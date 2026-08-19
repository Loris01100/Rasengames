import type { Env } from "../../env";
import { type RoomState, type Player, type Mode, createEmptyRoom } from "./types";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  connectedIds,
  aliveIds,
  connectedAliveIds,
  nextTurn,
  randomLetter,
  randomBombDelay,
} from "./logic";
import { GAME_SLUGS } from "../../lib/gameSlugs";
import { reportRoom } from "../../lib/registry";

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);
const VALID_MODES: Mode[] = ["perso", "anime"];

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class BombRoom {
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
      this.room.mode = VALID_MODES.includes(this.room.mode) ? this.room.mode : "perso";
      this.room.eliminationOrder ??= [];
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
      slug: "bomb",
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
      // Sans ça, la bombe resterait bloquée dans les mains de quelqu'un qui
      // vient de partir jusqu'à ce qu'elle explose sur lui — on fait passer
      // le tour tout de suite, la mèche continue de courir sans être touchée.
      if (this.room.phase === "play" && this.room.turnId === player.id) {
        this.advanceTurn(this.room);
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
        await this.onStart(session, room, msg);
        break;
      case "pass":
        await this.onPass(session, room);
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
    return { id, token, name, connected: true, lives: 2, eliminated: false };
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
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const requestedMode = msg.mode as Mode;
    room.mode = VALID_MODES.includes(requestedMode) ? requestedMode : "perso";

    for (const player of Object.values(room.players)) {
      player.lives = 2;
      player.eliminated = false;
    }
    room.eliminationOrder = [];
    room.winnerId = null;

    const ids = connectedAliveIds(room);
    room.turnId = ids[Math.floor(Math.random() * ids.length)] ?? null;
    room.letter = randomLetter();
    room.phase = "play";

    await this.saveRoom();
    await this.scheduleBomb();
    this.broadcast();
  }

  // Le joueur dont c'est le tour vient de dire son mot à voix haute : la
  // bombe passe au suivant avec une nouvelle lettre. La mèche, elle, continue
  // de courir sans être touchée — ce n'est pas elle qu'on relance ici.
  private async onPass(session: Session, room: RoomState) {
    if (room.phase !== "play") return;
    if (room.turnId !== session.playerId) {
      this.sendError(session.ws, "Ce n'est pas ton tour.");
      return;
    }
    this.advanceTurn(room);
    await this.saveRoom();
    this.broadcast();
  }

  private advanceTurn(room: RoomState) {
    room.turnId = nextTurn(room, room.turnId);
    room.letter = room.turnId ? randomLetter() : null;
  }

  private async scheduleBomb(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + randomBombDelay());
  }

  // Réveillé par le runtime à l'heure fixée par scheduleBomb(), même si ce
  // Durable Object avait été déchargé entre-temps — c'est ce qui rend la mèche
  // fiable sans qu'aucun client n'ait à la faire tourner lui-même.
  async alarm(): Promise<void> {
    if (!this.room) {
      const stored = await this.state.storage.get<RoomState>("room");
      if (!stored) return;
      this.room = stored;
    }
    const room = this.room;
    if (room.phase !== "play") return;

    const holder = room.turnId ? room.players[room.turnId] : null;
    if (holder) {
      if (holder.lives > 0) {
        holder.lives -= 1;
      } else {
        holder.eliminated = true;
        room.eliminationOrder.push(holder.id);
      }
    }

    const survivors = aliveIds(room);
    if (survivors.length <= 1) {
      room.winnerId = survivors[0] ?? null;
      if (room.winnerId) room.scores[room.winnerId] = (room.scores[room.winnerId] ?? 0) + 1;
      room.turnId = null;
      room.letter = null;
      room.phase = "ended";
      await this.saveRoom();
      this.broadcast();
      return;
    }

    // La personne qui vient de se faire éliminer ne peut plus recevoir la
    // bombe : on repart d'après elle pour que le suivant soit forcément en vie.
    room.turnId = nextTurn(room, holder?.id ?? room.turnId);
    room.letter = room.turnId ? randomLetter() : null;

    await this.saveRoom();
    await this.scheduleBomb();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.lives = 2;
      player.eliminated = false;
    }
    room.eliminationOrder = [];
    room.winnerId = null;
    room.turnId = null;
    room.letter = null;
    this.promoteWaiting(room);
    room.phase = "lobby";

    // Filet de sécurité : pas de mèche en attente une fois la manche finie.
    await this.state.storage.deleteAlarm();
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

  private buildView(room: RoomState, _forPlayerId: string) {
    const nameOf = (id: string) => room.players[id]?.name ?? "?";

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        lives: p.lives,
        eliminated: p.eliminated,
      }));

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      mode: room.mode,
      hostId: room.hostId,
      players,
      turnId: room.turnId,
      turnName: room.turnId ? nameOf(room.turnId) : null,
      letter: room.letter,
      eliminationOrder: room.eliminationOrder.map((id) => ({ id, name: nameOf(id) })),
      winnerId: room.winnerId,
      winnerName: room.winnerId ? nameOf(room.winnerId) : null,
    };
  }
}
