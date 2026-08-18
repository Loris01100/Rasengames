import type { Mode } from "./types";

// Two flavours of the same game: in "perso" mode the theme is a trait a
// *character* can have more or less of, in "anime" mode it's a dimension a
// *whole show* can be rated on. Keep both lists in sync with the copies in
// public/games/hundred/app.js (duplicated there so the host can preview them).
export const CHARACTER_THEMES: string[] = [
  "Puissance",
  "Intelligence",
  "Popularité",
  "Charisme",
  "Drôle",
  "Loyauté",
  "Détermination",
  "Vitesse",
  "Instinct de sacrifice",
  "Ambition",
  "Cringe",
  "Talent pour les punchlines",
  "Style vestimentaire",
  "Capacité à mourir bêtement",
  "Histoire triste",
  "Capacité à retourner sa veste",
  "Bodycount",
  "Beauté (homme)",
  "Beauté (femme)",
  "Flow",
  "Aura",
  "Énergie de pnj",
  "Probabilité de finir célib",
  "Leader",
  "Meilleur colocataire",
  "Meilleur prof",
  "Développement de personnage",
  "Transformation",
];

export const ANIME_THEMES: string[] = [
  "Personnages",
  "Personnage principal",
  "OST",
  "Openings",
  "Anime",
  "Animation",
  "Combats",
  "Antagonistes",
  "Qualité de la fin",
  "Popularité",
  "Les émotions (ça fait pleurer)",
  "Quantité de fanservice",
  "Rythme",
  "Sous-coté",
  "Sur-coté",
  "Worldbuilding",
  "Chara-design",
  "Présence r34",
];

export const THEMES_BY_MODE: Record<Mode, string[]> = {
  perso: CHARACTER_THEMES,
  anime: ANIME_THEMES,
};

export function pickRandomTheme(mode: Mode): string {
  const themes = THEMES_BY_MODE[mode] ?? CHARACTER_THEMES;
  return themes[Math.floor(Math.random() * themes.length)];
}
