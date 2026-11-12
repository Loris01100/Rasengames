// Mémoire des derniers tirages d'un salon : une paire Undercover, un thème de
// 1 à 100 ou une grille de Qui est-ce ne doivent pas revenir dès la manche
// suivante. Chaque salon stocke dans son `RoomState` une liste `recentDraws`
// d'identifiants (du plus ancien au plus récent) ; le tirage l'évite tant que
// le pool le permet. Pas de garantie dure : quand le pool filtré par l'hôte
// (catégorie, sources exclues, lettres décochées) est plus petit que
// l'historique, on réautorise d'abord les tirages les plus anciens.

// Ajoute `ids` en fin d'historique (un id déjà présent est déplacé en fin) et
// ne garde que les `max` derniers.
export function remember(recent: readonly string[], ids: readonly string[], max: number): string[] {
  const fresh = new Set(ids);
  return [...recent.filter((id) => !fresh.has(id)), ...fresh].slice(-max);
}

// Tire un élément absent de l'historique ; si tout le pool y figure, oublie
// les entrées une à une en partant de la plus ancienne jusqu'à trouver un
// candidat — le tirage retombe ainsi sur ce qui est sorti il y a le plus
// longtemps, jamais sur la manche d'avant tant qu'il existe une autre option.
export function pickFresh<T>(
  pool: readonly T[],
  recent: readonly string[],
  key: (item: T) => string,
  random: () => number = Math.random,
): T {
  if (pool.length === 0) throw new Error("Pool de tirage vide.");
  for (let start = 0; start < recent.length; start++) {
    const banned = new Set(recent.slice(start));
    const candidates = pool.filter((item) => !banned.has(key(item)));
    if (candidates.length > 0) return candidates[Math.floor(random() * candidates.length)];
  }
  return pool[Math.floor(random() * pool.length)];
}

// Tire `count` éléments distincts (plateau, grille) en privilégiant ceux
// absents de l'historique, puis les moins récents, et rend le tout mélangé.
export function drawFresh<T>(
  pool: readonly T[],
  count: number,
  recent: readonly string[],
  key: (item: T) => string,
  random: () => number = Math.random,
): T[] {
  const age = new Map(recent.map((id, index) => [id, index]));
  const fresh = shuffle(pool.filter((item) => !age.has(key(item))), random);
  const stale = pool
    .filter((item) => age.has(key(item)))
    .sort((a, b) => age.get(key(a))! - age.get(key(b))!);
  return shuffle([...fresh, ...stale].slice(0, count), random);
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
