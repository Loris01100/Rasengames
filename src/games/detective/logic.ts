import type { RoomState } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 3;

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

export function othersOf(room: RoomState, playerId: string): string[] {
  return connectedIds(room).filter((id) => id !== playerId);
}

// Turn is stored as a playerId rather than an index, so a disconnect that
// shortens the rotation can't silently shift whose turn it is.
export function nextTurn(room: RoomState, afterId: string | null): string | null {
  const ids = connectedIds(room);
  if (ids.length === 0) return null;
  const index = afterId ? ids.indexOf(afterId) : -1;
  return ids[(index + 1) % ids.length];
}

// Le nombre de catégories trouvées prime ; à résultat égal, le joueur qui a
// consommé le moins de propositions ou tentatives de catégorie passe devant.
export function rankInvestigators(room: RoomState) {
  return room.playerOrder
    .map((id) => ({
      id,
      name: room.players[id]?.name ?? "?",
      found: room.solved.filter((entry) => entry.by === id).length,
      questions: room.log.filter((entry) => entry.from === id).length,
    }))
    .sort((a, b) => b.found - a.found || a.questions - b.questions || a.name.localeCompare(b.name));
}
