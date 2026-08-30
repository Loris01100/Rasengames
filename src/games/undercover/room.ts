import type { Env } from "../../env";
import { type RoomState, type Player, type Role, createEmptyRoom } from "./types";
import {
  assignRoles,
  startNewRound,
  tallyVotes,
  checkWinCondition,
  defaultSettings,
  validateSettings,
} from "./logic";
import { normalizeWord } from "../../lib/words";
import { CATEGORY_LABELS, type WordCategory } from "./words";
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

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

// "technique"/"random" words aren't reliably findable on MyAnimeList (jutsu
// names aren't indexed there), so non-anime categories try the character
// lookup first and fall back to an anime lookup (also covers Jikan's
// character search being down while anime search still works).

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
const MIN_PLAYERS_TO_START = 3;

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
      // Les salons créés avant ces champs sont relus tels qu'ils ont été
      // persistés : sans ça, le premier push dans waiting casse la manche.
      this.room.scores ??= {};
      this.room.waiting ??= [];
      this.room.clueHistory ??= [];
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
      sendError(session.ws, "Seul l'hôte peut changer la visibilité du salon.");
      return;
    }
    this.visibility = msg.visibility === "public" ? "public" : "private";
    await this.state.storage.put("visibility", this.visibility);
    await this.saveRoom();
    this.broadcast();
  }

  private async handleClose(session: Session) {
    this.sessions = this.sessions.filter((s) => s !== session);
    if (session.spectator) {
      this.broadcast();
      return;
    }
    if (!this.room || !session.playerId) return;

    const stillHere = this.sessions.some((s) => s.playerId === session.playerId);

    const player = this.room.players[session.playerId];
    if (!player) {
      // Un joueur en attente n'a pas de ligne dans la partie : il quitte la
      // file plutôt que d'être marqué déconnecté.
      if (!stillHere && this.room.waiting.some((p) => p.id === session.playerId)) {
        this.room.waiting = this.room.waiting.filter((p) => p.id !== session.playerId);
        await this.saveRoom();
        this.broadcast();
      }
      return;
    }

    if (!stillHere) {
      player.connected = false;
      reassignHost(this.room, player.id);
      this.maybeAdvancePhase(this.room);
      await this.saveRoom();
      this.broadcast();
    }
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

    // fetch() always loads the room before a session can send messages.
    const room = this.room!;

    const spectatorResult = handleSpectatorMessage(session, msg, room.phase !== "lobby");
    if (spectatorResult !== "continue") {
      if (spectatorResult === "joined") this.broadcast();
      return;
    }

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
      case "setVisibility":
        await this.onSetVisibility(session, room, msg);
        break;
      case "switchGame":
        await switchGame(this.sessions, session, room, msg, this.env);
        break;
      default:
        sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
    }
  }

  // Un joueur neuf, qu'il entre tout de suite ou qu'il patiente (waiting).
  private makePlayer(id: string, token: string, name: string): Player {
    return { id, token, name, connected: true, alive: true };
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
      // La partie tourne : au lieu de renvoyer le nouveau venu créer son propre
      // salon, on le met de côté et il entrera à la manche suivante.
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

    if (nameTaken(room, name)) {
      sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
      return;
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const player = this.makePlayer(id, token, name);
    room.players[id] = player;
    room.playerOrder.push(id);
    assignHostAfterSwitch(room, id, msg);
    session.playerId = id;

    room.settings = defaultSettings(room.playerOrder.length, room.settings.category);

    session.ws.send(JSON.stringify({ type: "joined", playerId: id, token }));
    await this.saveRoom();
    this.broadcast();
  }

  private async onStart(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;

    const connectedCount = Object.values(room.players).filter((p) => p.connected).length;
    if (connectedCount < MIN_PLAYERS_TO_START) {
      sendError(session.ws, `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs connectés.`);
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
        sendError(session.ws, error);
        return;
      }
      room.settings = settings;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
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
      sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }
    const text = String(msg.text ?? "").trim().slice(0, 60);
    if (!text) {
      sendError(session.ws, "Indice vide.");
      return;
    }

    const player = room.players[session.playerId];
    if (player?.word && normalizeWord(text) === normalizeWord(player.word)) {
      sendError(session.ws, "Tu ne peux pas écrire ton propre mot.");
      return;
    }

    const alreadyGiven = room.clues.some((c) => normalizeWord(c.text) === normalizeWord(text));
    if (alreadyGiven) {
      sendError(session.ws, "Cet indice a déjà été donné ce tour-ci.");
      return;
    }

    room.clues.push({ playerId: session.playerId, text });
    room.clueHistory.push({ round: room.round, playerId: session.playerId, text });
    room.currentTurnIndex += 1;
    this.maybeAdvancePhase(room);

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
      sendError(session.ws, "Cible de vote invalide.");
      return;
    }

    room.votes[session.playerId] = targetId;
    this.maybeAdvancePhase(room);

    await this.saveRoom();
    this.broadcast();
  }

  // Un joueur parti ne donnera plus d'indice et ne votera jamais : sans ça la
  // manche restait figée sur lui. Rejoué à chaque indice, chaque vote et
  // chaque déconnexion — en boucle, parce qu'une phase débloquée peut en
  // débloquer une autre (dernier vote -> nouveau tour d'indices, dont le
  // premier joueur est peut-être parti lui aussi).
  private maybeAdvancePhase(room: RoomState) {
    for (let guard = room.playerOrder.length * 2 + 2; guard > 0; guard--) {
      if (!this.advancePhaseOnce(room)) return;
    }
  }

  // Un pas, ou false quand il n'y a rien à débloquer.
  private advancePhaseOnce(room: RoomState): boolean {
    if (room.phase === "clue") {
      const currentId = room.turnOrder[room.currentTurnIndex];
      if (currentId === undefined) {
        room.phase = "vote";
        room.votes = {};
        return true;
      }
      if (room.players[currentId]?.connected) return false;
      room.currentTurnIndex += 1;
      return true;
    }

    if (room.phase === "vote") {
      const voters = room.playerOrder.filter((id) => {
        const p = room.players[id];
        return !!p && p.alive && p.connected;
      });
      if (voters.length === 0 || !voters.every((id) => room.votes[id])) return false;
      this.resolveVote(room);
      return true;
    }

    // Le Mr White éliminé est parti sans deviner : on tranche comme une
    // mauvaise réponse plutôt que de laisser la manche en suspens.
    if (room.phase === "whiteguess") {
      const guesser = room.pendingGuesserId ? room.players[room.pendingGuesserId] : null;
      if (!guesser || guesser.connected) return false;
      this.resolveWhiteGuess(room, "");
      return true;
    }

    return false;
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
      this.awardWin(room);
      room.lastVoteResult = result;
      return;
    }

    startNewRound(room);
    room.lastVoteResult = result;
  }

  private async onWhiteGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "whiteguess" || session.playerId !== room.pendingGuesserId) return;

    this.resolveWhiteGuess(room, String(msg.word ?? ""));
    this.maybeAdvancePhase(room);

    await this.saveRoom();
    this.broadcast();
  }

  private resolveWhiteGuess(room: RoomState, guess: string) {
    room.pendingGuesserId = null;

    if (room.civilianWord && normalizeWord(guess) === normalizeWord(room.civilianWord)) {
      room.winner = "mrwhite";
      room.phase = "ended";
      this.awardWin(room);
      return;
    }

    const winner = checkWinCondition(room);
    if (winner) {
      room.winner = winner;
      room.phase = "ended";
      this.awardWin(room);
      return;
    }

    startNewRound(room);
  }

  // Un point à chaque membre du camp gagnant, cumulé sur le salon.
  private awardWin(room: RoomState) {
    for (const p of Object.values(room.players)) {
      const won =
        room.winner === "civilians"
          ? p.role === "civilian"
          : room.winner === "undercover"
            ? p.role === "undercover" || p.role === "mrwhite"
            : room.winner === "mrwhite" && p.role === "mrwhite";
      if (won) room.scores[p.id] = (room.scores[p.id] ?? 0) + 1;
    }
  }

  private async onRestart(session: Session, room: RoomState) {
    // Depuis n'importe quelle phase sauf le lobby : c'est aussi la sortie de
    // secours quand une manche reste bloquée (joueur parti sans revenir).
    if (session.playerId !== room.hostId || room.phase === "lobby") return;

    for (const player of Object.values(room.players)) {
      player.alive = true;
      player.role = undefined;
      player.word = undefined;
    }
    promoteWaiting(room);
    // Le nombre d'undercover dépend de l'effectif, qui vient de changer.
    room.settings = defaultSettings(room.playerOrder.length, room.settings.category);
    room.phase = "lobby";
    room.round = 0;
    room.turnOrder = [];
    room.currentTurnIndex = 0;
    room.clues = [];
    room.clueHistory = [];
    room.votes = {};
    room.lastVoteResult = null;
    room.eliminatedHistory = [];
    room.civilianWord = null;
    room.civilianWordHint = null;
    room.wordCategory = null;
    room.undercoverWord = null;
    room.undercoverWordHint = null;
    room.pendingGuesserId = null;
    room.winner = null;

    await this.saveRoom();
    this.broadcast();
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
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
        // Le mot de chacun, en clair, une fois la manche finie — "résumé
        // des mots" : plus besoin de recouper rôle + les deux mots globaux.
        word: revealAll ? p.word : undefined,
        wordHint: revealAll ? p.wordHint : undefined,
      }));

    const you = room.players[forPlayerId] ?? null;

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      round: room.round,
      hostId: room.hostId,
      players,
      you: you && { id: you.id, role: ownRole(you), word: you.word, wordHint: you.wordHint, alive: you.alive },
      turnOrder: room.turnOrder,
      currentTurnPlayerId: room.turnOrder[room.currentTurnIndex] ?? null,
      clues: room.clues,
      // Le client résout les noms via state.players (les éliminés y restent).
      clueHistory: room.clueHistory,
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
      civilianWordHint: revealAll ? room.civilianWordHint : undefined,
      undercoverWordHint: revealAll ? room.undercoverWordHint : undefined,
      settings: room.settings,
      wordCategory: room.wordCategory,
    };
  }
}
