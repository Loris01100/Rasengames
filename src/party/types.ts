import type { GameSlug } from "../lib/gameSlugs";

export type PartyPhase = "lobby" | "playing" | "summary" | "ended";

export interface PartyPlayer {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  score: number;
}

export interface PartyResult {
  playerId: string;
  name: string;
  gameScore: number;
  partyPoints: number;
}

export interface PartyState {
  code: string;
  phase: PartyPhase;
  hostId: string | null;
  players: Record<string, PartyPlayer>;
  playerOrder: string[];
  playlist: GameSlug[];
  currentIndex: number;
  currentGame: { slug: GameSlug; code: string } | null;
  lastResult: PartyResult[];
}

export function createEmptyParty(code: string): PartyState {
  return {
    code,
    phase: "lobby",
    hostId: null,
    players: {},
    playerOrder: [],
    playlist: [],
    currentIndex: -1,
    currentGame: null,
    lastResult: [],
  };
}
