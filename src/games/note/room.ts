import type { Env } from "../../env";
import { type RoomState, type Player, type LastChanceKind, createEmptyRoom } from "./types";
import { MIN_PLAYERS, MAX_PLAYERS, connectedIds, informedIds, pickGuesser, nextStep } from "./logic";
import { GAME_SLUGS } from "../../lib/gameSlugs";
import { reportRoom } from "../../lib/registry";
import { reassignHost } from "../../lib/host";

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
const MAX_TEXT_LENGTH = 60;
const VALID_LAST_CHANCE_KINDS: Set<string> = new Set(["arc", "lieu", "pouvoir", "groupe", "arme"]);
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class NoteRoom {
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
      // Les salons créés avant ces champs sont relus tels qu'ils ont été
      // persistés : sans ça, le premier push dans waiting casse la manche.
      this.room.scores ??= {};
      this.room.waiting ??= [];
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
      slug: "note",
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
      // A disconnect can complete the "everyone answered" set for the current
      // step even though nobody submitted just now — recheck so the round
      // doesn't stall waiting on someone who just left.
      if (this.room.phase === "play") this.maybeAdvanceStep(this.room);
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
      case "submitClue":
        await this.onSubmitClue(session, room, msg);
        break;
      case "submitGuess":
        await this.onSubmitGuess(session, room, msg);
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

  // Un joueur neuf, qu'il entre tout de suite ou qu'il patiente (waiting).
  private makePlayer(id: string, token: string, name: string): Player {
    return { id, token, name, connected: true, submitted: false };
  }

  private nameTaken(room: RoomState, name: string): boolean {
    const taken = (p: Player) => p.connected && p.name.toLowerCase() === name.toLowerCase();
    return Object.values(room.players).some(taken) || room.waiting.some(taken);
  }

  // Les joueurs arrivés en cours de partie rejoignent la table au retour au
  // lobby, avec l'id et le token qu'ils ont déjà en localStorage.
  private promoteWaiting(room: RoomState) {
    for (const p of room.waiting) {
      room.players[p.id] = p;
      room.playerOrder.push(p.id);
    }
    room.waiting = [];
  }

  private async onJoin(session: Session, room: RoomState, msg: Record<string, unknown>) {
    const name = String(msg.name ?? "").trim().slice(0, MAX_NAME_LENGTH);
    if (name.length < MIN_NAME_LENGTH) {
      this.sendError(session.ws, `Le pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.`);
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
      if (room.playerOrder.length + room.waiting.length >= MAX_PLAYERS) {
        this.sendError(session.ws, `Ce salon est complet (${MAX_PLAYERS} joueurs max).`);
        return;
      }
      if (this.nameTaken(room, name)) {
        this.sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
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

    // Capped at MAX_PLAYERS ever, not just connected, so a late arrival can't
    // sneak into a slot freed by someone dropping mid-game.
    if (room.playerOrder.length >= MAX_PLAYERS) {
      this.sendError(session.ws, `Ce salon est complet (${MAX_PLAYERS} joueurs max).`);
      return;
    }

    if (this.nameTaken(room, name)) {
      this.sendError(session.ws, "Ce pseudo est déjà pris dans ce salon.");
      return;
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const player = this.makePlayer(id, token, name);
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

    const connectedCount = connectedIds(room).length;
    if (connectedCount < MIN_PLAYERS) {
      this.sendError(session.ws, `Il faut au moins ${MIN_PLAYERS} joueurs connectés.`);
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const requestedGuesserId = typeof msg.guesserId === "string" ? msg.guesserId : null;
    room.guesserId = pickGuesser(room, requestedGuesserId);
    room.number = 1 + Math.floor(Math.random() * 10);
    room.clues = [];
    room.guess = null;
    room.step = "character";
    for (const player of Object.values(room.players)) player.submitted = false;
    room.phase = "play";

    await this.saveRoom();
    this.broadcast();
  }

  private async onSubmitClue(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play" || !room.step || room.step === "guessing") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected || player.submitted) return;
    if (player.id === room.guesserId) {
      this.sendError(session.ws, "Tu es celui qui devine, tu ne réponds pas à ce tour.");
      return;
    }

    const text = String(msg.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) {
      this.sendError(session.ws, "Réponse vide.");
      return;
    }

    let kind: LastChanceKind | undefined;
    if (room.step === "lastChance") {
      const rawKind = String(msg.kind ?? "");
      if (!VALID_LAST_CHANCE_KINDS.has(rawKind)) {
        this.sendError(session.ws, "Choisis un arc, un lieu, un pouvoir, un groupe ou une arme.");
        return;
      }
      kind = rawKind as LastChanceKind;
    }

    room.clues.push({ playerId: player.id, step: room.step, text, kind });
    player.submitted = true;

    this.maybeAdvanceStep(room);

    await this.saveRoom();
    this.broadcast();
  }

  // Moves to the next clue step (or to "guessing") once every connected
  // informed player has answered for the current one.
  private maybeAdvanceStep(room: RoomState) {
    if (!room.step || room.step === "guessing") return;
    const ids = informedIds(room);
    const allAnswered = ids.length > 0 && ids.every((id) => room.players[id]?.submitted);
    if (!allAnswered) return;

    const next = nextStep(room.step);
    room.step = next;
    if (next !== "guessing") {
      for (const id of ids) room.players[id].submitted = false;
    }
  }

  private async onSubmitGuess(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play" || room.step !== "guessing") return;
    if (session.playerId !== room.guesserId) {
      this.sendError(session.ws, "Ce n'est pas à toi de deviner.");
      return;
    }

    const number = Number(msg.number);
    if (!Number.isInteger(number) || number < 1 || number > 10) {
      this.sendError(session.ws, "Choisis un chiffre entre 1 et 10.");
      return;
    }

    room.guess = number;
    // Coopératif : les indices valent autant que la réponse, donc la table
    // entière marque selon l'écart (pile 2 points, à 1 près 1 point).
    const gap = room.number == null ? 99 : Math.abs(number - room.number);
    const points = gap === 0 ? 2 : gap === 1 ? 1 : 0;
    if (points > 0) {
      for (const id of room.playerOrder) room.scores[id] = (room.scores[id] ?? 0) + points;
    }
    room.phase = "ended";

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    // Depuis n'importe quelle phase sauf le lobby : c'est aussi la sortie de
    // secours quand une manche reste bloquée (joueur parti sans revenir).
    if (session.playerId !== room.hostId || room.phase === "lobby") return;

    for (const player of Object.values(room.players)) player.submitted = false;
    room.guesserId = null;
    room.number = null;
    room.step = null;
    room.clues = [];
    room.guess = null;
    this.promoteWaiting(room);
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
    const iAmGuesser = forPlayerId === room.guesserId;

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        isGuesser: p.id === room.guesserId,
        submitted: p.submitted,
      }));

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      hostId: room.hostId,
      players,
      guesserId: room.guesserId,
      step: room.step,
      // Hidden from the guesser until the round ends — that's the whole game.
      number: revealAll || !iAmGuesser ? room.number : null,
      clues: room.clues,
      guess: room.guess,
    };
  }
}
