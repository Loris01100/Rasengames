(() => {
  const $ = (id) => document.getElementById(id);

  const OTHER_GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
  ];

  const el = {
    toast: $("toast"),
    roomBadge: $("room-badge"),
    switchGame: $("switch-game"),
    switchGameSelect: $("switch-game-select"),
    switchGameBtn: $("switch-game-btn"),

    screenJoin: $("screen-join"),
    nameInput: $("name-input"),
    codeInput: $("code-input"),
    createBtn: $("create-btn"),
    joinBtn: $("join-btn"),

    screenLobby: $("screen-lobby"),
    lobbyCode: $("lobby-code"),
    playersList: $("players-list"),
    hostSettings: $("host-settings"),
    startBtn: $("start-btn"),
    startHint: $("start-hint"),
    waitingHost: $("waiting-host"),

    screenPlay: $("screen-play"),
    guessForm: $("guess-form"),
    guessInput: $("guess-input"),
    guessSubmit: $("guess-submit"),
    foundHint: $("found-hint"),
    endRoundBtn: $("end-round-btn"),
    othersList: $("others-list"),

    screenEnded: $("screen-ended"),
    ranking: $("ranking"),
    revealGrid: $("reveal-grid"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  let ws = null;
  let myPlayerId = null;
  let roomCode = null;
  let reconnectTimer = null;
  let latestState = null;
  let toastTimer = null;

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 4000);
  }

  function wsUrl(code) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws/whoami/${code}`;
  }

  function storageKey(code, suffix) {
    return `whoami:${code}:${suffix}`;
  }

  function connect(code, name, token, asHost) {
    roomCode = code.toUpperCase();
    ws = new WebSocket(wsUrl(roomCode));

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
      if (myPlayerId) {
        showToast("Connexion perdue, reconnexion...");
        scheduleReconnect();
      }
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      const token = localStorage.getItem(storageKey(roomCode, "token"));
      const name = localStorage.getItem(storageKey(roomCode, "name"));
      if (roomCode && token && name) connect(roomCode, name, token);
    }, 2000);
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function handleServerMessage(msg) {
    if (msg.type === "joined") {
      myPlayerId = msg.playerId;
      localStorage.setItem(storageKey(roomCode, "token"), msg.token);
      localStorage.setItem(storageKey(roomCode, "name"), el.nameInput.value.trim() || "Joueur");
      localStorage.setItem("whoami:lastName", el.nameInput.value.trim() || "Joueur");
      const params = new URLSearchParams(location.search);
      params.set("room", roomCode);
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
      el.roomBadge.textContent = roomCode;
      el.roomBadge.classList.remove("hidden");
    } else if (msg.type === "state") {
      latestState = msg.state;
      render(latestState);
    } else if (msg.type === "switchGame") {
      const name = localStorage.getItem(storageKey(roomCode, "name")) || "Joueur";
      const asHostParam = msg.asHost ? "&asHost=1" : "";
      location.href = `/games/${msg.slug}/?room=${msg.code}&autojoin=${encodeURIComponent(name)}${asHostParam}`;
    } else if (msg.type === "error") {
      showToast(msg.message);
    }
  }

  // ---- rendering ----

  const SCREENS = [el.screenJoin, el.screenLobby, el.screenPlay, el.screenEnded];

  function showScreen(screen) {
    for (const s of SCREENS) s.classList.toggle("hidden", s !== screen);
  }

  function populateSwitchGameSelect() {
    el.switchGameSelect.innerHTML = "";
    for (const g of OTHER_GAMES) {
      const opt = document.createElement("option");
      opt.value = g.slug;
      opt.textContent = g.label;
      el.switchGameSelect.appendChild(opt);
    }
  }
  populateSwitchGameSelect();

  function render(state) {
    el.switchGame.classList.toggle("hidden", state.hostId !== myPlayerId);

    if (state.phase === "lobby") {
      showScreen(el.screenLobby);
      renderLobby(state);
    } else if (state.phase === "play") {
      showScreen(el.screenPlay);
      renderPlay(state);
    } else if (state.phase === "ended") {
      showScreen(el.screenEnded);
      renderEnded(state);
    }
  }

  function playerRow(p) {
    const row = document.createElement("div");
    row.className = "player-row";
    if (p.id === myPlayerId) row.classList.add("you");
    if (p.connected === false) row.classList.add("offline");

    const dot = document.createElement("span");
    dot.className = "dot";
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.name + (p.id === myPlayerId ? " (toi)" : "");
    row.appendChild(name);

    if (p.isHost) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Hôte";
      row.appendChild(tag);
    }

    return row;
  }

  function renderLobby(state) {
    el.lobbyCode.textContent = state.code;
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.playersList.innerHTML = "";
    for (const p of state.players) el.playersList.appendChild(playerRow(p));

    const isHost = state.hostId === myPlayerId;
    const connectedCount = state.players.filter((p) => p.connected).length;

    if (isHost) {
      el.hostSettings.classList.remove("hidden");
      el.waitingHost.classList.add("hidden");
      const canStart = connectedCount >= 2;
      el.startBtn.disabled = !canStart;
      el.startHint.textContent = canStart
        ? ""
        : `Il faut au moins 2 joueurs connectés (actuellement ${connectedCount}).`;
    } else {
      el.hostSettings.classList.add("hidden");
      el.waitingHost.classList.remove("hidden");
    }
  }

  function characterCard(p) {
    const card = document.createElement("div");
    card.className = "whoami-card";
    if (p.found) card.classList.add("found");

    if (p.characterImage) {
      const img = document.createElement("img");
      img.className = "whoami-image";
      img.src = p.characterImage;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      card.appendChild(img);
    }

    const name = document.createElement("div");
    name.className = "whoami-owner";
    name.textContent = p.name + (p.id === myPlayerId ? " (toi)" : "");
    card.appendChild(name);

    const character = document.createElement("div");
    character.className = "whoami-character";
    character.textContent = p.character ?? "?";
    card.appendChild(character);

    if (p.found) {
      const badge = document.createElement("div");
      badge.className = "whoami-found-badge";
      badge.textContent = "Trouvé ✓";
      card.appendChild(badge);
    }

    return card;
  }

  function renderPlay(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const you = state.players.find((p) => p.id === myPlayerId);
    const isHost = state.hostId === myPlayerId;

    el.guessForm.classList.toggle("hidden", !!you?.found);
    el.foundHint.classList.toggle("hidden", !you?.found);
    el.endRoundBtn.classList.toggle("hidden", !isHost);

    el.othersList.innerHTML = "";
    for (const p of state.players) {
      if (p.id === myPlayerId) continue;
      el.othersList.appendChild(characterCard(p));
    }
  }

  function renderEnded(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.ranking.innerHTML = "";
    state.foundOrder.forEach((playerId, index) => {
      const p = state.players.find((pl) => pl.id === playerId);
      if (!p) return;
      const row = document.createElement("div");
      row.className = "player-row";
      if (p.id === myPlayerId) row.classList.add("you");

      const rank = document.createElement("span");
      rank.className = "dot";
      rank.textContent = "";
      row.appendChild(rank);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `${index + 1}. ${p.name}${p.id === myPlayerId ? " (toi)" : ""}`;
      row.appendChild(name);

      el.ranking.appendChild(row);
    });

    const notFound = state.players.filter((p) => !state.foundOrder.includes(p.id));
    for (const p of notFound) {
      const row = document.createElement("div");
      row.className = "player-row offline";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `${p.name}${p.id === myPlayerId ? " (toi)" : ""} — n'a pas trouvé`;
      row.appendChild(name);
      el.ranking.appendChild(row);
    }

    el.revealGrid.innerHTML = "";
    for (const p of state.players) {
      el.revealGrid.appendChild(characterCard(p));
    }

    const isHost = state.hostId === myPlayerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.createBtn.addEventListener("click", async () => {
    const name = el.nameInput.value.trim();
    if (!name) return showToast("Entre un pseudo d'abord.");
    el.createBtn.disabled = true;
    try {
      const res = await fetch("/api/whoami/create", { method: "POST" });
      if (!res.ok) throw new Error("Erreur serveur");
      const { code } = await res.json();
      connect(code, name);
    } catch {
      showToast("Impossible de créer un salon, réessaie.");
    } finally {
      el.createBtn.disabled = false;
    }
  });

  el.joinBtn.addEventListener("click", () => {
    const name = el.nameInput.value.trim();
    const code = el.codeInput.value.trim();
    if (!name) return showToast("Entre un pseudo d'abord.");
    if (!code) return showToast("Entre un code de salon.");
    connect(code, name);
  });

  el.codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.joinBtn.click();
  });

  el.startBtn.addEventListener("click", () => send({ type: "start" }));

  el.guessSubmit.addEventListener("click", submitGuess);
  el.guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  function submitGuess() {
    const text = el.guessInput.value.trim();
    if (!text) return;
    send({ type: "guess", text });
    el.guessInput.value = "";
  }

  el.endRoundBtn.addEventListener("click", () => send({ type: "endRound" }));
  el.restartBtn.addEventListener("click", () => send({ type: "restart" }));

  el.switchGameBtn.addEventListener("click", () => {
    const slug = el.switchGameSelect.value;
    const label = OTHER_GAMES.find((g) => g.slug === slug)?.label ?? slug;
    if (!slug) return;
    if (!confirm(`Changer de jeu pour "${label}" ? Tout le monde du salon sera redirigé.`)) return;
    send({ type: "switchGame", slug });
  });

  // ---- boot ----

  (function boot() {
    const params = new URLSearchParams(location.search);
    const codeFromUrl = params.get("room");
    const autojoinName = params.get("autojoin");
    const asHost = params.get("asHost") === "1";
    const lastName = localStorage.getItem("whoami:lastName");
    if (lastName) el.nameInput.value = lastName;

    if (codeFromUrl) {
      el.codeInput.value = codeFromUrl.toUpperCase();
      const token = localStorage.getItem(storageKey(codeFromUrl.toUpperCase(), "token"));
      const savedName = localStorage.getItem(storageKey(codeFromUrl.toUpperCase(), "name"));
      if (token && savedName) {
        el.nameInput.value = savedName;
        connect(codeFromUrl, savedName, token);
        return;
      }

      if (autojoinName) {
        el.nameInput.value = autojoinName;
        connect(codeFromUrl, autojoinName, undefined, asHost);
      }
    }
  })();
})();
