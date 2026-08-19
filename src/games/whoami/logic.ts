import type { RoomState } from "./types";

export const MIN_PLAYERS = 2;
// A proposal costs two of your own turns: you must ask two more questions
// before you're allowed to name another character.
export const GUESS_COOLDOWN_QUESTIONS = 2;
export const MAX_PLAYERS = 5;

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

// Turn rotates only among players still guessing — someone who already found
// their word has no reason to keep asking questions.
export function nextTurn(room: RoomState, afterId: string | null): string | null {
  const ids = connectedIds(room).filter((id) => !room.players[id]?.found);
  if (ids.length === 0) return null;
  const index = afterId ? ids.indexOf(afterId) : -1;
  return ids[(index + 1) % ids.length];
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
    assignee.found = false;
    assignee.guesses = [];
    assignee.pendingGuess = null;
    assignee.nextGuessAt = 0;
  }
  for (const id of ids) {
    room.players[id].submittedWord = null;
    room.players[id].ready = false;
  }
}

