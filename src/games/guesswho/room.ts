import type { Env } from "../../env";
import { type Player, type RoomState, createEmptyRoom } from "./types";
import { MAX_PLAYERS, MIN_PLAYERS, connectedIds, drawBoard, drawTargets, findOtherPlayer, nextGuesser, pickGuesser } from "./logic";
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

const MIN_NAME_LENGTH = 4;
const MAX_NAME_LENGTH = 20;

export class GuessWhoRoom {
  private sessions: Session[] = [];
  private room: RoomState | null = null;
  private lastReport = "";
  private visibility: "public" | "private" = "private";

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
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
      this.room = (await this.state.storage.get<RoomState>("room")) ?? createEmptyRoom(code.toUpperCase());
      this.room.scores ??= {};
      this.room.waiting ??= [];
      this.room.round ??= 0;
      const legacy = this.room as RoomState & {
        guesserId?: string | null;
        clueGiverId?: string | null;
        targetId?: string | null;
      };
      this.room.currentTurnId ??= legacy.guesserId ?? null;
      this.room.targetIds ??= {};
      this.room.questionCounts ??= {};
      this.room.guessedById ??= this.room.phase === "ended" ? legacy.guesserId ?? null : null;
      if (this.room.board.length > 0 && Object.keys(this.room.targetIds).length === 0) {
        if (legacy.clueGiverId && legacy.targetId) {
          this.room.targetIds[legacy.clueGiverId] = legacy.targetId;
        }
        const used = new Set(Object.values(this.room.targetIds));
        for (const playerId of this.room.playerOrder) {
          const fallback = this.room.board.find((card) => !used.has(card.id));
          if (!this.room.targetIds[playerId] && fallback) {
            this.room.targetIds[playerId] = fallback.id;
            used.add(fallback.id);
          }
        }
      }
      this.visibility =
        (await this.state.storage.get<"public" | "private">("visibility")) ?? "private";
    }
    return this.room;
  }

  private async saveRoom(): Promise<void> {
    if (!this.room) return;
    await this.state.storage.put("room", this.room);
    const summary = {
      slug: "guesswho",
      code: this.room.code,
      phase: this.room.phase,
      players: connectedIds(this.room).length,
      visibility: this.visibility,
    };
    const fingerprint = JSON.stringify(summary);
    if (fingerprint !== this.lastReport) {
      this.lastReport = fingerprint;
      await reportRoom(this.env, summary);
    }
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
  }

  private async handleClose(session: Session) {
    this.sessions = this.sessions.filter((item) => item !== session);
    if (session.spectator) {
      this.broadcast();
      return;
    }
    if (!this.room || !session.playerId) return;
    const stillHere = this.sessions.some((item) => item.playerId === session.playerId);
    const player = this.room.players[session.playerId];
    if (!player) return;
    if (!stillHere) {
      player.connected = false;
      reassignHost(this.room, player.id);
      await this.saveRoom();
      this.broadcast();
    }
  }

  private async handleMessage(session: Session, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES || tooManyMessages(session.recent)) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const room = this.room!;
    const spectatorResult = handleSpectatorMessage(session, msg, room.phase !== "lobby");
    if (spectatorResult !== "continue") {
      if (spectatorResult === "joined") this.broadcast();
      return;
    }
    switch (msg.type) {
      case "join": await this.onJoin(session, room, msg); break;
      case "start": await this.onStart(session, room, msg); break;
      case "endTurn": await this.onEndTurn(session, room); break;
      case "guess": await this.onGuess(session, room, msg); break;
      case "nextRound": await this.onNextRound(session, room); break;
      case "restart": await this.onRestart(session, room); break;
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
      case "setVisibility": await this.onSetVisibility(session, room, msg); break;
      case "switchGame": await switchGame(this.sessions, session, room, msg, this.env); break;
      default: sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
    }
  }

  private makePlayer(id: string, token: string, name: string): Player {
    return { id, token, name, connected: true };
  }

  private async onJoin(session: Session, room: RoomState, msg: Record<string, unknown>) {
    const name = String(msg.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (name.length < MIN_NAME_LENGTH) {
      sendError(session.ws, `Le pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.`);
      return;
    }
    if (typeof msg.token === "string" && msg.token) {
      const existing = Object.values(room.players).find((player) => player.token === msg.token);
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
    if (room.phase !== "lobby" || room.playerOrder.length >= MAX_PLAYERS) {
      sendError(session.ws, "Ce duel est complet. Utilise le mode spectateur pour regarder.");
      return;
    }
    if (nameTaken(room, name)) {
      sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
      return;
    }
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    room.players[id] = this.makePlayer(id, token, name);
    room.playerOrder.push(id);
    assignHostAfterSwitch(room, id, msg);
    session.playerId = id;
    session.ws.send(JSON.stringify({ type: "joined", playerId: id, token }));
    await this.saveRoom();
    this.broadcast();
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

  private async onStart(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId || room.phase !== "lobby") return;
    const connected = connectedIds(room);
    if (connected.length !== MIN_PLAYERS) {
      sendError(session.ws, "Il faut exactement 2 joueurs connectés.");
      return;
    }
    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
        room.playerOrder = room.playerOrder.filter((playerId) => playerId !== id);
      }
    }
    const guesserId = pickGuesser(room, typeof msg.guesserId === "string" ? msg.guesserId : null);
    this.startRound(room, guesserId);
    await this.saveRoom();
    this.broadcast();
  }

  private startRound(room: RoomState, guesserId: string | null) {
    const playerIds = connectedIds(room);
    room.currentTurnId = guesserId;
    room.board = drawBoard();
    room.targetIds = drawTargets(room.board, playerIds);
    room.questionCounts = Object.fromEntries(playerIds.map((id) => [id, 0]));
    room.guessedId = null;
    room.guessedById = null;
    room.winnerId = null;
    room.round += 1;
    room.phase = "play";
  }

  private async onEndTurn(session: Session, room: RoomState) {
    if (room.phase !== "play" || session.playerId !== room.currentTurnId) return;
    const nextId = findOtherPlayer(room, session.playerId);
    if (!nextId) {
      sendError(session.ws, "L'autre joueur doit être connecté pour continuer.");
      return;
    }
    room.questionCounts[session.playerId] = (room.questionCounts[session.playerId] ?? 0) + 1;
    room.currentTurnId = nextId;
    await this.saveRoom();
    this.broadcast();
  }

  private async onGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play" || session.playerId !== room.currentTurnId) return;
    const guessedId = String(msg.characterId ?? "");
    if (!room.board.some((card) => card.id === guessedId)) {
      sendError(session.ws, "Ce personnage n'est pas sur la grille.");
      return;
    }
    const opponentId = findOtherPlayer(room, session.playerId);
    if (!opponentId) return;
    room.questionCounts[session.playerId] = (room.questionCounts[session.playerId] ?? 0) + 1;
    room.guessedId = guessedId;
    room.guessedById = session.playerId;
    room.winnerId = guessedId === room.targetIds[opponentId] ? session.playerId : opponentId;
    if (room.winnerId) room.scores[room.winnerId] = (room.scores[room.winnerId] ?? 0) + 1;
    room.phase = "ended";
    await this.saveRoom();
    this.broadcast();
  }

  private async onNextRound(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;
    const guesserId = nextGuesser(room);
    if (!guesserId || connectedIds(room).length !== MIN_PLAYERS) {
      sendError(session.ws, "Les deux joueurs doivent être connectés pour continuer.");
      return;
    }
    this.startRound(room, guesserId);
    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase === "lobby") return;
    promoteWaiting(room);
    room.currentTurnId = null;
    room.board = [];
    room.targetIds = {};
    room.questionCounts = {};
    room.guessedId = null;
    room.guessedById = null;
    room.winnerId = null;
    room.phase = "lobby";
    await this.saveRoom();
    this.broadcast();
  }

  private buildView(room: RoomState, forPlayerId: string) {
    const guessedAgainstId = findOtherPlayer(room, room.guessedById);
    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((player) => ({ id: player.id, name: player.name })),
      hostId: room.hostId,
      players: room.playerOrder.map((id) => room.players[id]).filter(Boolean).map((player) => ({
        id: player.id,
        name: player.name,
        connected: player.connected,
        isHost: player.id === room.hostId,
        role: player.id === room.currentTurnId ? "turn" : null,
      })),
      currentTurnId: room.currentTurnId,
      board: room.board,
      ownTargetId: room.phase === "play" ? room.targetIds[forPlayerId] ?? null : null,
      revealedTargetId: room.phase === "ended" && guessedAgainstId
        ? room.targetIds[guessedAgainstId] ?? null
        : null,
      questionCounts: room.questionCounts,
      guessedId: room.phase === "ended" ? room.guessedId : null,
      guessedById: room.phase === "ended" ? room.guessedById : null,
      winnerId: room.phase === "ended" ? room.winnerId : null,
      round: room.round,
    };
  }
}
