import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { pickRandomLetter, buildRoundResult, recomputeScores } from "./logic";
import { CATEGORY_IDS } from "./categories";
import { reportRoom } from "../../lib/registry";
import { reassignHost } from "../../lib/host";
import {
  type Session,
  attachSession,
  broadcastState,
  kickPlayer,
  nameTaken,
  promoteWaiting,
  sendError,
  switchGame,
} from "../../lib/session";
import { MAX_MESSAGE_BYTES, tooManyMessages } from "../../lib/throttle";

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
const MAX_ANSWER_LENGTH = 40;
// Une manche ne peut pas durer indéfiniment : si personne ne crie stop (joueur
// parti manger, table bloquée sur une catégorie), l'alarme du Durable Object la
// termine toute seule.
const ROUND_MS = 10 * 60 * 1000;
const ANSWER_SAVE_DELAY_MS = 2000;
// Crier stop fige la manche pour tout le monde, donc on l'interdit tant qu'on
// n'a pas soi-même rempli l'essentiel de sa grille.
const STOP_MIN_FILLED_RATIO = 0.75;
const MIN_PLAYERS_TO_START = 2;

function requiredFilled(categoryCount: number): number {
  return Math.ceil(categoryCount * STOP_MIN_FILLED_RATIO);
}

export class BacRoom {
  private state: DurableObjectState;
  private sessions: Session[] = [];
  private room: RoomState | null = null;
  private env: Env;
  private lastReport = "";
  // Kept out of RoomState (and its own storage key) so it survives a restart
  // and doesn't need a migration in every game's room shape. Private by
  // default: a salon shows up in the public list only if the host says so.
  private visibility: "public" | "private" = "private";
  private answerSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const code = parts[parts.length - 1] ?? "";

    if (parts[parts.length - 2] === "exists") {
      const room = await this.loadRoom(code);
      return Response.json({ exists: room.hostId !== null });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade request", { status: 426 });
    }

    await this.loadRoom(code);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    attachSession(
      this.sessions,
      server,
      (session, raw) => this.handleMessage(session, raw),
      (session) => this.handleClose(session),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadRoom(code: string): Promise<RoomState> {
    if (!this.room) {
      const stored = await this.state.storage.get<RoomState>("room");
      this.room = stored ?? createEmptyRoom(code.toUpperCase());
      // Les salons créés avant ces champs sont relus tels qu'ils ont été
      // persistés : sans ça, le premier push dans waiting casse la manche.
      this.room.scores ??= {};
      this.room.waiting ??= [];
      this.visibility =
        (await this.state.storage.get<"public" | "private">("visibility")) ?? "private";
    }
    return this.room;
  }

  private async saveRoom(): Promise<void> {
    if (this.answerSaveTimer !== null) {
      clearTimeout(this.answerSaveTimer);
      this.answerSaveTimer = null;
    }
    if (this.room) {
      await this.state.storage.put("room", this.room);
      await this.reportToRegistry();
    }
  }

  // Feeds the landing page's "parties en cours" list. Skipped when nothing
  // visible from outside changed, so a room doesn't hammer the registry DO.
  private async reportToRegistry(): Promise<void> {
    if (!this.room) return;
    const summary = {
      slug: "bac",
      code: this.room.code,
      phase: this.room.phase,
      players: Object.values(this.room.players).filter((p) => p.connected).length,
      visibility: this.visibility,
    };
    const fingerprint = JSON.stringify(summary);
    if (fingerprint === this.lastReport) return;
    this.lastReport = fingerprint;
    await reportRoom(this.env, summary);
  }

  private async onSetVisibility(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut changer la visibilité du salon.");
      return;
    }
    this.visibility = msg.visibility === "public" ? "public" : "private";
    await this.state.storage.put("visibility", this.visibility);
    await this.saveRoom();
    this.broadcast();
  }

  private async handleClose(session: Session) {
    this.sessions = this.sessions.filter((s) => s !== session);
    if (!this.room || !session.playerId) return;

    const stillHere = this.sessions.some((s) => s.playerId === session.playerId);

    const player = this.room.players[session.playerId];
    if (!player) {
      // Un joueur en attente n'a pas de ligne dans la partie : il quitte la
      // file plutôt que d'être marqué déconnecté.
      if (!stillHere && this.room.waiting.some((p) => p.id === session.playerId)) {
        this.room.waiting = this.room.waiting.filter((p) => p.id !== session.playerId);
        await this.saveRoom();
        this.broadcast();
      }
      return;
    }

    if (!stillHere) {
      player.connected = false;
      reassignHost(this.room, player.id);
      await this.saveRoom();
      this.broadcast();
    }
  }

  private async handleMessage(session: Session, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    if (tooManyMessages(session.recent)) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // fetch() always loads the room before a session can send messages.
    const room = this.room!;

    switch (msg.type) {
      case "join":
        await this.onJoin(session, room, msg);
        break;
      case "start":
        await this.onStart(session, room, msg);
        break;
      case "answer":
        await this.onAnswer(session, room, msg);
        break;
      case "stop":
        await this.onStop(session, room);
        break;
      case "setValid":
        await this.onSetValid(session, room, msg);
        break;
      case "finishReview":
        await this.onFinishReview(session, room);
        break;
      case "restart":
        await this.onRestart(session, room);
        break;
      case "kick":
        if (kickPlayer(this.sessions, session, room, msg)) {
          await this.saveRoom();
          this.broadcast();
        }
        break;
      case "setVisibility":
        await this.onSetVisibility(session, room, msg);
        break;
      case "switchGame":
        switchGame(this.sessions, session, room, msg);
        break;
      default:
        sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
    }
  }

  // Un joueur neuf, qu'il entre tout de suite ou qu'il patiente (waiting).
  private makePlayer(id: string, token: string, name: string): Player {
    return { id, token, name, connected: true, answers: {} };
  }

  private async onJoin(session: Session, room: RoomState, msg: Record<string, unknown>) {
    const name = String(msg.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (name.length < MIN_NAME_LENGTH) {
      sendError(session.ws, `Le pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.`);
      return;
    }

    if (typeof msg.token === "string" && msg.token) {
      const existing = Object.values(room.players).find((p) => p.token === msg.token);
      if (existing) {
        existing.connected = true;
        existing.name = name;
        session.playerId = existing.id;
        session.ws.send(JSON.stringify({ type: "joined", playerId: existing.id, token: existing.token }));
        await this.saveRoom();
        this.broadcast();
        return;
      }

      const pending = room.waiting.find((p) => p.token === msg.token);
      if (pending) {
        pending.connected = true;
        pending.name = name;
        session.playerId = pending.id;
        session.ws.send(JSON.stringify({ type: "joined", playerId: pending.id, token: pending.token }));
        await this.saveRoom();
        this.broadcast();
        return;
      }
    }

    if (room.phase !== "lobby") {
      // La partie tourne : au lieu de renvoyer le nouveau venu créer son propre
      // salon, on le met de côté et il entrera à la manche suivante.
      if (nameTaken(room, name)) {
        sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
        return;
      }
      const pending = this.makePlayer(crypto.randomUUID(), crypto.randomUUID(), name);
      room.waiting.push(pending);
      session.playerId = pending.id;
      session.ws.send(JSON.stringify({ type: "joined", playerId: pending.id, token: pending.token }));
      await this.saveRoom();
      this.broadcast();
      return;
    }

    if (nameTaken(room, name)) {
      sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
      return;
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const player = this.makePlayer(id, token, name);
    room.players[id] = player;
    room.playerOrder.push(id);
    // asHost lets the player who triggered a switchGame reclaim host in the
    // new room even if another player's join message happens to land first.
    if (!room.hostId || msg.asHost === true) room.hostId = id;
    session.playerId = id;

    session.ws.send(JSON.stringify({ type: "joined", playerId: id, token }));
    await this.saveRoom();
    this.broadcast();
  }

  private async onStart(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;

    const connectedCount = Object.values(room.players).filter((p) => p.connected).length;
    if (connectedCount < MIN_PLAYERS_TO_START) {
      sendError(session.ws, `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs connectés.`);
      return;
    }

    const rawCategories = Array.isArray(msg.categories) ? msg.categories : [];
    const categories = [...new Set(rawCategories.filter((c): c is string => typeof c === "string" && CATEGORY_IDS.has(c)))];
    if (categories.length === 0) {
      sendError(session.ws, "Choisis au moins une catégorie.");
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    room.categories = categories;
    room.letter = pickRandomLetter();
    room.stoppedBy = null;
    room.endsAt = Date.now() + ROUND_MS;
    room.result = null;
    for (const player of Object.values(room.players)) {
      player.answers = {};
    }
    room.phase = "play";

    await this.state.storage.setAlarm(room.endsAt);
    await this.saveRoom();
    this.broadcast();
  }

  private async onAnswer(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected) return;

    const category = String(msg.category ?? "");
    if (!room.categories.includes(category)) return;

    player.answers[category] = String(msg.text ?? "").slice(0, MAX_ANSWER_LENGTH);
    // No broadcast: answers are private until the round ends, and the typing
    // player already has their own value locally — nothing else to send.
    // Écriture groupée : personne n'attend celle-ci, et une frappe débouncée
    // toutes les 250 ms x 12 catégories x 8 joueurs faisait autant
    // d'écritures de l'état complet du salon.
    this.scheduleAnswerSave();
  }

  // Le DO reste vivant tant que des WebSockets y sont attachés (pas
  // d'hibernation ici), donc ce timer aboutit. La fin de manche sauvegarde de
  // toute façon, et saveRoom() annule le flush en attente.
  private scheduleAnswerSave() {
    if (this.answerSaveTimer !== null) return;
    this.answerSaveTimer = setTimeout(() => {
      this.answerSaveTimer = null;
      void this.saveRoom();
    }, ANSWER_SAVE_DELAY_MS);
  }

  private async onStop(session: Session, room: RoomState) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected) return;

    const filled = room.categories.filter((c) => (player.answers[c] ?? "").trim()).length;
    if (filled < requiredFilled(room.categories.length)) {
      sendError(
        session.ws,
        `Remplis au moins ${requiredFilled(room.categories.length)} catégories sur ${room.categories.length} avant de crier stop.`
      );
      return;
    }

    await this.endRound(room, session.playerId);
  }

  // Fin de manche, criée ou expirée (stoppedBy null = le temps est écoulé).
  private async endRound(room: RoomState, stoppedBy: string | null) {
    room.stoppedBy = stoppedBy;
    room.endsAt = null;
    room.result = buildRoundResult(room);
    room.phase = "review";
    await this.state.storage.deleteAlarm();
    await this.saveRoom();
    this.broadcast();
  }

  // Déclenchée par le storage même si plus personne n'est connecté au moment T.
  async alarm() {
    const room = await this.loadRoom("");
    if (room.phase !== "play") return;
    await this.endRound(room, null);
  }

  private async onSetValid(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut valider les réponses.");
      return;
    }
    if (room.phase !== "review" || !room.result) return;

    const category = String(msg.category ?? "");
    const playerId = String(msg.playerId ?? "");
    const catResult = room.result.byCategory.find((c) => c.category === category);
    const entry = catResult?.entries.find((e) => e.playerId === playerId);
    if (!entry) return;

    // Une réponse vide ne rapporte rien, même si l'hôte clique dessus.
    entry.valid = msg.valid === true && entry.answer.trim() !== "";
    recomputeScores(room.result);

    await this.saveRoom();
    this.broadcast();
  }

  private async onFinishReview(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "review") return;
    // Les points de la manche s'ajoutent au cumul du salon.
    for (const [id, points] of Object.entries(room.result?.totals ?? {})) {
      room.scores[id] = (room.scores[id] ?? 0) + points;
    }
    room.phase = "ended";
    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    // Depuis n'importe quelle phase sauf le lobby : c'est aussi la sortie de
    // secours quand une manche reste bloquée (joueur parti sans revenir).
    if (session.playerId !== room.hostId || room.phase === "lobby") return;

    for (const player of Object.values(room.players)) {
      player.answers = {};
    }
    promoteWaiting(room);
    room.phase = "lobby";
    room.letter = null;
    room.stoppedBy = null;
    room.endsAt = null;
    room.result = null;
    // room.categories is kept so the host doesn't have to re-pick them.

    await this.saveRoom();
    this.broadcast();
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
  }

  private buildView(room: RoomState, forPlayerId: string) {
    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
      }));

    const you = room.players[forPlayerId] ?? null;

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      hostId: room.hostId,
      players,
      categories: room.categories,
      letter: room.phase === "lobby" ? null : room.letter,
      // Durée restante et pas instant absolu : l'horloge du téléphone d'un
      // joueur peut être décalée de plusieurs minutes, ce qui affichait un
      // compte à rebours faux (voire 0) sur une manche qui tourne.
      endsIn: room.phase === "play" && room.endsAt ? Math.max(0, room.endsAt - Date.now()) : null,
      stopMinFilled: requiredFilled(room.categories.length),
      you: you && { id: you.id, answers: you.answers },
      stoppedByName: room.stoppedBy ? room.players[room.stoppedBy]?.name ?? null : null,
      result: room.phase === "review" || room.phase === "ended" ? room.result : null,
    };
  }
}
