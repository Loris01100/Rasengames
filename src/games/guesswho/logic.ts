import { CHARACTERS } from "./characters";
import type { CharacterCard, RoomState } from "./types";
import { drawFresh } from "../../lib/recent";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;
export const BOARD_SIZE = 24;
// Personnages dont le salon se souvient : trois grilles. Avec 120 cartes, il
// en reste toujours assez pour une grille entièrement neuve, donc ni la grille
// ni les personnages secrets ne reviennent avant trois manches.
export const RECENT_CHARACTERS = 3 * BOARD_SIZE;

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
  recent: readonly string[] = [],
): CharacterCard[] {
  return drawFresh(pool, BOARD_SIZE, recent, (card) => card.id, random);
}

export function findOtherPlayer(room: RoomState, playerId: string | null): string | null {
  return connectedIds(room).find((id) => id !== playerId) ?? null;
}

// Pendant une manche, le joueur de la manche (il a un personnage secret) qui
// n'est plus connecté — celui qui perdra par forfait s'il ne revient pas.
export function absentPlayerId(room: RoomState): string | null {
  if (room.phase !== "play") return null;
  return Object.keys(room.targetIds).find((id) => !room.players[id]?.connected) ?? null;
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
