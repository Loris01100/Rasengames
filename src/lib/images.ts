// Looks up a preview image for an anime/character name via the AniList
// GraphQL API (https://anilist.co, no key required for public search
// queries). Best effort only — games must stay playable if this returns
// null (API down, rate-limited, or no match found), so callers should treat
// the image as decoration, never as required state.

const ENDPOINT = "https://graphql.anilist.co";
const TIMEOUT_MS = 4000;

// AniList's public rate limit is 90 req/min per IP with a burst limiter on
// top of that. A single Worker isolate can be serving several rooms at
// once, and a room with several players proposing around the same time
// fires several lookups in parallel, so every request is routed through
// this one-at-a-time queue to keep well under the limit regardless of how
// many games are asking at once.
const MIN_SPACING_MS = 700;

// Spacing is a timestamp reservation, not a promise chain: a chain has to
// release its successor from a setTimeout, and a timer scheduled after the
// response was returned gets cancelled with the request context — which
// deadlocked every later lookup in the isolate. Here the wait happens before
// the call, awaited by the caller, so a cancelled timer only affects its own
// request.
let nextSlot = 0;

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + MIN_SPACING_MS;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
  return fn();
}

// In-memory only, scoped to this Worker isolate's lifetime. Only successful
// lookups (found or confirmed not-found) are cached; network errors/timeouts
// are not, so a transient failure gets retried on the next request instead
// of being stuck forever.
const cache = new Map<string, string | null>();

function anilistRequest(body: string): Promise<Response | null> {
  return throttled(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Workers' fetch sends no User-Agent by default and public APIs
          // (AniList included) tend to reject anonymous clients.
          "User-Agent": "RasenGames/1.0 (+https://rasengames.reesch.com)",
        },
        body,
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  });
}

const MEDIA_QUERY = `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { large } } }`;
const CHARACTER_QUERY = `query ($search: String) { Character(search: $search) { image { large } } }`;

interface AnilistResponse {
  data?: {
    Media?: { coverImage?: { large?: string } } | null;
    Character?: { image?: { large?: string } } | null;
  };
}

// AniList answers "no match" with an HTTP 404 (not a 200 + empty result like
// most search APIs), so that's treated as a valid "nothing found" response
// rather than a failure worth retrying.
async function anilistSearch(kind: "character" | "anime", query: string): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cacheKey = `${kind}:${trimmed.toLowerCase()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const body = JSON.stringify({
    query: kind === "anime" ? MEDIA_QUERY : CHARACTER_QUERY,
    variables: { search: trimmed },
  });

  let res = await anilistRequest(body);
  if (res && res.status !== 404 && !res.ok) {
    res = await anilistRequest(body);
  }
  if (!res || (res.status !== 404 && !res.ok)) return null;

  if (res.status === 404) {
    cache.set(cacheKey, null);
    return null;
  }

  const json = (await res.json()) as AnilistResponse;
  const imageUrl =
    kind === "anime"
      ? (json.data?.Media?.coverImage?.large ?? null)
      : (json.data?.Character?.image?.large ?? null);
  cache.set(cacheKey, imageUrl);
  return imageUrl;
}

export function fetchCharacterImage(name: string): Promise<string | null> {
  return anilistSearch("character", name);
}

export function fetchAnimeImage(name: string): Promise<string | null> {
  return anilistSearch("anime", name);
}

// A character-name search that comes up empty falls back to an anime search
// on the same text — useful for "technique"/"random" words that are often
// character names but sometimes aren't, so a cover image beats no image.
export async function fetchCharacterOrAnimeImage(name: string): Promise<string | null> {
  return (await fetchCharacterImage(name)) ?? (await fetchAnimeImage(name));
}

// Same idea the other way round, for contexts where the text is expected to
// be a show title (a character with the same name as its anime would
// otherwise win the lookup and show the wrong picture).
export async function fetchAnimeOrCharacterImage(name: string): Promise<string | null> {
  return (await fetchAnimeImage(name)) ?? (await fetchCharacterImage(name));
}

// ---- name suggestions (typeahead) ----

// Same API, but a list instead of a single best match, so the client can
// offer spellings to pick from: typing "hin" is enough to get the exact
// "Shouyou Hinata", which then makes the image lookup above unambiguous.
// Left on AniList's default relevance sort on purpose — FAVOURITES_DESC
// ranks popular-but-weak matches above the name actually being typed.
const SUGGEST_CHARACTERS = `query ($search: String) { Page(perPage: 8) { characters(search: $search) { name { full } media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji } } } } } }`;
const SUGGEST_ANIME = `query ($search: String) { Page(perPage: 8) { media(search: $search, type: ANIME) { title { romaji } startDate { year } } } }`;

export class SuggestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`AniList responded ${status}`);
  }
}

export interface Suggestion {
  name: string;
  from: string;
}

interface SuggestResponse {
  data?: {
    Page?: {
      characters?: {
        name?: { full?: string };
        media?: { nodes?: { title?: { romaji?: string } }[] };
      }[];
      media?: { title?: { romaji?: string }; startDate?: { year?: number } }[];
    } | null;
  };
}

const suggestCache = new Map<string, Suggestion[]>();

async function suggestOne(kind: "character" | "anime", query: string): Promise<Suggestion[]> {
  const cacheKey = `${kind}:${query}`;
  const cached = suggestCache.get(cacheKey);
  if (cached) return cached;

  const res = await anilistRequest(
    JSON.stringify({
      query: kind === "anime" ? SUGGEST_ANIME : SUGGEST_CHARACTERS,
      variables: { search: query },
    })
  );
  // A 404 is a miss (the caller is a typeahead; a half-typed name legitimately
  // matches nothing). Anything else is an upstream failure and must surface —
  // silently returning [] is what hid the outbound calls failing in production.
  if (!res) throw new SuggestError(0, "no response from AniList");
  if (res.status !== 404 && !res.ok) throw new SuggestError(res.status, await res.text().catch(() => ""));
  if (res.status === 404) {
    suggestCache.set(cacheKey, []);
    return [];
  }

  const json = (await res.json()) as SuggestResponse;
  const page = json.data?.Page;
  const out: Suggestion[] =
    kind === "anime"
      ? (page?.media ?? [])
          .map((m) => ({ name: m.title?.romaji ?? "", from: m.startDate?.year ? String(m.startDate.year) : "" }))
          .filter((s) => s.name)
      : (page?.characters ?? [])
          .map((c) => ({ name: c.name?.full ?? "", from: c.media?.nodes?.[0]?.title?.romaji ?? "" }))
          .filter((s) => s.name);

  suggestCache.set(cacheKey, out);
  return out;
}

// "any" = characters, falling back to anime titles only when no character
// matches, so a normal keystroke costs a single upstream request.
export async function suggestNames(kind: "character" | "anime" | "any", query: string): Promise<Suggestion[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 3) return [];
  if (kind === "anime") return suggestOne("anime", trimmed);
  const characters = await suggestOne("character", trimmed);
  if (characters.length > 0 || kind === "character") return characters;
  return suggestOne("anime", trimmed);
}
