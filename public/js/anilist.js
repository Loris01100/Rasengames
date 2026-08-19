// AniList lookups, run from the player's browser.
//
// These used to run in the Worker, which AniList answers with
// 403 "You have been manually blocked" — Cloudflare Workers share a handful
// of egress IPs and AniList has blacklisted them, so no amount of throttling
// or caching on our side helps. From the browser each player uses their own
// IP (and their own share of AniList's 90 req/min), and AniList allows CORS
// because browser clients are exactly what its public API is for.
//
// Everything here is best effort: a failed lookup means no picture and no
// suggestions, never a broken game.
const Anilist = (() => {
  const ENDPOINT = "https://graphql.anilist.co";
  const TIMEOUT_MS = 5000;

  // Names repeat a lot inside one game (same word rendered on several
  // screens, same prefix retyped), so one cache per tab is enough to keep
  // the request count low.
  const cache = new Map();

  async function query(graphql, variables) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: graphql, variables }),
        signal: controller.signal,
      });
      // AniList answers "no match" with a 404, not an empty 200.
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return (await res.json()).data ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function cached(key, run) {
    if (cache.has(key)) return cache.get(key);
    const promise = run();
    cache.set(key, promise);
    return promise;
  }

  const IMAGE_CHARACTER = `query ($search: String) { Character(search: $search) { image { large } } }`;
  const IMAGE_ANIME = `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { large } } }`;

  // `kind` picks which lookup runs first; the other one is the fallback, since
  // a "word" is often a character but sometimes a show title (and vice versa).
  async function image(name, kind = "character") {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    return cached(`image:${kind}:${trimmed.toLowerCase()}`, async () => {
      const order = kind === "anime" ? ["anime", "character"] : ["character", "anime"];
      for (const step of order) {
        const data = await query(step === "anime" ? IMAGE_ANIME : IMAGE_CHARACTER, { search: trimmed });
        const url =
          step === "anime" ? data?.Media?.coverImage?.large : data?.Character?.image?.large;
        if (url) return url;
      }
      return null;
    });
  }

  // Sets an <img> once the picture is known, and leaves it hidden otherwise —
  // callers don't have to care that the lookup is asynchronous, and a render
  // that happened in the meantime can't be overwritten by a stale answer.
  async function setImage(img, name, kind) {
    img.classList.add("hidden");
    img.dataset.for = name || "";
    const url = await image(name, kind);
    if (!url || img.dataset.for !== (name || "")) return;
    img.src = url;
    img.classList.remove("hidden");
  }

  // Left on AniList's default relevance sort on purpose — FAVOURITES_DESC
  // ranks popular-but-weak matches above the name actually being typed.
  const SUGGEST_CHARACTERS = `query ($search: String) { Page(perPage: 8) { characters(search: $search) { name { full } media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji } } } } } }`;
  const SUGGEST_ANIME = `query ($search: String) { Page(perPage: 8) { media(search: $search, type: ANIME) { title { romaji } startDate { year } } } }`;

  // "any" = characters, falling back to anime titles only when no character
  // matches, so a normal keystroke costs a single request.
  async function suggest(text, kind = "any") {
    const trimmed = (text || "").trim().toLowerCase();
    if (trimmed.length < 3) return [];
    return cached(`suggest:${kind}:${trimmed}`, async () => {
      if (kind !== "anime") {
        const characters = await suggestCharacters(trimmed);
        if (characters.length > 0 || kind === "character") return characters;
      }
      const data = await query(SUGGEST_ANIME, { search: trimmed });
      return (data?.Page?.media ?? [])
        .map((m) => ({ name: m.title?.romaji ?? "", from: m.startDate?.year ? String(m.startDate.year) : "" }))
        .filter((s) => s.name);
    });
  }

  async function suggestCharacters(search) {
    const data = await query(SUGGEST_CHARACTERS, { search });
    return (data?.Page?.characters ?? [])
      .map((c) => ({ name: c.name?.full ?? "", from: c.media?.nodes?.[0]?.title?.romaji ?? "" }))
      .filter((s) => s.name);
  }

  return { image, setImage, suggest };
})();
