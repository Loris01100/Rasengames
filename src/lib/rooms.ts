const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
const CODE_LENGTH = 5;

// Le code d'un salon privé est son seul secret : on le tire au CSPRNG, pas à
// Math.random (xorshift128+ de V8, dont l'état se reconstruit à partir de
// quelques sorties observées et qui est partagé par tout l'isolate).
// 32 symboles = 2^5 : `octet & 31` est uniforme, aucun biais de modulo.
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b & 31];
  return code;
}

/**
 * Génère un code libre dans le namespace du jeu qu'on crée. Un seul jeu suffit :
 * un code n'est jamais réutilisé d'un jeu à l'autre (`switchGame` et la soirée
 * tirent chacun un code neuf dans le namespace cible), donc une collision
 * dans un autre jeu est sans conséquence.
 * Chaque DO de salon expose `GET .../exists/<code>` (code en dernier segment).
 */
export async function createRoomCode(slug: string, namespace: DurableObjectNamespace): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode();
    const res = await namespace
      .get(namespace.idFromName(code))
      .fetch(new Request(`https://room/${slug}/exists/${code}`));
    if (!(await res.json<{ exists: boolean }>()).exists) return code;
  }
  throw new Error("Impossible de générer un code de salon unique.");
}
