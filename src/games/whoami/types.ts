export type Phase = "lobby" | "submit" | "play" | "ended";

// "libre": chacun écrit ce qu'il veut. "categorie": l'hôte impose un thème
// (texte libre, pas une liste prédéfinie) que tout le monde doit respecter en
// écrivant son mot — non vérifié côté serveur, c'est une consigne affichée.
export type SubmitMode = "libre" | "categorie";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  submittedWord: string | null; // written during "submit", for another player to guess
  ready: boolean; // has submitted a word this round
  word: string | null;
  wordRef: string | null;
  submittedRef: string | null; // the word assigned to THIS player to guess — hidden from themself
  found: boolean;
  guesses: string[]; // validated attempts this round, visible to everyone
  pendingGuess: string | null; // proposed, waiting for the host to say if it's right
  nextGuessAt: number; // questionsAsked value this player must reach to propose again
  questionsAsked: number; // yes/no questions asked aloud this round, one per turn
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
  turnId: string | null; // whose turn it is to ask a question during "play"
  submitMode: SubmitMode;
  category: string | null; // set only when submitMode === "categorie"
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
    turnId: null,
    submitMode: "libre",
    category: null,
  };
}
