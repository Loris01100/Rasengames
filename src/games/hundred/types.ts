export type Phase = "lobby" | "propose" | "arrange" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  number: number | null;
  proposal: string | null;
}

export interface Score {
  correctPairs: number;
  total: number;
  sortedFully: boolean;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  theme: string | null;
  order: string[];
  score: Score | null;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
    theme: null,
    order: [],
    score: null,
  };
}
