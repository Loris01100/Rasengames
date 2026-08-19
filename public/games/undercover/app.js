(() => {
  const $ = (id) => document.getElementById(id);

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
    categorySelect: $("category-select"),
    undercoverCount: $("undercover-count"),
    mrwhiteCount: $("mrwhite-count"),
    startBtn: $("start-btn"),
    startHint: $("start-hint"),
    waitingHost: $("waiting-host"),

    screenGame: $("screen-game"),
    wordImage: $("word-image"),
    wordDisplay: $("word-display"),
    toggleWord: $("toggle-word"),
    roleHint: $("role-hint"),
    roundNumber: $("round-number"),
    categoryLabel: $("category-label"),
    phaseLabel: $("phase-label"),
    playersMini: $("players-mini"),

    clueList: $("clue-list"),
    clueForm: $("clue-form"),
    clueInput: $("clue-input"),
    clueSubmit: $("clue-submit"),
    clueTurnHint: $("clue-turn-hint"),

    votePanel: $("vote-panel"),
    voteProgress: $("vote-progress"),
    voteList: $("vote-list"),

    voteResultPanel: $("vote-result-panel"),
    voteResultList: $("vote-result-list"),
    voteResultSummary: $("vote-result-summary"),

    whiteguessPanel: $("whiteguess-panel"),
    whiteguessInfo: $("whiteguess-info"),
    whiteguessForm: $("whiteguess-form"),
    whiteguessInput: $("whiteguess-input"),
    whiteguessSubmit: $("whiteguess-submit"),

    historyPanel: $("history-panel"),
    historyList: $("history-list"),

    endPanel: $("end-panel"),
    endTitle: $("end-title"),
    endWordsImages: $("end-words-images"),
    endWords: $("end-words"),
    endReveal: $("end-reveal"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  const CATEGORY_LABELS = {
    random: "Aléatoire",
    character: "Personnages",
    technique: "Pouvoirs",
    anime: "Titres d'anime",
    place: "Lieux",
    arc: "Arcs",
    group: "Groupes",
    object: "Objets",
  };

  // Other games the group can switch to without disbanding — see the
  // "switchGame" message handling below.
  const OTHER_GAMES = [
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
    { slug: "whoami", label: "Qui suis-je" },
    { slug: "detective", label: "Détective Anime" },
    { slug: "note", label: "Le jeu de la note" },
  ];

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

  let ws = null;
  let myPlayerId = null;
  let roomCode = null;
  let wordHidden = false;
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
    return `${proto}://${location.host}/ws/undercover/${code}`;
  }

  function storageKey(code, suffix) {
    return `undercover:${code}:${suffix}`;
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
      localStorage.setItem("undercover:lastName", el.nameInput.value.trim() || "Joueur");
      const params = new URLSearchParams(location.search);
      params.set("room", roomCode);
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
      el.roomBadge.textContent = roomCode;
      el.roomBadge.classList.remove("hidden");
    } else if (msg.type === "state") {
      latestState = msg.state;
      playSounds(latestState);
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

  // Sound.onIncrease / onChange ignorent le premier state reçu, donc rien ne
  // sonne au chargement ni à la reconnexion.
  function playSounds(state) {
    // Seulement les indices des autres : on ne se bipe pas soi-même.
    const othersClues = (state.clues ?? []).filter((c) => c.playerId !== myPlayerId);
    Sound.onIncrease("uc:clues", othersClues.length, "notify");
    Sound.onIncrease("uc:votes", state.votesCast ?? 0, "tick");
    const myTurn = state.phase === "clue" && state.currentTurnPlayerId === myPlayerId;
    Sound.onChange("uc:turn", `${state.phase}:${state.currentTurnPlayerId}`, myTurn ? "turn" : null);
  }

  // ---- rendering ----

  function render(state) {
    el.screenJoin.classList.add("hidden");
    el.switchGame.classList.toggle("hidden", state.hostId !== myPlayerId);

    if (state.phase === "lobby") {
      el.screenLobby.classList.remove("hidden");
      el.screenGame.classList.add("hidden");
      renderLobby(state);
    } else {
      el.screenLobby.classList.add("hidden");
      el.screenGame.classList.remove("hidden");
      renderGame(state);
    }
  }

  function playerRow(p, { showRole } = {}) {
    const row = document.createElement("div");
    row.className = "player-row";
    if (p.id === myPlayerId) row.classList.add("you");
    if (p.alive === false) row.classList.add("dead");
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

    if (showRole && p.role) {
      const roleTag = document.createElement("span");
      roleTag.className = `role-tag role-${p.role}`;
      roleTag.textContent = roleLabel(p.role);
      row.appendChild(roleTag);
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

  function roleLabel(role) {
    if (role === "civilian") return "Civil";
    if (role === "undercover") return "Undercover";
    if (role === "mrwhite") return "Mr. White";
    return role;
  }

  function renderLobby(state) {
    el.lobbyCode.textContent = state.code;
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.playersList.innerHTML = "";
    for (const p of state.players) {
      el.playersList.appendChild(playerRow(p));
    }

    const isHost = state.hostId === myPlayerId;
    const connectedCount = state.players.filter((p) => p.connected).length;

    if (isHost) {
      el.hostSettings.classList.remove("hidden");
      el.waitingHost.classList.add("hidden");
      if (document.activeElement !== el.undercoverCount) {
        el.undercoverCount.value = state.settings.undercoverCount;
      }
      if (document.activeElement !== el.mrwhiteCount) {
        el.mrwhiteCount.value = state.settings.mrWhiteCount;
      }
      if (document.activeElement !== el.categorySelect) {
        el.categorySelect.value = state.settings.category;
      }
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

  function renderGame(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    el.roundNumber.textContent = state.round;

    const phaseLabels = {
      clue: "🗣️ Donnez vos indices",
      vote: "🗳️ Votez pour éliminer un suspect",
      whiteguess: "🤔 Mr. White tente de deviner",
      ended: "🏁 Partie terminée",
    };
    el.phaseLabel.textContent = phaseLabels[state.phase] || "";
    el.categoryLabel.textContent = CATEGORY_LABELS[state.settings?.category] || "";

    renderRoleCard(state);
    renderPlayersMini(state);
    renderClues(state);
    renderVote(state);
    renderVoteResult(state);
    renderWhiteGuess(state);
    renderHistory(state);
    renderEnd(state);
  }

  function renderRoleCard(state) {
    const you = state.you;
    if (!you) return;
    const text = you.word ? you.word : you.role === "mrwhite" ? "Tu es Mr. White (pas de mot !)" : "—";
    el.wordDisplay.textContent = wordHidden ? "•••••" : text;
    el.wordDisplay.classList.toggle("hidden-word", wordHidden);

    if (you.wordImage && !wordHidden) {
      el.wordImage.src = you.wordImage;
      el.wordImage.classList.remove("hidden");
    } else {
      el.wordImage.classList.add("hidden");
    }

    el.roleHint.textContent = you.role === "mrwhite"
      ? "Bluffe : tu n'as pas de mot, essaie de deviner celui des civils si tu es démasqué."
      : you.role === "undercover"
        ? "Ton mot ressemble à celui des civils, mais n'est pas identique."
        : "Décris ton mot sans le dire directement.";
  }

  function renderPlayersMini(state) {
    el.playersMini.innerHTML = "";
    for (const p of state.players) {
      const chip = document.createElement("span");
      chip.className = "chip";
      if (p.id === state.currentTurnPlayerId && state.phase === "clue") chip.classList.add("current");
      if (!p.alive) chip.classList.add("dead");
      chip.textContent = p.name;
      el.playersMini.appendChild(chip);
    }
  }

  function renderClues(state) {
    el.clueList.innerHTML = "";
    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    for (const clue of state.clues) {
      const li = document.createElement("li");
      const author = document.createElement("span");
      author.className = "clue-author";
      author.textContent = nameOf(clue.playerId) + " : ";
      li.appendChild(author);
      li.appendChild(document.createTextNode(clue.text));
      el.clueList.appendChild(li);
    }

    const isMyTurn = state.phase === "clue" && state.currentTurnPlayerId === myPlayerId;
    el.clueForm.classList.toggle("hidden", !isMyTurn);
    if (state.phase === "clue") {
      el.clueTurnHint.textContent = isMyTurn
        ? "C'est ton tour !"
        : `En attente de ${nameOf(state.currentTurnPlayerId)}...`;
    } else {
      el.clueTurnHint.textContent = "";
    }
  }

  function renderVote(state) {
    const active = state.phase === "vote";
    el.votePanel.classList.toggle("hidden", !active);
    if (!active) return;

    el.voteProgress.textContent = `${state.votesCast}/${state.votesNeeded} ont voté`;
    el.voteList.innerHTML = "";
    for (const p of state.players) {
      if (!p.alive) continue;
      const btn = document.createElement("button");
      btn.className = "vote-option";
      btn.textContent = p.name + (p.id === myPlayerId ? " (toi)" : "");
      if (state.myVote === p.id) btn.classList.add("selected");
      const me = state.players.find((pl) => pl.id === myPlayerId);
      if (!me || !me.alive) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => send({ type: "vote", targetId: p.id }));
      }
      el.voteList.appendChild(btn);
    }
  }

  function renderVoteResult(state) {
    const result = state.lastVoteResult;
    const active = !!result && state.phase !== "vote";
    el.voteResultPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    el.voteResultList.innerHTML = "";
    const entries = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
    for (const [id, count] of entries) {
      const row = document.createElement("div");
      row.className = "player-row";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = nameOf(id);
      row.appendChild(name);

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `${count} vote${count > 1 ? "s" : ""}`;
      row.appendChild(tag);

      el.voteResultList.appendChild(row);
    }

    el.voteResultSummary.textContent = result.tie
      ? "Égalité : personne n'est éliminé, nouvelle manche."
      : `${nameOf(result.eliminatedId)} a été éliminé(e).`;
  }

  function renderWhiteGuess(state) {
    const active = state.phase === "whiteguess";
    el.whiteguessPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const isGuesser = state.pendingGuesserId === myPlayerId;
    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    el.whiteguessForm.classList.toggle("hidden", !isGuesser);
    el.whiteguessInfo.textContent = isGuesser
      ? "Tu as été démasqué ! Devine le mot des civils pour gagner."
      : `${nameOf(state.pendingGuesserId)} (Mr. White) a été démasqué et tente de deviner le mot des civils...`;
  }

  function renderHistory(state) {
    const has = state.eliminatedHistory.length > 0;
    el.historyPanel.classList.toggle("hidden", !has);
    if (!has) return;
    el.historyList.innerHTML = "";
    for (const e of state.eliminatedHistory) {
      const li = document.createElement("li");
      li.textContent = `${e.name} était ${roleLabel(e.role)}`;
      el.historyList.appendChild(li);
    }
  }

  function renderEnd(state) {
    const active = state.phase === "ended";
    el.endPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const titles = {
      civilians: "Les civils gagnent 🎉",
      undercover: "Les undercover gagnent 😈",
      mrwhite: "Mr. White gagne en devinant le mot ! 🃏",
    };
    el.endTitle.textContent = titles[state.winner] || "Partie terminée";
    el.endWords.textContent = `Mot des civils : ${state.civilianWord} — Mot des undercover : ${state.undercoverWord}`;

    el.endWordsImages.innerHTML = "";
    const wordCards = [
      { label: "Civils", word: state.civilianWord, image: state.civilianImage },
      { label: "Undercover", word: state.undercoverWord, image: state.undercoverImage },
    ];
    for (const w of wordCards) {
      if (!w.image) continue;
      const fig = document.createElement("figure");
      fig.className = "end-word-figure";
      const img = document.createElement("img");
      img.src = w.image;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      fig.appendChild(img);
      const caption = document.createElement("figcaption");
      caption.textContent = `${w.label} : ${w.word}`;
      fig.appendChild(caption);
      el.endWordsImages.appendChild(fig);
    }

    el.endReveal.innerHTML = "";
    for (const p of state.players) {
      el.endReveal.appendChild(playerRow(p, { showRole: true }));
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
      const res = await fetch("/api/undercover/create", { method: "POST" });
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

  el.toggleWord.addEventListener("click", () => {
    wordHidden = !wordHidden;
    el.toggleWord.textContent = wordHidden ? "Afficher" : "Cacher";
    if (latestState) renderRoleCard(latestState);
  });

  el.startBtn.addEventListener("click", () => {
    send({
      type: "start",
      settings: {
        undercoverCount: Number(el.undercoverCount.value) || 0,
        mrWhiteCount: Number(el.mrwhiteCount.value) || 0,
        category: el.categorySelect.value,
      },
    });
  });

  el.clueSubmit.addEventListener("click", submitClue);
  el.clueInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitClue();
  });
  function submitClue() {
    const text = el.clueInput.value.trim();
    if (!text) return;
    send({ type: "clue", text });
    el.clueInput.value = "";
  }

  el.whiteguessSubmit.addEventListener("click", submitWhiteGuess);
  el.whiteguessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWhiteGuess();
  });
  function submitWhiteGuess() {
    const word = el.whiteguessInput.value.trim();
    if (!word) return;
    send({ type: "whiteGuess", word });
    el.whiteguessInput.value = "";
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
    const lastName = localStorage.getItem("undercover:lastName");
    if (lastName) el.nameInput.value = lastName;

    if (codeFromUrl) {
      el.codeInput.value = codeFromUrl.toUpperCase();
      // Prefer an existing token for this exact room+game: revisiting a game
      // we already joined (e.g. switching back and forth) must reconnect as
      // the same player instead of creating a duplicate one.
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
