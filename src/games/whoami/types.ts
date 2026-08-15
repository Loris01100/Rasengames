export type Phase = "lobby" | "play" | "ended";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  character: string | null; // the character THIS player must guess — hidden from themself
  characterImage: string | null;
  found: boolean;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[];
  foundOrder: string[]; // player IDs, in the order they guessed correctly
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    players: {},
    playerOrder: [],
    foundOrder: [],
  };
}
