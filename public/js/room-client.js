// Shared room plumbing for every game's app.js (no bundler, so one global object).
//
// Owns everything that was copy-pasted identically in the six app.js files:
// the WebSocket + reconnection, the join/create screen, localStorage identity,
// the room badge, the "changer de jeu" header, the toast, the player rows and
// the lobby. Each app.js keeps only its own game screens and messages.
//
// Usage, at the bottom of a game's app.js:
//   Room.init({ slug: "whoami", minPlayers: 2, maxPlayers: 5, onState: render });
// Games with lobby settings also pass onStart() -> extra fields for the "start"
// message, or a falsy value to refuse (see bac).
const Room = (() => {
  const $ = (id) => document.getElementById(id);

  const GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
    { slug: "whoami", label: "Qui suis-je" },
    { slug: "detective", label: "Détective Anime" },
    { slug: "note", label: "Le jeu de la note" },
  ];

  const el = {};
  let cfg = null;
  let ws = null;
  let reconnectTimer = null;
  let toastTimer = null;
  let wantPublic = false;

  const api = {
    playerId: null,
    code: null,
    state: null,
  };

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 4000);
  }

  function storageKey(code, suffix) {
    return `${cfg.slug}:${code}:${suffix}`;
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function connect(code, name, token, asHost) {
    api.code = code.toUpperCase();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/${cfg.slug}/${api.code}`);

    ws.addEventListener("open", () => {
      send({ type: "join", name, token: token || undefined, asHost: !!asHost });
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      handleServerMessage(msg);
    });

    ws.addEventListener("close", () => {
      if (api.playerId) {
        toast("Connexion perdue, reconnexion...");
        scheduleReconnect();
      }
    });

    ws.addEventListener("error", () => ws.close());
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      const token = localStorage.getItem(storageKey(api.code, "token"));
      const name = localStorage.getItem(storageKey(api.code, "name"));
      if (api.code && token && name) connect(api.code, name, token);
    }, 2000);
  }

  function handleServerMessage(msg) {
    if (msg.type === "joined") {
      api.playerId = msg.playerId;
      const name = el.nameInput.value.trim() || "Joueur";
      localStorage.setItem(storageKey(api.code, "token"), msg.token);
      localStorage.setItem(storageKey(api.code, "name"), name);
      localStorage.setItem(`${cfg.slug}:lastName`, name);
      const params = new URLSearchParams(location.search);
      params.set("room", api.code);
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
      el.roomBadge.textContent = api.code;
      el.roomBadge.classList.remove("hidden");
      if (wantPublic) {
        wantPublic = false;
        send({ type: "setVisibility", visibility: "public" });
      }
    } else if (msg.type === "state") {
      const previous = api.state;
      api.state = msg.state;
      cfg.onState(msg.state, previous);
    } else if (msg.type === "switchGame") {
      const name = localStorage.getItem(storageKey(api.code, "name")) || "Joueur";
      const asHostParam = msg.asHost ? "&asHost=1" : "";
      location.href = `/games/${msg.slug}/?room=${msg.code}&autojoin=${encodeURIComponent(name)}${asHostParam}`;
    } else if (msg.type === "kicked") {
      // Token dropped so the auto-reconnect on the next page load doesn't
      // silently walk back into the salon we were just thrown out of.
      localStorage.removeItem(storageKey(api.code, "token"));
      api.playerId = null;
      alert("Tu as été exclu du salon par l'hôte.");
      location.href = "/";
    } else if (msg.type === "error") {
      toast(msg.message);
    }
  }

  // ---- shared rendering ----

  // Every game screen is a <section id="screen-*">, so no per-game list needed.
  function showScreen(screen) {
    const target = typeof screen === "string" ? $(screen) : screen;
    for (const s of document.querySelectorAll("section[id^='screen-']")) {
      s.classList.toggle("hidden", s !== target);
    }
  }

  // `decorate(row, player)` is where a game hangs its own badges (roles, scores).
  function playerRow(p, decorate) {
    const row = document.createElement("div");
    row.className = "player-row";
    if (p.id === api.playerId) row.classList.add("you");
    if (p.alive === false) row.classList.add("dead");
    if (p.connected === false) row.classList.add("offline");

    row.appendChild(makeAvatar(p.name));

    const dot = document.createElement("span");
    dot.className = "dot";
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.name + (p.id === api.playerId ? " (toi)" : "");
    row.appendChild(name);

    if (p.isHost) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Hôte";
      row.appendChild(tag);
    }

    if (decorate) decorate(row, p);

    if (
      api.state &&
      api.state.phase === "lobby" &&
      api.state.hostId === api.playerId &&
      p.id !== api.playerId
    ) {
      const kick = document.createElement("button");
      kick.className = "btn secondary small kick-btn";
      kick.textContent = "Exclure";
      kick.addEventListener("click", () => {
        if (confirm(`Exclure ${p.name} du salon ?`)) send({ type: "kick", playerId: p.id });
      });
      row.appendChild(kick);
    }

    return row;
  }

  // Games with extra lobby controls (settings, selects) render them on top of
  // this, after calling it.
  function renderLobby(state, decorate) {
    el.lobbyCode.textContent = state.code;
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.playersList.innerHTML = "";
    for (const p of state.players) el.playersList.appendChild(playerRow(p, decorate));

    const isHost = state.hostId === api.playerId;
    const connected = state.players.filter((p) => p.connected).length;
    const { minPlayers: min, maxPlayers: max } = cfg;

    el.hostSettings.classList.toggle("hidden", !isHost);
    el.waitingHost.classList.toggle("hidden", isHost);
    if (!isHost) return;

    el.publicToggle.checked = state.visibility === "public";
    const canStart = connected >= min && (!max || connected <= max);
    el.startBtn.disabled = !canStart;
    el.startHint.textContent = canStart
      ? ""
      : `Il faut ${max ? `entre ${min} et ${max}` : `au moins ${min}`} joueurs connectés (actuellement ${connected}).`;
  }

  // ---- boot ----

  function init(config) {
    cfg = config;

    Object.assign(el, {
      toast: $("toast"),
      roomBadge: $("room-badge"),
      switchGame: $("switch-game"),
      switchGameSelect: $("switch-game-select"),
      switchGameBtn: $("switch-game-btn"),
      nameInput: $("name-input"),
      codeInput: $("code-input"),
      createBtn: $("create-btn"),
      createPublic: $("create-public"),
      joinBtn: $("join-btn"),
      lobbyCode: $("lobby-code"),
      playersList: $("players-list"),
      hostSettings: $("host-settings"),
      publicToggle: $("public-toggle"),
      startBtn: $("start-btn"),
      startHint: $("start-hint"),
      waitingHost: $("waiting-host"),
    });

    for (const g of GAMES) {
      if (g.slug === cfg.slug) continue;
      const opt = document.createElement("option");
      opt.value = g.slug;
      opt.textContent = g.label;
      el.switchGameSelect.appendChild(opt);
    }

    el.createBtn.addEventListener("click", async () => {
      const name = el.nameInput.value.trim();
      if (!name) return toast("Entre un pseudo d'abord.");
      el.createBtn.disabled = true;
      wantPublic = el.createPublic.checked;
      try {
        const res = await fetch(`/api/${cfg.slug}/create`, { method: "POST" });
        if (!res.ok) throw new Error("Erreur serveur");
        const { code } = await res.json();
        connect(code, name);
      } catch {
        toast("Impossible de créer un salon, réessaie.");
      } finally {
        el.createBtn.disabled = false;
      }
    });

    el.joinBtn.addEventListener("click", () => {
      const name = el.nameInput.value.trim();
      const code = el.codeInput.value.trim();
      if (!name) return toast("Entre un pseudo d'abord.");
      if (!code) return toast("Entre un code de salon.");
      connect(code, name);
    });

    el.codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.joinBtn.click();
    });

    el.publicToggle.addEventListener("change", () =>
      send({ type: "setVisibility", visibility: el.publicToggle.checked ? "public" : "private" })
    );

    // Games with lobby settings supply them (or refuse) via onStart().
    el.startBtn.addEventListener("click", () => {
      const extra = cfg.onStart ? cfg.onStart() : {};
      if (!extra) return;
      send({ type: "start", ...extra });
    });

    el.switchGameBtn.addEventListener("click", () => {
      const slug = el.switchGameSelect.value;
      if (!slug) return;
      const label = GAMES.find((g) => g.slug === slug)?.label ?? slug;
      if (!confirm(`Changer de jeu pour "${label}" ? Tout le monde du salon sera redirigé.`)) return;
      send({ type: "switchGame", slug });
    });

    const params = new URLSearchParams(location.search);
    const codeFromUrl = params.get("room");
    const lastName = localStorage.getItem(`${cfg.slug}:lastName`);
    if (lastName) el.nameInput.value = lastName;
    if (!codeFromUrl) return;

    const code = codeFromUrl.toUpperCase();
    el.codeInput.value = code;
    const token = localStorage.getItem(storageKey(code, "token"));
    const savedName = localStorage.getItem(storageKey(code, "name"));
    if (token && savedName) {
      el.nameInput.value = savedName;
      connect(code, savedName, token);
      return;
    }

    const autojoinName = params.get("autojoin");
    if (autojoinName) {
      el.nameInput.value = autojoinName;
      connect(code, autojoinName, undefined, params.get("asHost") === "1");
    }
  }

  return Object.assign(api, { init, send, toast, showScreen, playerRow, renderLobby, showSwitchGame });

  function showSwitchGame(visible) {
    el.switchGame.classList.toggle("hidden", !visible);
  }
})();
