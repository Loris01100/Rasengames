export type Phase = "lobby" | "play" | "ended";

export interface CharacterCard {
  id: string;
  name: string;
  anime: string;
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
  guesserId: string | null;
  clueGiverId: string | null;
  board: CharacterCard[];
  targetId: string | null;
  guessedId: string | null;
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
    guesserId: null,
    clueGiverId: null,
    board: [],
    targetId: null,
    guessedId: null,
    winnerId: null,
    round: 0,
  };
}
