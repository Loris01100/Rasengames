export type Phase = "lobby" | "questions" | "answering" | "reveal" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  submitted: boolean;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  scores: Record<string, number>;
  waiting: Player[];
  refereeId: string | null;
  questions: string[];
  answers: Record<string, string[]>;
  revealQuestion: number;
  revealedCounts: number[];
  endReason: string | null;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
    scores: {},
    waiting: [],
    refereeId: null,
    questions: [],
    answers: {},
    revealQuestion: 0,
    revealedCounts: [0, 0, 0],
    endReason: null,
  };
}
