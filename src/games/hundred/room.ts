import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { assignNumbers, computeScore, allProposed, shuffle } from "./logic";
import { pickRandomTheme } from "./themes";

const MAX_NAME_LENGTH = 20;
const MAX_PROPOSAL_LENGTH = 40;
const MAX_THEME_LENGTH = 60;
const MIN_PLAYERS_TO_START = 3;

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class HundredRoom {
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
      case "propose":
        await this.onPropose(session, room, msg);
        break;
      case "move":
        await this.onMove(session, room, msg);
        break;
      case "reveal":
        await this.onReveal(session, room);
        break;
      case "restart":
        await this.onRestart(session, room);
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
    const player: Player = { id, token, name, connected: true, number: null, proposal: null };
    room.players[id] = player;
    room.playerOrder.push(id);
    if (!room.hostId) room.hostId = id;
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

    const customTheme = String(msg.theme ?? "").trim().slice(0, MAX_THEME_LENGTH);
    room.theme = customTheme || pickRandomTheme();
    room.order = [];
    room.score = null;
    assignNumbers(room);
    room.phase = "propose";

    await this.saveRoom();
    this.broadcast();
  }

  private async onPropose(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "propose") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected) return;

    const text = String(msg.text ?? "").trim().slice(0, MAX_PROPOSAL_LENGTH);
    if (!text) {
      this.sendError(session.ws, "Proposition vide.");
      return;
    }
    player.proposal = text;

    if (allProposed(room)) {
      const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
      room.order = shuffle(connectedIds);
      room.phase = "arrange";
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onMove(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "arrange") return;
    const mover = room.players[session.playerId];
    if (!mover || !mover.connected) return;

    const targetId = String(msg.playerId ?? "");
    if (!room.order.includes(targetId)) return;

    let toIndex = Math.trunc(Number(msg.toIndex));
    if (!Number.isFinite(toIndex)) return;

    room.order = room.order.filter((id) => id !== targetId);
    toIndex = Math.max(0, Math.min(toIndex, room.order.length));
    room.order.splice(toIndex, 0, targetId);

    await this.saveRoom();
    this.broadcast();
  }

  private async onReveal(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "arrange") return;

    room.score = computeScore(room);
    room.phase = "ended";

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.number = null;
      player.proposal = null;
    }
    room.phase = "lobby";
    room.theme = null;
    room.order = [];
    room.score = null;

    await this.saveRoom();
    this.broadcast();
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
        proposal: p.proposal,
        number: revealAll || p.id === forPlayerId ? p.number : undefined,
      }));

    const you = room.players[forPlayerId] ?? null;
    const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      theme: room.theme,
      players,
      you: you && { id: you.id, number: you.number, proposal: you.proposal },
      order: room.order,
      proposalsSubmitted: connectedIds.filter((id) => room.players[id]?.proposal !== null).length,
      proposalsNeeded: connectedIds.length,
      score: room.score,
    };
  }
}
