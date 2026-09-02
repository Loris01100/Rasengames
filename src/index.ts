import type { Env } from "./env";
import { UndercoverRoom } from "./games/undercover/room";
import { HundredRoom } from "./games/hundred/room";
import { BacRoom } from "./games/bac/room";
import { WhoamiRoom } from "./games/whoami/room";
import { DetectiveRoom } from "./games/detective/room";
import { NoteRoom } from "./games/note/room";
import { BombRoom } from "./games/bomb/room";
import { CodenamesRoom } from "./games/codenames/room";
import { WORDS as CODENAMES_WORDS } from "./games/codenames/words";
import { SyncRoom } from "./games/sync/room";
import { GuessWhoRoom } from "./games/guesswho/room";
import { PartyRoom } from "./party/room";
import { UndercoverFeedback } from "./feedback/undercover";
import { UNDERCOVER_SOURCES } from "./games/undercover/words";
import { createRoomCode } from "./lib/rooms";
import { LobbyRegistry, listRooms } from "./lib/registry";

export {
  UndercoverRoom,
  HundredRoom,
  BacRoom,
  WhoamiRoom,
  DetectiveRoom,
  NoteRoom,
  BombRoom,
  CodenamesRoom,
  SyncRoom,
  GuessWhoRoom,
  PartyRoom,
  UndercoverFeedback,
  LobbyRegistry,
};

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
  { slug: "note", namespace: (env) => env.NOTE_ROOM },
  { slug: "bomb", namespace: (env) => env.BOMB_ROOM },
  { slug: "codenames", namespace: (env) => env.CODENAMES_ROOM },
  { slug: "sync", namespace: (env) => env.SYNC_ROOM },
  { slug: "guesswho", namespace: (env) => env.GUESSWHO_ROOM },
];

const PARTY: GameRoute = { slug: "party", namespace: (env) => env.PARTY_ROOM };

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms") {
      return listRooms(env);
    }

    if (url.pathname === "/api/undercover/sources") {
      return Response.json({ sources: UNDERCOVER_SOURCES });
    }

    if (url.pathname === "/api/undercover/feedback" && request.method === "GET") {
      if (!env.ADMIN_KEY) return Response.json({ error: "ADMIN_KEY non configurée." }, { status: 503 });
      const authorization = request.headers.get("Authorization") ?? "";
      if (authorization !== `Bearer ${env.ADMIN_KEY}`) return new Response("Accès refusé", { status: 401 });
      const namespace = env.UNDERCOVER_FEEDBACK;
      return namespace.get(namespace.idFromName("global")).fetch("https://feedback/results");
    }

    // Catalogue complet (mot + série d'origine) pour le filtre de mots du
    // lobby Codenames — statique, pas besoin de passer par un Durable Object.
    if (url.pathname === "/api/codenames/words") {
      return Response.json(CODENAMES_WORDS);
    }

    const createMatch = url.pathname.match(/^\/api\/([a-z]+)\/create$/);
    if (createMatch && request.method === "POST") {
      const game = createMatch[1] === PARTY.slug ? PARTY : GAMES.find((g) => g.slug === createMatch[1]);
      if (!game) return new Response("Unknown game", { status: 404 });
      const code = await createRoomCode(game.namespace(env), game.slug);
      return Response.json({ code });
    }

    // Sans ça, un code mal tapé ne renvoie pas d'erreur : le Durable Object
    // est créé à la demande, donc le joueur se retrouve seul dans un salon
    // fantôme en croyant attendre ses amis. Le client sonde avant de rejoindre.
    const existsMatch = url.pathname.match(/^\/api\/([a-z]+)\/exists\/([A-Za-z0-9]{4,8})$/);
    if (existsMatch) {
      const game = existsMatch[1] === PARTY.slug ? PARTY : GAMES.find((g) => g.slug === existsMatch[1]);
      if (!game) return new Response("Unknown game", { status: 404 });
      const code = existsMatch[2].toUpperCase();
      const namespace = game.namespace(env);
      // Code en dernier segment : c'est ce que room.ts sait lire (cf. CLAUDE.md).
      return namespace
        .get(namespace.idFromName(code))
        .fetch(new Request(`https://room/${game.slug}/exists/${code}`));
    }

    const wsMatch = url.pathname.match(/^\/ws\/([a-z]+)\/([A-Za-z0-9]{4,8})$/);
    if (wsMatch) {
      const game = wsMatch[1] === PARTY.slug ? PARTY : GAMES.find((g) => g.slug === wsMatch[1]);
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
