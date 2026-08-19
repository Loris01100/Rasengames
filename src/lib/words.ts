// Comparaison de mots partagée par les jeux : les joueurs tapent à la main,
// donc "Rem", "rem " et "Rém" doivent être le même mot.

// U+0300 (combining grave accent) to U+036F (combining latin small letter x),
// built from char codes to avoid embedding raw combining marks in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g"
);

export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

// "Naruto" et "Naruto Uzumaki" désignent le même personnage : deux réponses
// comptent pour la même dès que les mots de la plus courte sont tous dans
// l'autre. Comparaison mot à mot et pas par préfixe, sinon "Ash" mangerait
// "Ashita no Joe". Reste faux pour les homonymes ("Sakura" de Naruto vs
// Sakura Kinomoto) — c'est le prix d'un jeu où on tape ce qu'on veut.
export function sameWord(a: string, b: string): boolean {
  const words = (w: string) => new Set(normalizeWord(w).split(/[\s-]+/).filter(Boolean));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const [small, big] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  return [...small].every((w) => big.has(w));
}
