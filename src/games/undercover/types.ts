import type { WordCategory, PairCategory } from "./words";

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

// `clues` est vidé à chaque nouvelle manche : l'historique, lui, garde tout
// ce qui a été dit depuis le début de la partie, d'où le numéro de manche.
export interface HistoryClue extends Clue {
  round: number;
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
  // Points cumulés sur les manches jouées dans ce salon (playerId -> points).
  scores: Record<string, number>;
  // Arrivés en cours de partie : hors de players/playerOrder, donc invisibles
  // pour la manche en cours, ils entrent au retour au lobby (promoteWaiting).
  waiting: Player[];
  turnOrder: string[]; // clue order for the current round (alive players only)
  currentTurnIndex: number;
  clues: Clue[]; // manche en cours seulement
  clueHistory: HistoryClue[]; // toutes les manches de la partie
  votes: Record<string, string>; // voterId -> targetId
  lastVoteResult: VoteResult | null;
  eliminatedHistory: Elimination[];
  civilianWord: string | null;
  // Liste d'où sort la paire de la manche (utile même en "random").
  wordCategory: PairCategory | null;
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
    scores: {},
    waiting: [],
    turnOrder: [],
    currentTurnIndex: 0,
    clues: [],
    clueHistory: [],
    votes: {},
    lastVoteResult: null,
    eliminatedHistory: [],
    civilianWord: null,
    wordCategory: null,
    undercoverWord: null,
    pendingGuesserId: null,
    winner: null,
    settings: { undercoverCount: 1, mrWhiteCount: 0, category: "random" },
  };
}
