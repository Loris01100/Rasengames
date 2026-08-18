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
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
  };
}
