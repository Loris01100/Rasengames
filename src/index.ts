import type { Env } from "./env";
import { UndercoverRoom } from "./games/undercover/room";
import { HundredRoom } from "./games/hundred/room";
import { BacRoom } from "./games/bac/room";
import { WhoamiRoom } from "./games/whoami/room";
import { DetectiveRoom } from "./games/detective/room";
import { createRoomCode } from "./lib/rooms";

export { UndercoverRoom, HundredRoom, BacRoom, WhoamiRoom, DetectiveRoom };

interface GameRoute {
  slug: string;
  namespace: (env: Env) => DurableObjectNamespace;
}

const GAMES: GameRoute[] = [
  { slug: "undercover", namespace: (env) => env.UNDERCOVER_ROOM },
  { slug: "hundred", namespace: (env) => env.HUNDRED_ROOM },
  { slug: "bac", namespace: (env) => env.BAC_ROOM },
  { slug: "whoami", namespace: (env) => env.WHOAMI_ROOM },
  { slug: "detective", namespace: (env) => env.DETECTIVE_ROOM },
];

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);

    const createMatch = url.pathname.match(/^\/api\/([a-z]+)\/create$/);
    if (createMatch && request.method === "POST") {
      const game = GAMES.find((g) => g.slug === createMatch[1]);
      if (!game) return new Response("Unknown game", { status: 404 });
      const code = await createRoomCode(game.namespace(env), game.slug);
      return Response.json({ code });
    }

    const wsMatch = url.pathname.match(/^\/ws\/([a-z]+)\/([A-Za-z0-9]{4,8})$/);
    if (wsMatch) {
      const game = GAMES.find((g) => g.slug === wsMatch[1]);
      if (!game) return new Response("Unknown game", { status: 404 });
      const code = wsMatch[2].toUpperCase();
      const namespace = game.namespace(env);
      const id = namespace.idFromName(code);
      const stub = namespace.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
