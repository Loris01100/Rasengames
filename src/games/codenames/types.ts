export type Mode = "duet" | "teams";
export type Phase = "lobby" | "playing" | "ended";
export type DuetColor = "agent" | "bystander" | "assassin";
export type TeamColor = "agentA" | "agentB" | "neutral" | "assassin";
export type Seat = "A" | "B";
export type Team = "A" | "B";
export type Role = "spymaster" | "operative";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  seat?: Seat; // mode "duet" seulement
  team?: Team; // mode "teams" seulement
  role?: Role; // mode "teams" seulement
}

export interface Clue {
  by: string;
  word: string;
  number: number;
  guessesLeft: number; // number + 1, décrémenté à chaque bonne pioche
}

// coop-* : issues du mode duet. "A" / "B" : équipe gagnante en mode teams.
export type Winner = "coop-win" | "coop-lose-errors" | "coop-lose-assassin" | "A" | "B" | null;

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  mode: Mode | null;
  players: Record<string, Player>;
  playerOrder: string[];
  // Points cumulés sur les manches jouées dans ce salon (playerId -> points).
  scores: Record<string, number>;
  // Arrivés en cours de partie : hors de players/playerOrder, entrent au retour au lobby.
  waiting: Player[];
  // Mots retirés du pool par l'hôte (lobby "Gérer les mots") — persiste
  // d'une manche à l'autre dans le salon, contrairement au reste qui se
  // réinitialise à chaque restart.
  excludedWords: string[];

  words: string[]; // 25 mots, ordre du plateau
  // Indice de contexte par mot (sa série d'origine, ou une catégorie
  // générique) — public, affiché sous chaque tuile pour aider qui ne
  // reconnaît pas un mot à construire son indice. Même index que `words`.
  wordHints: string[];

  // ---- mode duet ----
  // Chaque siège voit sa propre clé en permanence (pas seulement à son tour) :
  // c'est elle qui lui sert à donner ses indices sur toute la partie.
  keyA: DuetColor[] | null;
  keyB: DuetColor[] | null;
  duetTurnSeat: Seat | null; // siège qui donne l'indice actif
  duetErrors: number;
  duetErrorsMax: number;
  duetAgentsTotal: number; // union des cases "agent" des deux clés, figée au démarrage

  // ---- mode teams ----
  teamColors: TeamColor[] | null; // une seule clé, vue par les deux chiffreurs
  turnTeam: Team | null;
  remainingA: number;
  remainingB: number;

  // ---- commun, une fois en partie ----
  // Une case n'est révélée qu'une fois : sa couleur retenue est celle de la
  // clé active au moment du clic (mode duet), ou la couleur unique (mode teams).
  revealed: boolean[];
  revealedColor: (DuetColor | TeamColor | null)[];

  currentClue: Clue | null;
  winner: Winner;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    mode: null,
    players: {},
    playerOrder: [],
    scores: {},
    waiting: [],
    excludedWords: [],
    words: [],
    wordHints: [],
    keyA: null,
    keyB: null,
    duetTurnSeat: null,
    duetErrors: 0,
    duetErrorsMax: 0,
    duetAgentsTotal: 0,
    teamColors: null,
    turnTeam: null,
    remainingA: 0,
    remainingB: 0,
    revealed: [],
    revealedColor: [],
    currentClue: null,
    winner: null,
  };
}
