import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { MIN_PLAYERS, MAX_PLAYERS, connectedIds, assignWords, nextTurn, isCorrectGuess } from "./logic";
import { fetchCharacterOrAnimeImage } from "../../lib/images";
import { GAME_SLUGS } from "../../lib/gameSlugs";

const MAX_NAME_LENGTH = 20;
const MAX_WORD_LENGTH = 40;
const MAX_GUESS_LENGTH = 40;
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class WhoamiRoom {
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
      if (this.room.phase === "play" && this.room.turnId === player.id) {
        this.room.turnId = nextTurn(this.room, player.id);
      }
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
        await this.onStart(session, room);
        break;
      case "submitWord":
        await this.onSubmitWord(session, room, msg);
        break;
      case "askedQuestion":
        await this.onAskedQuestion(session, room);
        break;
      case "guess":
        await this.onGuess(session, room, msg);
        break;
      case "endRound":
        await this.onEndRound(session, room);
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
    const player: Player = {
      id,
      token,
      name,
      connected: true,
      submittedWord: null,
      ready: false,
      word: null,
      wordImage: null,
      found: false,
      guesses: [],
      questionsAsked: 0,
    };
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

  private async onStart(session: Session, room: RoomState) {
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

    for (const player of Object.values(room.players)) {
      player.submittedWord = null;
      player.ready = false;
      player.word = null;
      player.wordImage = null;
      player.found = false;
      player.guesses = [];
      player.questionsAsked = 0;
    }
    room.turnId = null;
    room.phase = "submit";

    await this.saveRoom();
    this.broadcast();
  }

  private async onSubmitWord(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "submit") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected || player.ready) return;

    const text = String(msg.text ?? "").trim().slice(0, MAX_WORD_LENGTH);
    if (!text) {
      this.sendError(session.ws, "Mot invalide.");
      return;
    }
    player.submittedWord = text;
    player.ready = true;

    const ids = connectedIds(room);
    const roundReady = ids.length >= MIN_PLAYERS && ids.every((id) => room.players[id]?.ready);
    if (roundReady) {
      assignWords(room);
      room.phase = "play";
      room.turnId = ids[0] ?? null;
    }

    await this.saveRoom();
    this.broadcast();

    if (roundReady) await this.fetchImagesForRound(room);
  }

  // Best-effort illustration per assigned word, fetched once everyone's
  // submission is in and words are handed out. Runs after the round-start
  // broadcast so players see their card immediately and the image pops in.
  private async fetchImagesForRound(room: RoomState) {
    const snapshot = connectedIds(room)
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p?.word)
      .map((p) => ({ id: p.id, word: p.word as string }));

    await Promise.all(
      snapshot.map(async ({ id, word }) => {
        const image = await fetchCharacterOrAnimeImage(word);
        // The room may have restarted (new words assigned) while this lookup
        // was in flight; only apply it if it's still the same round.
        const player = room.players[id];
        if (room.phase === "play" && player && player.word === word) {
          player.wordImage = image;
        }
      })
    );

    await this.saveRoom();
    this.broadcast();
  }

  // Turn order for asking a (verbal) yes/no question aloud, one player at a
  // time. The actual question isn't captured by the app — this just tracks
  // whose turn it is and tallies how many each player has asked, so the
  // group takes turns instead of everyone talking over each other.
  private async onAskedQuestion(session: Session, room: RoomState) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected || player.found) return;
    if (room.turnId !== player.id) {
      this.sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }

    player.questionsAsked += 1;
    room.turnId = nextTurn(room, player.id);

    await this.saveRoom();
    this.broadcast();
  }

  private async onGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected || player.found || !player.word) return;

    const guess = String(msg.text ?? "").trim().slice(0, MAX_GUESS_LENGTH);
    if (!guess) return;

    player.guesses.push(guess);

    if (!isCorrectGuess(guess, player.word)) {
      await this.saveRoom();
      this.broadcast();
      this.sendError(session.ws, "Pas encore, retente !");
      return;
    }

    player.found = true;
    if (room.turnId === player.id) {
      room.turnId = nextTurn(room, player.id);
    }
    if (connectedIds(room).every((id) => room.players[id]?.found)) {
      room.phase = "ended";
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onEndRound(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "play") return;
    room.phase = "ended";
    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.submittedWord = null;
      player.ready = false;
      player.word = null;
      player.wordImage = null;
      player.found = false;
      player.guesses = [];
      player.questionsAsked = 0;
    }
    room.turnId = null;
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

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        ready: p.ready,
        found: p.found,
        // Hidden from the assignee while the round is live — everyone else
        // can already see it, that's the whole game — revealed once ended.
        word: p.id !== forPlayerId || revealAll ? p.word : null,
        wordImage: p.id !== forPlayerId || revealAll ? p.wordImage : null,
        // Attempts never reveal the word themselves (they're just what was
        // typed), so they're always visible to everyone, self included.
        guesses: p.guesses,
        questionsAsked: p.questionsAsked,
      }));

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players,
      turnId: room.turnId,
      turnName: room.turnId ? room.players[room.turnId]?.name ?? null : null,
    };
  }
}
