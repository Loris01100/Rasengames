// L'hôte est le seul à pouvoir démarrer, relancer, exclure, changer de jeu ou
// de visibilité : s'il ferme son onglet sans successeur, le salon devient
// inutilisable pour tous les autres. Typage structurel plutôt qu'un helper par
// jeu — les sept RoomState partagent déjà ces trois champs.
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
