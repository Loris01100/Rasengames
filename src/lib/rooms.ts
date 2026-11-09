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
 * Génère un code libre dans *tous* les jeux, pas seulement celui qu'on crée :
 * `switchGame` garde le même code en changeant de jeu, donc un code déjà pris
 * ailleurs enverrait le groupe dans le salon d'inconnus.
 * Chaque DO de salon expose `GET .../exists/<code>` (code en dernier segment).
 */
export async function createRoomCode(
  games: { slug: string; namespace: DurableObjectNamespace }[],
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode();
    const taken = await Promise.all(
      games.map(async ({ slug, namespace }) => {
        const res = await namespace
          .get(namespace.idFromName(code))
          .fetch(new Request(`https://room/${slug}/exists/${code}`));
        return (await res.json<{ exists: boolean }>()).exists;
      }),
    );
    if (!taken.some(Boolean)) return code;
  }
  throw new Error("Impossible de générer un code de salon unique.");
}
