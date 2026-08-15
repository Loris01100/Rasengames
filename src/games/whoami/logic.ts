import type { RoomState } from "./types";
import { pickRandomCharacters } from "./characters";

// U+0300 (combining grave accent) to U+036F (combining latin small letter x),
// built from char codes to avoid embedding raw combining marks in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

export function normalizeGuess(word: string): string {
  return word.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

export function assignCharacters(room: RoomState): void {
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  const picks = pickRandomCharacters(connectedIds.length);

  connectedIds.forEach((id, index) => {
    const player = room.players[id];
    player.character = picks[index];
    player.characterImage = null;
    player.found = false;
  });
  room.foundOrder = [];
}

export function isCorrectGuess(guess: string, character: string): boolean {
  return normalizeGuess(guess) === normalizeGuess(character);
}
