import { sendError, type Session } from "./session";

// L'hôte est le seul à pouvoir démarrer, relancer, exclure, changer de jeu ou
// de visibilité : s'il ferme son onglet sans successeur, le salon devient
// inutilisable pour tous les autres. Typage structurel plutôt qu'un helper par
// jeu — les neuf RoomState partagent déjà ces trois champs.
interface HostRoom {
  hostId: string | null;
  playerOrder: string[];
  players: Record<string, { connected: boolean }>;
}

export function reassignHost(room: HostRoom, leavingId: string): void {
  if (room.hostId !== leavingId) return;
  const next = room.playerOrder.find((id) => room.players[id]?.connected);
  // Personne d'autre en ligne : on garde l'hôte actuel, il reprendra la main
  // en se reconnectant (son token le remet sur le même id).
  if (next) room.hostId = next;
}

// Passer la main volontairement, sans quitter le salon : c'est le pendant
// choisi de `reassignHost`, qui lui ne se déclenche qu'en cas de départ.
// Lobby seulement, comme `kickPlayer` — le cas courant est « ce n'est pas moi
// qui aurais dû créer le salon », et l'hôte garde de toute façon son « Revenir
// au lobby » pour repasser par là en cours de partie.
// Renvoie true quand l'état a changé — au jeu de sauvegarder et diffuser.
export function transferHost(
  session: Session,
  room: { hostId: string | null; phase: string; players: Record<string, { connected: boolean }> },
  msg: Record<string, unknown>,
): boolean {
  if (session.playerId !== room.hostId) {
    sendError(session.ws, "Seul l'hôte peut passer la main.");
    return false;
  }
  if (room.phase !== "lobby") {
    sendError(session.ws, "Impossible de changer d'hôte en pleine partie.");
    return false;
  }
  const targetId = String(msg.playerId ?? "");
  const target = room.players[targetId];
  if (!target || targetId === room.hostId) return false;
  // Un déconnecté ferait un hôte fantôme : plus personne ne pourrait lancer
  // la partie tant qu'il n'est pas revenu.
  if (!target.connected) {
    sendError(session.ws, "Ce joueur est déconnecté.");
    return false;
  }

  room.hostId = targetId;
  return true;
}
