(() => {
  const $ = (id) => document.getElementById(id);

  const OTHER_GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
    { slug: "detective", label: "Détective Anime" },
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

    screenSubmit: $("screen-submit"),
    wordForm: $("word-form"),
    wordInput: $("word-input"),
    wordSubmit: $("word-submit"),
    wordDoneHint: $("word-done-hint"),
    submitProgress: $("submit-progress"),

    screenPlay: $("screen-play"),
    guessForm: $("guess-form"),
    guessInput: $("guess-input"),
    guessSubmit: $("guess-submit"),
    foundHint: $("found-hint"),
    pendingHint: $("pending-hint"),
    cooldownHint: $("cooldown-hint"),
    validatePanel: $("validate-panel"),
    validateList: $("validate-list"),
    myAttempts: $("my-attempts"),
    myQuestions: $("my-questions"),
    playProgress: $("play-progress"),
    turnBanner: $("turn-banner"),
    askedBtn: $("asked-btn"),
    othersGrid: $("others-grid"),
    endRoundBtn: $("end-round-btn"),
    hostRoundActions: $("host-round-actions"),

    screenEnded: $("screen-ended"),
    endTitle: $("end-title"),
    endBest: $("end-best"),
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
    Sound.onChange("whoami:phase", state.phase, "notify");
    Sound.onIncrease(
      "whoami:found",
      (state.players ?? []).filter((p) => p.found).length,
      "yes"
    );
  }

  // ---- rendering ----

  const SCREENS = [el.screenJoin, el.screenLobby, el.screenSubmit, el.screenPlay, el.screenEnded];

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
    } else if (state.phase === "submit") {
      showScreen(el.screenSubmit);
      renderSubmit(state);
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
      const canStart = connectedCount >= 2 && connectedCount <= 5;
      el.startBtn.disabled = !canStart;
      el.startHint.textContent = canStart
        ? ""
        : `Il faut entre 2 et 5 joueurs connectés (actuellement ${connectedCount}).`;
    } else {
      el.hostSettings.classList.add("hidden");
      el.waitingHost.classList.remove("hidden");
    }
  }

  function renderSubmit(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const you = state.players.find((p) => p.id === myPlayerId);
    const ready = !!you?.ready;
    el.wordForm.classList.toggle("hidden", ready);
    el.wordDoneHint.classList.toggle("hidden", !ready);

    const readyCount = state.players.filter((p) => p.connected && p.ready).length;
    const totalCount = state.players.filter((p) => p.connected).length;
    el.submitProgress.textContent = `${readyCount}/${totalCount} ont écrit leur mot`;
  }

  function characterCard(p, rank) {
    const card = document.createElement("div");
    card.className = "whoami-card";
    if (p.found) card.classList.add("found");

    if (rank) {
      const badge = document.createElement("div");
      badge.className = "whoami-rank";
      badge.textContent = `#${rank}`;
      card.appendChild(badge);
    }

    if (p.wordImage) {
      const img = document.createElement("img");
      img.className = "whoami-image";
      img.src = p.wordImage;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      card.appendChild(img);
    }

    const name = document.createElement("div");
    name.className = "whoami-owner";
    name.textContent = p.name + (p.id === myPlayerId ? " (toi)" : "");
    card.appendChild(name);

    const word = document.createElement("div");
    word.className = "whoami-character";
    word.textContent = p.word ?? "?";
    card.appendChild(word);

    if (p.found) {
      const badge = document.createElement("div");
      badge.className = "whoami-found-badge";
      badge.textContent = "Trouvé ✓";
      card.appendChild(badge);
    }

    if (p.pendingGuess) {
      const pending = document.createElement("div");
      pending.className = "whoami-pending";
      pending.textContent = `propose "${p.pendingGuess}"...`;
      card.appendChild(pending);
    }

    if (typeof p.questionsAsked === "number") {
      const q = document.createElement("div");
      q.className = "whoami-questions muted small";
      q.textContent = `${p.questionsAsked} question${p.questionsAsked > 1 ? "s" : ""} posée${p.questionsAsked > 1 ? "s" : ""}`;
      card.appendChild(q);
    }

    if (p.guesses && p.guesses.length > 0) {
      card.appendChild(attemptsList(p.guesses, p.found));
    }

    return card;
  }

  function attemptsList(guesses, found) {
    const wrap = document.createElement("div");
    wrap.className = "whoami-attempts";
    guesses.forEach((text, index) => {
      const chip = document.createElement("span");
      chip.className = "whoami-attempt-chip";
      if (found && index === guesses.length - 1) chip.classList.add("correct");
      chip.textContent = text;
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function validateRow(p) {
    const row = document.createElement("div");
    row.className = "whoami-validate";

    const text = document.createElement("div");
    text.className = "whoami-validate-text";
    const who = document.createElement("span");
    who.className = "muted small";
    who.textContent = `${p.name} propose · son mot : ${p.word ?? "?"}`;
    const guess = document.createElement("strong");
    guess.textContent = p.pendingGuess;
    text.appendChild(who);
    text.appendChild(guess);
    row.appendChild(text);

    const yes = document.createElement("button");
    yes.className = "btn small";
    yes.textContent = "C'est ça ✓";
    yes.addEventListener("click", () => send({ type: "validateGuess", playerId: p.id, correct: true }));
    const no = document.createElement("button");
    no.className = "btn secondary small";
    no.textContent = "Raté ✗";
    no.addEventListener("click", () => send({ type: "validateGuess", playerId: p.id, correct: false }));
    row.appendChild(yes);
    row.appendChild(no);

    return row;
  }

  function renderPlay(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const you = state.players.find((p) => p.id === myPlayerId);
    const isHost = state.hostId === myPlayerId;
    const myTurn = state.turnId === myPlayerId;

    const pending = you?.pendingGuess ?? null;
    const cooldown = Math.max(0, (you?.nextGuessAt ?? 0) - (you?.questionsAsked ?? 0));
    el.guessForm.classList.toggle("hidden", !!you?.found || !!pending || cooldown > 0);
    el.pendingHint.classList.toggle("hidden", !pending);
    el.pendingHint.textContent = pending ? `"${pending}" — en attente de validation...` : "";
    el.cooldownHint.classList.toggle("hidden", !!pending || !!you?.found || cooldown === 0);
    el.cooldownHint.textContent = `Encore ${cooldown} question${cooldown > 1 ? "s" : ""} avant de pouvoir proposer un nom.`;
    el.foundHint.classList.toggle("hidden", !you?.found);
    el.myAttempts.innerHTML = "";
    if (you?.guesses?.length) el.myAttempts.appendChild(attemptsList(you.guesses, you.found));
    el.myQuestions.textContent = `Questions posées : ${you?.questionsAsked ?? 0}`;

    el.turnBanner.textContent = !state.turnId
      ? ""
      : myTurn
        ? "À toi de poser une question"
        : `Au tour de ${state.turnName ?? "..."}`;
    el.turnBanner.classList.toggle("my-turn", myTurn);
    el.askedBtn.classList.toggle("hidden", !myTurn);

    // The host rules on every proposal, except their own — anyone else settles
    // that one, so the host is never told whether their own word is right.
    const toValidate = state.players.filter(
      (p) =>
        p.pendingGuess &&
        p.id !== myPlayerId &&
        (isHost || p.id === state.hostId)
    );
    el.validatePanel.classList.toggle("hidden", toValidate.length === 0);
    el.validateList.innerHTML = "";
    for (const p of toValidate) el.validateList.appendChild(validateRow(p));

    el.hostRoundActions.classList.toggle("hidden", !isHost);

    el.othersGrid.innerHTML = "";
    for (const p of state.players) {
      if (p.id === myPlayerId) continue;
      el.othersGrid.appendChild(characterCard(p));
    }

    const foundCount = state.players.filter((p) => p.connected && p.found).length;
    const totalCount = state.players.filter((p) => p.connected).length;
    el.playProgress.textContent = `${foundCount}/${totalCount} ont trouvé leur mot`;
  }

  function renderEnded(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    const foundCount = state.players.filter((p) => p.found).length;
    const total = state.players.length;
    const you = state.players.find((p) => p.id === myPlayerId);
    el.endTitle.textContent = you?.found
      ? `Manche terminée — tu as trouvé ! (${foundCount}/${total}) 🎉`
      : `Manche terminée (${foundCount}/${total} ont trouvé)`;

    // Ranked by total cost — questions asked plus names proposed — among
    // those who found their word, so a lucky first guess after ten questions
    // doesn't beat someone who got there on two.
    const cost = (p) => (p.guesses?.length ?? 0) + (p.questionsAsked ?? 0);
    const ranked = state.players.slice().sort((a, b) => {
      if (a.found !== b.found) return a.found ? -1 : 1;
      return cost(a) - cost(b);
    });
    const best = ranked.find((p) => p.found);
    el.endBest.classList.toggle("hidden", !best);
    if (best) {
      const tries = best.guesses.length;
      const questions = best.questionsAsked ?? 0;
      el.endBest.textContent = `🏆 ${best.name}${best.id === myPlayerId ? " (toi)" : ""} a trouvé avec ${questions} question${questions > 1 ? "s" : ""} et ${tries} proposition${tries > 1 ? "s" : ""} (score ${cost(best)}) !`;
    }

    el.revealGrid.innerHTML = "";
    ranked.forEach((p, index) => el.revealGrid.appendChild(characterCard(p, p.found ? index + 1 : null)));

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

  el.wordSubmit.addEventListener("click", submitWord);
  el.wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWord();
  });
  function submitWord() {
    const text = el.wordInput.value.trim();
    if (!text) return;
    send({ type: "submitWord", text });
  }

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

  el.askedBtn.addEventListener("click", () => send({ type: "askedQuestion" }));
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
