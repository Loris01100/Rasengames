import { GAME_SLUGS } from "./gameSlugs";
import type { Env } from "../env";
import { createRoomCode } from "./rooms";

// La plomberie de session strictement identique dans les `room.ts` :
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
  // Spectateur d'office (arrivé sans token en pleine partie) : de retour au
  // lobby, son join sans `spectator` le fait repasser par onJoin comme joueur.
  if (session.spectator && msg.type === "join" && msg.spectator !== true && !gameInProgress) {
    session.spectator = false;
    session.playerId = "";
    session.spectatorName = "";
    return "continue";
  }
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

// Pseudo retenu quand un joueur revient avec son token. On ne refuse jamais la
// reconnexion (le client n'aurait qu'un toast et resterait sans identité en
// pleine manche) mais deux joueurs ne doivent jamais partager un pseudo, même
// si l'un est déconnecté : la soirée rattache les scores par pseudo
// (onFinishGame) et deux « Naruto » s'y partageraient un même score.
// Ordre : le pseudo demandé s'il est libre, sinon l'ancien, sinon l'ancien
// suffixé d'un numéro (cas d'un nouveau venu qui a pris le pseudo d'un absent).
export function rejoinName(
  room: { players: Record<string, { id: string; name: string }>; waiting: { id: string; name: string }[] },
  selfId: string,
  requested: string,
  current: string,
  maxLength: number,
): string {
  const others = [...Object.values(room.players), ...room.waiting].filter((p) => p.id !== selfId);
  const free = (name: string) => !others.some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (free(requested)) return requested;
  if (free(current)) return current;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = current.slice(0, maxLength - suffix.length).trimEnd() + suffix;
    if (free(candidate)) return candidate;
  }
}

// Lors d'un changement de jeu, tous les navigateurs ouvrent un nouveau
// Durable Object. L'ancien hôte peut arriver après un autre
// joueur : ce marqueur lui rend alors la main au lieu de dépendre de la course
// entre connexions WebSocket.
export function assignHostAfterSwitch(
  room: { hostId: string | null },
  playerId: string,
  msg: Record<string, unknown>,
): void {
  if (!room.hostId || msg.preserveHost === true) room.hostId = playerId;
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

// Au lobby seulement : un salon plein dont un joueur est parti libère la place
// du premier déconnecté (hors hôte) au profit du nouveau venu, sinon un seul
// départ bloque tout remplaçant tant que l'hôte n'exclut pas l'absent. En
// partie, le plafond compte toujours les absents (ils peuvent revenir).
export function lobbyFull<P extends { connected: boolean }>(
  room: { hostId: string | null; players: Record<string, P>; playerOrder: string[] },
  max: number,
): boolean {
  if (room.playerOrder.length < max) return false;
  const gone = room.playerOrder.find((id) => id !== room.hostId && !room.players[id]?.connected);
  if (!gone) return true;
  delete room.players[gone];
  room.playerOrder = room.playerOrder.filter((id) => id !== gone);
  return false;
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

// Redirige tout le groupe vers un salon neuf du jeu cible. Réutiliser le même
// code pouvait ressusciter une ancienne manche si le groupe revenait sur un
// jeu déjà visité ; le nouveau code reste transparent pour les joueurs.
export async function switchGame(
  sessions: Session[],
  session: Session,
  room: { code: string; hostId: string | null },
  msg: Record<string, unknown>,
  env: Env,
): Promise<void> {
  if (session.playerId !== room.hostId) {
    sendError(session.ws, "Seul l'hôte peut changer de jeu.");
    return;
  }
  const slug = String(msg.slug ?? "");
  if (!VALID_GAME_SLUGS.has(slug)) {
    sendError(session.ws, "Jeu invalide.");
    return;
  }
  const namespaces: Record<string, DurableObjectNamespace> = {
    undercover: env.UNDERCOVER_ROOM,
    hundred: env.HUNDRED_ROOM,
    bac: env.BAC_ROOM,
    whoami: env.WHOAMI_ROOM,
    detective: env.DETECTIVE_ROOM,
    note: env.NOTE_ROOM,
    bomb: env.BOMB_ROOM,
    codenames: env.CODENAMES_ROOM,
    sync: env.SYNC_ROOM,
    guesswho: env.GUESSWHO_ROOM,
  };
  const code = await createRoomCode(Object.entries(namespaces).map(([slug, namespace]) => ({ slug, namespace })));
  for (const s of sessions) {
    try {
      s.ws.send(JSON.stringify({
        type: "switchGame",
        slug,
        code,
        preserveHost: s.playerId === room.hostId,
      }));
    } catch {
      // socket already gone
    }
  }
}
