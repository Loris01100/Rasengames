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
const GAMES = ["bac", "detective", "hundred", "note", "undercover", "whoami"];

// What each game's "start" message must carry beyond its type.
const START_KEYS = {
  bac: ["type", "categories"],
  detective: ["type"],
  hundred: ["type", "mode", "theme"],
  note: ["type", "guesserId"],
  undercover: ["type", "settings"],
  whoami: ["type"],
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
    style: {},
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
        { name: { full: "Shouyou Hinata" }, media: { nodes: [{ title: { romaji: "Haikyuu!!" } }] } },
      ],
    },
    animes: { media: [{ id: 20, title: { romaji: "Haikyuu!!" }, startDate: { year: 2014 } }] },
  },
};

const ANILIST_CAST = {
  data: {
    Media: {
      title: { romaji: "Haikyuu!!" },
      characters: { nodes: [{ name: { full: "Tobio Kageyama" } }, { name: { full: "Shouyou Hinata" } }] },
    },
  },
};

function run(slug) {
  const html = fs.readFileSync(path.join(ROOT, "games", slug, "index.html"), "utf8");
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
    location: { protocol: "http:", host: "localhost", search: "", pathname: `/games/${slug}/`, href: "" },
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
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    navigator: { userAgent: "node" },
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
        state: { code: "ABCD", phase: "lobby", hostId: "p1", visibility: "public", players, settings: { undercoverCount: 1, mrWhiteCount: 0, category: "anime" } },
      });

      assert.strictEqual(byId("lobby-code").textContent, "ABCD");
      assert.strictEqual(byId("players-list").children.length, 3);
      assert.strictEqual(byId("public-toggle").checked, true);
      assert.strictEqual(byId("start-btn").disabled, false, `${slug}: start should be enabled with 3 players`);
      assert.ok(!byId("screen-lobby").classList.contains("hidden"), `${slug}: lobby screen hidden`);
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
      const menuOrder = ["undercover", "hundred", "bac", "whoami", "detective", "note"]; // room-client.js
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
      // Typeahead: inputs that expect a character name must query /api/suggest
      // once enough letters are typed, and expose the result as a <datalist>.
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
            assert.ok(menu.classes.has("hidden"), `${slug}: menu stayed open after picking`);
            resolve();
          });
        });
        return;
      }
      resolve();
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
