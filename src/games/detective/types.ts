export type Phase = "lobby" | "setup" | "play" | "ended";

export interface Incoming {
  from: string; // playerId who submitted this
  kind: "proposal" | "guess";
  text: string;
}

export interface LogEntry {
  kind: "proposal" | "guess";
  from: string; // playerId who submitted it
  target: string; // playerId whose category it was tested against
  text: string;
  fits: boolean; // for a proposal: does it fit the target's category; for a guess: was it correct
}

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  category: string | null; // this player's own secret category
  ready: boolean; // has submitted their category during setup
  incoming: Incoming[]; // proposals/guesses from the others this player must judge, oldest first
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  players: Record<string, Player>;
  playerOrder: string[]; // capped at MAX_PLAYERS, ever
  // Points cumulés sur les manches jouées dans ce salon (playerId -> points).
  scores: Record<string, number>;
  // Arrivés en cours de partie : hors de players/playerOrder, donc invisibles
  // pour la manche en cours, ils entrent au retour au lobby (promoteWaiting).
  waiting: Player[];
  turnId: string | null; // whose turn it is to propose/guess during "play"
  log: LogEntry[];
  solved: { target: string; by: string }[]; // categories found, oldest first
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
    log: [],
    solved: [],
  };
}
