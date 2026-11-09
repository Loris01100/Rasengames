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

  // Le cache mémoire évite les doublons dans l'onglet. Les URLs d'images
  // réussies sont aussi conservées dans le navigateur : une actualisation ne
  // doit pas redemander les vingt portraits et épuiser le quota AniList.
  const cache = new Map();
  const IMAGE_STORAGE_KEY = "rasengames:anilist-images:v1";
  const storedImages = (() => {
    try {
      if (typeof localStorage === "undefined") return {};
      const value = JSON.parse(localStorage.getItem(IMAGE_STORAGE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  })();

  function storedImage(key) {
    const value = storedImages[key];
    return typeof value === "string" && value.startsWith("https://") ? value : null;
  }

  function rememberImage(key, url) {
    if (!url || storedImages[key] === url) return url;
    storedImages[key] = url;
    const keys = Object.keys(storedImages);
    for (const oldKey of keys.slice(0, Math.max(0, keys.length - 300))) {
      delete storedImages[oldKey];
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(IMAGE_STORAGE_KEY, JSON.stringify(storedImages));
      }
    } catch {
      // Le jeu continue normalement si le stockage privé est indisponible.
    }
    return url;
  }

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
  const IMAGE_BY_CHARACTER_ID = `query ($id: Int) { Character(id: $id) { image { large } } }`;
  const IMAGE_BY_ANIME_ID = `query ($id: Int) { Media(id: $id) { coverImage { large } } }`;

  // A `ref` ("character:417", "anime:20") is the exact entry the player picked
  // from the suggestions, and beats any name search: searching "King" returns
  // Lelouch, whose aliases include "Black King", not King of Nanatsu no Taizai.
  // Words typed by hand have no ref and still fall back to the name search.
  async function imageByRef(ref) {
    const [type, rawId] = String(ref).split(":");
    const id = Number(rawId);
    if (!id || (type !== "character" && type !== "anime")) return null;
    const key = `ref:${type}:${id}`;
    const saved = storedImage(key);
    if (saved) return saved;
    return cached(key, async () => {
      const data = await query(type === "anime" ? IMAGE_BY_ANIME_ID : IMAGE_BY_CHARACTER_ID, { id });
      const url = (type === "anime" ? data?.Media?.coverImage?.large : data?.Character?.image?.large) ?? null;
      return rememberImage(key, url);
    });
  }

  const ANIME_OF_CHARACTER_BY_ID = `query ($id: Int) { Character(id: $id) { media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji } } } } }`;
  const ANIME_OF_CHARACTER_BY_NAME = `query ($search: String) { Character(search: $search) { media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji } } } } }`;

  // The show a character is best known from, shown under their name in Qui
  // suis-je's reveal cards. Only meaningful for characters — an `anime:` ref
  // is already the show itself, nothing to look up underneath it.
  async function animeOf(name, ref) {
    if (ref) {
      const [type, rawId] = String(ref).split(":");
      if (type === "anime") return null;
      const id = Number(rawId);
      if (type === "character" && id) {
        return cached(`animeOf:character:${id}`, async () => {
          const data = await query(ANIME_OF_CHARACTER_BY_ID, { id });
          return data?.Character?.media?.nodes?.[0]?.title?.romaji ?? null;
        });
      }
    }
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    return cached(`animeOf:name:${trimmed.toLowerCase()}`, async () => {
      const data = await query(ANIME_OF_CHARACTER_BY_NAME, { search: trimmed });
      return data?.Character?.media?.nodes?.[0]?.title?.romaji ?? null;
    });
  }

  // `kind` picks which lookup runs first; the other one is the fallback, since
  // a "word" is often a character but sometimes a show title (and vice versa).
  async function image(name, kind = "character", ref = null) {
    if (ref) {
      const url = await imageByRef(ref);
      if (url) return url;
    }
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const key = `image:${kind}:${trimmed.toLowerCase()}`;
    const saved = storedImage(key);
    if (saved) return saved;
    const url = await cached(key, async () => {
      const order = kind === "anime" ? ["anime", "character"] : ["character", "anime"];
      for (const step of order) {
        const data = await query(step === "anime" ? IMAGE_ANIME : IMAGE_CHARACTER, { search: trimmed });
        const url =
          step === "anime" ? data?.Media?.coverImage?.large : data?.Character?.image?.large;
        if (url) return rememberImage(key, url);
      }
      return null;
    });
    // Une panne réseau ou un 429 ne doit pas condamner l'image jusqu'au
    // rechargement de la page : seuls les résultats positifs restent en cache.
    if (!url) cache.delete(key);
    return url;
  }

  // Sets an <img> once the picture is known, and leaves it hidden otherwise —
  // callers don't have to care that the lookup is asynchronous, and a render
  // that happened in the meantime can't be overwritten by a stale answer.
  async function setImage(img, name, kind, ref) {
    img.classList.add("hidden");
    img.dataset.for = `${ref || ""}|${name || ""}`;
    const url = await image(name, kind, ref);
    if (!url || img.dataset.for !== `${ref || ""}|${name || ""}`) return false;
    img.src = url;
    img.classList.remove("hidden");
    return true;
  }

  // La grille de Qui est-ce affiche vingt personnages d'un coup. Une requête
  // par carte finit vite en 429, surtout quand deux joueurs partagent la même
  // connexion : GraphQL permet de résoudre tous les noms avec des alias dans
  // un seul appel. Chaque image garde le même garde-fou anti-rendu périmé que
  // setImage().
  async function setCharacterImages(entries) {
    const clean = entries
      .map(({ img, name }) => ({ img, name: String(name || "").trim() }))
      .filter(({ img, name }) => img && name);
    if (clean.length === 0) return 0;

    const names = [...new Set(clean.map(({ name }) => name))];
    const urls = new Map(
      names.map((name) => [name, storedImage(`image:character:${name.toLowerCase()}`)])
    );
    const missingNames = names.filter((name) => !urls.get(name));
    const variables = {};
    const declarations = [];
    const fields = [];
    missingNames.forEach((name, index) => {
      variables[`q${index}`] = name;
      declarations.push(`$q${index}: String`);
      fields.push(`c${index}: Character(search: $q${index}) { image { large } }`);
    });

    for (const { img, name } of clean) {
      img.classList.add("hidden");
      img.dataset.for = `batch|${name}`;
    }

    if (missingNames.length > 0) {
      const key = `images:characters:${missingNames.join("|").toLowerCase()}`;
      const data = await cached(key, () =>
        query(`query (${declarations.join(", ")}) { ${fields.join(" ")} }`, variables)
      );
      if (!data) {
        cache.delete(key);
      } else {
        missingNames.forEach((name, index) => {
          const imageKey = `image:character:${name.toLowerCase()}`;
          const url = data[`c${index}`]?.image?.large ?? null;
          urls.set(name, rememberImage(imageKey, url));
        });
      }
    }
    let loaded = 0;
    for (const { img, name } of clean) {
      const url = urls.get(name);
      if (!url || img.dataset.for !== `batch|${name}`) continue;
      img.src = url;
      img.classList.remove("hidden");
      loaded += 1;
    }
    return loaded;
  }

  // Left on AniList's default relevance sort on purpose — FAVOURITES_DESC
  // ranks popular-but-weak matches above the name actually being typed.
  // Characters and anime in one request: AniList allows several root fields,
  // and its rate limit counts requests, so the anime rows that open the
  // per-anime character list are free.
  const SUGGEST_CHARACTERS = `query ($search: String) { chars: Page(perPage: 12) { characters(search: $search) { id name { full native alternative } media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji } } } } } animes: Page(perPage: 3) { media(search: $search, type: ANIME) { id title { romaji } startDate { year } } } }`;
  const MEDIA_CHARACTERS = `query ($id: Int) { Media(id: $id) { title { romaji } characters(sort: [ROLE, FAVOURITES_DESC], perPage: 25) { nodes { id name { full } } } } }`;
  const SUGGEST_ANIME = `query ($search: String) { Page(perPage: 8) { media(search: $search, type: ANIME) { id title { romaji } startDate { year } } } }`;

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
        .map((m) => ({ name: m.title?.romaji ?? "", ref: `anime:${m.id}`, from: m.startDate?.year ? String(m.startDate.year) : "" }))
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
        const id = c.id;
        const anime = c.media?.nodes?.[0]?.title?.romaji ?? "";
        const alias = (c.name?.alternative ?? []).find((a) => a.toLowerCase().includes(search));
        const byName = `${name} ${c.name?.native ?? ""}`.toLowerCase().includes(search);
        return { name, id, anime, alias, byName };
      })
      .filter((r) => r.name);

    const direct = rows.filter((r) => r.byName);
    const characters = (direct.length > 0 ? direct : rows).slice(0, 6).map((r) => ({
      name: r.name,
      ref: `character:${r.id}`,
      anime: r.anime,
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
        .map((c) => ({ name: c.name?.full ?? "", ref: `character:${c.id}`, anime: from, from }))
        .filter((c) => c.name);
    });
  }

  // Page-based, like SUGGEST_CHARACTERS/SUGGEST_ANIME above: a no-match search
  // answers with an empty array (200 OK), not the 404 that the singular
  // Character(search:)/Media(search:) fields use.
  //
  // Les deux types dans une seule requête (AniList accepte plusieurs champs
  // racines) : sa limite compte les requêtes, et elle est basse. Une partie
  // d'Alphabombe à quatre derrière la même box les épuisait en deux minutes,
  // et une vérification qui n'aboutit pas laisse passer n'importe quel mot.
  const NAMES_BOTH = `query ($search: String) { chars: Page(perPage: 10) { characters(search: $search) { name { full native alternative } } } animes: Page(perPage: 10) { media(search: $search, type: ANIME) { title { romaji english native } } } }`;

  function normalizeForMatch(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // 0 = unrelated, 1 = one name's words are all contained in the other's
  // (handles "Luffy" vs "Monkey D. Luffy", either order), 2 = the same name.
  // Word-set containment rather than raw substring: a plain substring check
  // would let "One Piece" match a character alias like "The Man closest to
  // One Piece" — real, but not what typing "One Piece" as a personnage means.
  function matchScore(typed, candidate) {
    const a = normalizeForMatch(typed);
    const b = normalizeForMatch(candidate);
    if (!a || !b) return 0;
    if (a === b) return 2;
    const aTok = new Set(a.split(" ").filter((t) => t.length > 1));
    const bTok = new Set(b.split(" ").filter((t) => t.length > 1));
    if (aTok.size === 0 || bTok.size === 0) return 0;
    const subsetOf = (small, big) => [...small].every((t) => big.has(t));
    return subsetOf(aTok, bTok) || subsetOf(bTok, aTok) ? 1 : 0;
  }

  function bestScore(typed, candidates) {
    return candidates.reduce((max, c) => Math.max(max, matchScore(typed, c)), 0);
  }

  // { character: [...], anime: [...] }, ou null si la requête n'a pas abouti
  // (hors ligne, timeout, 429) — un cas que l'appelant doit distinguer d'un
  // vrai "rien trouvé". Mis en cache sur le mot seul, donc les variantes
  // strict/non-strict d'un même mot ne coûtent qu'une requête.
  async function candidateNames(search) {
    return cached(`names:${search.toLowerCase()}`, async () => {
      const data = await query(NAMES_BOTH, { search });
      if (data === null) return null;
      return {
        character: (data.chars?.characters ?? []).flatMap((c) =>
          [c.name?.full, c.name?.native, ...(c.name?.alternative ?? [])].filter(Boolean)
        ),
        anime: (data.animes?.media ?? []).flatMap((m) =>
          [m.title?.romaji, m.title?.english, m.title?.native].filter(Boolean)
        ),
      };
    });
  }

  // Used by Alphabombe to reject made-up names, and by 1 à 100 to keep an
  // anime title out of the "personnage" category (and vice versa). Returns
  // "found" / "notfound" / "unknown" rather than a boolean because the
  // caller needs to fail closed on a clean no-match but fail *open* when the
  // check itself couldn't run (offline, timeout, blocked) — freezing the
  // game over an AniList hiccup would be worse than trusting the answer.
  //
  // Always fetches both character and anime candidates and compares the two
  // scores, rather than just checking whether `kind` has any match at all:
  // AniList's search is generous enough that "One Piece" still turns up a
  // character (an obscure one, but real) even though it plainly means the
  // show. Only a genuinely exact match on the *other* kind overrides `kind`
  // — a same-strength partial match (like "Luffy" faintly matching an
  // episode title) isn't enough to reject the obvious reading.
  async function exists(name, kind = "character", strict = false) {
    const trimmed = (name || "").trim();
    if (!trimmed) return "notfound";
    return cached(`exists:${kind}:${strict ? "strict" : "any"}:${trimmed.toLowerCase()}`, async () => {
      const candidates = await candidateNames(trimmed);
      if (candidates === null) return "unknown";

      const charScore = bestScore(trimmed, candidates.character);
      const animeScore = bestScore(trimmed, candidates.anime);
      if (!strict) return Math.max(charScore, animeScore) > 0 ? "found" : "notfound";

      const ownScore = kind === "anime" ? animeScore : charScore;
      const otherScore = kind === "anime" ? charScore : animeScore;
      if (ownScore === 0) return "notfound";
      if (otherScore >= 2 && otherScore > ownScore) return "notfound";
      return "found";
    });
  }

  return { image, setImage, setCharacterImages, suggest, charactersOf, exists, animeOf };
})();
