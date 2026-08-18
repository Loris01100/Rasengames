import type { RoomState } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

// U+0300 (combining grave accent) to U+036F (combining latin small letter x),
// built from char codes to avoid embedding raw combining marks in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

export function normalizeGuess(word: string): string {
  return word.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

function shuffled<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Every connected player is assigned another player's submitted word to
// guess. Shuffling the play order and then pairing each player with the next
// one in that order (wrapping around) always produces a derangement — nobody
// is ever assigned their own word — while the shuffle keeps who-got-whose
// unpredictable. Also clears the now-consumed submissions.
export function assignWords(room: RoomState): void {
  const ids = shuffled(connectedIds(room));
  for (let i = 0; i < ids.length; i++) {
    const assignee = room.players[ids[i]];
    const source = room.players[ids[(i + 1) % ids.length]];
    assignee.word = source.submittedWord;
    assignee.wordImage = null;
    assignee.found = false;
    assignee.guesses = [];
  }
  for (const id of ids) {
    room.players[id].submittedWord = null;
    room.players[id].ready = false;
  }
}

// Flexible on purpose: a compound name ("Eren Yeager") is accepted from any
// single word of it ("Eren" alone passes), not just the exact full name.
export function isCorrectGuess(guess: string, word: string): boolean {
  const normGuess = normalizeGuess(guess);
  if (!normGuess) return false;
  if (normGuess === normalizeGuess(word)) return true;
  const tokens = word.split(/\s+/).map(normalizeGuess).filter(Boolean);
  return tokens.includes(normGuess);
}
