// Runnable check for the shared room client (no browser here, no test runner):
//   npm test
// Boots every game's app.js against a stub DOM + stub WebSocket, then pushes a
// "joined" + lobby "state" through it. Fails loudly on a missing element ref or
// a dangling symbol left over from the room-client extraction.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "public");
const GAMES = ["bac", "bomb", "detective", "hundred", "note", "undercover", "whoami"];

// What each game's "start" message must carry beyond its type.
const START_KEYS = {
  bac: ["type", "categories", "letters"],
  bomb: ["type", "mode", "letters"],
  detective: ["type"],
  hundred: ["type", "mode", "theme"],
  note: ["type", "guesserId"],
  undercover: ["type", "settings"],
  whoami: ["type", "submitMode"],
};

// Stands in for a checked lobby checkbox/radio (bac categories, note kind…).
function makeInput() {
  const input = makeEl("input");
  input.value = "anime";
  input.checked = true;
  return input;
}

function makeEl(id) {
  const el = {
    id,
    children: [],
    listeners: {},
    classes: new Set(),
    // setProperty : les sièges de l Alphabombe posent leur angle en variable CSS.
    style: { setProperty(name, value) { this[name] = value; } },
    dataset: {},
    textContent: "",
    value: "",
    disabled: false,
    checked: false,
    classList: {
      add: (...c) => c.forEach((x) => el.classes.add(x)),
      remove: (...c) => c.forEach((x) => el.classes.delete(x)),
      toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)),
      contains: (c) => el.classes.has(c),
    },
    appendChild: (c) => (el.children.push(c), c),

    removeChild: (c) => c,
    remove: () => {},
    attributes: {},
    setAttribute: (k, v) => (el.attributes[k] = v),
    getAttribute: (k) => el.attributes[k] ?? null,
    addEventListener: (type, fn) => ((el.listeners[type] ||= []).push(fn), undefined),
    removeEventListener: () => {},
    dispatch: (type, ev = {}) => (el.listeners[type] || []).forEach((fn) => fn(ev)),
    querySelector: (sel) => (sel.includes("input") ? makeInput() : null),
    querySelectorAll: (sel) => (sel.includes("input") ? [makeInput()] : []),
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    closest: () => null,
    focus: () => {},
    insertBefore: (c) => c,
    scrollIntoView: () => {},
    cloneNode: () => makeEl(id),
  };
  // Setting innerHTML to "" clears the children, like the real thing.
  let html = "";
  Object.defineProperty(el, "innerHTML", {
    get: () => html,
    set: (v) => {
      html = String(v);
      if (html === "") el.children.length = 0;
    },
  });

  // className and classList are the same set here, as in a real element.
  Object.defineProperty(el, "className", {
    get: () => [...el.classes].join(" "),
    set: (v) => {
      el.classes.clear();
      for (const c of String(v).split(/\s+/).filter(Boolean)) el.classes.add(c);
    },
  });

  // Lazily materialised so every node has a parent to be appended to, the way
  // the real DOM does, without building a tree up front.
  let parent = null;
  Object.defineProperty(el, "parentNode", { get: () => (parent ||= makeEl(`${id}-parent`)) });

  return el;
}

// Buttons wired only from inside a render pass (they don't exist as static ids
// until the matching phase), so they can't be checked at lobby time.
const LATE_BUTTONS = {
  bac: ["stop-btn", "finish-review-btn"],
};

// Inputs wired to the name typeahead, and the AniList kind each asks for.
const TYPEAHEAD = {
  whoami: { id: "word-input", kind: "any" },
  detective: { id: "propose-input", kind: "character" },
  hundred: { id: "proposal-input", kind: "any" },
};

const SUGGESTIONS = [{ name: "Shouyou Hinata", from: "Haikyuu!!" }];

// What graphql.anilist.co answers: the combined character+anime search, and
// the cast of one anime once a "Voir les personnages" row is opened.
const ANILIST_SEARCH = {
  data: {
    chars: {
      characters: [
        { id: 1, name: { full: "Shouyou Hinata" }, media: { nodes: [{ title: { romaji: "Haikyuu!!" } }] } },
      ],
    },
    animes: { media: [{ id: 20, title: { romaji: "Haikyuu!!" }, startDate: { year: 2014 } }] },
  },
};

const ANILIST_CAST = {
  data: {
    Media: {
      title: { romaji: "Haikyuu!!" },
      characters: { nodes: [{ id: 2, name: { full: "Tobio Kageyama" } }, { id: 1, name: { full: "Shouyou Hinata" } }] },
    },
  },
};

// Vérifications propres à une phase de jeu, jouées après le lobby.
const PHASE_CHECKS = {
  // Petit Bac : stop verrouillé tant que 75 % des cases ne sont pas remplies.
  bac(send, byId, slug, tick) {
    send({
      type: "state",
      state: {
        code: "ABCD", phase: "play", hostId: "p1", players: [], letter: "K",
        categories: ["anime", "hero", "villain", "item"], // 4 cases -> 3 requises
        stopMinFilled: 3, endsIn: 600000, you: { id: "p1", answers: {} },
      },
    });
    const inputs = byId("answers-form").children.map((row) => row.children[1]);
    assert.strictEqual(inputs.length, 4, `${slug}: wrong number of answer inputs`);
    assert.strictEqual(byId("stop-btn").disabled, true, `${slug}: stop should be locked with 0 answers`);
    inputs[0].value = "Kenshin";
    inputs[1].value = "Kirito";
    tick();
    assert.strictEqual(byId("stop-btn").disabled, true, `${slug}: stop should stay locked at 2/4`);
    inputs[2].value = "Kabuto";
    tick();
    assert.strictEqual(byId("stop-btn").disabled, false, `${slug}: stop should unlock at 3/4`);
    assert.match(byId("play-timer").textContent, /^\d+:\d\d$/, `${slug}: no countdown shown`);

    // Correction : une case vide ne doit pas être cliquable par l'hôte.
    send({
      type: "state",
      state: {
        code: "ABCD", phase: "review", hostId: "p1", stoppedByName: "Alice",
        players: [{ id: "p1", name: "Alice", connected: true, isHost: true }],
        result: {
          letter: "K", totals: { p1: 2 },
          byCategory: [{ category: "anime", entries: [
            { playerId: "p1", answer: "Kenshin", valid: true, points: 2 },
          ] }, { category: "hero", entries: [
            { playerId: "p1", answer: "  ", valid: false, points: 0 },
          ] }],
        },
      },
    });
    const cells = byId("review-table").children[1].children.map((tr) => tr.children[1]);
    assert.ok(cells[0].listeners.click?.length, `${slug}: a filled answer must stay editable`);
    assert.ok(!cells[1].listeners.click?.length, `${slug}: an empty answer must not be validable`);
  },

  // Alphabombe : un mot inconnu d'AniList ne doit pas partir au serveur.
  async bomb(send, byId, slug, tick, socketSent, fetchCount) {
    send({
      type: "state",
      state: {
        code: "ABCD", phase: "play", hostId: "p1", mode: "perso", letter: "S",
        players: [
          { id: "p1", name: "Alice", connected: true, lives: 2 },
          { id: "p2", name: "Bob", connected: true, lives: 1 },
        ],
        turnId: "p1", answers: [],
      },
    });
    // La table : un siège par joueur, placé par un angle, et celui qui tient
    // la bombe est marqué — c'est toute l'information de l'écran.
    const seats = byId("bomb-seats").children;
    assert.strictEqual(seats.length, 2, `${slug}: un siège par joueur autour de la bombe`);
    assert.strictEqual(seats[0].style["--angle"], "-90deg", `${slug}: siège sans angle`);
    assert.ok(seats[0].classes.has("current"), `${slug}: le porteur de la bombe n'est pas marqué`);
    assert.ok(!seats[1].classes.has("current"), `${slug}: un seul porteur à la fois`);

    const flush = () => new Promise((r) => setImmediate(r));
    const sentWords = () => socketSent().filter((m) => m.type === "submitWord").map((m) => m.text);

    byId("word-input").value = "Sdfsdfsdf";
    byId("word-submit").dispatch("click");
    await flush();
    await flush();
    assert.deepStrictEqual(sentWords(), [], `${slug}: un mot inconnu d'AniList ne doit pas être envoyé`);

    byId("word-input").value = "Shouyou Hinata";
    byId("word-submit").dispatch("click");
    await flush();
    await flush();
    assert.deepStrictEqual(sentWords(), ["Shouyou Hinata"], `${slug}: un vrai personnage doit passer`);

    // Un mot pris dans les suggestions est déjà validé : pas de requête de plus.
    const before = fetchCount();
    byId("word-input").value = "Shouyou Hinata";
    byId("word-input").dataset.anilistRef = "character:1";
    byId("word-submit").dispatch("click");
    await flush();
    assert.deepStrictEqual(sentWords(), ["Shouyou Hinata", "Shouyou Hinata"], `${slug}: mot choisi dans la liste`);
    assert.strictEqual(fetchCount(), before, `${slug}: un mot déjà choisi ne doit pas redemander AniList`);
  },

  // 1 à 100 : l'écran final colore chaque carte selon ses paires voisines.
  hundred(send, byId, slug) {
    // La variante de la manche doit être lisible en haut de l'écran, pas
    // seulement devinable au placeholder du champ.
    for (const [mode, attendu] of [["perso", /Personnages/], ["anime", /Animes/]]) {
      send({
        type: "state",
        state: {
          code: "ABCD", phase: "propose", hostId: "p1", mode, theme: "Puissance",
          players: [{ id: "p1", name: "Alice", connected: true }],
          you: { id: "p1", number: 42, proposal: null },
          proposalsSubmitted: 0, proposalsNeeded: 1,
        },
      });
      assert.match(byId("propose-mode").textContent, attendu, `${slug}: variante ${mode} pas annoncée`);
    }

    send({
      type: "state",
      state: {
        code: "ABCD", phase: "ended", hostId: "p1", mode: "character", theme: "Puissance",
        order: ["p1", "p2", "p3"],
        players: [
          { id: "p1", name: "Alice", proposal: "Yuki", number: 33 },
          { id: "p2", name: "Bob", proposal: "Rem", number: 100 },
          { id: "p3", name: "Carl", proposal: "Hinata", number: 69 },
        ],
        score: { correctPairs: 1, total: 2, sortedFully: false },
      },
    });
    const classes = byId("line-final").children.map((c) =>
      c.classes.has("incorrect") ? "incorrect" : c.classes.has("correct") ? "correct" : "none"
    );
    assert.deepStrictEqual(classes, ["correct", "incorrect", "incorrect"], `${slug}: pair colors ${classes}`);
  },
};

function run(slug) {
  const html = fs.readFileSync(path.join(ROOT, "games", slug, "index.html"), "utf8");
  // Chaque page de jeu doit porter ses règles (reprises par room-client.js dans
  // le <dialog> du bouton Règles) et ses balises de partage : un huitième jeu
  // ajouté sans elles se voit ici plutôt que dans une conversation de groupe.
  assert.match(html, /<template id="rules">[\s\S]*?<li>[\s\S]*?<\/template>/, slug + ': pas de <template id="rules"> avec des étapes');
  assert.match(html, /property="og:image"/, slug + ': pas de balises de partage (og:)');
  const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const els = new Map();
  const byId = (id) => {
    if (!ids.has(id)) return null; // same as a real page: a typo yields null
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  };
  const sections = [...html.matchAll(/<section id="(screen-[\w-]+)"/g)].map((m) => byId(m[1]));

  const fetches = [];
  const timers = [];
  const copied = []; // presse-papier bouchon, pour le lien d'invitation
  const intervals = []; // callbacks du chrono, rejoués à la main par tick()
  let socket = null;
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      this.listeners = {};
      socket = this;
    }
    addEventListener(t, fn) {
      (this.listeners[t] ||= []).push(fn);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {}
    fire(type, ev) {
      (this.listeners[type] || []).forEach((fn) => fn(ev));
    }
  }
  FakeWebSocket.OPEN = 1;

  const document = {
    getElementById: byId,
    createElement: (tag) => makeEl(tag),
    createDocumentFragment: () => makeEl("#fragment"),
    createTextNode: (t) => ({ textContent: String(t) }),
    querySelector: () => null,
    querySelectorAll: (sel) => (sel.includes("screen-") ? sections : []),
    addEventListener: () => {},
    body: makeEl("body"),
    activeElement: null,
  };

  const store = new Map();
  const sandbox = {
    document,
    console,
    WebSocket: FakeWebSocket,
    location: { protocol: "http:", host: "localhost", origin: "http://localhost", search: "", pathname: `/games/${slug}/`, href: "" },
    history: { replaceState: () => {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    URLSearchParams,
    AbortController,
    fetch: async (url, init) => {
      fetches.push({ url: String(url), body: init?.body ?? "" });
      const body = String(init?.body ?? "");
      const anilist = String(url).includes("graphql.anilist.co");
      return {
        ok: true,
        status: 200,
        json: async () => {
          if (!anilist) return { code: "ABCD" };
          return body.includes("Media(id") ? ANILIST_CAST : ANILIST_SEARCH;
        },
      };
    },
    alert: () => {},
    confirm: () => true,
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {},
    setInterval: (fn) => intervals.push(fn),
    clearInterval: () => intervals.splice(0),
    requestAnimationFrame: () => 0,
    navigator: { userAgent: "node", clipboard: { writeText: async (text) => copied.push(text) } },
    prompt: () => "",
    // room-client.js écoute "online" sur window pour relancer la reconnexion.
    addEventListener: () => {},
    AudioContext: function () {
      return { createOscillator: () => ({ connect: () => {}, start: () => {}, stop: () => {}, frequency: { setValueAtTime: () => {} } }), createGain: () => ({ connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} } }), currentTime: 0, destination: {}, state: "running", resume: () => {} };
    },
    Audio: function () {
      return { play: () => Promise.resolve(), pause: () => {}, addEventListener: () => {} };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const [, src] of html.matchAll(/<script src="\/([^"]+)"><\/script>/g)) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, src), "utf8"), sandbox, { filename: src });
  }

  // Un pseudo trop court ne doit même pas ouvrir de socket (le serveur le
  // refuse aussi, mais l'écran de join doit le dire tout de suite).
  byId("name-input").value = "Bob";
  byId("create-btn").dispatch("click");
  assert.ok(!socket, `${slug}: a 3-letter name should not create a room`);

  // Create a room the way a host does, then walk the server messages.
  byId("name-input").value = "Alice";
  byId("create-public").checked = true;
  byId("create-btn").dispatch("click");

  return new Promise((resolve) => {
    setImmediate(() => {
      assert.ok(socket, `${slug}: no WebSocket opened`);
      assert.match(socket.url, new RegExp(`/ws/${slug}/ABCD$`));
      socket.fire("open");
      assert.deepStrictEqual(socket.sent[0].type, "join");

      const send = (msg) => socket.fire("message", { data: JSON.stringify(msg) });
      send({ type: "joined", playerId: "p1", token: "t1" });
      assert.ok(
        socket.sent.some((m) => m.type === "setVisibility" && m.visibility === "public"),
        `${slug}: public room checkbox did not reach the server`
      );

      const players = [
        { id: "p1", name: "Alice", connected: true, isHost: true },
        { id: "p2", name: "Bob", connected: true },
        { id: "p3", name: "Carl", connected: true },
      ];
      send({
        type: "state",
        state: { code: "ABCD", phase: "lobby", hostId: "p1", visibility: "public", players, scores: { p2: 3 }, settings: { undercoverCount: 1, mrWhiteCount: 0, category: "anime" } },
      });

      assert.strictEqual(byId("lobby-code").textContent, "ABCD");
      assert.strictEqual(byId("players-list").children.length, 3);
      assert.strictEqual(byId("public-toggle").checked, true);
      assert.strictEqual(byId("start-btn").disabled, false, `${slug}: start should be enabled with 3 players`);
      assert.ok(!byId("screen-lobby").classList.contains("hidden"), `${slug}: lobby screen hidden`);

      // Score cumulé du salon, rendu par le client partagé pour les sept jeux.
      const tags = byId("players-list").children[1].children.map((c) => c.textContent);
      assert.ok(tags.includes("3 pts"), `${slug}: score cumulé absent de la ligne joueur (${tags})`);

      // Lien d'invitation : ?room=CODE est déjà géré au chargement.
      byId("lobby-code").parentNode.children.find((c) => c.id === "invite-btn").dispatch("click");
      assert.ok(byId("screen-join").classList.contains("hidden"), `${slug}: join screen still visible`);

      // Every static button must be wired: this is what a dropped listener
      // looks like from the outside ("Prêt" doing nothing).
      const late = new Set(LATE_BUTTONS[slug] || []);
      for (const [, id] of html.matchAll(/<button id="([\w-]+)"/g)) {
        if (late.has(id)) continue;
        const b = byId(id);
        assert.ok(b.listeners.click?.length, `${slug}: #${id} has no click listener`);
      }

      // The "changer de jeu" select must offer the five other games, in order,
      // and switch to the one actually selected.
      const options = byId("switch-game-select").children.map((o) => o.value);
      const menuOrder = ["undercover", "hundred", "bac", "whoami", "detective", "note", "bomb"]; // room-client.js
      assert.deepStrictEqual(options, menuOrder.filter((g) => g !== slug), `${slug}: switch-game options`);
      byId("switch-game-select").value = options[2];
      byId("switch-game-btn").dispatch("click");
      const switched = socket.sent.find((m) => m.type === "switchGame");
      assert.strictEqual(switched?.slug, options[2], `${slug}: switched to the wrong game`);

      // Start must carry the game's lobby settings, not a bare {type:"start"}.
      if (byId("guesser-select")) byId("guesser-select").value = "p2"; // note: optional field
      byId("start-btn").dispatch("click");
      const start = socket.sent.find((m) => m.type === "start");
      assert.ok(start, `${slug}: start button sent nothing`);
      assert.deepStrictEqual(Object.keys(start).sort(), START_KEYS[slug].sort(), `${slug}: start payload`);
      // Joué en dernier : ces phases déclenchent leurs propres fetch (images),
      // qui brouilleraient les assertions sur la requête du typeahead.
      const extra = PHASE_CHECKS[slug];
      const done = () => {
        assert.deepStrictEqual(copied, [`http://localhost/games/${slug}/?room=ABCD`], `${slug}: lien d'invitation`);

        // Arrivé en cours de partie : écran d'attente partagé, le jeu ne rend
        // rien (le serveur ne nous envoie pas la manche en cours).
        send({ type: "state", state: { code: "ABCD", phase: "play", hostId: "p2", players, waiting: [{ id: "p1", name: "Alice" }] } });
        assert.ok(byId("screen-lobby").classList.contains("hidden"), `${slug}: un joueur en attente ne doit pas voir le jeu`);
        // Et l'hôte voit qu'on attend derrière la porte, sinon il n'a aucune
        // raison de relancer une manche.
        send({
          type: "state",
          state: { code: "ABCD", phase: "lobby", hostId: "p1", visibility: "public", players, waiting: [{ id: "p9", name: "Dave" }], settings: { undercoverCount: 1, mrWhiteCount: 0, category: "anime" } },
        });
        const badge = byId("room-badge").parentNode.children.find((c) => c.id === "waiting-badge");
        assert.strictEqual(badge?.textContent, "1 en attente", `${slug}: badge d'attente`);

        Promise.resolve(
          extra
            ? extra(send, byId, slug, () => intervals.forEach((fn) => fn()), () => socket.sent, () => fetches.length)
            : null
        ).then(resolve);
      };

      // Typeahead: inputs that expect a character name must query AniList
      // (from the browser, cf. anilist.js) once enough letters are typed.
      const typeahead = TYPEAHEAD[slug];
      if (typeahead) {
        const input = byId(typeahead.id);
        input.value = "hin";
        input.dispatch("input");
        timers.splice(0).forEach((fn) => fn());
        setImmediate(() => {
          // The lookup must go straight to AniList: routing it through the
          // Worker gets a 403, its egress IPs are blocked.
          const call = fetches.find((f) => f.url.includes("graphql.anilist.co"));
          assert.ok(call, `${slug}: typing did not query AniList`);
          assert.ok(call.body.includes('"search":"hin"'), `${slug}: query not forwarded (${call.body})`);
          const wantsAnime = typeahead.kind === "anime";
          assert.strictEqual(call.body.includes("characters(search"), !wantsAnime, `${slug}: wrong AniList query for kind ${typeahead.kind}`);

          // The suggestion menu must render and fill the input when picked —
          // a native <datalist> did neither on Firefox-based browsers.
          const menu = input.parentNode.children.find((c) => c.classes.has("suggest-menu"));
          assert.ok(menu, `${slug}: no suggestion menu created`);
          assert.ok(!menu.classes.has("hidden"), `${slug}: suggestion menu stayed hidden`);
          // One character match + one "Voir les personnages" row for the anime.
          assert.strictEqual(menu.children.length, 2, `${slug}: wrong number of suggestions`);

          // Opening the anime row lists its cast instead of filling the input.
          menu.children[1].dispatch("mousedown", { preventDefault() {} });
          setImmediate(() => {
            assert.strictEqual(input.value, "hin", `${slug}: opening an anime should not fill the input`);
            const names = menu.children.map((c) => c.children[0]?.textContent ?? c.textContent);
            assert.deepStrictEqual(
              names,
              ["Personnages de Haikyuu!!", "‹ Retour", "Haikyuu!!", "Tobio Kageyama", "Shouyou Hinata"],
              `${slug}: unexpected cast list ${JSON.stringify(names)}`
            );

            // And picking one of those fills the input with the exact spelling.
            menu.children[3].dispatch("mousedown", { preventDefault() {} });
            assert.strictEqual(input.value, "Tobio Kageyama", `${slug}: picking from the cast did not fill the input`);
            // The exact AniList entry travels with the word, so every player
            // sees the character that was picked and not a same-named other.
            assert.strictEqual(input.dataset.anilistRef, "character:2", `${slug}: picked entry not remembered`);
            input.dispatch("input");
            assert.strictEqual(input.dataset.anilistRef, undefined, `${slug}: editing should forget the picked entry`);
            assert.ok(menu.classes.has("hidden"), `${slug}: menu stayed open after picking`);
            done();
          });
        });
        return;
      }
      done();
    });
  });
}

(async () => {
  for (const slug of GAMES) {
    await run(slug);
    console.log(`${slug}: ok`);
  }
  console.log("all games boot and render their lobby");
})();
