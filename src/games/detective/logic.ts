import type { RoomState } from "./types";

export const MAX_PLAYERS = 2;

export function opponentOf(room: RoomState, playerId: string): string | null {
  return room.playerOrder.find((id) => id !== playerId) ?? null;
}
