import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import {
  BOARD_SIZE,
  DUET_MAX_ERRORS,
  pickBoard,
  generateDuetKey,
  countDuetAgents,
  countFoundAgents,
  cellColorFor,
  assignSeatsForDuet,
  assignTeamsAndRoles,
  parseTeamAssignment,
  generateTeamKey,
  resolveDuetGuess,
  resolveTeamGuess,
  switchDuetTurn,
  switchTeamTurn,
  passDuetTurn,
  passTeamTurn,
} from "./logic";
import { WORDS } from "./words";
import { normalizeWord } from "../../lib/words";
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

const MAX_NAME_LENGTH = 20;
const MIN_NAME_LENGTH = 4;
const MAX_CLUE_LENGTH = 30;

export class CodenamesRoom {
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
      // Salons persistés avant ces champs : relus tels quels plutôt que de casser.
      this.room.scores ??= {};
      this.room.waiting ??= [];
      this.room.wordHints ??= [];
      this.room.excludedWords ??= [];
      this.visibility = (await this.state.storage.get<"public" | "private">("visibility")) ?? "private";
    }
    return this.room;
  }

  private async saveRoom(): Promise<void> {
    if (this.room) {
      await this.state.storage.put("room", this.room);
      await this.reportToRegistry();
    }
  }

  private async reportToRegistry(): Promise<void> {
    if (!this.room) return;
    const summary = {
      slug: "codenames",
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
    if (!this.room || !session.playerId) return;

    const stillHere = this.sessions.some((s) => s.playerId === session.playerId);

    const player = this.room.players[session.playerId];
    if (!player) {
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
      this.maybeAutoPass(this.room);
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

    const room = this.room!;

    switch (msg.type) {
      case "join":
        await this.onJoin(session, room, msg);
        break;
      case "start":
        await this.onStart(session, room, msg);
        break;
      case "setWordFilter":
        await this.onSetWordFilter(session, room, msg);
        break;
      case "clue":
        await this.onClue(session, room, msg);
        break;
      case "guess":
        await this.onGuess(session, room, msg);
        break;
      case "pass":
        await this.onPass(session, room);
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
        switchGame(this.sessions, session, room, msg);
        break;
      default:
        sendError(session.ws, `Type de message inconnu: ${String(msg.type)}`);
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
    if (!room.hostId) room.hostId = id;
    session.playerId = id;

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

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const ids = [...room.playerOrder];
    if (ids.length !== 2 && ids.length !== 4) {
      sendError(session.ws, "Il faut exactement 2 joueurs (coopératif) ou 4 joueurs (équipes) pour lancer une partie.");
      return;
    }

    // Répartition des équipes choisie par l'hôte (4 joueurs). Absente, on tire
    // au sort ; présente mais devenue fausse (un joueur parti entre-temps), on
    // le dit plutôt que de démarrer sur autre chose que ce qu'il a réglé.
    const chosenTeams = msg.assignment === undefined || ids.length !== 4
      ? null
      : parseTeamAssignment(msg.assignment, ids);
    if (msg.assignment !== undefined && ids.length === 4 && !chosenTeams) {
      sendError(
        session.ws,
        "La répartition des équipes ne correspond plus aux joueurs du salon — vérifie-la et relance.",
      );
      return;
    }

    const excluded = new Set(room.excludedWords);
    const pool = WORDS.filter((entry) => !excluded.has(entry.word));
    if (pool.length < BOARD_SIZE) {
      sendError(
        session.ws,
        `Il ne reste que ${pool.length} mots actifs sur ${BOARD_SIZE} minimum — réactive-en depuis "Gérer les mots".`,
      );
      return;
    }

    const board = pickBoard(pool);
    room.words = board.map((entry) => entry.word);
    room.wordHints = board.map((entry) => entry.hint);
    room.revealed = new Array(BOARD_SIZE).fill(false);
    room.revealedColor = new Array(BOARD_SIZE).fill(null);
    room.currentClue = null;
    room.winner = null;

    if (ids.length === 2) {
      room.mode = "duet";
      const seats = assignSeatsForDuet(ids);
      for (const id of ids) room.players[id].seat = seats[id];
      room.keyA = generateDuetKey();
      room.keyB = generateDuetKey();
      room.duetAgentsTotal = countDuetAgents(room.keyA, room.keyB);
      room.duetErrorsMax = DUET_MAX_ERRORS;
      room.duetErrors = DUET_MAX_ERRORS;
      room.duetTurnSeat = "A";
      room.teamColors = null;
      room.turnTeam = null;
    } else {
      room.mode = "teams";
      const assignment = chosenTeams ?? assignTeamsAndRoles(ids);
      for (const id of ids) Object.assign(room.players[id], assignment[id]);
      const startingTeam = Math.random() < 0.5 ? "A" : "B";
      room.teamColors = generateTeamKey(startingTeam);
      room.remainingA = room.teamColors.filter((c) => c === "agentA").length;
      room.remainingB = room.teamColors.filter((c) => c === "agentB").length;
      room.turnTeam = startingTeam;
      room.keyA = null;
      room.keyB = null;
    }

    room.phase = "playing";
    await this.saveRoom();
    this.broadcast();
  }

  // Lobby uniquement : changer la liste en pleine partie changerait le pool
  // sous les pieds d'une manche déjà tirée, sans rien y gagner.
  private async onSetWordFilter(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut modifier la liste des mots.");
      return;
    }
    if (room.phase !== "lobby") return;

    const raw = Array.isArray(msg.excluded) ? msg.excluded : [];
    const validWords = new Set(WORDS.map((entry) => entry.word));
    const excluded = [...new Set(raw.filter((w): w is string => typeof w === "string" && validWords.has(w)))];

    if (WORDS.length - excluded.length < BOARD_SIZE) {
      sendError(session.ws, `Il faut garder au moins ${BOARD_SIZE} mots actifs.`);
      return;
    }

    room.excludedWords = excluded;
    await this.saveRoom();
    this.broadcast();
  }

  private async onClue(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "playing" || room.currentClue) return;
    const player = room.players[session.playerId];
    if (!player) return;

    if (room.mode === "duet") {
      if (player.seat !== room.duetTurnSeat) {
        sendError(session.ws, "Ce n'est pas ton tour de donner un indice.");
        return;
      }
    } else if (room.mode === "teams") {
      if (!(player.role === "spymaster" && player.team === room.turnTeam)) {
        sendError(session.ws, "Seul le chiffreur de l'équipe au tour peut donner un indice.");
        return;
      }
    } else {
      return;
    }

    const word = String(msg.word ?? "").trim().slice(0, MAX_CLUE_LENGTH);
    if (!word) {
      sendError(session.ws, "Indice vide.");
      return;
    }
    if (room.words.some((w) => normalizeWord(w) === normalizeWord(word))) {
      sendError(session.ws, "L'indice ne peut pas être un mot du plateau.");
      return;
    }
    const number = Math.max(1, Math.min(9, Math.floor(Number(msg.number)) || 1));

    room.currentClue = { by: session.playerId, word, number, guessesLeft: number + 1 };
    await this.saveRoom();
    this.broadcast();
  }

  private async onGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "playing" || !room.currentClue) return;
    const player = room.players[session.playerId];
    if (!player) return;

    const index = Number(msg.index);
    if (!Number.isInteger(index) || index < 0 || index >= room.words.length || room.revealed[index]) return;

    if (room.mode === "duet") {
      const guesserSeat = room.duetTurnSeat === "A" ? "B" : "A";
      if (player.seat !== guesserSeat) {
        sendError(session.ws, "Ce n'est pas à toi de deviner.");
        return;
      }
      resolveDuetGuess(room, index);
      this.awardIfEnded(room);
    } else if (room.mode === "teams") {
      if (!(player.role === "operative" && player.team === room.turnTeam)) {
        sendError(session.ws, "Ce n'est pas à ton équipe de deviner.");
        return;
      }
      resolveTeamGuess(room, index);
      this.awardIfEnded(room);
    } else {
      return;
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onPass(session: Session, room: RoomState) {
    if (room.phase !== "playing" || !room.currentClue) return;
    const player = room.players[session.playerId];
    if (!player) return;

    if (room.mode === "duet") {
      const guesserSeat = room.duetTurnSeat === "A" ? "B" : "A";
      if (player.seat !== guesserSeat) return;
      passDuetTurn(room);
    } else if (room.mode === "teams") {
      if (!(player.role === "operative" && player.team === room.turnTeam)) return;
      passTeamTurn(room);
    } else {
      return;
    }

    await this.saveRoom();
    this.broadcast();
  }

  // Un point à chaque membre du camp gagnant (les deux, en coopératif), cumulé sur le salon.
  private awardIfEnded(room: RoomState) {
    if (room.phase !== "ended") return;
    for (const p of Object.values(room.players)) {
      const won =
        room.winner === "coop-win"
          ? true
          : room.mode === "teams"
            ? p.team === room.winner
            : false;
      if (won) room.scores[p.id] = (room.scores[p.id] ?? 0) + 1;
    }
  }

  // Le chiffreur ou le devineur au tour qui part sans agir figerait la partie
  // sinon : personne d'autre ne connaît sa clé pour le remplacer, on passe le
  // tour à sa place (cf. src/CLAUDE.md, "un joueur qui part ne doit jamais
  // figer un salon"). Rejoué en boucle courte : le nouveau tour peut retomber
  // sur un joueur déjà déconnecté lui aussi.
  private maybeAutoPass(room: RoomState) {
    for (let guard = 4; guard > 0; guard--) {
      if (!this.autoPassOnce(room)) return;
    }
  }

  private autoPassOnce(room: RoomState): boolean {
    if (room.phase !== "playing") return false;

    if (room.mode === "duet") {
      const giverId = room.playerOrder.find((id) => room.players[id]?.seat === room.duetTurnSeat);
      const guesserSeat = room.duetTurnSeat === "A" ? "B" : "A";
      const guesserId = room.playerOrder.find((id) => room.players[id]?.seat === guesserSeat);
      if (!room.currentClue && giverId && !room.players[giverId]?.connected) {
        switchDuetTurn(room);
        return true;
      }
      if (room.currentClue && guesserId && !room.players[guesserId]?.connected) {
        passDuetTurn(room);
        return true;
      }
      return false;
    }

    if (room.mode === "teams") {
      const spymasterId = room.playerOrder.find(
        (id) => room.players[id]?.team === room.turnTeam && room.players[id]?.role === "spymaster",
      );
      const operativeId = room.playerOrder.find(
        (id) => room.players[id]?.team === room.turnTeam && room.players[id]?.role === "operative",
      );
      if (!room.currentClue && spymasterId && !room.players[spymasterId]?.connected) {
        switchTeamTurn(room);
        return true;
      }
      if (room.currentClue && operativeId && !room.players[operativeId]?.connected) {
        passTeamTurn(room);
        return true;
      }
      return false;
    }

    return false;
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase === "lobby") return;

    for (const p of Object.values(room.players)) {
      p.seat = undefined;
      p.team = undefined;
      p.role = undefined;
    }
    promoteWaiting(room);
    room.mode = null;
    room.phase = "lobby";
    room.words = [];
    room.wordHints = [];
    room.keyA = null;
    room.keyB = null;
    room.duetTurnSeat = null;
    room.duetErrors = 0;
    room.duetErrorsMax = 0;
    room.duetAgentsTotal = 0;
    room.teamColors = null;
    room.turnTeam = null;
    room.remainingA = 0;
    room.remainingB = 0;
    room.revealed = [];
    room.revealedColor = [];
    room.currentClue = null;
    room.winner = null;

    await this.saveRoom();
    this.broadcast();
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
  }

  private buildView(room: RoomState, forPlayerId: string) {
    const ended = room.phase === "ended";

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        seat: p.seat,
        team: p.team,
        role: p.role,
      }));

    const you = room.players[forPlayerId] ?? null;

    const board = room.words.map((word, i) => ({
      word,
      hint: room.wordHints[i] ?? "",
      revealed: room.revealed[i] ?? false,
      color: ended && room.mode === "teams" ? room.teamColors![i] : cellColorFor(room, i, forPlayerId),
    }));

    return {
      code: room.code,
      phase: room.phase,
      mode: room.mode,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      excludedWords: room.excludedWords,
      hostId: room.hostId,
      players,
      you: you && { id: you.id, seat: you.seat, team: you.team, role: you.role },
      board,
      duetTurnSeat: room.duetTurnSeat,
      duetErrors: room.duetErrors,
      duetErrorsMax: room.duetErrorsMax,
      duetAgentsTotal: room.duetAgentsTotal,
      duetAgentsFound: countFoundAgents(room),
      turnTeam: room.turnTeam,
      remainingA: room.remainingA,
      remainingB: room.remainingB,
      currentClue: room.currentClue,
      winner: room.winner,
      endKeyA: ended && room.mode === "duet" ? room.keyA : undefined,
      endKeyB: ended && room.mode === "duet" ? room.keyB : undefined,
    };
  }
}
