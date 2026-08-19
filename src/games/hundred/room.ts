import type { Env } from "../../env";
import { type RoomState, type Player, type Mode, createEmptyRoom } from "./types";
import { assignNumbers, computeScore, allProposed, shuffle } from "./logic";
import { pickRandomTheme } from "./themes";
import { fetchAnimeOrCharacterImage, fetchCharacterOrAnimeImage } from "../../lib/images";
import { GAME_SLUGS } from "../../lib/gameSlugs";
import { reportRoom } from "../../lib/registry";

const MAX_NAME_LENGTH = 20;
const MAX_PROPOSAL_LENGTH = 40;
const MAX_THEME_LENGTH = 60;
const MIN_PLAYERS_TO_START = 3;
const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);
const VALID_MODES: Mode[] = ["perso", "anime"];

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class HundredRoom {
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
      // Rooms persisted before the anime mode existed have no `mode` field.
      this.room.mode = VALID_MODES.includes(this.room.mode) ? this.room.mode : "perso";
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
      slug: "hundred",
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
      case "propose":
        await this.onPropose(session, room, msg);
        break;
      case "move":
        await this.onMove(session, room, msg);
        break;
      case "reveal":
        await this.onReveal(session, room);
        break;
      case "revealNext":
        await this.onRevealNext(session, room);
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
    const player: Player = {
      id,
      token,
      name,
      connected: true,
      number: null,
      proposal: null,
      proposalImage: null,
    };
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

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
      }
    }

    const requestedMode = msg.mode as Mode;
    room.mode = VALID_MODES.includes(requestedMode) ? requestedMode : "perso";

    const customTheme = String(msg.theme ?? "").trim().slice(0, MAX_THEME_LENGTH);
    room.theme = customTheme || pickRandomTheme(room.mode);
    room.order = [];
    room.score = null;
    assignNumbers(room);
    room.phase = "propose";

    await this.saveRoom();
    this.broadcast();
  }

  private async onPropose(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "propose") return;
    const player = room.players[session.playerId];
    if (!player || !player.connected) return;

    const text = String(msg.text ?? "").trim().slice(0, MAX_PROPOSAL_LENGTH);
    if (!text) {
      this.sendError(session.ws, "Proposition vide.");
      return;
    }
    player.proposal = text;
    player.proposalImage = null;

    if (allProposed(room)) {
      const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
      room.order = shuffle(connectedIds);
      room.phase = "arrange";
    }

    await this.saveRoom();
    this.broadcast();

    const image =
      room.mode === "anime"
        ? await fetchAnimeOrCharacterImage(text)
        : await fetchCharacterOrAnimeImage(text);
    // The player may have re-proposed (or the room restarted) while this
    // lookup was in flight; only apply it if it's still the current proposal.
    if (player.proposal === text) {
      player.proposalImage = image;
      await this.saveRoom();
      this.broadcast();
    }
  }

  private async onMove(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "arrange") return;
    if (session.playerId !== room.hostId) {
      this.sendError(session.ws, "Seul l'hôte peut déplacer les cartes.");
      return;
    }
    const mover = room.players[session.playerId];
    if (!mover || !mover.connected) return;

    const targetId = String(msg.playerId ?? "");
    if (!room.order.includes(targetId)) return;

    let toIndex = Math.trunc(Number(msg.toIndex));
    if (!Number.isFinite(toIndex)) return;

    room.order = room.order.filter((id) => id !== targetId);
    toIndex = Math.max(0, Math.min(toIndex, room.order.length));
    room.order.splice(toIndex, 0, targetId);

    await this.saveRoom();
    this.broadcast();
  }

  private async onReveal(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "arrange") return;

    room.revealedCount = 0;
    room.phase = "reveal";

    await this.saveRoom();
    this.broadcast();
  }

  private async onRevealNext(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "reveal") return;

    room.revealedCount = Math.min(room.revealedCount + 1, room.order.length);
    if (room.revealedCount >= room.order.length) {
      room.score = computeScore(room);
      room.phase = "ended";
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    if (session.playerId !== room.hostId || room.phase !== "ended") return;

    for (const player of Object.values(room.players)) {
      player.number = null;
      player.proposal = null;
      player.proposalImage = null;
    }
    room.phase = "lobby";
    room.theme = null;
    room.order = [];
    room.revealedCount = 0;
    room.score = null;

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
    const revealedInOrder =
      room.phase === "reveal" ? new Set(room.order.slice(0, room.revealedCount)) : null;
    // Proposals stay secret only while people are still submitting them —
    // once everyone's in, seeing the actual proposals is the whole point of
    // the debate. Numbers are the one thing that stays hidden until the
    // one-by-one reveal.
    const proposalVisibleFor = (id: string) => id === forPlayerId || room.phase !== "propose";
    const numberVisibleFor = (id: string) =>
      revealAll || id === forPlayerId || (revealedInOrder?.has(id) ?? false);

    const players = room.playerOrder
      .map((id) => room.players[id])
      .filter((p): p is Player => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.id === room.hostId,
        hasProposed: p.proposal !== null,
        proposal: proposalVisibleFor(p.id) ? p.proposal : null,
        proposalImage: proposalVisibleFor(p.id) ? p.proposalImage : null,
        number: numberVisibleFor(p.id) ? p.number : undefined,
      }));

    const you = room.players[forPlayerId] ?? null;
    const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      mode: room.mode,
      hostId: room.hostId,
      theme: room.theme,
      players,
      you: you && {
        id: you.id,
        number: you.number,
        proposal: you.proposal,
        proposalImage: you.proposalImage,
      },
      order: room.order,
      revealedCount: room.revealedCount,
      proposalsSubmitted: connectedIds.filter((id) => room.players[id]?.proposal !== null).length,
      proposalsNeeded: connectedIds.length,
      score: room.score,
    };
  }
}
