export type Phase = "lobby" | "play" | "ended";
export type Step = "character" | "anime" | "lastChance";
export type LastChanceKind = "arc" | "lieu" | "pouvoir";

export interface ClueEntry {
  playerId: string;
  step: Step;
  text: string;
  kind?: LastChanceKind; // only set when step === "lastChance"
}

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  submitted: boolean; // has answered for the current step this round
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
  guesserId: string | null; // the one player who never sees `number`
  number: number | null; // the shared secret rating, 1-10
  step: Step | "guessing" | null; // current stage within "play"
  clues: ClueEntry[];
  guess: number | null;
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
    number: null,
    step: null,
    clues: [],
    guess: null,
  };
}
