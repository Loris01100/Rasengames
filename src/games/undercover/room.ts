import type { Env } from "../../env";
import { type RoomState, type Player, type Role, createEmptyRoom } from "./types";
import {
  assignRoles,
  startNewRound,
  tallyVotes,
  checkWinCondition,
  defaultSettings,
  validateSettings,
  normalizeWord,
} from "./logic";
import { CATEGORY_LABELS, type WordCategory } from "./words";
import { GAME_SLUGS } from "../../lib/gameSlugs";
import { reportRoom } from "../../lib/registry";

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

// "technique"/"random" words aren't reliably findable on MyAnimeList (jutsu
// names aren't indexed there), so non-anime categories try the character
// lookup first and fall back to an anime lookup (also covers Jikan's
// character search being down while anime search still works).

const MAX_NAME_LENGTH = 20;
const MIN_PLAYERS_TO_START = 3;

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class UndercoverRoom {
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
    this.attachSession(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async loadRoom(code: string): Promise<RoomState> {
    if (!this.room) {
      const stored = await this.state.storage.get<RoomState>("room");
      this.room = stored ?? createEmptyRoom(code.toUpperCase());
      this.visibility =
        (await this.state.storage.get<"public" | "private">("visibility")) ?? "private";
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
      slug: "undercover",
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
      this.sendError(session.ws, "Seul l'hôte peut changer la visibilité du salon.");
      return;
    }
    this.visibility = msg.visibility === "public" ? "public" : "private";
    await this.state.storage.put("visibility", this.visibility);
    await this.saveRoom();
    this.broadcast();
  }

  // Host-only, lobby-only: mid-game removal would need per-game turn/vote
  // fixups, and a disconnect already covers someone who just leaves.
  private async onKick(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      this.sendError(session.ws, "Seul l'hôte peut exclure un joueur.");
      return;
    }
    if (room.phase !== "lobby") {
      this.sendError(session.ws, "Impossible d'exclure quelqu'un en pleine partie.");
      return;
    }
    const targetId = String(msg.playerId ?? "");
    if (!targetId || targetId === room.hostId || !room.players[targetId]) return;

    delete room.players[targetId];
    room.playerOrder = room.playerOrder.filter((id) => id !== targetId);

    for (const s of this.sessions.filter((s) => s.playerId === targetId)) {
      try {
        s.ws.send(JSON.stringify({ type: "kicked" }));
        s.ws.close(1000, "kicked");
      } catch {
        // socket already gone
      }
    }

    await this.saveRoom();
    this.broadcast();
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
      case "clue":
        await this.onClue(session, room, msg);
        break;
      case "vote":
        await this.onVote(session, room, msg);
        break;
      case "whiteGuess":
        await this.onWhiteGuess(session, room, msg);
        break;
      case "restart":
        await this.onRestart(session, room);
        break;
      case "kick":
        await this.onKick(session, room, msg);
        break;
      case "setVisibility":
        await this.onSetVisibility(session, room, msg);
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
    const player: Player = { id, token, name, connected: true, alive: true };
    room.players[id] = player;
    room.playerOrder.push(id);
    // asHost lets the player who triggered a switchGame reclaim host in the
    // new room even if another player's join message happens to land first.
    if (!room.hostId || msg.asHost === true) room.hostId = id;
    session.playerId = id;

    room.settings = defaultSettings(room.playerOrder.length, room.settings.category);

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

    const rawSettings = msg.settings as
      | { undercoverCount?: unknown; mrWhiteCount?: unknown; category?: unknown }
      | undefined;
    if (rawSettings) {
      const category =
        typeof rawSettings.category === "string" && VALID_CATEGORIES.has(rawSettings.category)
          ? (rawSettings.category as WordCategory)
          : room.settings.category;
      const settings = {
        undercoverCount: Math.max(0, Number(rawSettings.undercoverCount) || 0),
        mrWhiteCount: Math.max(0, Number(rawSettings.mrWhiteCount) || 0),
        category,
      };
      const error = validateSettings(connectedCount, settings);
      if (error) {
        this.sendError(session.ws, error);
        return;
      }
      room.settings = settings;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    assignRoles(room);
    startNewRound(room);

    await this.saveRoom();
    this.broadcast();

    // The room may have moved on (restart, etc.) while these lookups were in
    // flight; only apply them if we're still in the round they were fetched for.
    if (room.civilianWord && room.undercoverWord) {
      await this.saveRoom();
      this.broadcast();
    }
  }

  private async onClue(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "clue") return;
    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    if (session.playerId !== currentPlayerId) {
      this.sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }
    const text = String(msg.text ?? "").trim().slice(0, 60);
    if (!text) {
      this.sendError(session.ws, "Indice vide.");
      return;
    }

    const player = room.players[session.playerId];
    if (player?.word && normalizeWord(text) === normalizeWord(player.word)) {
      this.sendError(session.ws, "Tu ne peux pas écrire ton propre mot.");
      return;
    }

    const alreadyGiven = room.clues.some((c) => normalizeWord(c.text) === normalizeWord(text));
    if (alreadyGiven) {
      this.sendError(session.ws, "Cet indice a déjà été donné ce tour-ci.");
      return;
    }

    room.clues.push({ playerId: session.playerId, text });
    room.currentTurnIndex += 1;

    if (room.currentTurnIndex >= room.turnOrder.length) {
      room.phase = "vote";
      room.votes = {};
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onVote(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "vote") return;
    const voter = room.players[session.playerId];
    if (!voter || !voter.alive) return;

    const targetId = String(msg.targetId ?? "");
    const target = room.players[targetId];
    if (!target || !target.alive) {
      this.sendError(session.ws, "Cible de vote invalide.");
      return;
    }

    room.votes[session.playerId] = targetId;

    const aliveIds = room.playerOrder.filter((id) => room.players[id]?.alive);
    const allVoted = aliveIds.every((id) => room.votes[id]);
    if (allVoted) {
      this.resolveVote(room);
    }

    await this.saveRoom();
    this.broadcast();
  }

  private resolveVote(room: RoomState) {
    const result = tallyVotes(room);

    if (result.tie || !result.eliminatedId) {
      startNewRound(room);
      room.lastVoteResult = result;
      return;
    }

    const eliminated = room.players[result.eliminatedId];
    eliminated.alive = false;
    room.eliminatedHistory.push({ playerId: eliminated.id, role: eliminated.role! });

    if (eliminated.role === "mrwhite") {
      room.phase = "whiteguess";
      room.pendingGuesserId = eliminated.id;
      room.lastVoteResult = result;
      return;
    }

    const winner = checkWinCondition(room);
    if (winner) {
      room.winner = winner;
      room.phase = "ended";
      room.lastVoteResult = result;
      return;
    }

    startNewRound(room);
    room.lastVoteResult = result;
  }

  private async onWhiteGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "whiteguess" || session.playerId !== room.pendingGuesserId) return;

    const guess = String(msg.word ?? "");
    room.pendingGuesserId = null;

    if (room.civilianWord && normalizeWord(guess) === normalizeWord(room.civilianWord)) {
      room.winner = "mrwhite";
      room.phase = "ended";
    } else {
      const winner = checkWinCondition(room);
      if (winner) {
        room.winner = winner;
        room.phase = "ended";
      } else {
        startNewRound(room);
      }
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.alive = true;
      player.role = undefined;
      player.word = undefined;
    }
    room.phase = "lobby";
    room.round = 0;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.clues = [];
    room.votes = {};
    room.lastVoteResult = null;
    room.eliminatedHistory = [];
    room.civilianWord = null;
    room.undercoverWord = null;
    room.pendingGuesserId = null;
    room.winner = null;

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
    // An undercover must not know they're the undercover — their own role
    // reads as "civilian" until the reveal, so the app never tells them and
    // they only have their (slightly off) word to go on. Mr White inevitably
    // knows, having no word at all.
    const ownRole = (p: Player): Role | undefined =>
      !revealAll && p.role === "undercover" ? "civilian" : p.role;
    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        alive: p.alive,
        isHost: p.id === room.hostId,
        role: revealAll ? p.role : p.id === forPlayerId ? ownRole(p) : undefined,
      }));

    const you = room.players[forPlayerId] ?? null;

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      round: room.round,
      hostId: room.hostId,
      players,
      you: you && { id: you.id, role: ownRole(you), word: you.word, alive: you.alive },
      turnOrder: room.turnOrder,
      currentTurnPlayerId: room.turnOrder[room.currentTurnIndex] ?? null,
      clues: room.clues,
      votesCast: Object.keys(room.votes).length,
      votesNeeded: room.playerOrder.filter((id) => room.players[id]?.alive).length,
      myVote: room.votes[forPlayerId] ?? null,
      lastVoteResult: room.lastVoteResult,
      eliminatedHistory: room.eliminatedHistory.map((e) => ({
        ...e,
        name: room.players[e.playerId]?.name ?? "?",
      })),
      pendingGuesserId: room.pendingGuesserId,
      winner: room.winner,
      civilianWord: revealAll ? room.civilianWord : undefined,
      undercoverWord: revealAll ? room.undercoverWord : undefined,
      settings: room.settings,
    };
  }
}
