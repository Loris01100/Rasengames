export type Phase = "lobby" | "submit" | "play" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  submittedWord: string | null; // written during "submit", for another player to guess
  ready: boolean; // has submitted a word this round
  word: string | null; // the word assigned to THIS player to guess — hidden from themself
  wordImage: string | null;
  found: boolean;
  guesses: string[]; // every attempt this player made this round, visible to everyone
  questionsAsked: number; // yes/no questions asked aloud this round, one per turn
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  turnId: string | null; // whose turn it is to ask a question during "play"
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
    turnId: null,
  };
}
