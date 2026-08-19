import type { Env } from "../../env";
import { type RoomState, type Player, createEmptyRoom } from "./types";
import { MIN_PLAYERS, MAX_PLAYERS, connectedIds, othersOf, nextTurn } from "./logic";
import { GAME_SLUGS } from "../../lib/gameSlugs";
import { reportRoom } from "../../lib/registry";

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
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
      // rooms stored before multi-solve shipped have no `solved` array
      this.room.solved ??= [];
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
      slug: "detective",
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
      if (this.room.phase === "play" && this.room.turnId === player.id) {
        this.room.turnId = this.advanceTurn(this.room, player.id);
      }
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
        await this.onProposeCharacter(session, room, msg);
        break;
      case "guessCategory":
        await this.onGuessCategory(session, room, msg);
        break;
      case "answerIncoming":
        await this.onAnswerIncoming(session, room, msg);
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
    return {
      id,
      token,
      name,
      connected: true,
      category: null,
      ready: false,
      incoming: [],
    };
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

  private async onStart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId) {
      this.sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;

    const connectedCount = Object.values(room.players).filter((p) => p.connected).length;
    if (connectedCount < MIN_PLAYERS) {
      this.sendError(session.ws, `Il faut au moins ${MIN_PLAYERS} joueurs connectés.`);
      return;
    }

    for (const player of Object.values(room.players)) {
      player.category = null;
      player.ready = false;
      player.incoming = [];
    }
    room.log = [];
    room.solved = [];
    room.turnId = null;
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

    const ids = connectedIds(room);
    if (ids.length >= MIN_PLAYERS && ids.every((id) => room.players[id]?.ready)) {
      room.phase = "play";
      room.turnId = ids[0];
    }

    await this.saveRoom();
    this.broadcast();
  }

  // A proposed character is asked of every opponent at once; each judges it
  // against their own category, producing one log entry per target.
  private async onProposeCharacter(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const from = session.playerId;
    if (room.turnId !== from) {
      this.sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }
    // A category that's already been found is out of play: no point asking its
    // owner to keep judging proposals about it.
    const targets = this.openTargets(room, from);
    if (targets.length === 0) return;

    const text = String(msg.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return;

    for (const id of targets) room.players[id].incoming.push({ from, kind: "proposal", text });
    room.turnId = this.advanceTurn(room, from);

    await this.saveRoom();
    this.broadcast();
  }

  // Unlike a proposal, a guess names one specific opponent's category, so it's
  // sent to that one target only instead of everybody still in play.
  private async onGuessCategory(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const from = session.playerId;
    if (room.turnId !== from) {
      this.sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }
    const targets = this.openTargets(room, from);
    if (targets.length === 0) return;

    const targetId = String(msg.target ?? "");
    if (!targets.includes(targetId)) {
      this.sendError(session.ws, "Choisis un joueur valide à deviner.");
      return;
    }

    const text = String(msg.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return;

    room.players[targetId].incoming.push({ from, kind: "guess", text });
    room.turnId = this.advanceTurn(room, from);

    await this.saveRoom();
    this.broadcast();
  }

  private async onAnswerIncoming(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "play") return;
    const player = room.players[session.playerId];
    if (!player || player.incoming.length === 0) return;

    const fits = msg.fits === true;
    const { from, kind, text } = player.incoming.shift()!;
    room.log.push({ kind, from, target: player.id, text, fits });

    if (kind === "guess" && fits && !this.isSolved(room, player.id)) {
      room.solved.push({ target: player.id, by: from });
      // Ends only once every connected player's category has been found, not
      // after some fixed count — nobody's secret is left hanging.
      if (room.solved.length >= connectedIds(room).length) {
        // Trouvée en dernier = a tenu le plus longtemps : c'est le gagnant
        // affiché sur l'écran de fin, il prend le point de la manche.
        const winner = room.solved[room.solved.length - 1]?.target;
        if (winner) room.scores[winner] = (room.scores[winner] ?? 0) + 1;
        room.phase = "ended";
      }
    }
    if (room.phase === "play" && room.turnId && this.openTargets(room, room.turnId).length === 0) {
      room.turnId = this.advanceTurn(room, room.turnId);
    }

    await this.saveRoom();
    this.broadcast();
  }

  private isSolved(room: RoomState, playerId: string): boolean {
    return room.solved.some((s) => s.target === playerId);
  }

  private openTargets(room: RoomState, playerId: string): string[] {
    return othersOf(room, playerId).filter((id) => !this.isSolved(room, id));
  }

  // Skips anyone left with nothing to test (2-player room where the opponent's
  // category has already been found) — otherwise their turn would deadlock.
  private advanceTurn(room: RoomState, afterId: string | null): string | null {
    let next = nextTurn(room, afterId);
    for (let i = connectedIds(room).length; i > 0 && next; i--) {
      if (this.openTargets(room, next).length > 0) return next;
      next = nextTurn(room, next);
    }
    return next;
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.category = null;
      player.ready = false;
      player.incoming = [];
    }
    room.log = [];
    room.solved = [];
    room.turnId = null;
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
    const nameOf = (id: string) => room.players[id]?.name ?? "?";
    const you = room.players[forPlayerId] ?? null;

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
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
        solved: this.isSolved(room, you.id),
      },
      others: room.playerOrder
        .filter((id) => id !== forPlayerId)
        .map((id) => room.players[id])
        .filter((p): p is Player => !!p)
        .map((p) => ({
          id: p.id,
          name: p.name,
          connected: p.connected,
          ready: p.ready,
          pendingCount: p.incoming.length,
          // A found category is public knowledge, no need to wait for the end.
          category: revealAll || this.isSolved(room, p.id) ? p.category : null,
          solved: this.isSolved(room, p.id),
        })),
      turnId: room.turnId,
      turnName: room.turnId ? room.players[room.turnId]?.name ?? null : null,
      log: room.log,
      categoriesTotal: connectedIds(room).length,
      solved: room.solved.map((s) => ({
        target: s.target,
        targetName: nameOf(s.target),
        by: s.by,
        byName: nameOf(s.by),
      })),
    };
  }
}
