import type { Env } from "../../env";
import { type RoomState, type Player, type Mode, createEmptyRoom } from "./types";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  connectedIds,
  aliveIds,
  connectedAliveIds,
  nextTurn,
  randomBombDelay,
  startsWithLetter,
} from "./logic";
import { sameWord } from "../../lib/words";
import { ALPHABET, parseLetters, pickLetter } from "../../lib/letters";
import { reportRoom } from "../../lib/registry";
import { reassignHost, transferHost } from "../../lib/host";
import {
  type Session,
  assignHostAfterSwitch,
  attachSession,
  broadcastState,
  handleSpectatorMessage,
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
const MAX_WORD_LENGTH = 40;
const MAX_ANIME_LENGTH = 80;
const MIN_TURN_MS = 2_000;
const VALID_MODES: Mode[] = ["perso", "anime"];

export class BombRoom {
  private state: DurableObjectState;
  private sessions: Session[] = [];
  private room: RoomState | null = null;
  private env: Env;
  private lastReport = "";
  // Kept out of RoomState (and its own storage key) so it survives a restart
  // and doesn't need a migration in every game's room shape. Private by
  // default: a salon shows up in the public list only if the host says so.
  private visibility: "public" | "private" = "private";

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
      this.room.mode = VALID_MODES.includes(this.room.mode) ? this.room.mode : "perso";
      this.room.eliminationOrder ??= [];
      this.room.letters ??= [...ALPHABET];
      this.room.turnSafeUntil ??= 0;
    }
    return this.room;
  }

  private async saveRoom(): Promise<void> {
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
      slug: "bomb",
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
      // Sans ça, la bombe resterait bloquée dans les mains de quelqu'un qui
      // vient de partir jusqu'à ce qu'elle explose sur lui — on fait passer
      // le tour tout de suite, la mèche continue de courir sans être touchée.
      if (this.room.phase === "play" && this.room.turnId === player.id) {
        this.advanceTurn(this.room);
        await this.protectNewTurn(this.room);
      }
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
      case "submitWord":
        await this.onSubmitWord(session, room, msg);
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

  // Un joueur neuf, qu'il entre tout de suite ou qu'il patiente (waiting).
  private makePlayer(id: string, token: string, name: string): Player {
    return { id, token, name, connected: true, lives: 2, eliminated: false };
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
      if (room.playerOrder.length + room.waiting.length >= MAX_PLAYERS) {
        sendError(session.ws, `Ce salon est complet (${MAX_PLAYERS} joueurs max).`);
        return;
      }
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

    // Capped at MAX_PLAYERS ever, not just connected, so a late arrival can't
    // sneak into a slot freed by someone dropping mid-game.
    if (room.playerOrder.length >= MAX_PLAYERS) {
      sendError(session.ws, `Ce salon est complet (${MAX_PLAYERS} joueurs max).`);
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
    assignHostAfterSwitch(room, id, msg);
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

    const connectedCount = connectedIds(room).length;
    if (connectedCount < MIN_PLAYERS) {
      sendError(session.ws, `Il faut au moins ${MIN_PLAYERS} joueurs connectés.`);
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const requestedMode = msg.mode as Mode;
    room.mode = VALID_MODES.includes(requestedMode) ? requestedMode : "perso";

    for (const player of Object.values(room.players)) {
      player.lives = 2;
      player.eliminated = false;
    }
    room.answers = [];
    room.eliminationOrder = [];
    room.winnerId = null;

    const ids = connectedAliveIds(room);
    room.letters = parseLetters(msg.letters);
    room.turnId = ids[Math.floor(Math.random() * ids.length)] ?? null;
    room.turnSafeUntil = Date.now() + MIN_TURN_MS;
    room.letter = pickLetter(room.letters);
    room.phase = "play";

    await this.saveRoom();
    await this.scheduleBomb();
    this.broadcast();
  }

  // Le joueur dont c'est le tour tape son mot : validé contre la lettre
  // imposée (pas plus — le jeu ne peut pas vérifier qu'un perso/anime existe
  // vraiment), il rejoint le journal et la bombe passe au suivant avec une
  // nouvelle lettre. La mèche, elle, continue de courir sans être touchée —
  // ce n'est pas elle qu'on relance ici.
  private async onSubmitWord(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    if (room.turnId !== session.playerId) {
      sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }

    const text = String(msg.text ?? "").trim().slice(0, MAX_WORD_LENGTH);
    const anime = String(msg.anime ?? "").trim().slice(0, MAX_ANIME_LENGTH);
    if (!text) {
      sendError(session.ws, "Réponse vide.");
      return;
    }
    if (!room.letter || !startsWithLetter(text, room.letter)) {
      sendError(session.ws, `Ta réponse doit commencer par la lettre ${room.letter ?? "?"}.`);
      return;
    }

    // Une lettre revient plusieurs fois dans une manche : sans ça, tout le
    // monde pouvait ressortir le même personnage à chaque passage. Comparaison
    // via sameWord (cf. lib/words.ts) pour que "Naruto" et "Naruto Uzumaki"
    // comptent pour la même réponse.
    const already = room.answers.find((a) => sameWord(a.text, text));
    if (already) {
      sendError(session.ws, `"${already.text}" est déjà passé dans cette manche, trouve autre chose.`);
      return;
    }

    room.answers.push({ playerId: session.playerId, letter: room.letter, text, ...(anime ? { anime } : {}) });
    this.advanceTurn(room);
    await this.protectNewTurn(room);
    await this.saveRoom();
    this.broadcast();
  }

  private advanceTurn(room: RoomState) {
    room.turnId = nextTurn(room, room.turnId);
    room.letter = room.turnId ? pickLetter(room.letters) : null;
  }

  private async scheduleBomb(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + randomBombDelay());
  }

  // La mèche globale continue de courir, mais si elle devait finir moins de
  // deux secondes après un passage, on ne déplace que sa fin à cette limite.
  private async protectNewTurn(room: RoomState): Promise<void> {
    room.turnSafeUntil = Date.now() + MIN_TURN_MS;
    const alarm = await this.state.storage.getAlarm();
    if (alarm === null || alarm < room.turnSafeUntil) {
      await this.state.storage.setAlarm(room.turnSafeUntil);
    }
  }

  // Réveillé par le runtime à l'heure fixée par scheduleBomb(), même si ce
  // Durable Object avait été déchargé entre-temps — c'est ce qui rend la mèche
  // fiable sans qu'aucun client n'ait à la faire tourner lui-même.
  async alarm(): Promise<void> {
    // Par loadRoom() : recharger la visibilité et les champs rétro-compatibles
    // compte autant ici qu'à l'ouverture d'un WebSocket. Sans ça, un salon
    // réveillé après éviction du DO repassait en privé (donc disparaissait de
    // la liste publique) et pouvait planter sur un room.scores absent.
    const room = await this.loadRoom("");
    if (room.phase !== "play") return;

    // Filet de sécurité contre la course entre une réponse et une alarme déjà
    // en file d'attente : le nouveau porteur garde réellement ses 2 secondes.
    if (Date.now() < room.turnSafeUntil) {
      await this.state.storage.setAlarm(room.turnSafeUntil);
      return;
    }

    const holder = room.turnId ? room.players[room.turnId] : null;
    if (holder) {
      if (holder.lives > 0) {
        holder.lives -= 1;
      } else {
        holder.eliminated = true;
        room.eliminationOrder.push(holder.id);
      }
    }

    const survivors = aliveIds(room);
    if (survivors.length <= 1) {
      room.winnerId = survivors[0] ?? null;
      if (room.winnerId) room.scores[room.winnerId] = (room.scores[room.winnerId] ?? 0) + 1;
      room.turnId = null;
      room.letter = null;
      room.phase = "ended";
      await this.saveRoom();
      this.broadcast();
      return;
    }

    // La personne qui vient de se faire éliminer ne peut plus recevoir la
    // bombe : on repart d'après elle pour que le suivant soit forcément en vie.
    room.turnId = nextTurn(room, holder?.id ?? room.turnId);
    room.turnSafeUntil = Date.now() + MIN_TURN_MS;
    room.letter = room.turnId ? pickLetter(room.letters) : null;

    // Plus personne de connecté pour tenir la bombe : la manche s'arrête là.
    // Sinon l'alarme se reprogrammait toutes les 30 s dans le vide, pour
    // toujours, sur un salon que plus personne ne regarde.
    if (!room.turnId) {
      room.phase = "ended";
      await this.saveRoom();
      this.broadcast();
      return;
    }

    await this.saveRoom();
    await this.scheduleBomb();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    // Depuis n'importe quelle phase sauf le lobby : c'est aussi la sortie de
    // secours quand une manche reste bloquée (joueur parti sans revenir).
    if (session.playerId !== room.hostId || room.phase === "lobby") return;

    for (const player of Object.values(room.players)) {
      player.lives = 2;
      player.eliminated = false;
    }
    room.answers = [];
    room.eliminationOrder = [];
    room.winnerId = null;
    room.turnId = null;
    room.turnSafeUntil = 0;
    room.letter = null;
    promoteWaiting(room);
    room.phase = "lobby";

    // Filet de sécurité : pas de mèche en attente une fois la manche finie.
    await this.state.storage.deleteAlarm();
    await this.saveRoom();
    this.broadcast();
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
  }

  private buildView(room: RoomState, _forPlayerId: string) {
    const nameOf = (id: string) => room.players[id]?.name ?? "?";

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        lives: p.lives,
        eliminated: p.eliminated,
      }));

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      mode: room.mode,
      hostId: room.hostId,
      players,
      turnId: room.turnId,
      turnName: room.turnId ? nameOf(room.turnId) : null,
      letter: room.letter,
      answers: room.answers.map((a) => ({ ...a, name: nameOf(a.playerId) })),
      eliminationOrder: room.eliminationOrder.map((id) => ({ id, name: nameOf(id) })),
      winnerId: room.winnerId,
      winnerName: room.winnerId ? nameOf(room.winnerId) : null,
    };
  }
}
