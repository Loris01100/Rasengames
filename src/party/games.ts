import type { Env } from "../env";
import type { GameSlug } from "../lib/gameSlugs";

export interface PartyGame {
  slug: GameSlug;
  label: string;
  icon: string;
  min: number;
  max?: number;
  exact?: number[];
  namespace: (env: Env) => DurableObjectNamespace;
}

export const PARTY_GAMES: PartyGame[] = [
  { slug: "undercover", label: "Undercover", icon: "🕵️", min: 3, namespace: (env) => env.UNDERCOVER_ROOM },
  { slug: "hundred", label: "1 à 100", icon: "🔢", min: 3, namespace: (env) => env.HUNDRED_ROOM },
  { slug: "bac", label: "Petit Bac", icon: "📝", min: 2, namespace: (env) => env.BAC_ROOM },
  { slug: "whoami", label: "Qui suis-je", icon: "🎭", min: 2, max: 5, namespace: (env) => env.WHOAMI_ROOM },
  { slug: "detective", label: "Détective Anime", icon: "🔍", min: 2, max: 3, namespace: (env) => env.DETECTIVE_ROOM },
  { slug: "note", label: "Le jeu de la note", icon: "🔟", min: 3, namespace: (env) => env.NOTE_ROOM },
  { slug: "bomb", label: "Alphabombe", icon: "💣", min: 2, namespace: (env) => env.BOMB_ROOM },
  { slug: "codenames", label: "Codenames Anime", icon: "🗂️", min: 2, exact: [2, 4], namespace: (env) => env.CODENAMES_ROOM },
  { slug: "sync", label: "Même longueur d'onde", icon: "🧠", min: 3, max: 10, namespace: (env) => env.SYNC_ROOM },
  { slug: "guesswho", label: "Qui est-ce ?", icon: "🧑‍🤝‍🧑", min: 2, max: 2, namespace: (env) => env.GUESSWHO_ROOM },
];

export function gameSupportsPlayers(game: PartyGame, count: number): boolean {
  if (game.exact) return game.exact.includes(count);
  return count >= game.min && (!game.max || count <= game.max);
}
