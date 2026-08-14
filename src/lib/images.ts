// Looks up a preview image for an anime/character name via the Jikan API
// (unofficial MyAnimeList API, no key required: https://jikan.moe). Best
// effort only — games must stay playable if this returns null (API down,
// rate-limited, or no match found), so callers should treat the image as
// decoration, never as required state.

const TIMEOUT_MS = 4000;

// In-memory only, scoped to this Worker isolate's lifetime. Only successful
// lookups (found or confirmed not-found) are cached; network errors/timeouts
// are not, so a transient failure gets retried on the next request instead
// of being stuck forever.
const cache = new Map<string, string | null>();

async function jikanRequest(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Jikan (unofficial, free, unauthenticated) is prone to bursty 5xx responses
// when MyAnimeList itself is slow, so one retry meaningfully improves the
// hit rate. Not worth more than that for a decorative, best-effort feature.
async function jikanSearch(kind: "characters" | "anime", query: string): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cacheKey = `${kind}:${trimmed.toLowerCase()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const url = `https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(trimmed)}&limit=1`;

  let res = await jikanRequest(url);
  if (!res || !res.ok) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    res = await jikanRequest(url);
  }
  if (!res || !res.ok) return null;

  const data = (await res.json()) as {
    data?: Array<{ images?: { jpg?: { image_url?: string } } }>;
  };
  const imageUrl = data.data?.[0]?.images?.jpg?.image_url ?? null;
  cache.set(cacheKey, imageUrl);
  return imageUrl;
}

export function fetchCharacterImage(name: string): Promise<string | null> {
  return jikanSearch("characters", name);
}

export function fetchAnimeImage(name: string): Promise<string | null> {
  return jikanSearch("anime", name);
}
