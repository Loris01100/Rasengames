// Option "lettres autorisées" du lobby (bombe, petit bac) : l'hôte décoche les
// lettres qu'il ne veut pas (Q, W, X...), elles disparaissent simplement du
// tirage. Liste vide ou salon d'avant l'option = alphabet complet.
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function parseLetters(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...ALPHABET];
  const picked = ALPHABET.filter((l) => raw.includes(l));
  return picked.length ? picked : [...ALPHABET];
}

export function pickLetter(pool?: string[]): string {
  const letters = pool?.length ? pool : ALPHABET;
  return letters[Math.floor(Math.random() * letters.length)];
}
