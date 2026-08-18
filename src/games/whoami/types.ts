export type Phase = "lobby" | "play" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  character: string | null; // set only on the guesser — hidden from themself
  characterImage: string | null;
  found: boolean;
  guesses: string[]; // every attempt this player made this round, visible to everyone
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  guesserId: string | null; // the single player guessing this round; everyone else makes them guess
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
    guesserId: null,
  };
}
