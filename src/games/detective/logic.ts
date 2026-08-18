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
