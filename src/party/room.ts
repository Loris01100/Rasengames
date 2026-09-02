import type { Env } from "../env";
import { GAME_SLUGS, type GameSlug } from "../lib/gameSlugs";
import { createRoomCode } from "../lib/rooms";
import { MAX_MESSAGE_BYTES, tooManyMessages } from "../lib/throttle";
import { PARTY_GAMES, gameSupportsPlayers } from "./games";
import { awardPartyPoints } from "./logic";
import { createEmptyParty, type PartyPlayer, type PartyResult, type PartyState } from "./types";

interface PartySession {
  ws: WebSocket;
  playerId: string;
  recent: number[];
}

const MIN_NAME_LENGTH = 4;
const MAX_NAME_LENGTH = 20;
const MAX_PLAYERS = 10;
const VALID_SLUGS = new Set<string>(GAME_SLUGS);

export class PartyRoom {
  private sessions: PartySession[] = [];
  private room: PartyState | null = null;

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
    const session: PartySession = { ws: server, playerId: "", recent: [] };
    this.sessions.push(session);
    server.addEventListener("message", (event) => {
      this.handleMessage(session, event.data).catch((error) => this.sendError(
        session,
        error instanceof Error ? error.message : "Erreur inconnue.",
      ));
    });
    const close = () => this.handleClose(session);
    server.addEventListener("close", close);
    server.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadRoom(code: string): Promise<PartyState> {
    if (!this.room) {
      this.room = (await this.state.storage.get<PartyState>("room")) ?? createEmptyParty(code.toUpperCase());
    }
    return this.room;
  }

  private async save(): Promise<void> {
    if (this.room) await this.state.storage.put("room", this.room);
  }

  private sendError(session: PartySession, message: string): void {
    try { session.ws.send(JSON.stringify({ type: "error", message })); } catch { /* socket fermé */ }
  }

  private broadcast(): void {
    if (!this.room) return;
    const state = this.buildView(this.room);
    for (const session of this.sessions) {
      if (!session.playerId) continue;
      try { session.ws.send(JSON.stringify({ type: "state", state })); } catch { /* socket fermé */ }
    }
  }

  private async handleClose(session: PartySession): Promise<void> {
    this.sessions = this.sessions.filter((item) => item !== session);
    if (!this.room || !session.playerId) return;
    const stillHere = this.sessions.some((item) => item.playerId === session.playerId);
    const player = this.room.players[session.playerId];
    if (player && !stillHere) {
      player.connected = false;
      await this.save();
      this.broadcast();
    }
  }

  private async handleMessage(session: PartySession, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES || tooManyMessages(session.recent)) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case "join": await this.onJoin(session, msg); break;
      case "start": await this.onStart(session, msg); break;
      case "finishGame": await this.onFinishGame(session, msg); break;
      case "nextGame": await this.onNextGame(session, msg); break;
      case "endParty": await this.onEndParty(session); break;
      case "restart": await this.onRestart(session); break;
      default: this.sendError(session, `Type de message inconnu : ${String(msg.type)}`);
    }
  }

  private async onJoin(session: PartySession, msg: Record<string, unknown>): Promise<void> {
    const room = this.room!;
    const name = String(msg.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (name.length < MIN_NAME_LENGTH) {
      this.sendError(session, `Le pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.`);
      return;
    }
    if (typeof msg.token === "string" && msg.token) {
      const existing = Object.values(room.players).find((player) => player.token === msg.token);
      if (existing) {
        const duplicate = Object.values(room.players).some(
          (player) => player.id !== existing.id && player.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          this.sendError(session, "Ce pseudo est déjà pris dans cette soirée.");
          return;
        }
        existing.connected = true;
        existing.name = name;
        session.playerId = existing.id;
        session.ws.send(JSON.stringify({ type: "joined", playerId: existing.id, token: existing.token }));
        await this.save();
        this.broadcast();
        return;
      }
    }
    if (room.phase !== "lobby") {
      this.sendError(session, "Cette soirée a déjà commencé.");
      return;
    }
    if (room.playerOrder.length >= MAX_PLAYERS) {
      this.sendError(session, "Cette soirée est complète.");
      return;
    }
    if (Object.values(room.players).some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      this.sendError(session, "Ce pseudo est déjà pris dans cette soirée.");
      return;
    }
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    room.players[id] = { id, token, name, connected: true, score: 0 };
    room.playerOrder.push(id);
    room.hostId ??= id;
    session.playerId = id;
    session.ws.send(JSON.stringify({ type: "joined", playerId: id, token }));
    await this.save();
    this.broadcast();
  }

  private connectedPlayers(room: PartyState): PartyPlayer[] {
    return room.playerOrder.map((id) => room.players[id]).filter((player) => player?.connected);
  }

  private async onStart(session: PartySession, msg: Record<string, unknown>): Promise<void> {
    const room = this.room!;
    if (session.playerId !== room.hostId || room.phase !== "lobby") return;
    if (this.connectedPlayers(room).length < 2) {
      this.sendError(session, "Il faut au moins 2 joueurs connectés.");
      return;
    }
    const slug = String(msg.slug ?? "");
    if (!VALID_SLUGS.has(slug)) {
      this.sendError(session, "Choisis un jeu pour commencer.");
      return;
    }
    const game = PARTY_GAMES.find((item) => item.slug === slug);
    const count = this.connectedPlayers(room).length;
    if (!game || !gameSupportsPlayers(game, count)) {
      this.sendError(session, `${game?.label ?? slug} n'accepte pas ${count} joueurs.`);
      return;
    }
    room.playlist = [slug as GameSlug];
    room.currentIndex = 0;
    await this.launchCurrentGame(session);
  }

  private async launchCurrentGame(session: PartySession): Promise<void> {
    const room = this.room!;
    const slug = room.playlist[room.currentIndex];
    const game = PARTY_GAMES.find((item) => item.slug === slug);
    const count = this.connectedPlayers(room).length;
    if (!game || !gameSupportsPlayers(game, count)) {
      this.sendError(session, `${game?.label ?? slug} n'accepte pas ${count} joueurs.`);
      return;
    }
    const code = await createRoomCode(game.namespace(this.env), slug);
    room.currentGame = { slug, code };
    room.phase = "playing";
    room.lastResult = [];
    await this.save();
    this.broadcast();
    for (const current of this.sessions) {
      if (!current.playerId) continue;
      try {
        current.ws.send(JSON.stringify({
          type: "launchGame",
          slug,
          code,
          preserveHost: current.playerId === room.hostId,
        }));
      } catch { /* socket fermé */ }
    }
  }

  private async onFinishGame(session: PartySession, msg: Record<string, unknown>): Promise<void> {
    const room = this.room!;
    if (session.playerId !== room.hostId || room.phase !== "playing") return;
    const raw = Array.isArray(msg.results) ? msg.results : [];
    const gameScores = new Map<string, number>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const result = item as Record<string, unknown>;
      const name = String(result.name ?? "").trim().toLowerCase();
      const score = Number(result.score);
      if (name && Number.isFinite(score)) gameScores.set(name, score);
    }
    const players = room.playerOrder.map((id) => room.players[id]).filter(Boolean);
    const values = players.map((player) => gameScores.get(player.name.toLowerCase()) ?? 0);
    const awarded = awardPartyPoints(values);
    const result: PartyResult[] = players.map((player, index) => {
      const gameScore = gameScores.get(player.name.toLowerCase()) ?? 0;
      const partyPoints = awarded[index];
      player.score += partyPoints;
      return { playerId: player.id, name: player.name, gameScore, partyPoints };
    }).sort((a, b) => b.gameScore - a.gameScore || a.name.localeCompare(b.name));
    room.lastResult = result;
    room.phase = "summary";
    await this.save();
    this.broadcast();
    for (const current of this.sessions) {
      try { current.ws.send(JSON.stringify({ type: "returnToParty" })); } catch { /* socket fermé */ }
    }
  }

  private async onNextGame(session: PartySession, msg: Record<string, unknown>): Promise<void> {
    const room = this.room!;
    if (session.playerId !== room.hostId || room.phase !== "summary") return;
    const slug = String(msg.slug ?? "");
    if (!VALID_SLUGS.has(slug)) {
      this.sendError(session, "Choisis le prochain jeu.");
      return;
    }
    const game = PARTY_GAMES.find((item) => item.slug === slug);
    const count = this.connectedPlayers(room).length;
    if (!game || !gameSupportsPlayers(game, count)) {
      this.sendError(session, `${game?.label ?? slug} n'accepte pas ${count} joueurs.`);
      return;
    }
    room.playlist.push(slug as GameSlug);
    room.currentIndex += 1;
    await this.launchCurrentGame(session);
  }

  private async onEndParty(session: PartySession): Promise<void> {
    const room = this.room!;
    if (session.playerId !== room.hostId || room.phase !== "summary") return;
    room.phase = "ended";
    room.currentGame = null;
    await this.save();
    this.broadcast();
  }

  private async onRestart(session: PartySession): Promise<void> {
    const room = this.room!;
    if (session.playerId !== room.hostId || room.phase !== "ended") return;
    for (const player of Object.values(room.players)) player.score = 0;
    room.phase = "lobby";
    room.playlist = [];
    room.currentIndex = -1;
    room.currentGame = null;
    room.lastResult = [];
    await this.save();
    this.broadcast();
  }

  private buildView(room: PartyState) {
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      playlist: room.playlist,
      currentIndex: room.currentIndex,
      currentGame: room.currentGame,
      lastResult: room.lastResult,
      players: room.playerOrder.map((id) => room.players[id]).filter(Boolean).map((player) => ({
        id: player.id,
        name: player.name,
        connected: player.connected,
        score: player.score,
        isHost: player.id === room.hostId,
      })),
    };
  }
}
