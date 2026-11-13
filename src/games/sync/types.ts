import { type StepTimer, emptyStepTimer } from "../../lib/stepTimer";
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
  // Chrono par action, réglé par l'hôte au lancement (lib/stepTimer.ts).
  stepTimer: StepTimer;
  refereeId: string | null;
  // Joueurs qui ont tenu le rôle d'arbitre pendant la phase de réponses de la
  // manche en cours : ils ont vu les réponses en clair, ils ne répondent plus
  // jusqu'à la manche suivante (sinon il suffit de quitter puis revenir avec
  // son jeton pour recopier).
  formerReferees: string[];
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
    stepTimer: emptyStepTimer(),
    refereeId: null,
    formerReferees: [],
    questions: [],
    answers: {},
    revealQuestion: 0,
    revealedCounts: [0, 0, 0],
    endReason: null,
  };
}
