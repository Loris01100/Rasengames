import type { Env } from "../../env";
import { type RoomState, type Player, type LastChanceKind, createEmptyRoom } from "./types";
import { MIN_PLAYERS, MAX_PLAYERS, connectedIds, informedIds, pickGuesser, nextStep } from "./logic";
import { GAME_SLUGS } from "../../lib/gameSlugs";

const MAX_NAME_LENGTH = 20;
const MAX_TEXT_LENGTH = 60;
const VALID_LAST_CHANCE_KINDS: Set<string> = new Set(["arc", "lieu", "pouvoir"]);
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class NoteRoom {
  private state: DurableObjectState;
  private sessions: Session[] = [];
  private room: RoomState | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
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
    this.attachSession(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadRoom(code: string): Promise<RoomState> {
    if (!this.room) {
      const stored = await this.state.storage.get<RoomState>("room");
      this.room = stored ?? createEmptyRoom(code.toUpperCase());
    }
    return this.room;
  }

  private async saveRoom(): Promise<void> {
    if (this.room) {
      await this.state.storage.put("room", this.room);
    }
  }

  private attachSession(ws: WebSocket) {
    const session: Session = { ws, playerId: "" };
    this.sessions.push(session);

    ws.addEventListener("message", (event) => {
      this.handleMessage(session, event.data).catch((err) => {
        this.sendError(ws, err instanceof Error ? err.message : "Erreur inconnue.");
      });
    });

    const onClose = () => this.handleClose(session);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onClose);
  }

  private async handleClose(session: Session) {
    this.sessions = this.sessions.filter((s) => s !== session);
    if (!this.room || !session.playerId) return;

    const player = this.room.players[session.playerId];
    if (!player) return;

    const stillConnected = this.sessions.some((s) => s.playerId === session.playerId);
    if (!stillConnected) {
      player.connected = false;
      // A disconnect can complete the "everyone answered" set for the current
      // step even though nobody submitted just now — recheck so the round
      // doesn't stall waiting on someone who just left.
      if (this.room.phase === "play") this.maybeAdvanceStep(this.room);
      await this.saveRoom();
      this.broadcast();
    }
  }

  private sendError(ws: WebSocket, message: string) {
    try {
      ws.send(JSON.stringify({ type: "error", message }));
    } catch {
      // socket already gone
    }
  }

  private async handleMessage(session: Session, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return;
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
      case "submitClue":
        await this.onSubmitClue(session, room, msg);
        break;
      case "submitGuess":
        await this.onSubmitGuess(session, room, msg);
        break;
      case "restart":
        await this.onRestart(session, room);
        break;
      case "switchGame":
        this.onSwitchGame(session, room, msg);
        break;
      default:
        this.sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
    }
  }

  private async onJoin(session: Session, room: RoomState, msg: Record<string, unknown>) {
    const name = String(msg.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (!name) {
      this.sendError(session.ws, "Nom invalide.");
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
    }

    if (room.phase !== "lobby") {
      this.sendError(session.ws, "La partie a déjà commencé.");
      return;
    }

    // Capped at MAX_PLAYERS ever, not just connected, so a late arrival can't
    // sneak into a slot freed by someone dropping mid-game.
    if (room.playerOrder.length >= MAX_PLAYERS) {
      this.sendError(session.ws, `Ce salon est complet (${MAX_PLAYERS} joueurs max).`);
      return;
    }

    const nameTaken = Object.values(room.players).some(
      (p) => p.connected && p.name.toLowerCase() === name.toLowerCase()
    );
    if (nameTaken) {
      this.sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
      return;
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const player: Player = { id, token, name, connected: true, submitted: false };
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
      this.sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;

    const connectedCount = connectedIds(room).length;
    if (connectedCount < MIN_PLAYERS) {
      this.sendError(session.ws, `Il faut au moins ${MIN_PLAYERS} joueurs connectés.`);
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const requestedGuesserId = typeof msg.guesserId === "string" ? msg.guesserId : null;
    room.guesserId = pickGuesser(room, requestedGuesserId);
    room.number = 1 + Math.floor(Math.random() * 10);
    room.clues = [];
    room.guess = null;
    room.step = "character";
    for (const player of Object.values(room.players)) player.submitted = false;
    room.phase = "play";

    await this.saveRoom();
    this.broadcast();
  }

  private async onSubmitClue(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play" || !room.step || room.step === "guessing") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected || player.submitted) return;
    if (player.id === room.guesserId) {
      this.sendError(session.ws, "Tu es celui qui devine, tu ne réponds pas à ce tour.");
      return;
    }

    const text = String(msg.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) {
      this.sendError(session.ws, "Réponse vide.");
      return;
    }

    let kind: LastChanceKind | undefined;
    if (room.step === "lastChance") {
      const rawKind = String(msg.kind ?? "");
      if (!VALID_LAST_CHANCE_KINDS.has(rawKind)) {
        this.sendError(session.ws, "Choisis un arc, un lieu ou un pouvoir.");
        return;
      }
      kind = rawKind as LastChanceKind;
    }

    room.clues.push({ playerId: player.id, step: room.step, text, kind });
    player.submitted = true;

    this.maybeAdvanceStep(room);

    await this.saveRoom();
    this.broadcast();
  }

  // Moves to the next clue step (or to "guessing") once every connected
  // informed player has answered for the current one.
  private maybeAdvanceStep(room: RoomState) {
    if (!room.step || room.step === "guessing") return;
    const ids = informedIds(room);
    const allAnswered = ids.length > 0 && ids.every((id) => room.players[id]?.submitted);
    if (!allAnswered) return;

    const next = nextStep(room.step);
    room.step = next;
    if (next !== "guessing") {
      for (const id of ids) room.players[id].submitted = false;
    }
  }

  private async onSubmitGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play" || room.step !== "guessing") return;
    if (session.playerId !== room.guesserId) {
      this.sendError(session.ws, "Ce n'est pas à toi de deviner.");
      return;
    }

    const number = Number(msg.number);
    if (!Number.isInteger(number) || number < 1 || number > 10) {
      this.sendError(session.ws, "Choisis un chiffre entre 1 et 10.");
      return;
    }

    room.guess = number;
    room.phase = "ended";

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) player.submitted = false;
    room.guesserId = null;
    room.number = null;
    room.step = null;
    room.clues = [];
    room.guess = null;
    room.phase = "lobby";

    await this.saveRoom();
    this.broadcast();
  }

  // Purely a redirect signal to every connected client — the group keeps its
  // room code and just points its WebSocket at another game's room instead,
  // so switching games doesn't require leaving and re-sharing a new code.
  private onSwitchGame(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      this.sendError(session.ws, "Seul l'hôte peut changer de jeu.");
      return;
    }
    const slug = String(msg.slug ?? "");
    if (!VALID_GAME_SLUGS.has(slug)) {
      this.sendError(session.ws, "Jeu invalide.");
      return;
    }
    for (const s of this.sessions) {
      try {
        s.ws.send(
          JSON.stringify({ type: "switchGame", slug, code: room.code, asHost: s === session })
        );
      } catch {
        // socket already gone
      }
    }
  }

  private broadcast() {
    if (!this.room) return;
    for (const session of this.sessions) {
      if (!session.playerId) continue;
      const view = this.buildView(this.room, session.playerId);
      try {
        session.ws.send(JSON.stringify({ type: "state", state: view }));
      } catch {
        // socket already gone; the close handler will clean it up
      }
    }
  }

  private buildView(room: RoomState, forPlayerId: string) {
    const revealAll = room.phase === "ended";
    const iAmGuesser = forPlayerId === room.guesserId;

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        isGuesser: p.id === room.guesserId,
        submitted: p.submitted,
      }));

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players,
      guesserId: room.guesserId,
      step: room.step,
      // Hidden from the guesser until the round ends — that's the whole game.
      number: revealAll || !iAmGuesser ? room.number : null,
      clues: room.clues,
      guess: room.guess,
    };
  }
}
