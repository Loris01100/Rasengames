import type { Env } from "../../env";
import { type RoomState, type Player, type RoundDuration, createEmptyRoom } from "./types";
import { buildRoundResult, recomputeScores } from "./logic";
import { ALPHABET, drawLetter, parseLetters } from "../../lib/letters";
import { CATEGORY_IDS, CATEGORY_LABELS } from "./categories";
import { reportRoom } from "../../lib/registry";
import { armIdlePurge, cancelIdlePurge, purgeIfIdle, rearmIdlePurge } from "../../lib/idle";
import { claimHost, reassignHost, transferHost } from "../../lib/host";
import {
  type Session,
  assignHostAfterSwitch,
  isHostKeyRequest,
  storeHostKey,
  acceptSession,
  dispatchClose,
  dispatchMessage,
  restoreSessions,
  broadcastState,
  handleSpectatorMessage,
  joinAsSpectator,
  kickPlayer,
  nameTaken,
  rejoinName,
  promoteWaiting,
  sendError,
  switchGame,
} from "../../lib/session";
import { MAX_MESSAGE_BYTES, tooManyMessages } from "../../lib/throttle";

// Lettres dont le salon se souvient : une par manche.
const RECENT_LETTERS = 8;

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
const MAX_ANSWER_LENGTH = 40;
// Une manche ne peut pas durer indéfiniment : si personne ne crie stop (joueur
// parti manger, table bloquée sur une catégorie), l'alarme du Durable Object la
// termine toute seule.
const ROUND_DURATIONS: Record<RoundDuration, number> = {
  short: 5 * 60 * 1000,
  normal: 10 * 60 * 1000,
  long: 15 * 60 * 1000,
};
const MAX_CUSTOM_CATEGORIES = 8;
const MAX_CATEGORY_LENGTH = 36;
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
    this.sessions = restoreSessions(state);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const code = parts[parts.length - 1] ?? "";

    if (isHostKeyRequest(request, parts)) return storeHostKey(this.state.storage, request);

    if (parts[parts.length - 2] === "exists") {
      const room = await this.loadRoom(code);
      return Response.json({ exists: room.hostId !== null, live: this.sessions.length > 0 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade request", { status: 426 });
    }

    await this.loadRoom(code);
    await cancelIdlePurge(this.state.storage);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    acceptSession(this.state, this.sessions, server, code);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await dispatchMessage(this.sessions, ws, raw, (code) => this.loadRoom(code), (session, msg) => this.handleMessage(session, msg));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket): Promise<void> {
    await dispatchClose(this.sessions, ws, (code) => this.loadRoom(code), async (session) => {
      await this.handleClose(session).finally(() => armIdlePurge(this.state.storage, this.sessions.length));
    });
  }

  // Purge du salon après 24 h sans connexion (lib/idle.ts), sinon alarme de jeu.
  async alarm(): Promise<void> {
    if (await purgeIfIdle(this.state.storage, this.sessions.length)) {
      this.room = null;
      this.lastReport = "";
      return;
    }
    await this.onGameAlarm();
    await rearmIdlePurge(this.state.storage);
  }

  private async loadRoom(code: string): Promise<RoomState> {
    if (!this.room) {
      const stored = await this.state.storage.get<RoomState>("room");
      this.room = stored ?? createEmptyRoom(code.toUpperCase());
      // Les salons créés avant ces champs sont relus tels qu'ils ont été
      // persistés : sans ça, le premier push dans waiting casse la manche.
      this.room.scores ??= {};
      this.room.waiting ??= [];
      this.room.letters ??= [...ALPHABET];
      this.room.categoryLabels ??= {};
      this.room.duration ??= "normal";
      this.room.recentDraws ??= [];
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
    if (session.spectator) {
      this.broadcast();
      return;
    }
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

    const spectatorResult = handleSpectatorMessage(session, msg, room.phase !== "lobby");
    if (spectatorResult !== "continue") {
      if (spectatorResult === "joined") this.broadcast();
      return;
    }

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
      case "transferHost":
        if (transferHost(session, room, msg)) {
          await this.saveRoom();
          this.broadcast();
        }
        break;
      case "setVisibility":
        await this.onSetVisibility(session, room, msg);
        break;
      case "switchGame":
        await switchGame(this.sessions, session, room, msg, this.env);
        break;
      default:
        sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
    }
  }

  // Un joueur neuf ; `waiting` ne contient plus que d'anciens retardataires persistés.
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
        claimHost(room, existing.id);
        existing.name = rejoinName(room, existing.id, name, existing.name, MAX_NAME_LENGTH);
        session.playerId = existing.id;
        session.ws.send(JSON.stringify({ type: "joined", playerId: existing.id, token: existing.token }));
        await this.saveRoom();
        this.broadcast();
        return;
      }

      const pending = room.waiting.find((p) => p.token === msg.token);
      if (pending) {
        pending.connected = true;
        pending.name = rejoinName(room, pending.id, name, pending.name, MAX_NAME_LENGTH);
        session.playerId = pending.id;
        session.ws.send(JSON.stringify({ type: "joined", playerId: pending.id, token: pending.token }));
        await this.saveRoom();
        this.broadcast();
        return;
      }
    }

    if (room.phase !== "lobby") {
      // Token inconnu en pleine partie : spectateur, comme une arrivée sans token.
      joinAsSpectator(session, name);
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
    claimHost(room, id);
    await assignHostAfterSwitch(this.state.storage, room, id, msg);
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
    const seenLabels = new Set(categories.map((id) => CATEGORY_LABELS[id].toLocaleLowerCase("fr")));
    const customLabels = (Array.isArray(msg.customCategories) ? msg.customCategories : [])
      .filter((label): label is string => typeof label === "string")
      .map((label) => label.trim().replace(/\s+/g, " ").slice(0, MAX_CATEGORY_LENGTH))
      .filter((label) => {
        const normalized = label.toLocaleLowerCase("fr");
        if (!normalized || seenLabels.has(normalized)) return false;
        seenLabels.add(normalized);
        return true;
      })
      .slice(0, MAX_CUSTOM_CATEGORIES);
    const categoryLabels: Record<string, string> = Object.fromEntries(
      categories.map((id) => [id, CATEGORY_LABELS[id]])
    );
    for (const [index, label] of customLabels.entries()) {
      const id = `custom:${index}`;
      categories.push(id);
      categoryLabels[id] = label;
    }
    if (categories.length === 0) {
      sendError(session.ws, "Choisis au moins une catégorie.");
      return;
    }
    const duration: RoundDuration =
      msg.duration === "short" || msg.duration === "long" ? msg.duration : "normal";

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    room.categories = categories;
    room.categoryLabels = categoryLabels;
    room.duration = duration;
    room.letters = parseLetters(msg.letters);
    room.letter = drawLetter(room, RECENT_LETTERS);
    room.stoppedBy = null;
    room.endsAt = Date.now() + ROUND_DURATIONS[duration];
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

  // Un setTimeout en attente empêche l'hibernation du DO (doc Cloudflare),
  // donc ce timer aboutit toujours. La fin de manche sauvegarde de
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
  private async onGameAlarm() {
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

    // Filet de sécurité : pas de fin de chrono en attente une fois la manche finie.
    await this.state.storage.deleteAlarm();
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
      categoryLabels: room.categoryLabels,
      duration: room.duration,
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
