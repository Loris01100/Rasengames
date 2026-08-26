import type { Env } from "../../env";
import { type RoomState, type Player, type Mode, createEmptyRoom } from "./types";
import { assignNumbers, computeScore, allProposed, shuffle } from "./logic";
import { pickRandomTheme } from "./themes";
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
import { sameWord } from "../../lib/words";

// "character:417" / "anime:20" — the exact AniList entry a player picked from
// the suggestions. Relayed as-is to every client so they all show the same
// picture; a name search can't tell King of Nanatsu no Taizai from Lelouch,
// whose aliases include "Black King". Validated because it comes from a client.
function parseAnilistRef(value: unknown): string | null {
  const ref = String(value ?? "");
  return /^(character|anime):[0-9]{1,9}$/.test(ref) ? ref : null;
}

const MAX_NAME_LENGTH = 20;
// 4 minimum : les pseudos d'une lettre rendaient les listes illisibles (et un
// joueur nommé "toi" se confondait avec le suffixe "(toi)" des rendus).
const MIN_NAME_LENGTH = 4;
const MAX_PROPOSAL_LENGTH = 40;
const MAX_THEME_LENGTH = 60;
const MIN_PLAYERS_TO_START = 3;
const VALID_MODES: Mode[] = ["perso", "anime"];

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
      // Le partant ne proposera jamais sa carte : sans ça la phase "propose"
      // attendait une proposition qui n'arriverait plus, pour toujours.
      this.maybeStartArrange(this.room);
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

  // Un joueur neuf, qu'il entre tout de suite ou qu'il patiente (waiting).
  private makePlayer(id: string, token: string, name: string): Player {
    return {
      id,
      token,
      name,
      connected: true,
      number: null,
      proposal: null,
      proposalRef: null,
    };
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
      sendError(session.ws, "Seul l'hôte peut démarrer la partie.");
      return;
    }
    if (room.phase !== "lobby") return;

    const connectedCount = Object.values(room.players).filter((p) => p.connected).length;
    if (connectedCount < MIN_PLAYERS_TO_START) {
      sendError(session.ws, `Il faut au moins ${MIN_PLAYERS_TO_START} joueurs connectés.`);
      return;
    }

    for (const id of [...room.playerOrder]) {
      if (!room.players[id]?.connected) {
        delete room.players[id];
        delete room.scores[id];
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
      sendError(session.ws, "Proposition vide.");
      return;
    }
    // Deux cartes identiques sur la ligne, c'est un débat sans réponse : on
    // refuse le doublon (et les quasi-doublons, cf. sameWord).
    const taken = Object.values(room.players).find(
      (p) => p.id !== player.id && p.connected && p.proposal && sameWord(p.proposal, text)
    );
    if (taken) {
      sendError(session.ws, `"${taken.proposal}" est déjà pris, trouve autre chose.`);
      return;
    }

    const ref = parseAnilistRef(msg.anilistRef);
    // The client already checks this against AniList before sending, but a
    // ref specifically also tells us its own kind for free (no lookup
    // needed) — this catches picking an anime's own title while browsing its
    // cast in "perso" mode, which the suggestion UI otherwise allows.
    if (ref && !ref.startsWith(room.mode === "anime" ? "anime:" : "character:")) {
      sendError(
        session.ws,
        room.mode === "anime" ? "Ça, c'est un personnage, pas un anime." : "Ça, c'est un anime, pas un personnage."
      );
      return;
    }

    player.proposal = text;
    player.proposalRef = ref;

    this.maybeStartArrange(room);

    await this.saveRoom();
    this.broadcast();
  }

  // Rejoué aussi à la déconnexion (cf. handleClose) : la bascule ne doit pas
  // dépendre de l'arrivée d'un message qui ne viendra plus.
  private maybeStartArrange(room: RoomState) {
    if (room.phase !== "propose" || !allProposed(room)) return;
    room.order = shuffle(room.playerOrder.filter((id) => room.players[id]?.connected));
    room.phase = "arrange";
  }

  private async onMove(session: Session, room: RoomState, msg: Record<string, unknown>) {
    if (room.phase !== "arrange") return;
    if (session.playerId !== room.hostId) {
      sendError(session.ws, "Seul l'hôte peut déplacer les cartes.");
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
      // Coopératif : la ligne est l'oeuvre de tout le monde, donc tout le
      // monde encaisse les paires réussies.
      for (const id of room.order) room.scores[id] = (room.scores[id] ?? 0) + room.score.correctPairs;
      room.phase = "ended";
    }

    await this.saveRoom();
    this.broadcast();
  }

  private async onRestart(session: Session, room: RoomState) {
    // Depuis n'importe quelle phase sauf le lobby : c'est aussi la sortie de
    // secours quand une manche reste bloquée (joueur parti sans revenir).
    if (session.playerId !== room.hostId || room.phase === "lobby") return;

    for (const player of Object.values(room.players)) {
      player.number = null;
      player.proposal = null;
      player.proposalRef = null;
    }
    promoteWaiting(room);
    room.phase = "lobby";
    room.theme = null;
    room.order = [];
    room.revealedCount = 0;
    room.score = null;

    await this.saveRoom();
    this.broadcast();
  }

  private broadcast() {
    broadcastState(this.sessions, this.room, (room, playerId) => this.buildView(room, playerId));
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
        proposalRef: proposalVisibleFor(p.id) ? p.proposalRef : null,
        number: numberVisibleFor(p.id) ? p.number : undefined,
      }));

    const you = room.players[forPlayerId] ?? null;
    const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);

    return {
      code: room.code,
      phase: room.phase,
      visibility: this.visibility,
      scores: room.scores,
      waiting: room.waiting.map((p) => ({ id: p.id, name: p.name })),
      mode: room.mode,
      hostId: room.hostId,
      theme: room.theme,
      players,
      you: you && {
        id: you.id,
        number: you.number,
        proposal: you.proposal,
        proposalRef: you.proposalRef,
      },
      order: room.order,
      revealedCount: room.revealedCount,
      proposalsSubmitted: connectedIds.filter((id) => room.players[id]?.proposal !== null).length,
      proposalsNeeded: connectedIds.length,
      score: room.score,
    };
  }
}
