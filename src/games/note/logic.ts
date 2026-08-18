import type { RoomState, Step } from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export const STEP_ORDER: Step[] = ["character", "anime", "lastChance"];

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

// Everyone except the one guesser sees the secret number and contributes clues.
export function informedIds(room: RoomState): string[] {
  return connectedIds(room).filter((id) => id !== room.guesserId);
}

// Never the same guesser twice in a row when someone else could go.
export function pickGuesser(room: RoomState, requestedId?: string | null): string | null {
  const ids = connectedIds(room);
  if (ids.length === 0) return null;
  if (requestedId && ids.includes(requestedId)) return requestedId;
  const candidates = ids.length > 1 ? ids.filter((id) => id !== room.guesserId) : ids;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function nextStep(step: Step): Step | "guessing" {
  const index = STEP_ORDER.indexOf(step);
  return STEP_ORDER[index + 1] ?? "guessing";
}
