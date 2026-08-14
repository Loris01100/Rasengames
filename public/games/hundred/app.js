(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    toast: $("toast"),
    roomBadge: $("room-badge"),

    screenJoin: $("screen-join"),
    nameInput: $("name-input"),
    codeInput: $("code-input"),
    createBtn: $("create-btn"),
    joinBtn: $("join-btn"),

    screenLobby: $("screen-lobby"),
    lobbyCode: $("lobby-code"),
    playersList: $("players-list"),
    hostSettings: $("host-settings"),
    themeInput: $("theme-input"),
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
    proposalsList: $("proposals-list"),

    screenArrange: $("screen-arrange"),
    arrangeTheme: $("arrange-theme"),
    line: $("line"),
    revealBtn: $("reveal-btn"),
    revealHint: $("reveal-hint"),

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

  function connect(code, name, token) {
    roomCode = code.toUpperCase();
    ws = new WebSocket(wsUrl(roomCode));

    ws.addEventListener("open", () => {
      send({ type: "join", name, token: token || undefined });
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
      render(latestState);
    } else if (msg.type === "error") {
      showToast(msg.message);
    }
  }

  // ---- rendering ----

  const SCREENS = [el.screenJoin, el.screenLobby, el.screenPropose, el.screenArrange, el.screenEnded];

  function showScreen(screen) {
    for (const s of SCREENS) s.classList.toggle("hidden", s !== screen);
  }

  function render(state) {
    if (state.phase === "lobby") {
      showScreen(el.screenLobby);
      renderLobby(state);
    } else if (state.phase === "propose") {
      showScreen(el.screenPropose);
      renderPropose(state);
    } else if (state.phase === "arrange") {
      showScreen(el.screenArrange);
      renderArrange(state);
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
    el.proposeProgress.textContent = `${state.proposalsSubmitted}/${state.proposalsNeeded} ont proposé un personnage`;

    el.proposalsList.innerHTML = "";
    for (const p of state.players) {
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

      const status = document.createElement("span");
      status.className = "tag";
      status.textContent = p.proposal ? p.proposal : "réfléchit...";
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
    card.addEventListener("pointerdown", (e) => {
      if (!latestState || latestState.phase !== "arrange") return;
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
    el.revealBtn.classList.toggle("hidden", !isHost);
    el.revealHint.classList.toggle("hidden", isHost);

    if (dragState) return; // avoid yanking the DOM out from under an active drag

    el.line.innerHTML = "";
    for (const playerId of state.order) {
      const card = makeCard(state, playerId);
      attachDrag(card, playerId);
      el.line.appendChild(card);
    }
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

  el.startBtn.addEventListener("click", () => {
    send({ type: "start", theme: el.themeInput.value.trim() });
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
  el.restartBtn.addEventListener("click", () => send({ type: "restart" }));

  // ---- boot ----

  (function boot() {
    const params = new URLSearchParams(location.search);
    const codeFromUrl = params.get("room");
    const lastName = localStorage.getItem("hundred:lastName");
    if (lastName) el.nameInput.value = lastName;

    if (codeFromUrl) {
      el.codeInput.value = codeFromUrl.toUpperCase();
      const token = localStorage.getItem(storageKey(codeFromUrl.toUpperCase(), "token"));
      const savedName = localStorage.getItem(storageKey(codeFromUrl.toUpperCase(), "name"));
      if (token && savedName) {
        el.nameInput.value = savedName;
        connect(codeFromUrl, savedName, token);
      }
    }
  })();
})();
