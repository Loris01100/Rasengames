import type { RoomState } from "./types";
import { pickCharacter } from "./characters";

// U+0300 (combining grave accent) to U+036F (combining latin small letter x),
// built from char codes to avoid embedding raw combining marks in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

export function normalizeGuess(word: string): string {
  return word.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

// A single player guesses per round. The host can name the guesser; otherwise
// it's drawn at random, never twice in a row when someone else could go.
export function startRound(room: RoomState, guesserId?: string | null, anime?: string | null): void {
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  if (connectedIds.length === 0) return;

  if (guesserId && connectedIds.includes(guesserId)) {
    room.guesserId = guesserId;
  } else {
    const candidates =
      connectedIds.length > 1 ? connectedIds.filter((id) => id !== room.guesserId) : connectedIds;
    room.guesserId = candidates[Math.floor(Math.random() * candidates.length)];
  }

  for (const id of connectedIds) {
    const player = room.players[id];
    player.character = null;
    player.characterAnime = null;
    player.characterImage = null;
    player.found = false;
    player.guesses = [];
  }
  const picked = pickCharacter(anime);
  room.players[room.guesserId].character = picked.name;
  room.players[room.guesserId].characterAnime = picked.anime;
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
