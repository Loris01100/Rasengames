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
 * Generates a room code that isn't already in use in the given Durable
 * Object namespace. Each room DO exposes a `GET .../exists/<code>` route.
 */
export async function createRoomCode(namespace: DurableObjectNamespace, gameSlug: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode();
    const id = namespace.idFromName(code);
    const stub = namespace.get(id);
    const res = await stub.fetch(new Request(`https://room/${gameSlug}/exists/${code}`));
    const { exists } = await res.json<{ exists: boolean }>();
    if (!exists) return code;
  }
  throw new Error("Impossible de générer un code de salon unique.");
}
