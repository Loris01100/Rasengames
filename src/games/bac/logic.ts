import type { RoomState, RoundResult } from "./types";
import { normalizeWord, sameWord } from "../../lib/words";

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
    const validated = cat.entries.filter((e) => e.valid);
    for (const e of cat.entries) {
      if (!e.valid) {
        e.points = 0;
        continue;
      }
      const shared = validated.some((o) => o !== e && sameWord(o.answer, e.answer));
      e.points = shared ? 1 : 2;
      result.totals[e.playerId] = (result.totals[e.playerId] ?? 0) + e.points;
    }
  }
}
