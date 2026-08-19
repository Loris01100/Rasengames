import type { WordCategory } from "./words";

export type Role = "civilian" | "undercover" | "mrwhite";

export type Phase = "lobby" | "clue" | "vote" | "whiteguess" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  alive: boolean;
  role?: Role;
  word?: string; // undefined for Mr White
}

export interface Clue {
  playerId: string;
  text: string;
}

export interface Elimination {
  playerId: string;
  role: Role;
}

export interface VoteResult {
  tally: Record<string, number>;
  eliminatedId: string | null;
  tie: boolean;
}

export interface Settings {
  undercoverCount: number;
  mrWhiteCount: number;
  category: WordCategory;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  round: number;
  players: Record<string, Player>;
  playerOrder: string[]; // stable join order, for display
  turnOrder: string[]; // clue order for the current round (alive players only)
  currentTurnIndex: number;
  clues: Clue[];
  votes: Record<string, string>; // voterId -> targetId
  lastVoteResult: VoteResult | null;
  eliminatedHistory: Elimination[];
  civilianWord: string | null;
  undercoverWord: string | null;
  pendingGuesserId: string | null;
  winner: Role | "civilians" | null;
  settings: Settings;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    round: 0,
    players: {},
    playerOrder: [],
    turnOrder: [],
    currentTurnIndex: 0,
    clues: [],
    votes: {},
    lastVoteResult: null,
    eliminatedHistory: [],
    civilianWord: null,
    undercoverWord: null,
    pendingGuesserId: null,
    winner: null,
    settings: { undercoverCount: 1, mrWhiteCount: 0, category: "random" },
  };
}
