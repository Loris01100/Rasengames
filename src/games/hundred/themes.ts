import type { Mode } from "./types";

// Two flavours of the same game: in "perso" mode the theme is a trait a
// *character* can have more or less of, in "anime" mode it's a dimension a
// *whole show* can be rated on. Keep both lists in sync with the copies in
// public/games/hundred/app.js (duplicated there so the host can preview them).
export const CHARACTER_THEMES: string[] = [
  "Puissance de combat",
  "Intelligence",
  "Popularité",
  "Charisme",
  "Drôlerie",
  "Loyauté",
  "Détermination",
  "Vitesse",
  "Instinct de sacrifice",
  "Chance",
  "Ambition",
  "Résistance à la douleur",
  "Niveau de cringe",
  "Capacité à survivre dans un shonen",
  "Talent pour les punchlines",
  "Sens de la mode",
  "Capacité à mourir bêtement",
  "Alignement moral (gentil → méchant)",
  "Tragique (histoire triste)",
  "Capacité à retourner sa veste",
];

export const ANIME_THEMES: string[] = [
  "Qualité des personnages",
  "Qualité de l'OST",
  "Qualité de l'opening",
  "Qualité globale de l'anime",
  "Qualité de l'animation",
  "Qualité des combats",
  "Qualité du méchant",
  "Qualité de la fin",
  "Popularité",
  "Niveau de hype",
  "Niveau de feels (ça fait pleurer)",
  "Complexité du scénario",
  "Envie de le revoir",
  "Fidélité au manga",
  "Niveau de cringe",
  "Niveau de fanservice",
  "Lenteur du rythme",
  "Sous-coté → sur-coté",
  "Difficulté à le conseiller à un non-initié",
  "Ancienneté",
];

export const THEMES_BY_MODE: Record<Mode, string[]> = {
  perso: CHARACTER_THEMES,
  anime: ANIME_THEMES,
};

export function pickRandomTheme(mode: Mode): string {
  const themes = THEMES_BY_MODE[mode] ?? CHARACTER_THEMES;
  return themes[Math.floor(Math.random() * themes.length)];
}
