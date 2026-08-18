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

// A single player guesses per round; the guesser role rotates through the
// connected players so nobody has to sit out two rounds in a row.
export function startRound(room: RoomState): void {
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  if (connectedIds.length === 0) return;

  const previous = room.guesserId ? connectedIds.indexOf(room.guesserId) : -1;
  room.guesserId = connectedIds[(previous + 1) % connectedIds.length];

  for (const id of connectedIds) {
    const player = room.players[id];
    player.character = null;
    player.characterImage = null;
    player.found = false;
    player.guesses = [];
  }
  room.players[room.guesserId].character = pickRandomCharacters(1)[0];
}

// Flexible on purpose: a compound name ("Eren Yeager") is accepted from any
// single word of it ("Eren" alone passes), not just the exact full name.
export function isCorrectGuess(guess: string, character: string): boolean {
  const normGuess = normalizeGuess(guess);
  if (!normGuess) return false;
  if (normGuess === normalizeGuess(character)) return true;
  const tokens = character.split(/\s+/).map(normalizeGuess).filter(Boolean);
  return tokens.includes(normGuess);
}
