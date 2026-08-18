import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { startRound, isCorrectGuess } from "./logic";
import { ANIME_LIST } from "./characters";
import { fetchCharacterOrAnimeImage, fetchAnimeImage } from "../../lib/images";
import { GAME_SLUGS } from "../../lib/gameSlugs";

const MAX_NAME_LENGTH = 20;
const MAX_GUESS_LENGTH = 40;
const MIN_PLAYERS_TO_START = 2;
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
      character: null,
      characterAnime: null,
      characterImage: null,
      found: false,
      guesses: [],
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

  private async onStart(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      this.sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;

    const connectedCount = Object.values(room.players).filter((p) => p.connected).length;
    if (connectedCount < MIN_PLAYERS_TO_START) {
      this.sendError(session.ws, `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs connectés.`);
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const anime = ANIME_LIST.includes(String(msg.anime ?? "")) ? String(msg.anime) : null;
    const guesserId = typeof msg.guesserId === "string" ? msg.guesserId : null;
    room.anime = anime;
    startRound(room, guesserId, anime);
    room.phase = "play";

    await this.saveRoom();
    this.broadcast();

    const guesser = room.guesserId ? room.players[room.guesserId] : null;
    if (!guesser?.character) return;
    const startedWith = guesser.character;
    // Falls back to the series cover so the card is never left imageless.
    const image =
      (await fetchCharacterOrAnimeImage(startedWith)) ??
      (guesser.characterAnime ? await fetchAnimeImage(guesser.characterAnime) : null);
    // The room may have restarted (new character assigned) while this lookup
    // was in flight; only apply it if it's still the same round.
    if (room.phase === "play" && guesser.character === startedWith) {
      guesser.characterImage = image;
      await this.saveRoom();
      this.broadcast();
    }
  }

  private async onGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected || player.found || !player.character) return;
    if (room.guesserId !== player.id) {
      this.sendError(session.ws, "Ce n'est pas toi qui devines cette manche.");
      return;
    }

    const guess = String(msg.text ?? "").trim().slice(0, MAX_GUESS_LENGTH);
    if (!guess) return;

    player.guesses.push(guess);

    if (!isCorrectGuess(guess, player.character)) {
      await this.saveRoom();
      this.broadcast();
      this.sendError(session.ws, "Pas encore, retente !");
      return;
    }

    player.found = true;
    room.phase = "ended";

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
      player.character = null;
      player.characterAnime = null;
      player.characterImage = null;
      player.found = false;
      player.guesses = [];
    }
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
        found: p.found,
        // Hidden from the guesser while the round is live — everyone else can
        // already see it, that's the whole game — revealed to them once ended.
        character: p.id !== forPlayerId || revealAll ? p.character : null,
        characterAnime: p.id !== forPlayerId || revealAll ? p.characterAnime : null,
        characterImage: p.id !== forPlayerId || revealAll ? p.characterImage : null,
        // Attempts never reveal the character themselves (they're just what
        // was typed), so they're always visible to everyone, self included.
        guesses: p.guesses,
      }));

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players,
      guesserId: room.guesserId,
      anime: room.anime,
      animeList: ANIME_LIST,
    };
  }
}
