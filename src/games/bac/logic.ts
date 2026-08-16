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

// Only used as a soft hint in the review UI — the host is always the one
// who decides validity, nothing is auto-accepted.
export function isValidAnswer(answer: string, letter: string): boolean {
  const normalized = normalizeWord(answer);
  if (!normalized) return false;
  return normalized[0] === normalizeWord(letter);
}

// Builds the review table with every answer marked invalid by default — the
// host validates each one by hand (see recomputeScores) before anything scores.
export function buildRoundResult(room: RoomState): RoundResult {
  const letter = room.letter!;
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  const totals: Record<string, number> = {};
  for (const id of connectedIds) totals[id] = 0;

  const byCategory = room.categories.map((category) => {
    const entries = connectedIds.map((playerId) => {
      const answer = room.players[playerId]?.answers[category] ?? "";
      return { playerId, answer, valid: false, points: 0 };
    });
    return { category, entries };
  });

  return { letter, categories: room.categories, totals, byCategory };
}

// Classic "petit bac" scoring applied only to host-validated answers: 2
// points if no one else's validated answer in that category matches, 1
// point if it's a validated duplicate.
export function recomputeScores(result: RoundResult): void {
  for (const id of Object.keys(result.totals)) result.totals[id] = 0;

  for (const cat of result.byCategory) {
    const counts = new Map<string, number>();
    for (const e of cat.entries) {
      if (!e.valid) {
        e.points = 0;
        continue;
      }
      const key = normalizeWord(e.answer);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const e of cat.entries) {
      if (!e.valid) continue;
      const key = normalizeWord(e.answer);
      e.points = counts.get(key) === 1 ? 2 : 1;
      result.totals[e.playerId] = (result.totals[e.playerId] ?? 0) + e.points;
    }
  }
}
