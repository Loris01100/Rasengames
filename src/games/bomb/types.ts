import { ALPHABET } from "../../lib/letters";

export type Phase = "lobby" | "play" | "ended";

// "perso": chacun doit dire un personnage. "anime": chacun doit dire un anime.
// Seule la formulation change, la mécanique est identique.
export type Mode = "perso" | "anime";

// "start": la réponse commence par la lettre. "contains": elle la contient
// n'importe où (accents et casse ignorés dans les deux cas).
export type LetterRule = "start" | "contains";

// Plage de la mèche choisie par l'hôte (bornes dans logic.ts, FUSES).
export type FuseKey = "short" | "normal" | "long" | "wild";

export interface Player {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  // room.lives au départ. La bombe qui explose sur son tour en retire une ;
  // à 0, la fois suivante élimine (2 vies = 3 explosions avant élimination).
  lives: number;
  eliminated: boolean;
}

export interface WordEntry {
  playerId: string;
  letter: string;
  text: string;
  // Anime d'origine du personnage, résolu dans le navigateur via AniList.
  anime?: string;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  phase: Phase;
  mode: Mode;
  rule: LetterRule;
  fuse: FuseKey;
  // Vies de départ de chaque joueur, choisies par l'hôte (0 = mort subite).
  lives: number;
  players: Record<string, Player>;
  playerOrder: string[];
  // Points cumulés sur les manches jouées dans ce salon (playerId -> points).
  scores: Record<string, number>;
  // Arrivés en cours de partie : hors de players/playerOrder, donc invisibles
  // pour la manche en cours, ils entrent au retour au lobby (promoteWaiting).
  waiting: Player[];
  turnId: string | null;
  // Avant cette heure, une alarme ne peut pas exploser chez le nouveau joueur.
  turnSafeUntil: number;
  letter: string | null;
  // Lettres autorisées au tirage, choisies par l'hôte au lobby.
  letters: string[];
  // Ce que chacun a tapé, dans l'ordre — c'est un jeu écrit, donc ça reste
  // affiché à tous plutôt que de disparaître une fois le tour passé.
  answers: WordEntry[];
  // Ordre d'élimination (premier éliminé en premier) : sert au classement final.
  eliminationOrder: string[];
  winnerId: string | null;
  // Dernières lettres tirées (une par tour), de la plus ancienne à la plus
  // récente : le tirage les évite (lib/recent.ts).
  recentDraws: string[];
}

export function createEmptyRoom(code: string): RoomState {
  return {
    code,
    hostId: null,
    phase: "lobby",
    mode: "perso",
    rule: "start",
    fuse: "normal",
    lives: 2,
    players: {},
    playerOrder: [],
    scores: {},
    waiting: [],
    turnId: null,
    turnSafeUntil: 0,
    letter: null,
    letters: [...ALPHABET],
    answers: [],
    eliminationOrder: [],
    winnerId: null,
    recentDraws: [],
  };
}
