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
  // Joueur parti trop longtemps en pleine manche : il perd par forfait.
  forfeitById: string | null;
  round: number;
  // Identifiants des personnages des dernières grilles, du plus ancien au plus
  // récent : le tirage les évite (lib/recent.ts).
  recentDraws: string[];
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
    forfeitById: null,
    round: 0,
    recentDraws: [],
  };
}
