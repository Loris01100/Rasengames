export type Phase = "lobby" | "play" | "ended";

export interface CharacterCard {
  id: string;
  name: string;
  anime: string;
  anilistRef?: string;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  scores: Record<string, number>;
  waiting: Player[];
  currentTurnId: string | null;
  board: CharacterCard[];
  targetIds: Record<string, string>;
  questionCounts: Record<string, number>;
  guessedId: string | null;
  guessedById: string | null;
  winnerId: string | null;
  round: number;
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
    currentTurnId: null,
    board: [],
    targetIds: {},
    questionCounts: {},
    guessedId: null,
    guessedById: null,
    winnerId: null,
    round: 0,
  };
}
