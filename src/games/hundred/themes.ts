export const THEMES: string[] = [
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

export function pickRandomTheme(): string {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}
