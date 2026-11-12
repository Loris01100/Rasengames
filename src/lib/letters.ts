// Option "lettres autorisées" du lobby (bombe, petit bac) : l'hôte décoche les
// lettres qu'il ne veut pas (Q, W, X...), elles disparaissent simplement du
// tirage. Liste vide ou salon d'avant l'option = alphabet complet.
import { pickFresh, remember } from "./recent";

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function parseLetters(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...ALPHABET];
  const picked = ALPHABET.filter((l) => raw.includes(l));
  return picked.length ? picked : [...ALPHABET];
}

// `recent` : dernières lettres du salon, évitées tant que la sélection de
// l'hôte le permet (lib/recent.ts) — une seule lettre cochée sort toujours.
export function pickLetter(pool?: string[], recent: readonly string[] = []): string {
  const letters = pool?.length ? pool : ALPHABET;
  return pickFresh(letters, recent, (letter) => letter);
}

// Tire une lettre et la note dans l'historique du salon.
export function drawLetter(room: { letters: string[]; recentDraws: string[] }, max: number): string {
  const letter = pickLetter(room.letters, room.recentDraws);
  room.recentDraws = remember(room.recentDraws, [letter], max);
  return letter;
}
