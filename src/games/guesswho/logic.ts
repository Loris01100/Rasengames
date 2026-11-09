import { CHARACTERS } from "./characters";
import type { CharacterCard, RoomState } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;
export const BOARD_SIZE = 24;

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

export function pickGuesser(
  room: RoomState,
  requestedId: string | null,
  random: () => number = Math.random,
): string | null {
  const ids = connectedIds(room);
  if (requestedId && ids.includes(requestedId)) return requestedId;
  return ids.length > 0 ? ids[Math.floor(random() * ids.length)] : null;
}

export function drawBoard(
  pool: CharacterCard[] = CHARACTERS,
  random: () => number = Math.random,
): CharacterCard[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, BOARD_SIZE);
}

export function findOtherPlayer(room: RoomState, playerId: string | null): string | null {
  return connectedIds(room).find((id) => id !== playerId) ?? null;
}

export function nextGuesser(room: RoomState): string | null {
  return findOtherPlayer(room, room.currentTurnId);
}

export function drawTargets(
  board: CharacterCard[],
  playerIds: string[],
  random: () => number = Math.random,
): Record<string, string> {
  const available = [...board];
  const targets: Record<string, string> = {};
  for (const playerId of playerIds) {
    if (available.length === 0) break;
    const index = Math.floor(random() * available.length);
    targets[playerId] = available.splice(index, 1)[0].id;
  }
  return targets;
}
