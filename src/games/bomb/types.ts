import { ALPHABET } from "../../lib/letters";

export type Phase = "lobby" | "play" | "ended";

// "perso": chacun doit dire un personnage. "anime": chacun doit dire un anime.
// Seule la formulation change, la mécanique est identique.
export type Mode = "perso" | "anime";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  // 2 au départ. La bombe qui explose sur son tour en retire une ; à 0, la
  // fois suivante élimine (donc 3 explosions au total avant élimination).
  lives: number;
  eliminated: boolean;
}

export interface WordEntry {
  playerId: string;
  letter: string;
  text: string;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  mode: Mode;
  players: Record<string, Player>;
  playerOrder: string[];
  // Points cumulés sur les manches jouées dans ce salon (playerId -> points).
  scores: Record<string, number>;
  // Arrivés en cours de partie : hors de players/playerOrder, donc invisibles
  // pour la manche en cours, ils entrent au retour au lobby (promoteWaiting).
  waiting: Player[];
  turnId: string | null;
  letter: string | null;
  // Lettres autorisées au tirage, choisies par l'hôte au lobby.
  letters: string[];
  // Ce que chacun a tapé, dans l'ordre — c'est un jeu écrit, donc ça reste
  // affiché à tous plutôt que de disparaître une fois le tour passé.
  answers: WordEntry[];
  // Ordre d'élimination (premier éliminé en premier) : sert au classement final.
  eliminationOrder: string[];
  winnerId: string | null;
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    mode: "perso",
    players: {},
    playerOrder: [],
    scores: {},
    waiting: [],
    turnId: null,
    letter: null,
    letters: [...ALPHABET],
    answers: [],
    eliminationOrder: [],
    winnerId: null,
  };
}
