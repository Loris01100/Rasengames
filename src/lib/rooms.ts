const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
const CODE_LENGTH = 5;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
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
