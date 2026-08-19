(() => {
  const $ = (id) => document.getElementById(id);

  // Kept in sync with src/games/hundred/themes.ts — duplicated client-side so
  // the host can preview the full list in a dropdown instead of typing blind.
  const THEMES_BY_MODE = {
    perso: [
      "Puissance",
      "Intelligence",
      "Popularité",
      "Charisme",
      "Drôle",
      "Loyauté",
      "Détermination",
      "Vitesse",
      "Instinct de sacrifice",
      "Ambition",
      "Cringe",
      "Talent pour les punchlines",
      "Style vestimentaire",
      "Capacité à mourir bêtement",
      "Histoire triste",
      "Capacité à retourner sa veste",
      "Bodycount",
      "Beauté (homme)",
      "Beauté (femme)",
      "Flow",
      "Aura",
      "Énergie de pnj",
      "Probabilité de finir célib",
      "Leader",
      "Meilleur colocataire",
      "Meilleur prof",
      "Développement de personnage",
      "Transformation",
    ],
    anime: [
      "Personnages",
      "Personnage principal",
      "OST",
      "Openings",
      "Anime",
      "Animation",
      "Combats",
      "Antagonistes",
      "Qualité de la fin",
      "Popularité",
      "Les émotions (ça fait pleurer)",
      "Quantité de fanservice",
      "Qualité du rythme",
      "Sous-coté",
      "Sur-coté",
      "Worldbuilding",
      "Chara-design",
      "Présence r34",
    ],
  };

  // Formulations propres à chaque variante. Le serveur renvoie `mode` dans
  // chaque state, donc tout le monde voit les mêmes mots, pas seulement l'hôte.
  const WORDING = {
    perso: {
      indefinite: "un personnage",
      placeholder: "Un personnage qui correspond à ton chiffre",
    },
    anime: {
      indefinite: "un anime",
      placeholder: "Un anime qui correspond à ton chiffre",
    },
  };

  const wordingFor = (mode) => WORDING[mode] ?? WORDING.perso;

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
    modeSelect: $("mode-select"),
    themeSelect: $("theme-select"),
    startBtn: $("start-btn"),
    startHint: $("start-hint"),
    waitingHost: $("waiting-host"),

    screenPropose: $("screen-propose"),
    proposeTheme: $("propose-theme"),
    myNumber: $("my-number"),
    proposeForm: $("propose-form"),
    proposalInput: $("proposal-input"),
    proposalSubmit: $("proposal-submit"),
    proposalDoneHint: $("proposal-done-hint"),
    proposeProgress: $("propose-progress"),
    proposalsSecretHint: $("proposals-secret-hint"),
    proposalsList: $("proposals-list"),

    screenArrange: $("screen-arrange"),
    arrangeTheme: $("arrange-theme"),
    arrangeInstructions: $("arrange-instructions"),
    line: $("line"),
    revealBtn: $("reveal-btn"),
    revealHint: $("reveal-hint"),

    screenReveal: $("screen-reveal"),
    revealTheme: $("reveal-theme"),
    lineReveal: $("line-reveal"),
    revealNextBtn: $("reveal-next-btn"),
    revealNextHint: $("reveal-next-hint"),
    revealProgress: $("reveal-progress"),

    screenEnded: $("screen-ended"),
    endTitle: $("end-title"),
    endScore: $("end-score"),
    lineFinal: $("line-final"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  let ws = null;
  let myPlayerId = null;
  let roomCode = null;
  let reconnectTimer = null;
  let latestState = null;
  let toastTimer = null;
  let dragState = null; // { playerId, cardEl } while the local user is dragging a card

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 4000);
  }

  function wsUrl(code) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws/hundred/${code}`;
  }

  function storageKey(code, suffix) {
    return `hundred:${code}:${suffix}`;
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
      localStorage.setItem("hundred:lastName", el.nameInput.value.trim() || "Joueur");
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
    Sound.onChange("h:phase", state.phase, "notify");
    Sound.onIncrease("h:proposals", state.proposalsSubmitted ?? 0, "tick");
    Sound.onIncrease("h:revealed", state.revealedCount ?? 0, "notify");
  }

  // ---- rendering ----

  const SCREENS = [
    el.screenJoin,
    el.screenLobby,
    el.screenPropose,
    el.screenArrange,
    el.screenReveal,
    el.screenEnded,
  ];

  function showScreen(screen) {
    for (const s of SCREENS) s.classList.toggle("hidden", s !== screen);
  }

  function populateThemeSelect() {
    el.themeSelect.innerHTML = "";
    const randomOpt = document.createElement("option");
    randomOpt.value = "";
    randomOpt.textContent = "🎲 Thème aléatoire";
    el.themeSelect.appendChild(randomOpt);
    for (const theme of THEMES_BY_MODE[el.modeSelect.value] ?? []) {
      const opt = document.createElement("option");
      opt.value = theme;
      opt.textContent = theme;
      el.themeSelect.appendChild(opt);
    }
  }
  populateThemeSelect();
  // Les deux variantes n'ont pas les mêmes thèmes : changer de variante
  // repeuple la liste (et retombe sur "aléatoire", le thème choisi n'existant
  // pas forcément dans l'autre).
  el.modeSelect.addEventListener("change", populateThemeSelect);

  // Other games the group can switch to without disbanding — see the
  // "switchGame" message handling below.
  const OTHER_GAMES = [
    { slug: "undercover", label: "Undercover" },
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

  function render(state) {
    el.switchGame.classList.toggle("hidden", state.hostId !== myPlayerId);

    if (state.phase === "lobby") {
      showScreen(el.screenLobby);
      renderLobby(state);
    } else if (state.phase === "propose") {
      showScreen(el.screenPropose);
      renderPropose(state);
    } else if (state.phase === "arrange") {
      showScreen(el.screenArrange);
      renderArrange(state);
    } else if (state.phase === "reveal") {
      showScreen(el.screenReveal);
      renderReveal(state);
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

  function renderPropose(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    el.proposeTheme.textContent = state.theme;
    el.myNumber.textContent = state.you?.number ?? "—";

    const alreadyProposed = !!state.you?.proposal;
    el.proposeForm.classList.toggle("hidden", alreadyProposed);
    el.proposalDoneHint.classList.toggle("hidden", !alreadyProposed);
    const wording = wordingFor(state.mode);
    el.proposalInput.placeholder = wording.placeholder;
    el.proposalsSecretHint.textContent = `Les propositions des autres restent secrètes jusqu'à ce que tout le monde ait proposé ${wording.indefinite}.`;
    el.proposeProgress.textContent = `${state.proposalsSubmitted}/${state.proposalsNeeded} ont proposé ${wording.indefinite}`;

    el.proposalsList.innerHTML = "";
    for (const p of state.players) {
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

      const status = document.createElement("span");
      status.className = "tag";
      status.textContent =
        p.id === myPlayerId
          ? p.proposal ?? "réfléchit..."
          : p.hasProposed
            ? "✓ prêt"
            : "réfléchit...";
      row.appendChild(status);

      el.proposalsList.appendChild(row);
    }
  }

  function makeCard(state, playerId) {
    const p = state.players.find((pl) => pl.id === playerId);
    const card = document.createElement("div");
    card.className = "card-token";
    card.dataset.playerId = playerId;
    if (playerId === myPlayerId) card.classList.add("you");

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = p ? p.name + (playerId === myPlayerId ? " (toi)" : "") : "?";
    card.appendChild(name);

    if (p?.proposalImage) {
      const img = document.createElement("img");
      img.className = "card-image";
      img.src = p.proposalImage;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      card.appendChild(img);
    }

    const proposal = document.createElement("div");
    proposal.className = "card-proposal";
    proposal.textContent = p?.proposal ?? "?";
    card.appendChild(proposal);

    if (p && p.number !== undefined && p.number !== null) {
      const number = document.createElement("div");
      number.className = "card-number";
      number.textContent = p.number;
      card.appendChild(number);
    }

    return card;
  }

  // A single pair of document-level listeners drives whichever card is being
  // dragged. Per-card listeners here would be more natural, but pointer
  // capture doesn't reliably scope pointermove/pointerup to one element
  // while the dragged card is being reinserted elsewhere in the DOM, which
  // let other cards' handlers react to the same event and fight over it.
  let dragLastSentIndex = null;

  function onLineDragMove(e) {
    if (!dragState) return;
    const cardEl = dragState.cardEl;
    const siblings = Array.from(el.line.children).filter((c) => c !== cardEl);
    let insertBefore = null;
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (e.clientX < rect.left + rect.width / 2) {
        insertBefore = sib;
        break;
      }
    }
    if (insertBefore) el.line.insertBefore(cardEl, insertBefore);
    else el.line.appendChild(cardEl);

    const newIndex = Array.from(el.line.children).indexOf(cardEl);
    if (newIndex !== dragLastSentIndex) {
      dragLastSentIndex = newIndex;
      send({ type: "move", playerId: dragState.playerId, toIndex: newIndex });
    }
  }

  function endLineDrag() {
    if (!dragState) return;
    dragState.cardEl.classList.remove("dragging");
    dragState = null;
    dragLastSentIndex = null;
  }

  document.addEventListener("pointermove", onLineDragMove);
  document.addEventListener("pointerup", endLineDrag);
  document.addEventListener("pointercancel", endLineDrag);

  function attachDrag(card, playerId) {
    card.classList.add("grabbable");
    card.addEventListener("pointerdown", (e) => {
      if (!latestState || latestState.phase !== "arrange") return;
      if (latestState.hostId !== myPlayerId) return;
      e.preventDefault();
      card.classList.add("dragging");
      dragState = { playerId, cardEl: card };
      dragLastSentIndex = Array.from(el.line.children).indexOf(card);
    });
  }

  function renderArrange(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    el.arrangeTheme.textContent = state.theme;

    const isHost = state.hostId === myPlayerId;
    el.arrangeInstructions.textContent = isHost
      ? "Les chiffres sont cachés jusqu'à la révélation. Débattez, puis glisse les cartes pour les ranger du plus petit (gauche) au plus grand (droite)."
      : "Les chiffres sont cachés jusqu'à la révélation. Débattez pour trouver le bon ordre — seul l'hôte peut déplacer les cartes.";
    el.revealBtn.classList.toggle("hidden", !isHost);
    el.revealHint.classList.toggle("hidden", isHost);

    if (dragState) return; // avoid yanking the DOM out from under an active drag

    el.line.innerHTML = "";
    for (const playerId of state.order) {
      const card = makeCard(state, playerId);
      if (isHost) attachDrag(card, playerId);
      el.line.appendChild(card);
    }
  }

  function renderReveal(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");
    el.revealTheme.textContent = state.theme;

    el.lineReveal.innerHTML = "";
    const cards = state.order.map((playerId) => makeCard(state, playerId));
    for (const card of cards) el.lineReveal.appendChild(card);

    for (let i = 1; i < state.revealedCount; i++) {
      const prev = state.players.find((p) => p.id === state.order[i - 1]);
      const cur = state.players.find((p) => p.id === state.order[i]);
      if (prev?.number != null && cur?.number != null) {
        cards[i].classList.add(prev.number < cur.number ? "correct" : "incorrect");
      }
    }

    el.revealProgress.textContent = `${state.revealedCount}/${state.order.length} cartes révélées`;

    const isHost = state.hostId === myPlayerId;
    const allRevealed = state.revealedCount >= state.order.length;
    el.revealNextBtn.classList.toggle("hidden", !isHost || allRevealed);
    el.revealNextHint.classList.toggle("hidden", isHost || allRevealed);
  }

  function renderEnded(state) {
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.endTitle.textContent = state.score?.sortedFully ? "Ordre parfait ! 🎉" : "Résultat";
    el.endScore.textContent = state.score
      ? `${state.score.correctPairs}/${state.score.total} paires dans le bon ordre.`
      : "";

    el.lineFinal.innerHTML = "";
    for (const playerId of state.order) {
      el.lineFinal.appendChild(makeCard(state, playerId));
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
      const res = await fetch("/api/hundred/create", { method: "POST" });
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

  el.startBtn.addEventListener("click", () => {
    send({ type: "start", mode: el.modeSelect.value, theme: el.themeSelect.value });
  });

  el.proposalSubmit.addEventListener("click", submitProposal);
  el.proposalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitProposal();
  });
  function submitProposal() {
    const text = el.proposalInput.value.trim();
    if (!text) return;
    send({ type: "propose", text });
  }

  el.revealBtn.addEventListener("click", () => send({ type: "reveal" }));
  el.revealNextBtn.addEventListener("click", () => send({ type: "revealNext" }));
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
    const lastName = localStorage.getItem("hundred:lastName");
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
