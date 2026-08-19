export type Phase = "lobby" | "play" | "review" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  answers: Record<string, string>; // categoryId -> current text
}

export interface CategoryEntry {
  playerId: string;
  answer: string;
  valid: boolean;
  points: number;
}

export interface CategoryResult {
  category: string;
  entries: CategoryEntry[];
}

export interface RoundResult {
  letter: string;
  categories: string[];
  totals: Record<string, number>; // playerId -> total points this round
  byCategory: CategoryResult[];
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  categories: string[]; // selected category ids, kept across rounds
  letter: string | null;
  stoppedBy: string | null; // playerId who called stop this round, null if the round timed out
  endsAt: number | null; // epoch ms of the automatic end of the round
  result: RoundResult | null;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
    categories: [],
    letter: null,
    stoppedBy: null,
    endsAt: null,
    result: null,
  };
}
