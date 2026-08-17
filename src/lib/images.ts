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
let requestQueueTail: Promise<void> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const previous = requestQueueTail;
  let release: () => void;
  requestQueueTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  return previous.then(async () => {
    try {
      return await fn();
    } finally {
      setTimeout(release, MIN_SPACING_MS);
    }
  });
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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
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
