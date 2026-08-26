import type { RoomState } from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const QUESTION_COUNT = 3;

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

export function respondentIds(room: RoomState): string[] {
  return connectedIds(room).filter((id) => id !== room.refereeId);
}

export function pickReferee(room: RoomState, requestedId?: string | null): string | null {
  const ids = connectedIds(room);
  if (requestedId && ids.includes(requestedId)) return requestedId;
  if (ids.length === 0) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

export function answererIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => id !== room.refereeId && room.answers[id]);
}

export function answererIdsForQuestion(room: RoomState, question: number): string[] {
  return answererIds(room).filter((id) => room.answers[id]?.[question] != null);
}

export function normalizeAnswer(answer: string): string {
  return answer
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function calculateScores(room: RoomState): Record<string, number> {
  const scores: Record<string, number> = {};
  const ids = answererIds(room);
  for (const id of ids) scores[id] = 0;

  for (let question = 0; question < QUESTION_COUNT; question++) {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const key = normalizeAnswer(room.answers[id]?.[question] ?? "");
      if (!key) continue;
      const group = groups.get(key) ?? [];
      group.push(id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      for (const id of group) scores[id] += Math.max(0, group.length - 1);
    }
  }

  return scores;
}
