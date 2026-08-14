// Paires de mots proches mais distincts : un mot pour les civils, un pour les undercover.
export interface WordPair {
  a: string;
  b: string;
}

export const WORD_PAIRS: WordPair[] = [
  { a: "Chat", b: "Chien" },
  { a: "Café", b: "Thé" },
  { a: "Mer", b: "Océan" },
  { a: "Plage", b: "Désert" },
  { a: "Pizza", b: "Pâtes" },
  { a: "Guitare", b: "Violon" },
  { a: "Avion", b: "Hélicoptère" },
  { a: "Médecin", b: "Infirmier" },
  { a: "Lune", b: "Soleil" },
  { a: "Football", b: "Rugby" },
  { a: "Hôtel", b: "Auberge" },
  { a: "Roman", b: "Bande dessinée" },
  { a: "Vélo", b: "Trottinette" },
  { a: "Neige", b: "Grêle" },
  { a: "Pomme", b: "Poire" },
  { a: "Fleuve", b: "Rivière" },
  { a: "Cinéma", b: "Théâtre" },
  { a: "Robot", b: "Ordinateur" },
  { a: "Château", b: "Palais" },
  { a: "Piscine", b: "Lac" },
  { a: "Fourchette", b: "Cuillère" },
  { a: "Professeur", b: "Élève" },
  { a: "Train", b: "Métro" },
  { a: "Glace", b: "Sorbet" },
  { a: "Pluie", b: "Orage" },
  { a: "Roi", b: "Empereur" },
  { a: "Forêt", b: "Jungle" },
  { a: "Sac à dos", b: "Valise" },
  { a: "Baguette", b: "Croissant" },
  { a: "Lion", b: "Tigre" },
  { a: "Voiture", b: "Camion" },
  { a: "Montagne", b: "Colline" },
  { a: "Danse", b: "Chant" },
  { a: "Whisky", b: "Vodka" },
  { a: "Épée", b: "Couteau" },
  { a: "Fantôme", b: "Vampire" },
  { a: "Facebook", b: "Instagram" },
  { a: "Docteur Jekyll", b: "Mr Hyde" },
  { a: "Pyramide", b: "Sphinx" },
  { a: "Basket", b: "Handball" },
  { a: "Île", b: "Presqu'île" },
  { a: "Peinture", b: "Dessin" },
  { a: "Nuage", b: "Brouillard" },
  { a: "Sandale", b: "Tong" },
  { a: "Poker", b: "Blackjack" },
];

export function pickRandomPair(): WordPair {
  return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}
