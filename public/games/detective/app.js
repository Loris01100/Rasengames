(() => {
  const $ = (id) => document.getElementById(id);

  const OTHER_GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
    { slug: "whoami", label: "Qui suis-je" },
    { slug: "note", label: "Le jeu de la note" },
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

    screenSetup: $("screen-setup"),
    categoryForm: $("category-form"),
    categoryInput: $("category-input"),
    categorySubmit: $("category-submit"),
    categoryDoneHint: $("category-done-hint"),

    screenPlay: $("screen-play"),
    myCategory: $("my-category"),
    turnBanner: $("turn-banner"),
    incomingPanel: $("incoming-panel"),
    incomingTitle: $("incoming-title"),
    incomingText: $("incoming-text"),
    incomingYes: $("incoming-yes"),
    incomingNo: $("incoming-no"),
    incomingMoreHint: $("incoming-more-hint"),
    proposeForm: $("propose-form"),
    proposeInput: $("propose-input"),
    proposeSubmit: $("propose-submit"),
    guessForm: $("guess-form"),
    guessTarget: $("guess-target"),
    guessInput: $("guess-input"),
    guessSubmit: $("guess-submit"),
    solvedProgress: $("solved-progress"),
    logColumns: $("log-columns"),

    screenEnded: $("screen-ended"),
    endTitle: $("end-title"),
    endRanking: $("end-ranking"),
    endFoundTally: $("end-found-tally"),
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
    return `${proto}://${location.host}/ws/detective/${code}`;
  }

  function storageKey(code, suffix) {
    return `detective:${code}:${suffix}`;
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
      localStorage.setItem("detective:lastName", el.nameInput.value.trim() || "Joueur");
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

  // Signale que l'adversaire a joué : une proposition arrive pour ma catégorie,
  // ou il vient de répondre à l'une des miennes. Sound.onIncrease ignore le
  // premier state reçu, donc pas de bip au chargement ni à la reconnexion.
  function playSounds(previous, state) {
    if (state.phase === "play") {
      Sound.onIncrease("detective:incoming", (state.you?.incoming ?? []).length, "notify");
      const answers = (state.log ?? []).filter((e) => e.from === myPlayerId);
      Sound.onIncrease("detective:answers", answers.length, answers.at(-1)?.fits ? "yes" : "no");
    }
    if (state.phase === "ended" && previous && previous.phase !== "ended") {
      Sound.play((state.solved ?? []).some((s) => s.by === myPlayerId) ? "win" : "lose");
    }
  }

  // ---- rendering ----

  const SCREENS = [el.screenJoin, el.screenLobby, el.screenSetup, el.screenPlay, el.screenEnded];

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
    } else if (state.phase === "setup") {
      showScreen(el.screenSetup);
      renderSetup(state);
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

    if (isHost) {
      el.hostSettings.classList.remove("hidden");
      el.waitingHost.classList.add("hidden");
      const canStart = connectedCount >= 2;
      el.startBtn.disabled = !canStart;
      el.startHint.textContent = canStart ? "" : "Il faut au moins 2 joueurs connectés (2 ou 3).";
    } else {
      el.hostSettings.classList.add("hidden");
      el.waitingHost.classList.remove("hidden");
    }
  }

  // Rebuilt on every render like everything else; `keep` preserves the
  // player's pick across re-renders triggered by an opponent's move.
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

  function renderSetup(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const you = state.players.find((p) => p.id === myPlayerId);
    const ready = !!you?.ready;
    el.categoryForm.classList.toggle("hidden", ready);
    el.categoryDoneHint.classList.toggle("hidden", !ready);
  }

  // One column per player: everything that was tested against THEIR
  // category, colored by whether it fit (or, for a guess, was correct).
  function renderLogColumns(state, containerEl) {
    containerEl.innerHTML = "";
    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    const targetIds = [myPlayerId, ...(state.others ?? []).map((o) => o.id)];

    for (const targetId of targetIds) {
      if (!targetId) continue;
      const column = document.createElement("div");
      column.className = "detective-column";

      const solvedEntry = (state.solved ?? []).find((s) => s.target === targetId);
      const title = document.createElement("h4");
      title.textContent =
        targetId === myPlayerId ? "Ta catégorie" : `Catégorie de ${nameOf(targetId)}`;
      column.appendChild(title);
      if (solvedEntry) {
        column.classList.add("solved");
        title.textContent += ` — trouvée par ${solvedEntry.byName} ✓`;
        const revealed =
          targetId === myPlayerId
            ? state.you?.category
            : state.others?.find((o) => o.id === targetId)?.category;
        if (revealed) {
          const sub = document.createElement("p");
          sub.className = "detective-solved-category";
          sub.textContent = revealed;
          column.appendChild(sub);
        }
      }

      const chips = document.createElement("div");
      chips.className = "detective-chips";
      const entries = state.log.filter((e) => e.target === targetId);
      for (const entry of entries) {
        const chip = document.createElement("div");
        chip.className = `detective-chip ${entry.fits ? "fits" : "no-fit"}`;
        if (entry.kind === "guess") {
          const kindTag = document.createElement("span");
          kindTag.className = "chip-kind";
          kindTag.textContent = "deviné";
          chip.appendChild(kindTag);
        }
        chip.appendChild(document.createTextNode(entry.text));
        chips.appendChild(chip);
      }
      column.appendChild(chips);
      containerEl.appendChild(column);
    }
  }

  function renderPlay(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    el.myCategory.textContent = state.you?.category ?? "";

    const myTurn = state.turnId === myPlayerId;
    el.turnBanner.textContent = myTurn
      ? "À toi de jouer"
      : `Au tour de ${state.turnName ?? "..."}`;
    el.turnBanner.classList.toggle("my-turn", myTurn);
    el.proposeForm.classList.toggle("hidden", !myTurn);
    el.guessForm.classList.toggle("hidden", !myTurn);

    const openTargets = (state.others ?? []).filter((o) => o.connected && !o.solved);
    fillSelect(
      el.guessTarget,
      openTargets.map((o) => ({ value: o.id, label: o.name }))
    );
    el.guessTarget.classList.toggle("hidden", openTargets.length <= 1);

    const queue = state.you?.incoming ?? [];
    const incoming = queue[0];
    el.incomingPanel.classList.toggle("hidden", !incoming);
    if (incoming) {
      const fromName =
        state.others?.find((o) => o.id === incoming.from)?.name ?? "Un adversaire";
      el.incomingTitle.textContent =
        incoming.kind === "proposal"
          ? `${fromName} propose un personnage pour TA catégorie`
          : `${fromName} pense connaître TA catégorie`;
      el.incomingText.textContent = incoming.text;
      el.incomingMoreHint.classList.toggle("hidden", queue.length <= 1);
      el.incomingMoreHint.textContent = `+${queue.length - 1} autre(s) en attente de réponse`;
    }

    const found = (state.solved ?? []).length;
    el.solvedProgress.textContent = `${found} / ${state.categoriesTotal ?? found} catégorie(s) trouvée(s)`;

    renderLogColumns(state, el.logColumns);
  }

  // Ranked by how long each category survived: found last = 1st place, since
  // `solved` is oldest-first, reversing it puts the latest find on top.
  const MEDALS = ["🥇", "🥈", "🧻"];

  function renderEnded(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const ranking = (state.solved ?? []).slice().reverse();
    const winner = ranking[0];
    el.endTitle.textContent = winner
      ? winner.target === myPlayerId
        ? "Manche terminée — tu as gagné ! 🏆"
        : `Manche terminée — ${winner.targetName} a gagné ! 🏆`
      : "Manche terminée !";

    el.endRanking.innerHTML = "";
    ranking.forEach((s, index) => {
      const row = document.createElement("div");
      row.className = "ranking-row";

      const medal = document.createElement("span");
      medal.className = "ranking-medal";
      medal.textContent = MEDALS[index] ?? `#${index + 1}`;
      row.appendChild(medal);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = s.targetName + (s.target === myPlayerId ? " (toi)" : "");
      row.appendChild(name);

      const questionCount = (state.log ?? []).filter((e) => e.target === s.target).length;
      const detail = document.createElement("span");
      detail.className = "muted small";
      detail.textContent = `trouvée en ${questionCount} question${questionCount > 1 ? "s" : ""}`;
      row.appendChild(detail);

      el.endRanking.appendChild(row);
    });

    el.endFoundTally.innerHTML = "";
    for (const p of state.players ?? []) {
      const count = (state.solved ?? []).filter((s) => s.by === p.id).length;
      const row = document.createElement("div");
      row.className = "ranking-row";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name + (p.id === myPlayerId ? " (toi)" : "");
      row.appendChild(name);

      const detail = document.createElement("span");
      detail.className = "muted small";
      detail.textContent = `${count} catégorie${count > 1 ? "s" : ""} trouvée${count > 1 ? "s" : ""}`;
      row.appendChild(detail);

      el.endFoundTally.appendChild(row);
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
      const res = await fetch("/api/detective/create", { method: "POST" });
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

  el.categorySubmit.addEventListener("click", submitCategory);
  el.categoryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitCategory();
  });
  function submitCategory() {
    const text = el.categoryInput.value.trim();
    if (!text) return;
    send({ type: "setCategory", text });
  }

  el.incomingYes.addEventListener("click", () => send({ type: "answerIncoming", fits: true }));
  el.incomingNo.addEventListener("click", () => send({ type: "answerIncoming", fits: false }));

  el.proposeSubmit.addEventListener("click", submitPropose);
  el.proposeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPropose();
  });
  function submitPropose() {
    const text = el.proposeInput.value.trim();
    if (!text) return;
    send({ type: "proposeCharacter", text });
    el.proposeInput.value = "";
  }

  el.guessSubmit.addEventListener("click", submitGuess);
  el.guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  function submitGuess() {
    const text = el.guessInput.value.trim();
    const target = el.guessTarget.value;
    if (!text || !target) return;
    send({ type: "guessCategory", text, target });
    el.guessInput.value = "";
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
    const lastName = localStorage.getItem("detective:lastName");
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
