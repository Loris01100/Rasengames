export type Phase = "lobby" | "propose" | "arrange" | "reveal" | "ended";

// "perso": chacun propose un personnage. "anime": chacun propose un anime.
// Seuls la liste de thèmes et les formulations changent, la mécanique est
// identique — c'est le même Durable Object, choisi par l'hôte au lobby.
export type Mode = "perso" | "anime";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  number: number | null;
  proposal: string | null;
}

export interface Score {
  correctPairs: number;
  total: number;
  sortedFully: boolean;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  mode: Mode;
  players: Record<string, Player>;
  playerOrder: string[];
  theme: string | null;
  order: string[];
  revealedCount: number;
  score: Score | null;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    mode: "perso",
    players: {},
    playerOrder: [],
    theme: null,
    order: [],
    revealedCount: 0,
    score: null,
  };
}
