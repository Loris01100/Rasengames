import type { Env } from "../../env";
import { type Player, type RoomState, createEmptyRoom } from "./types";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  QUESTION_COUNT,
  answererIds,
  calculateScores,
  connectedIds,
  respondentIds,
} from "./logic";
import { reportRoom } from "../../lib/registry";
import { reassignHost, transferHost } from "../../lib/host";
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

const MIN_NAME_LENGTH = 4;
const MAX_NAME_LENGTH = 20;
const MAX_QUESTION_LENGTH = 140;
const MAX_ANSWER_LENGTH = 80;

export class SyncRoom {
  private state: DurableObjectState;
  private sessions: Session[] = [];
  private room: RoomState | null = null;
  private env: Env;
  private lastReport = "";
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
      this.room.scores ??= {};
      this.room.waiting ??= [];
      this.visibility =
        (await this.state.storage.get<"public" | "private">("visibility")) ?? "private";
    }
    return this.room;
  }

  private async saveRoom(): Promise<void> {
    if (!this.room) return;
    await this.state.storage.put("room", this.room);
    await this.reportToRegistry();
  }

  private async reportToRegistry(): Promise<void> {
    if (!this.room) return;
    const summary = {
      slug: "sync",
      code: this.room.code,
      phase: this.room.phase,
      players: connectedIds(this.room).length,
      visibility: this.visibility,
    };
    const fingerprint = JSON.stringify(summary);
    if (fingerprint === this.lastReport) return;
    this.lastReport = fingerprint;
    await reportRoom(this.env, summary);
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
    const room = this.room!;
    switch (msg.type) {
      case "join": await this.onJoin(session, room, msg); break;
      case "start": await this.onStart(session, room, msg); break;
      case "submitQuestions": await this.onSubmitQuestions(session, room, msg); break;
      case "submitAnswers": await this.onSubmitAnswers(session, room, msg); break;
      case "revealNext": await this.onRevealNext(session, room); break;
      case "restart": await this.onRestart(session, room); break;
      case "transferHost":
        if (transferHost(session, room, msg)) {
          await this.saveRoom();
          this.broadcast();
        }
        break;
      case "kick":
        if (kickPlayer(this.sessions, session, room, msg)) {
          await this.saveRoom();
          this.broadcast();
        }
        break;
      case "setVisibility": await this.onSetVisibility(session, room, msg); break;
      case "switchGame": switchGame(this.sessions, session, room, msg); break;
      default: sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
    }
  }

  private makePlayer(id: string, token: string, name: string): Player {
    return { id, token, name, connected: true, submitted: false };
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
    room.players[id] = this.makePlayer(id, token, name);
    room.playerOrder.push(id);
    if (!room.hostId || msg.asHost === true) room.hostId = id;
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
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;
    if (connectedIds(room).length < MIN_PLAYERS) {
      sendError(session.ws, `Il faut au moins ${MIN_PLAYERS} joueurs connectés.`);
      return;
    }

    const refereeId = typeof msg.refereeId === "string" ? msg.refereeId : "";
    if (!room.players[refereeId]?.connected) {
      sendError(session.ws, "Choisis un arbitre connecté avant de démarrer.");
      return;
    }
    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        room.playerOrder = room.playerOrder.filter((playerId) => playerId !== id);
      }
    }

    room.refereeId = refereeId;
    room.questions = [];
    room.answers = {};
    room.revealQuestion = 0;
    room.revealedCounts = [0, 0, 0];
    room.endReason = null;
    room.scores = {};
    for (const player of Object.values(room.players)) player.submitted = false;
    room.phase = "questions";
    await this.saveRoom();
    this.broadcast();
  }

  private async onSubmitQuestions(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "questions" || session.playerId !== room.refereeId) {
      sendError(session.ws, "Seul l'arbitre peut envoyer les questions.");
      return;
    }
    if (!Array.isArray(msg.questions) || msg.questions.length !== QUESTION_COUNT) {
      sendError(session.ws, `Écris exactement ${QUESTION_COUNT} questions.`);
      return;
    }
    const questions = msg.questions.map((value) => String(value).trim().slice(0, MAX_QUESTION_LENGTH));
    if (questions.some((question) => !question)) {
      sendError(session.ws, "Les trois questions doivent être remplies.");
      return;
    }
    room.questions = questions;
    room.phase = "answering";
    await this.saveRoom();
    this.broadcast();
  }

  private async onSubmitAnswers(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "answering" || !session.playerId || session.playerId === room.refereeId) return;
    const player = room.players[session.playerId];
    if (!player?.connected || player.submitted) return;
    if (!Array.isArray(msg.answers) || msg.answers.length !== QUESTION_COUNT) {
      sendError(session.ws, `Réponds aux ${QUESTION_COUNT} questions.`);
      return;
    }
    const answers = msg.answers.map((value) => String(value).trim().slice(0, MAX_ANSWER_LENGTH));
    if (answers.some((answer) => !answer)) {
      sendError(session.ws, "Toutes les réponses doivent être remplies.");
      return;
    }
    room.answers[player.id] = answers;
    player.submitted = true;
    this.maybeStartReveal(room);
    await this.saveRoom();
    this.broadcast();
  }

  private maybeStartReveal(room: RoomState) {
    if (room.phase !== "answering") return;
    const ids = respondentIds(room);
    if (ids.length === 0) {
      room.phase = "ended";
      room.endReason = "Il ne reste aucun joueur pour répondre.";
      return;
    }
    if (ids.every((id) => room.players[id]?.submitted)) room.phase = "reveal";
  }

  private async onRevealNext(session: Session, room: RoomState) {
    if (room.phase !== "reveal" || session.playerId !== room.refereeId) return;
    const ids = answererIds(room);
    const question = room.revealQuestion;
    const count = room.revealedCounts[question] ?? 0;
    if (count < ids.length) {
      room.revealedCounts[question] = count + 1;
    } else if (question < QUESTION_COUNT - 1) {
      room.revealQuestion += 1;
    } else {
      room.scores = calculateScores(room);
      room.phase = "ended";
    }
    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase === "lobby") return;
    room.refereeId = null;
    room.questions = [];
    room.answers = {};
    room.revealQuestion = 0;
    room.revealedCounts = [0, 0, 0];
    room.endReason = null;
    room.scores = {};
    for (const player of Object.values(room.players)) player.submitted = false;
    promoteWaiting(room);
    room.phase = "lobby";
    await this.saveRoom();
    this.broadcast();
  }

  private async handleClose(session: Session) {
    this.sessions = this.sessions.filter((current) => current !== session);
    if (!this.room || !session.playerId) return;
    const stillHere = this.sessions.some((current) => current.playerId === session.playerId);
    const player = this.room.players[session.playerId];
    if (!player) {
      if (!stillHere && this.room.waiting.some((pending) => pending.id === session.playerId)) {
        this.room.waiting = this.room.waiting.filter((pending) => pending.id !== session.playerId);
        await this.saveRoom();
        this.broadcast();
      }
      return;
    }
    if (stillHere) return;

    player.connected = false;
    reassignHost(this.room, player.id);
    if (player.id === this.room.refereeId && this.room.phase !== "lobby" && this.room.phase !== "ended") {
      // L'arbitre est le seul à pouvoir envoyer les questions et révéler. En
      // cas de départ, l'hôte (ou le premier joueur encore là) prend le rôle
      // immédiatement afin que la partie ne reste jamais bloquée.
      const nextReferee =
        (this.room.hostId && this.room.players[this.room.hostId]?.connected ? this.room.hostId : null) ??
        connectedIds(this.room)[0] ??
        null;
      if (nextReferee) {
        this.room.refereeId = nextReferee;
        delete this.room.answers[nextReferee];
        this.room.players[nextReferee].submitted = false;
        this.maybeStartReveal(this.room);
      } else {
        this.room.phase = "ended";
        this.room.endReason = "Il ne reste personne dans la partie.";
      }
    } else {
      this.maybeStartReveal(this.room);
    }
    await this.saveRoom();
    this.broadcast();
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
  }

  private buildView(room: RoomState, forPlayerId: string) {
    const refereeView = forPlayerId === room.refereeId;
    const ids = answererIds(room);
    const answers = ids.map((id, position) => ({
      playerId: id,
      values: room.answers[id].map((value, question) => {
        const revealed =
          room.phase === "ended" ||
          question < room.revealQuestion ||
          (room.phase === "reveal" && question === room.revealQuestion && position < (room.revealedCounts[question] ?? 0));
        return revealed ? value : null;
      }),
    }));
    const refereeAnswers = refereeView
      ? ids.map((id) => ({ playerId: id, values: room.answers[id] }))
      : [];

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((player) => ({ id: player.id, name: player.name })),
      hostId: room.hostId,
      refereeId: room.refereeId,
      questions: room.questions,
      answers,
      refereeAnswers,
      revealQuestion: room.revealQuestion,
      revealedCounts: room.revealedCounts,
      endReason: room.endReason,
      players: room.playerOrder
        .map((id) => room.players[id])
        .filter((player): player is Player => !!player)
        .map((player) => ({
          id: player.id,
          name: player.name,
          connected: player.connected,
          isHost: player.id === room.hostId,
          isReferee: player.id === room.refereeId,
          submitted: player.submitted,
        })),
    };
  }
}
