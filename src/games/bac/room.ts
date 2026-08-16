import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { pickRandomLetter, buildRoundResult, recomputeScores } from "./logic";
import { CATEGORY_IDS } from "./categories";
import { GAME_SLUGS } from "../../lib/gameSlugs";

const MAX_NAME_LENGTH = 20;
const MAX_ANSWER_LENGTH = 40;
const MIN_PLAYERS_TO_START = 2;
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class BacRoom {
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
    const player: Player = { id, token, name, connected: true, answers: {} };
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

    const rawCategories = Array.isArray(msg.categories) ? msg.categories : [];
    const categories = [...new Set(rawCategories.filter((c): c is string => typeof c === "string" && CATEGORY_IDS.has(c)))];
    if (categories.length === 0) {
      this.sendError(session.ws, "Choisis au moins une catégorie.");
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    room.categories = categories;
    room.letter = pickRandomLetter();
    room.stoppedBy = null;
    room.result = null;
    for (const player of Object.values(room.players)) {
      player.answers = {};
    }
    room.phase = "play";

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
    await this.saveRoom();
  }

  private async onStop(session: Session, room: RoomState) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected) return;

    room.stoppedBy = session.playerId;
    room.result = buildRoundResult(room);
    room.phase = "review";

    await this.saveRoom();
    this.broadcast();
  }

  private async onSetValid(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      this.sendError(session.ws, "Seul l'hôte peut valider les réponses.");
      return;
    }
    if (room.phase !== "review" || !room.result) return;

    const category = String(msg.category ?? "");
    const playerId = String(msg.playerId ?? "");
    const catResult = room.result.byCategory.find((c) => c.category === category);
    const entry = catResult?.entries.find((e) => e.playerId === playerId);
    if (!entry) return;

    entry.valid = msg.valid === true;
    recomputeScores(room.result);

    await this.saveRoom();
    this.broadcast();
  }

  private async onFinishReview(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "review") return;
    room.phase = "ended";
    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.answers = {};
    }
    room.phase = "lobby";
    room.letter = null;
    room.stoppedBy = null;
    room.result = null;
    // room.categories is kept so the host doesn't have to re-pick them.

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
      hostId: room.hostId,
      players,
      categories: room.categories,
      letter: room.phase === "lobby" ? null : room.letter,
      you: you && { id: you.id, answers: you.answers },
      stoppedByName: room.stoppedBy ? room.players[room.stoppedBy]?.name ?? null : null,
      result: room.phase === "review" || room.phase === "ended" ? room.result : null,
    };
  }
}
