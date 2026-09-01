import { ALPHABET } from "../../lib/letters";

export type Phase = "lobby" | "play" | "review" | "ended";
export type RoundDuration = "short" | "normal" | "long";

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
  // Points cumulés sur les manches jouées dans ce salon (playerId -> points).
  scores: Record<string, number>;
  // Arrivés en cours de partie : hors de players/playerOrder, donc invisibles
  // pour la manche en cours, ils entrent au retour au lobby (promoteWaiting).
  waiting: Player[];
  categories: string[]; // selected category ids, kept across rounds
  // Les catégories personnalisées utilisent un identifiant interne stable ;
  // ce dictionnaire permet à tous les joueurs d'afficher le même libellé.
  categoryLabels: Record<string, string>;
  duration: RoundDuration;
  letter: string | null;
  // Lettres autorisées au tirage, choisies par l'hôte au lobby.
  letters: string[];
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
    scores: {},
    waiting: [],
    categories: [],
    categoryLabels: {},
    duration: "normal",
    letter: null,
    letters: [...ALPHABET],
    stoppedBy: null,
    endsAt: null,
    result: null,
  };
}
