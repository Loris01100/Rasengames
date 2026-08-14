import type { RoomState, RoundResult } from "./types";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function pickRandomLetter(): string {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

// U+0300 (combining grave accent) to U+036F (combining latin small letter x),
// built from char codes to avoid embedding raw combining marks in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

export function isValidAnswer(answer: string, letter: string): boolean {
  const normalized = normalizeWord(answer);
  if (!normalized) return false;
  return normalized[0] === normalizeWord(letter);
}

// Classic "petit bac" scoring, fully automatic (no peer validation step):
// a valid answer (non-empty, starts with the round's letter) scores 2 points
// if no one else gave the same word in that category, 1 point if it's a
// valid duplicate, 0 if empty or doesn't start with the letter.
export function scoreRound(room: RoomState): RoundResult {
  const letter = room.letter!;
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  const totals: Record<string, number> = {};
  for (const id of connectedIds) totals[id] = 0;

  const byCategory = room.categories.map((category) => {
    const entries = connectedIds.map((playerId) => {
      const answer = room.players[playerId]?.answers[category] ?? "";
      const valid = isValidAnswer(answer, letter);
      return { playerId, answer, valid, points: 0 };
    });

    const counts = new Map<string, number>();
    for (const e of entries) {
      if (!e.valid) continue;
      const key = normalizeWord(e.answer);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const e of entries) {
      if (!e.valid) continue;
      const key = normalizeWord(e.answer);
      e.points = counts.get(key) === 1 ? 2 : 1;
      totals[e.playerId] += e.points;
    }

    return { category, entries };
  });

  return { letter, categories: room.categories, totals, byCategory };
}
