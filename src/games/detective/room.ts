import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { MAX_PLAYERS, opponentOf } from "./logic";
import { GAME_SLUGS } from "../../lib/gameSlugs";

const MAX_NAME_LENGTH = 20;
const MAX_CATEGORY_LENGTH = 60;
const MAX_TEXT_LENGTH = 40;
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class DetectiveRoom {
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
        await this.onStart(session, room);
        break;
      case "setCategory":
        await this.onSetCategory(session, room, msg);
        break;
      case "proposeCharacter":
        await this.onSend(session, room, "proposal", msg);
        break;
      case "guessCategory":
        await this.onSend(session, room, "guess", msg);
        break;
      case "answerIncoming":
        await this.onAnswerIncoming(session, room, msg);
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

    // A "détective" room is a permanent 1v1 — capped at 2 players ever, not
    // just 2 connected, so a third person can't sneak in if one drops.
    if (room.playerOrder.length >= MAX_PLAYERS) {
      this.sendError(session.ws, "Ce salon est complet (2 joueurs max).");
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
      category: null,
      ready: false,
      incoming: null,
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

    const connectedCount = Object.values(room.players).filter((p) => p.connected).length;
    if (connectedCount < MAX_PLAYERS) {
      this.sendError(session.ws, "Il faut 2 joueurs connectés.");
      return;
    }

    for (const player of Object.values(room.players)) {
      player.category = null;
      player.ready = false;
      player.incoming = null;
    }
    room.log = [];
    room.winner = null;
    room.phase = "setup";

    await this.saveRoom();
    this.broadcast();
  }

  private async onSetCategory(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "setup") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected) return;

    const text = String(msg.text ?? "").trim().slice(0, MAX_CATEGORY_LENGTH);
    if (!text) {
      this.sendError(session.ws, "Catégorie vide.");
      return;
    }
    player.category = text;
    player.ready = true;

    const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
    if (connectedIds.length === MAX_PLAYERS && connectedIds.every((id) => room.players[id]?.ready)) {
      room.phase = "play";
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onSend(
    session: Session,
    room: RoomState,
    kind: "proposal" | "guess",
    msg: Record<string, unknown>
  ) {
    if (room.phase !== "play") return;
    const from = session.playerId;
    const opponentId = opponentOf(room, from);
    if (!opponentId) return;
    const opponent = room.players[opponentId];
    if (!opponent || !opponent.connected) return;

    if (opponent.incoming) {
      this.sendError(session.ws, "Attends que ton adversaire réponde d'abord.");
      return;
    }

    const text = String(msg.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return;

    opponent.incoming = { from, kind, text };

    await this.saveRoom();
    this.broadcast();
  }

  private async onAnswerIncoming(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.incoming) return;

    const fits = msg.fits === true;
    const { from, kind, text } = player.incoming;
    room.log.push({ kind, from, text, fits });
    player.incoming = null;

    if (kind === "guess" && fits) {
      room.phase = "ended";
      room.winner = from;
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.category = null;
      player.ready = false;
      player.incoming = null;
    }
    room.log = [];
    room.winner = null;
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
    const you = room.players[forPlayerId] ?? null;
    const opponentId = opponentOf(room, forPlayerId);
    const opponent = opponentId ? room.players[opponentId] : null;

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.playerOrder
        .map((id) => room.players[id])
        .filter((p): p is Player => !!p)
        .map((p) => ({
          id: p.id,
          name: p.name,
          connected: p.connected,
          isHost: p.id === room.hostId,
          ready: p.ready,
        })),
      you: you && {
        id: you.id,
        category: you.category,
        incoming: you.incoming,
      },
      opponent: opponent && {
        id: opponent.id,
        name: opponent.name,
        connected: opponent.connected,
        ready: opponent.ready,
        busy: opponent.incoming !== null,
        category: revealAll ? opponent.category : null,
      },
      log: room.log,
      winner: room.winner,
      winnerName: room.winner ? room.players[room.winner]?.name ?? null : null,
    };
  }
}
