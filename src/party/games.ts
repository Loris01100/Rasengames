import type { GameSlug } from "../lib/gameSlugs";

export interface PartyGame {
  slug: GameSlug;
  label: string;
  icon: string;
  min: number;
  max?: number;
  exact?: number[];
}

export const PARTY_GAMES: PartyGame[] = [
  { slug: "undercover", label: "Undercover", icon: "🕵️", min: 3 },
  { slug: "hundred", label: "1 à 100", icon: "🔢", min: 3 },
  { slug: "bac", label: "Petit Bac", icon: "📝", min: 2 },
  { slug: "whoami", label: "Qui suis-je", icon: "🎭", min: 2, max: 5 },
  { slug: "detective", label: "Détective Anime", icon: "🔍", min: 2, max: 3 },
  { slug: "note", label: "Le jeu de la note", icon: "🔟", min: 3 },
  { slug: "bomb", label: "Alphabombe", icon: "💣", min: 2 },
  { slug: "codenames", label: "Codenames Anime", icon: "🗂️", min: 2, exact: [2, 4] },
  { slug: "sync", label: "Même longueur d'onde", icon: "🧠", min: 3, max: 10 },
  { slug: "guesswho", label: "Qui est-ce ?", icon: "🧑‍🤝‍🧑", min: 2, max: 2 },
];

export function gameSupportsPlayers(game: PartyGame, count: number): boolean {
  if (game.exact) return game.exact.includes(count);
  return count >= game.min && (!game.max || count <= game.max);
}
