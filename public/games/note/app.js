(() => {
  const $ = (id) => document.getElementById(id);

  const OTHER_GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
    { slug: "whoami", label: "Qui suis-je" },
    { slug: "detective", label: "Détective Anime" },
  ];

  const STEP_LABELS = {
    character: "Donne un personnage que tu juges à ce niveau",
    anime: "Donne un anime que tu juges à ce niveau",
    lastChance: "Dernière chance : un arc, un lieu ou un pouvoir",
  };

  const CLUE_COLUMNS = [
    { key: "character", label: "Personnage" },
    { key: "anime", label: "Anime" },
    { key: "lastChance", label: "Dernière chance" },
  ];

  const KIND_LABELS = { arc: "Arc", lieu: "Lieu", pouvoir: "Pouvoir" };

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
    publicToggle: $("public-toggle"),
    guesserSelect: $("guesser-select"),
    startBtn: $("start-btn"),
    startHint: $("start-hint"),
    waitingHost: $("waiting-host"),

    screenPlay: $("screen-play"),
    numberPanel: $("number-panel"),
    numberDisplay: $("number-display"),
    guesserWaitPanel: $("guesser-wait-panel"),
    stepTitle: $("step-title"),
    clueForm: $("clue-form"),
    lastChanceKind: $("last-chance-kind"),
    clueInput: $("clue-input"),
    clueSubmit: $("clue-submit"),
    clueWaitHint: $("clue-wait-hint"),
    stepProgress: $("step-progress"),
    guessPanel: $("guess-panel"),
    guessNumbers: $("guess-numbers"),
    clueLog: $("clue-log"),

    screenEnded: $("screen-ended"),
    endTitle: $("end-title"),
    endDetail: $("end-detail"),
    endClueLog: $("end-clue-log"),
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
    return `${proto}://${location.host}/ws/note/${code}`;
  }

  function storageKey(code, suffix) {
    return `note:${code}:${suffix}`;
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
      localStorage.setItem("note:lastName", el.nameInput.value.trim() || "Joueur");
      const params = new URLSearchParams(location.search);
      params.set("room", roomCode);
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
      el.roomBadge.textContent = roomCode;
      el.roomBadge.classList.remove("hidden");
    } else if (msg.type === "state") {
      const previous = latestState;
      latestState = msg.state;
      playSounds(previous, latestState);
      render(latestState);
    } else if (msg.type === "switchGame") {
      const name = localStorage.getItem(storageKey(roomCode, "name")) || "Joueur";
      const asHostParam = msg.asHost ? "&asHost=1" : "";
      location.href = `/games/${msg.slug}/?room=${msg.code}&autojoin=${encodeURIComponent(name)}${asHostParam}`;
    } else if (msg.type === "kicked") {
      // Token dropped so the auto-reconnect on the next page load doesn't
      // silently walk back into the salon we were just thrown out of.
      localStorage.removeItem(storageKey(roomCode, "token"));
      myPlayerId = null;
      alert("Tu as été exclu du salon par l'hôte.");
      location.href = "/";
    } else if (msg.type === "error") {
      showToast(msg.message);
    }
  }

  // ---- sons ----

  // Sound.onIncrease ignore le premier state reçu, donc rien ne sonne au
  // chargement ni à la reconnexion.
  function playSounds(previous, state) {
    if (state.phase === "play") {
      Sound.onIncrease("note:clues", (state.clues ?? []).length, "notify");
    }
    if (state.phase === "ended" && previous && previous.phase !== "ended") {
      Sound.play(state.guess === state.number ? "win" : "lose");
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

  function buildGuessButtons() {
    el.guessNumbers.innerHTML = "";
    for (let n = 1; n <= 10; n++) {
      const btn = document.createElement("button");
      btn.className = "btn secondary note-number-btn";
      btn.textContent = String(n);
      btn.addEventListener("click", () => send({ type: "submitGuess", number: n }));
      el.guessNumbers.appendChild(btn);
    }
  }
  buildGuessButtons();

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

    row.appendChild(makeAvatar(p.name));

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


    if (
      latestState &&
      latestState.phase === "lobby" &&
      latestState.hostId === myPlayerId &&
      p.id !== myPlayerId
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

  function renderLobby(state) {
    el.lobbyCode.textContent = state.code;
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.playersList.innerHTML = "";
    for (const p of state.players) el.playersList.appendChild(playerRow(p));

    const isHost = state.hostId === myPlayerId;
    const connectedCount = state.players.filter((p) => p.connected).length;

    fillSelect(
      el.guesserSelect,
      [{ value: "", label: "Aléatoire" }].concat(
        state.players
          .filter((p) => p.connected)
          .map((p) => ({ value: p.id, label: p.name + (p.id === myPlayerId ? " (toi)" : "") }))
      )
    );

    if (isHost) {
      el.hostSettings.classList.remove("hidden");
      el.publicToggle.checked = state.visibility === "public";
      el.waitingHost.classList.add("hidden");
      const canStart = connectedCount >= 3;
      el.startBtn.disabled = !canStart;
      el.startHint.textContent = canStart
        ? ""
        : `Il faut au moins 3 joueurs connectés (actuellement ${connectedCount}).`;
    } else {
      el.hostSettings.classList.add("hidden");
      el.waitingHost.classList.remove("hidden");
    }
  }

  // Rebuilt on every render like everything else; `keep` preserves the
  // host's pick across re-renders triggered by someone else joining.
  function fillSelect(select, options) {
    const keep = select.value;
    select.innerHTML = "";
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    }
    if (options.some((o) => o.value === keep)) select.value = keep;
  }

  // One row per player rather than per answer: everyone's clues stay lined up
  // under the same three columns, in player order, whoever answered first.
  function renderClueLog(state, container) {
    container.innerHTML = "";
    const clues = state.clues ?? [];
    const authors = state.players.filter(
      (p) => p.id !== state.guesserId && clues.some((c) => c.playerId === p.id)
    );
    if (authors.length === 0) return;

    const cell = (text, className) => {
      const div = document.createElement("div");
      div.className = className;
      div.textContent = text;
      return div;
    };

    container.appendChild(cell("", "note-head"));
    for (const col of CLUE_COLUMNS) container.appendChild(cell(col.label, "note-head"));

    for (const player of authors) {
      container.appendChild(cell(player.name, "note-row-name"));
      for (const col of CLUE_COLUMNS) {
        const entry = clues.find((c) => c.playerId === player.id && c.step === col.key);
        if (!entry) {
          container.appendChild(cell("—", "note-chip empty"));
          continue;
        }
        const chip = document.createElement("div");
        chip.className = "note-chip";
        if (entry.kind) {
          const kind = document.createElement("span");
          kind.className = "note-author";
          kind.textContent = KIND_LABELS[entry.kind] ?? entry.kind;
          chip.appendChild(kind);
        }
        chip.appendChild(document.createTextNode(entry.text));
        container.appendChild(chip);
      }
    }
  }

  function renderPlay(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const iAmGuesser = state.guesserId === myPlayerId;
    const me = state.players.find((p) => p.id === myPlayerId);
    const isClueStep = state.step === "character" || state.step === "anime" || state.step === "lastChance";

    el.numberPanel.classList.toggle("hidden", iAmGuesser);
    if (!iAmGuesser) el.numberDisplay.textContent = state.number ?? "—";

    el.guesserWaitPanel.classList.toggle("hidden", !iAmGuesser || state.step === "guessing");

    el.stepTitle.textContent = isClueStep ? STEP_LABELS[state.step] : "Tout le monde a répondu !";

    const canSubmit = isClueStep && !iAmGuesser && !me?.submitted;
    el.clueForm.classList.toggle("hidden", !canSubmit);
    el.clueWaitHint.classList.toggle("hidden", !(isClueStep && !iAmGuesser && me?.submitted));
    el.lastChanceKind.classList.toggle("hidden", state.step !== "lastChance");

    const informed = state.players.filter((p) => p.connected && p.id !== state.guesserId);
    const submittedCount = informed.filter((p) => p.submitted).length;
    el.stepProgress.textContent = isClueStep ? `${submittedCount}/${informed.length} ont répondu` : "";

    el.guessPanel.classList.toggle("hidden", !(iAmGuesser && state.step === "guessing"));

    renderClueLog(state, el.clueLog);
  }

  function renderEnded(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const guesserName = state.players.find((p) => p.id === state.guesserId)?.name ?? "?";
    const iAmGuesser = state.guesserId === myPlayerId;
    const who = iAmGuesser ? "Tu as" : `${guesserName} a`;
    const exact = state.guess === state.number;

    el.endTitle.textContent = exact
      ? `${who} deviné pile le bon chiffre : ${state.number} ! 🎯`
      : `${who} dit ${state.guess}, c'était ${state.number}`;

    const diff = state.guess != null && state.number != null ? Math.abs(state.guess - state.number) : null;
    el.endDetail.textContent = exact || diff == null ? "" : `Écart de ${diff}.`;

    renderClueLog(state, el.endClueLog);

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
      const res = await fetch("/api/note/create", { method: "POST" });
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

  el.publicToggle.addEventListener("change", () =>
    send({ type: "setVisibility", visibility: el.publicToggle.checked ? "public" : "private" })
  );

  el.startBtn.addEventListener("click", () =>
    send({ type: "start", guesserId: el.guesserSelect.value || undefined })
  );

  el.clueSubmit.addEventListener("click", submitClue);
  el.clueInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitClue();
  });
  function submitClue() {
    const text = el.clueInput.value.trim();
    if (!text) return;
    const payload = { type: "submitClue", text };
    if (!el.lastChanceKind.classList.contains("hidden")) {
      const checked = el.lastChanceKind.querySelector("input[name=kind]:checked");
      payload.kind = checked ? checked.value : "arc";
    }
    send(payload);
    el.clueInput.value = "";
  }

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
    const lastName = localStorage.getItem("note:lastName");
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
