export interface Category {
  id: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { id: "anime", label: "Anime / Manga" },
  { id: "hero", label: "Personnage principal" },
  { id: "sidekick", label: "Personnage secondaire" },
  { id: "villain", label: "Antagoniste" },
  { id: "technique", label: "Technique / Pouvoir" },
  { id: "item", label: "Objet / Arme" },
  { id: "place", label: "Lieu / Monde" },
  { id: "guild", label: "Guilde / Clan / Équipe" },
  { id: "creature", label: "Animal / Créature" },
  { id: "studio", label: "Studio d'animation" },
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label])
);
