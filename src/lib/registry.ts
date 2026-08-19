import type { Env } from "../env";

// Durable Objects can't be enumerated, so every room reports its own summary
// to this single registry DO, which is what the landing page's "parties en
// cours" list reads. Entries are keyed `<slug>:<code>` and dropped as soon as
// a room reports zero connected players (or goes stale).
const STALE_MS = 3 * 60 * 60 * 1000;

export interface RoomSummary {
  slug: string;
  code: string;
  phase: string;
  players: number;
  updatedAt: number;
}

function registryStub(env: Env): DurableObjectStub {
  const ns = env.LOBBY_REGISTRY;
  return ns.get(ns.idFromName("global"));
}

export function listRooms(env: Env): Promise<Response> {
  return registryStub(env).fetch("https://registry/list");
}

// Awaited by the caller (a floating promise gets cancelled when the request
// that spawned it ends), but a registry hiccup must never break a game.
export async function reportRoom(env: Env, summary: Omit<RoomSummary, "updatedAt">): Promise<void> {
  try {
    await registryStub(env).fetch("https://registry/report", {
      method: "POST",
      body: JSON.stringify(summary),
    });
  } catch {
    // registry unavailable: the room just won't show up in the list
  }
}

export class LobbyRegistry {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/report") {
      const summary = (await request.json()) as Omit<RoomSummary, "updatedAt">;
      const key = `${summary.slug}:${summary.code}`;
      if (summary.players <= 0) {
        await this.state.storage.delete(key);
      } else {
        await this.state.storage.put(key, { ...summary, updatedAt: Date.now() });
      }
      return new Response(null, { status: 204 });
    }

    const stored = await this.state.storage.list<RoomSummary>();
    const cutoff = Date.now() - STALE_MS;
    const rooms: RoomSummary[] = [];
    const stale: string[] = [];
    for (const [key, summary] of stored) {
      if (summary.updatedAt < cutoff) stale.push(key);
      else rooms.push(summary);
    }
    if (stale.length > 0) await this.state.storage.delete(stale);

    rooms.sort((a, b) => b.updatedAt - a.updatedAt);
    return Response.json({ rooms });
  }
}
