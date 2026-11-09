// Convertit les scores propres à un mini-jeu en points de soirée. Les scores
// nuls restent une simple participation : dans les jeux à victoire binaire,
// ils ne doivent pas devenir artificiellement une deuxième place.
export function awardPartyPoints(scores: number[]): number[] {
  const distinctPositive = [...new Set(scores.filter((score) => score > 0))].sort((a, b) => b - a);
  if (distinctPositive.length === 0) return scores.map(() => 1);
  return scores.map((score) => {
    if (score <= 0) return 1;
    const rank = distinctPositive.indexOf(score);
    return rank === 0 ? 3 : rank === 1 ? 2 : 1;
  });
}
