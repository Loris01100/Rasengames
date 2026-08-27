import { GAME_SLUGS } from "./gameSlugs";

// La plomberie de session strictement identique dans les neuf `room.ts` :
// vérifiée au diff, ces fonctions y étaient copiées à l'octet près. Même
// critère que `host.ts` — on ne factorise que ce qui ne diverge pas d'un jeu
// à l'autre (les tours, les votes et les phases, eux, restent chez chaque
// jeu). Typage structurel/générique plutôt qu'une classe de base : chaque
// `RoomState` garde sa forme, on ne décrit ici que les champs touchés.
export interface Session {
  ws: WebSocket;
  playerId: string;
  spectator: boolean;
  spectatorName: string;
  // Horodatages des derniers messages reçus, cf. lib/throttle.ts.
  recent: number[];
}

const VALID_GAME_SLUGS: Set<string> = new Set(GAME_SLUGS);

export function sendError(ws: WebSocket, message: string): void {
  try {
    ws.send(JSON.stringify({ type: "error", message }));
  } catch {
    // socket already gone
  }
}

export function attachSession(
  sessions: Session[],
  ws: WebSocket,
  onMessage: (session: Session, raw: string | ArrayBuffer) => Promise<void>,
  onClose: (session: Session) => void,
): void {
  const session: Session = { ws, playerId: "", spectator: false, spectatorName: "", recent: [] };
  sessions.push(session);

  ws.addEventListener("message", (event) => {
    onMessage(session, event.data).catch((err) => {
      sendError(ws, err instanceof Error ? err.message : "Erreur inconnue.");
    });
  });

  const close = () => onClose(session);
  ws.addEventListener("close", close);
  ws.addEventListener("error", close);
}

// Chaque socket reçoit une vue *personnalisée* : c'est `buildView` qui filtre
// l'information cachée par destinataire, jamais ce broadcast.
export function broadcastState<R>(
  sessions: Session[],
  room: R | null,
  buildView: (room: R, playerId: string) => unknown,
): void {
  if (!room) return;
  const spectatorCount = sessions.filter((session) => session.spectator).length;
  for (const session of sessions) {
    if (!session.playerId) continue;
    const view = buildView(room, session.playerId);
    const state = {
      ...(view as Record<string, unknown>),
      spectator: session.spectator,
      spectatorCount,
    };
    try {
      session.ws.send(JSON.stringify({ type: "state", state }));
    } catch {
      // socket already gone; the close handler will clean it up
    }
  }
}

// Un spectateur est une session éphémère : aucune place dans `players`, aucun
// token persistant, aucun rôle et aucune action de jeu. Son identifiant factice
// permet malgré tout de réutiliser les vues personnalisées existantes.
export function handleSpectatorMessage(
  session: Session,
  msg: Record<string, unknown>,
  gameInProgress: boolean,
): "continue" | "joined" | "blocked" {
  if (session.spectator) {
    sendError(session.ws, "Le mode spectateur est en lecture seule.");
    return "blocked";
  }
  const shouldSpectate = msg.spectator === true || (gameInProgress && !msg.token);
  if (msg.type !== "join" || !shouldSpectate || session.playerId) return "continue";

  const name = String(msg.name ?? "").trim();
  if (name.length < 4 || name.length > 20) {
    sendError(session.ws, "Le pseudo doit contenir entre 4 et 20 caractères.");
    return "blocked";
  }

  session.playerId = `spectator:${crypto.randomUUID()}`;
  session.spectator = true;
  session.spectatorName = name;
  session.ws.send(JSON.stringify({ type: "joined", playerId: session.playerId, spectator: true }));
  return "joined";
}

export function nameTaken(
  room: { players: Record<string, { connected: boolean; name: string }>; waiting: { connected: boolean; name: string }[] },
  name: string,
): boolean {
  const taken = (p: { connected: boolean; name: string }) =>
    p.connected && p.name.toLowerCase() === name.toLowerCase();
  return Object.values(room.players).some(taken) || room.waiting.some(taken);
}

// Les joueurs arrivés en cours de partie rejoignent la table au retour au
// lobby, avec l'id et le token qu'ils ont déjà en localStorage.
export function promoteWaiting<P extends { id: string }>(room: {
  players: Record<string, P>;
  playerOrder: string[];
  waiting: P[];
}): void {
  for (const p of room.waiting) {
    room.players[p.id] = p;
    room.playerOrder.push(p.id);
  }
  room.waiting = [];
}

// Host-only, lobby-only: mid-game removal would need per-game turn/vote
// fixups, and a disconnect already covers someone who just leaves.
// Renvoie true quand l'état a changé — au jeu de sauvegarder et diffuser.
export function kickPlayer<P>(
  sessions: Session[],
  session: Session,
  room: { hostId: string | null; phase: string; players: Record<string, P>; playerOrder: string[] },
  msg: Record<string, unknown>,
): boolean {
  if (session.playerId !== room.hostId) {
    sendError(session.ws, "Seul l'hôte peut exclure un joueur.");
    return false;
  }
  if (room.phase !== "lobby") {
    sendError(session.ws, "Impossible d'exclure quelqu'un en pleine partie.");
    return false;
  }
  const targetId = String(msg.playerId ?? "");
  if (!targetId || targetId === room.hostId || !room.players[targetId]) return false;

  delete room.players[targetId];
  room.playerOrder = room.playerOrder.filter((id) => id !== targetId);

  for (const s of sessions.filter((s) => s.playerId === targetId)) {
    try {
      s.ws.send(JSON.stringify({ type: "kicked" }));
      s.ws.close(1000, "kicked");
    } catch {
      // socket already gone
    }
  }
  return true;
}

// Purely a redirect signal to every connected client — the group keeps its
// room code and just points its WebSocket at another game's room instead,
// so switching games doesn't require leaving and re-sharing a new code.
export function switchGame(
  sessions: Session[],
  session: Session,
  room: { code: string; hostId: string | null },
  msg: Record<string, unknown>,
): void {
  if (session.playerId !== room.hostId) {
    sendError(session.ws, "Seul l'hôte peut changer de jeu.");
    return;
  }
  const slug = String(msg.slug ?? "");
  if (!VALID_GAME_SLUGS.has(slug)) {
    sendError(session.ws, "Jeu invalide.");
    return;
  }
  for (const s of sessions) {
    try {
      // Le nouveau jeu choisit son hôte selon l'ordre d'arrivée, comme un
      // salon neuf : le rôle de l'ancien jeu n'est pas transféré de force.
      s.ws.send(JSON.stringify({ type: "switchGame", slug, code: room.code }));
    } catch {
      // socket already gone
    }
  }
}
