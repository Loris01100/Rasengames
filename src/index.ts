import type { Env } from "./env";
import { UndercoverRoom } from "./games/undercover/room";

export { UndercoverRoom };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
const CODE_LENGTH = 5;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function createUndercoverRoom(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode();
    const id = env.UNDERCOVER_ROOM.idFromName(code);
    const stub = env.UNDERCOVER_ROOM.get(id);
    const res = await stub.fetch(new Request(`https://room/undercover/${code}/exists`));
    const { exists } = await res.json<{ exists: boolean }>();
    if (!exists) return code;
  }
  throw new Error("Impossible de générer un code de salon unique.");
}

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/undercover/create" && request.method === "POST") {
      const code = await createUndercoverRoom(env);
      return Response.json({ code });
    }

    const wsMatch = url.pathname.match(/^\/ws\/undercover\/([A-Za-z0-9]{4,8})$/);
    if (wsMatch) {
      const code = wsMatch[1].toUpperCase();
      const id = env.UNDERCOVER_ROOM.idFromName(code);
      const stub = env.UNDERCOVER_ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
