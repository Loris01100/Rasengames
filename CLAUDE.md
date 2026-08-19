# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RasenGames is an anime/manga-themed party-game platform, played by friends over the web from separate devices (one browser tab per player, no login). It's deployed on Cloudflare Workers at `rasengames.reesch.com`. The name is a pun on "Rasengan" — new content defaults to anime/manga theming unless told otherwise.

## Commands

```
npm install          # install deps
npm run dev           # wrangler dev — local server with Durable Objects + static assets
npm run deploy         # wrangler deploy — manual deploy to Cloudflare
npm run typecheck      # tsc --noEmit
npm test               # scripts/smoke-test.js — boots all 6 game frontends against a stub DOM
```

There is no test suite. Game logic and the WebSocket protocol were validated during development with throwaway Node scripts (native `WebSocket`, simulating multiple players against `wrangler dev`) and a Playwright script for the drag-and-drop UI — neither is checked into the repo. When changing game logic, the fastest way to verify correctness is the same approach: run `npm run dev` and drive a couple of WebSocket clients through a full game.

**Deployment**: the Cloudflare Workers project is connected to this GitHub repo (`Loris01100/Rasengames`) via Workers Builds, which runs `npx wrangler deploy` automatically on push to `main`. This connection has previously dropped silently (Cloudflare dashboard showed a "disconnected from your Git account" banner while still displaying the old build config) — if a push doesn't produce a new deployment, check Settings > Build on the Cloudflare dashboard first before assuming the code is wrong. `npm run deploy` always works as a manual fallback.

## Architecture

Stack is deliberately minimal: Cloudflare Workers + Durable Objects for realtime state, no framework, no database, no bundler. Backend is TypeScript; frontend is hand-written HTML/CSS/JS per game, loaded directly via `<script src>` (no build step, no npm frontend deps).

### Request routing (`src/index.ts`)

One Worker fetch handler for the whole site, driven by a `GAMES` registry array (`{ slug, namespace }`):
- `GET /api/suggest?q=<texte>&kind=character|anime|any` → name typeahead backed by AniList (`suggestNames` in `src/lib/images.ts`), used by the "écris un personnage" inputs so players pick a real spelling instead of guessing it — which is also what makes the image lookup land on the right homonym.
- `POST /api/<slug>/create` → generates a unique room code and returns it as JSON.
- `GET /ws/<slug>/<code>` → looks up (or lazily creates) the game's Durable Object by `idFromName(code)` and forwards the WebSocket upgrade request to it.
- Anything else falls through to `env.ASSETS.fetch(request)`, which serves `public/`.

Adding a new mini-game means: add its Durable Object class + binding, add an entry to `GAMES` in `src/index.ts`, add the binding to `src/env.ts`'s `Env` interface, and add both a `durable_objects.bindings` entry and a new `migrations` entry (`new_sqlite_classes`) in `wrangler.toml`.

### Per-game structure (`src/games/<slug>/`)

Each game is self-contained and follows the same shape (see `undercover/` and `hundred/` as references):
- `types.ts` — the `RoomState` shape persisted in Durable Object storage, plus `createEmptyRoom(code)`.
- `logic.ts` — pure functions (role/number assignment, win conditions, scoring) with no DO or WebSocket dependency, easy to reason about in isolation.
- `room.ts` — the Durable Object class. Holds an in-memory `sessions: {ws, playerId}[]` array and a cached `RoomState` (`this.room`), loaded from/persisted to `this.state.storage` via `loadRoom()`/`saveRoom()`. Every state-changing WebSocket message ends with `saveRoom()` + `broadcast()`. `broadcast()` sends every connected socket a *personalized* view built by `buildView(room, playerId)` — this is where hidden information (your own role/word/number vs. others') gets filtered per-recipient before serialization.
- Game-specific static data (`words.ts`, `themes.ts`, etc).

Each `room.ts` reimplements its own session/join/reconnect/broadcast boilerplate rather than sharing a base class — the two games' reconnection and disconnect semantics already diverge (see comments in each `room.ts`), and a shared abstraction wasn't worth the generics complexity for two games. If a third game needs the exact same session lifecycle, revisit that call.

**Room code gotcha**: `room.ts`'s `fetch()` extracts the room code from the request path by taking the *last* non-empty path segment, and checks whether the second-to-last segment is `exists` to distinguish the room-existence probe from a WebSocket upgrade. `src/lib/rooms.ts` (used by `index.ts` for `/api/<slug>/create`) must therefore probe `/<slug>/exists/<code>` (code last) — putting `/exists` after the code instead breaks code parsing silently (it did once; see git history).

**Player identity / reconnection**: joining assigns a random `id` + `token`; the token is echoed back in the `joined` message and the client persists it in `localStorage` keyed by room code. Rejoining with a known token re-attaches the existing player instead of creating a new one, which is how refresh/reconnect-after-drop is handled. Disconnects mark a player `connected: false` rather than removing them.

### Frontend (`public/`)

- `public/index.html` + `public/styles.css` — landing page and the shared dark theme (design tokens as CSS variables), plus common component styles (join screen, lobby, player list rows, inline forms) reused across every game page.
- `public/js/room-client.js` — the shared `Room` global every game page loads before its own `app.js`. It owns the WebSocket + reconnection, the join/create screen, the localStorage identity, the room badge, the toast, the "changer de jeu" header, the player rows and the lobby (`Room.init({ slug, minPlayers, maxPlayers, onState })`, then `Room.send/toast/showScreen/playerRow/renderLobby/showSwitchGame`, plus the live `Room.playerId` / `Room.state`). Anything identical across games belongs here, not copy-pasted into a seventh `app.js`.
- `public/js/suggest.js` — `Suggest.attach(input, kindOf)` hangs a suggestion menu under a text input and fills it from `/api/suggest` (3 chars minimum, 350 ms debounce, in-page cache). Wired on the character inputs of Qui suis-je, Détective and 1 à 100. It deliberately does *not* use a native `<datalist>`: Firefox-based browsers don't refresh an open datalist popup when its options are injected after the keystroke, so suggestions never appeared there. The keydown listener is on the capture phase so picking with Enter beats the game's own Enter-to-submit handler on the same input.
- `public/games/<slug>/{index.html,style.css,app.js}` — one game per folder, linking the shared stylesheet plus its own. `app.js` holds only that game's screens, messages and sounds: a `render(state)` function that does a full DOM rebuild of the relevant screen from the latest server-pushed state on every message (no diffing/virtual DOM — state and player counts are small enough that this stays simple and correct). Screens are `<section id="screen-*">` toggled by `Room.showScreen(id)` adding/removing a `hidden` class.
- The "1 à 100" drag-and-drop line (`public/games/hundred/app.js`) intentionally uses a single pair of `pointermove`/`pointerup` listeners on `document` rather than per-card listeners with `setPointerCapture` — capture didn't reliably scope events to one card once the dragged card got reinserted elsewhere in the DOM mid-gesture, causing other cards to react to the same event. Keep this pattern if extending that screen.

### Durable Object storage note

`wrangler.toml` uses `new_sqlite_classes` (SQLite-backed Durable Objects) for both room classes — this is the current default for new Workers projects and is what `wrangler dev` provisions locally too.
