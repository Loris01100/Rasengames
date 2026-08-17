(() => {
  const $ = (id) => document.getElementById(id);

  // Kept in sync with src/games/bac/categories.ts.
  const CATEGORIES = [
    { id: "anime", label: "Anime / Manga" },
    { id: "hero", label: "Personnage principal" },
    { id: "sidekick", label: "Personnage secondaire" },
    { id: "villain", label: "Antagoniste" },
    { id: "technique", label: "Technique / Pouvoir" },
    { id: "item", label: "Objet / Arme" },
    { id: "place", label: "Lieu / Monde" },
    { id: "guild", label: "Guilde / Clan / Équipe" },
    { id: "creature", label: "Animal / Créature" },
    { id: "studio", label: "Studio d'animation" },
  ];
  const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

  const OTHER_GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "whoami", label: "Qui suis-je" },
    { slug: "detective", label: "Détective Anime" },
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
    categoryCheckboxes: $("category-checkboxes"),
    startBtn: $("start-btn"),
    startHint: $("start-hint"),
    waitingHost: $("waiting-host"),

    screenPlay: $("screen-play"),
    playLetter: $("play-letter"),
    stopBtn: $("stop-btn"),
    answersForm: $("answers-form"),

    screenReview: $("screen-review"),
    reviewTitle: $("review-title"),
    reviewStoppedBy: $("review-stopped-by"),
    reviewHint: $("review-hint"),
    reviewTable: $("review-table"),
    finishReviewBtn: $("finish-review-btn"),
    reviewWaitHint: $("review-wait-hint"),

    screenEnded: $("screen-ended"),
    endTitle: $("end-title"),
    endStoppedBy: $("end-stopped-by"),
    resultsTable: $("results-table"),
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
    return `${proto}://${location.host}/ws/bac/${code}`;
  }

  function storageKey(code, suffix) {
    return `bac:${code}:${suffix}`;
  }

  // Kept in sync with src/games/bac/logic.ts's normalizeWord/isValidAnswer —
  // used only as a soft "looks valid" hint in the review table, the host
  // always makes the actual call.
  const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");
  function normalizeWord(word) {
    return (word || "").trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
  }
  function looksValid(answer, letter) {
    const n = normalizeWord(answer);
    return !!n && n[0] === normalizeWord(letter);
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
      localStorage.setItem("bac:lastName", el.nameInput.value.trim() || "Joueur");
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
    } else if (msg.type === "error") {
      showToast(msg.message);
    }
  }

  // ---- sons ----

  // Sound.onChange ignore le premier state reçu, donc rien ne sonne au
  // chargement ni à la reconnexion. Le changement de phase couvre l'essentiel :
  // quelqu'un a crié stop, ou la manche est finie.
  function playSounds(state) {
    Sound.onChange("bac:phase", state.phase, "notify");
  }

  // ---- rendering ----

  const SCREENS = [el.screenJoin, el.screenLobby, el.screenPlay, el.screenReview, el.screenEnded];

  function showScreen(screen) {
    for (const s of SCREENS) s.classList.toggle("hidden", s !== screen);
  }

  function populateCategoryCheckboxes() {
    el.categoryCheckboxes.innerHTML = "";
    for (const cat of CATEGORIES) {
      const label = document.createElement("label");
      label.className = "category-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = cat.id;
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(cat.label));
      el.categoryCheckboxes.appendChild(label);
    }
  }
  populateCategoryCheckboxes();

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
    } else if (state.phase === "review") {
      showScreen(el.screenReview);
      renderReview(state);
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

  // Rebuilt only when a new round's letter shows up, so unrelated re-renders
  // (another player disconnecting, etc.) don't wipe out what you're typing.
  let answersFormLetter = null;
  const answerDebounce = {};

  function renderPlay(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    el.playLetter.textContent = state.letter;

    if (answersFormLetter === state.letter) return;
    answersFormLetter = state.letter;

    el.answersForm.innerHTML = "";
    for (const catId of state.categories) {
      const row = document.createElement("div");
      row.className = "answer-row";

      const label = document.createElement("label");
      label.textContent = CATEGORY_LABELS[catId] ?? catId;
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 40;
      input.autocomplete = "off";
      input.value = state.you?.answers?.[catId] ?? "";
      input.placeholder = `Commence par ${state.letter}...`;
      input.addEventListener("input", () => {
        clearTimeout(answerDebounce[catId]);
        answerDebounce[catId] = setTimeout(() => {
          send({ type: "answer", category: catId, text: input.value });
        }, 250);
      });
      row.appendChild(input);

      el.answersForm.appendChild(row);
    }
  }

  function renderReview(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    answersFormLetter = null;

    el.reviewTitle.textContent = `Stop ! Lettre ${state.result?.letter ?? ""}`;
    el.reviewStoppedBy.textContent = state.stoppedByName
      ? `${state.stoppedByName} a crié stop en premier.`
      : "";

    const isHost = state.hostId === myPlayerId;
    el.reviewHint.textContent = isHost
      ? "Clique sur une réponse pour la valider ou l'invalider. Rien n'est validé par défaut."
      : "L'hôte valide les réponses une par une...";

    renderResultsTable(state, el.reviewTable, isHost);

    el.finishReviewBtn.classList.toggle("hidden", !isHost);
    el.reviewWaitHint.classList.toggle("hidden", isHost);
  }

  function renderEnded(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    answersFormLetter = null;

    el.endTitle.textContent = `Résultats — Lettre ${state.result?.letter ?? ""}`;
    el.endStoppedBy.textContent = state.stoppedByName
      ? `${state.stoppedByName} a crié stop en premier.`
      : "";

    renderResultsTable(state, el.resultsTable, false);

    const isHost = state.hostId === myPlayerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  function renderResultsTable(state, tableEl, editable) {
    const result = state.result;
    tableEl.innerHTML = "";
    if (!result) return;

    const players = state.players.filter((p) => result.totals[p.id] !== undefined);

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    for (const p of players) {
      const th = document.createElement("th");
      th.textContent = p.name + (p.id === myPlayerId ? " (toi)" : "");
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const catResult of result.byCategory) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.className = "category-name";
      th.textContent = CATEGORY_LABELS[catResult.category] ?? catResult.category;
      tr.appendChild(th);

      for (const p of players) {
        const entry = catResult.entries.find((e) => e.playerId === p.id);
        const td = document.createElement("td");
        if (entry) {
          td.classList.add(entry.valid ? (entry.points === 2 ? "score-unique" : "score-duplicate") : "score-invalid");
          if (editable) {
            td.classList.add("editable");
            if (!entry.valid && looksValid(entry.answer, result.letter)) td.classList.add("hint-valid");
            td.addEventListener("click", () => {
              send({ type: "setValid", category: catResult.category, playerId: p.id, valid: !entry.valid });
            });
          }
          const answer = document.createElement("div");
          answer.className = "answer-text";
          answer.textContent = entry.answer.trim() || "—";
          td.appendChild(answer);
          const points = document.createElement("div");
          points.className = "answer-points";
          points.textContent = entry.valid
            ? `${entry.points} pt${entry.points > 1 ? "s" : ""}`
            : editable
              ? "à valider"
              : "invalide";
          td.appendChild(points);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);

    const maxTotal = Math.max(0, ...players.map((p) => result.totals[p.id] ?? 0));
    const tfoot = document.createElement("tfoot");
    const totalRow = document.createElement("tr");
    const totalTh = document.createElement("th");
    totalTh.textContent = "Total";
    totalRow.appendChild(totalTh);
    for (const p of players) {
      const td = document.createElement("td");
      td.className = "total-cell";
      const total = result.totals[p.id] ?? 0;
      td.textContent = total + (total === maxTotal && maxTotal > 0 ? " 🏆" : "");
      totalRow.appendChild(td);
    }
    tfoot.appendChild(totalRow);
    tableEl.appendChild(tfoot);
  }

  // ---- events ----

  el.createBtn.addEventListener("click", async () => {
    const name = el.nameInput.value.trim();
    if (!name) return showToast("Entre un pseudo d'abord.");
    el.createBtn.disabled = true;
    try {
      const res = await fetch("/api/bac/create", { method: "POST" });
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

  el.startBtn.addEventListener("click", () => {
    const categories = Array.from(el.categoryCheckboxes.querySelectorAll("input:checked")).map(
      (input) => input.value
    );
    if (categories.length === 0) return showToast("Choisis au moins une catégorie.");
    send({ type: "start", categories });
  });

  el.stopBtn.addEventListener("click", () => send({ type: "stop" }));
  el.finishReviewBtn.addEventListener("click", () => send({ type: "finishReview" }));
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
    const lastName = localStorage.getItem("bac:lastName");
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
