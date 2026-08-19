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
  // Characters and anime in one request: AniList allows several root fields,
  // and its rate limit counts requests, so the anime rows that open the
  // per-anime character list are free.
  const SUGGEST_CHARACTERS = `query ($search: String) { chars: Page(perPage: 12) { characters(search: $search) { name { full native alternative } media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji } } } } } animes: Page(perPage: 3) { media(search: $search, type: ANIME) { id title { romaji } startDate { year } } } }`;
  const MEDIA_CHARACTERS = `query ($id: Int) { Media(id: $id) { title { romaji } characters(sort: [ROLE, FAVOURITES_DESC], perPage: 25) { nodes { name { full } } } } }`;
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

  // AniList searches aliases too, as a substring: "reme" matches Momonga,
  // Kokichi Ouma and Judai Yuki because each is a "Supreme" something. Those
  // are noise when a real name matches, so they only show up when nothing
  // else does — and then they say which alias they matched on, otherwise the
  // row looks like it has nothing to do with what was typed.
  async function suggestCharacters(search) {
    const data = await query(SUGGEST_CHARACTERS, { search });
    const rows = (data?.chars?.characters ?? [])
      .map((c) => {
        const name = c.name?.full ?? "";
        const anime = c.media?.nodes?.[0]?.title?.romaji ?? "";
        const alias = (c.name?.alternative ?? []).find((a) => a.toLowerCase().includes(search));
        const byName = `${name} ${c.name?.native ?? ""}`.toLowerCase().includes(search);
        return { name, anime, alias, byName };
      })
      .filter((r) => r.name);

    const direct = rows.filter((r) => r.byName);
    const characters = (direct.length > 0 ? direct : rows).slice(0, 6).map((r) => ({
      name: r.name,
      from: r.byName || !r.alias ? r.anime : `alias : ${r.alias}${r.anime ? ` — ${r.anime}` : ""}`,
    }));

    // Rows that open an anime's cast instead of filling the input, for when
    // you know the show but not how the character's name is spelled.
    const animes = (data?.animes?.media ?? []).map((m) => ({
      name: m.title?.romaji ?? "",
      from: `Voir les personnages${m.startDate?.year ? ` — ${m.startDate.year}` : ""}`,
      mediaId: m.id,
    }));

    return characters.concat(animes.filter((a) => a.name));
  }

  // The cast of one anime, used when a suggestion row is opened rather than
  // picked. Main roles first, then by popularity.
  async function charactersOf(mediaId) {
    return cached(`media:${mediaId}`, async () => {
      const data = await query(MEDIA_CHARACTERS, { id: mediaId });
      const from = data?.Media?.title?.romaji ?? "";
      return (data?.Media?.characters?.nodes ?? [])
        .map((c) => ({ name: c.name?.full ?? "", from }))
        .filter((c) => c.name);
    });
  }

  return { image, setImage, suggest, charactersOf };
})();
