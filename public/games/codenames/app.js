(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    statusLine: $("status-line"),
    countersLine: $("counters-line"),
    clueDisplay: $("clue-display"),
    clueText: $("clue-text"),
    clueForm: $("clue-form"),
    clueInput: $("clue-input"),
    clueNumber: $("clue-number"),
    clueSubmit: $("clue-submit"),
    passBtn: $("pass-btn"),
    turnHint: $("turn-hint"),
    keyToggle: $("key-toggle"),
    boardGrid: $("board-grid"),
    endPanel: $("end-panel"),
    endTitle: $("end-title"),
    endSummary: $("end-summary"),
    endRecap: $("end-recap"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  // N'affecte que les cases pas encore révélées : celles-ci restent la seule
  // info vraiment privée (les cases révélées sont publiques pour tout le monde).
  let keyHidden = false;

  function nameOf(state, id) {
    return state.players.find((p) => p.id === id)?.name ?? "?";
  }

  function isMyClueTurn(state) {
    if (state.phase !== "playing" || state.currentClue || !state.you) return false;
    if (state.mode === "duet") return state.you.seat === state.duetTurnSeat;
    if (state.mode === "teams") return state.you.role === "spymaster" && state.you.team === state.turnTeam;
    return false;
  }

  function isMyGuessTurn(state) {
    if (state.phase !== "playing" || !state.currentClue || !state.you) return false;
    if (state.mode === "duet") {
      const guesserSeat = state.duetTurnSeat === "A" ? "B" : "A";
      return state.you.seat === guesserSeat;
    }
    if (state.mode === "teams") return state.you.role === "operative" && state.you.team === state.turnTeam;
    return false;
  }

  function isWin(state) {
    if (state.mode === "duet") return state.winner === "coop-win";
    return !!state.you && state.you.team === state.winner;
  }

  // ---- sons ----

  function playSounds(state) {
    const myTurn = isMyClueTurn(state) || isMyGuessTurn(state);
    Sound.onChange("cn:turn", `${state.duetTurnSeat}:${state.turnTeam}:${!!state.currentClue}`, myTurn ? "turn" : null);
    Sound.onChange("cn:winner", state.winner, state.winner ? (isWin(state) ? "win" : "lose") : null);
  }

  // ---- rendering ----

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      Room.renderLobby(state);
      return;
    }

    Room.showScreen("screen-game");
    renderStatus(state);
    renderClue(state);
    renderBoard(state);
    renderEnd(state);
  }

  function counterChip(text) {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = text;
    return span;
  }

  function renderStatus(state) {
    el.countersLine.innerHTML = "";
    if (state.mode === "duet") {
      const giver = state.players.find((p) => p.seat === state.duetTurnSeat);
      el.statusLine.textContent = state.currentClue
        ? `${nameOf(state, giver?.id)} a donné un indice, à l'autre de deviner.`
        : `Au tour de ${nameOf(state, giver?.id)} de donner un indice.`;
      el.countersLine.appendChild(counterChip(`❤️ ${state.duetErrors}/${state.duetErrorsMax} erreurs restantes`));
      el.countersLine.appendChild(counterChip(`🎯 ${state.duetAgentsFound}/${state.duetAgentsTotal} agents trouvés`));
    } else if (state.mode === "teams") {
      const spymaster = state.players.find((p) => p.team === state.turnTeam && p.role === "spymaster");
      const teamLabel = state.turnTeam === "A" ? "Équipe A" : "Équipe B";
      el.statusLine.textContent = state.currentClue
        ? `${teamLabel} devine (indice de ${nameOf(state, spymaster?.id)}).`
        : `${teamLabel} au tour : ${nameOf(state, spymaster?.id)} donne un indice.`;
      el.countersLine.appendChild(counterChip(`🟢 Équipe A : ${state.remainingA} restants`));
      el.countersLine.appendChild(counterChip(`🔵 Équipe B : ${state.remainingB} restants`));
    }
  }

  function renderClue(state) {
    const active = state.phase === "playing";
    el.clueDisplay.classList.toggle("hidden", !(active && state.currentClue));
    if (state.currentClue) {
      const n = state.currentClue.guessesLeft;
      el.clueText.textContent = `${state.currentClue.word} — ${state.currentClue.number} (${n} pioche${n > 1 ? "s" : ""} restante${n > 1 ? "s" : ""})`;
    }

    const myClueTurn = isMyClueTurn(state);
    el.clueForm.classList.toggle("hidden", !myClueTurn);

    const myGuessTurn = isMyGuessTurn(state);
    el.passBtn.classList.toggle("hidden", !myGuessTurn);

    if (!active) {
      el.turnHint.textContent = "";
    } else if (myClueTurn) {
      el.turnHint.textContent = "À toi de donner un indice.";
    } else if (myGuessTurn) {
      el.turnHint.textContent = "Devine, ou passe si tu n'es pas sûr.";
    } else if (!state.currentClue) {
      el.turnHint.textContent = "En attente d'un indice...";
    } else {
      el.turnHint.textContent = "En attente que l'autre devine...";
    }

    const seesKey =
      state.mode === "duet"
        ? !!state.you && (state.you.seat === "A" || state.you.seat === "B")
        : !!state.you && state.you.role === "spymaster";
    el.keyToggle.classList.toggle("hidden", !(active && seesKey));
  }

  function renderBoard(state) {
    el.boardGrid.innerHTML = "";
    const myGuessTurn = isMyGuessTurn(state);
    for (const [index, cell] of (state.board ?? []).entries()) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      if (cell.revealed) tile.classList.add("revealed");
      if (cell.color && (cell.revealed || !keyHidden)) tile.classList.add(`c-${cell.color}`);
      if (cell.color && !cell.revealed) tile.classList.add("key-hint");

      const label = document.createElement("span");
      label.textContent = cell.word;
      tile.appendChild(label);

      if (myGuessTurn && !cell.revealed) {
        tile.addEventListener("click", () => Room.send({ type: "guess", index }));
      } else {
        tile.disabled = true;
      }
      el.boardGrid.appendChild(tile);
    }
  }

  function buildRecapGrid(words, colors) {
    const grid = document.createElement("div");
    grid.className = "board-grid small-grid";
    words.forEach((word, i) => {
      const tile = document.createElement("div");
      tile.className = "tile revealed recap";
      if (colors[i]) tile.classList.add(`c-${colors[i]}`);
      const label = document.createElement("span");
      label.textContent = word;
      tile.appendChild(label);
      grid.appendChild(tile);
    });
    return grid;
  }

  const DUET_TITLES = {
    "coop-win": "Victoire coopérative ! 🎉",
    "coop-lose-errors": "Défaite : plus d'erreurs possibles 😞",
    "coop-lose-assassin": "Défaite : l'assassin a été touché 💀",
  };

  function renderEnd(state) {
    const active = state.phase === "ended";
    el.endPanel.classList.toggle("hidden", !active);
    if (!active) return;

    if (state.mode === "duet") {
      el.endTitle.textContent = DUET_TITLES[state.winner] || "Partie terminée";
      el.endSummary.textContent = `${state.duetAgentsFound}/${state.duetAgentsTotal} agents trouvés.`;
    } else {
      const won = isWin(state);
      el.endTitle.textContent = state.winner
        ? `${won ? "Vous avez gagné" : "L'équipe adverse a gagné"} — Équipe ${state.winner} 🏆`
        : "Partie terminée";
      el.endSummary.textContent = `Équipe A : ${state.remainingA} restants · Équipe B : ${state.remainingB} restants.`;
    }

    el.endRecap.innerHTML = "";
    const words = (state.board ?? []).map((c) => c.word);
    if (state.mode === "teams") {
      el.endRecap.appendChild(buildRecapGrid(words, (state.board ?? []).map((c) => c.color)));
    } else if (state.mode === "duet") {
      const headA = document.createElement("p");
      headA.className = "muted small";
      headA.textContent = "Clé A";
      const headB = document.createElement("p");
      headB.className = "muted small";
      headB.textContent = "Clé B";
      el.endRecap.appendChild(headA);
      el.endRecap.appendChild(buildRecapGrid(words, state.endKeyA ?? []));
      el.endRecap.appendChild(headB);
      el.endRecap.appendChild(buildRecapGrid(words, state.endKeyB ?? []));
    }

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.clueSubmit.addEventListener("click", submitClue);
  el.clueInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitClue();
  });
  function submitClue() {
    const word = el.clueInput.value.trim();
    if (!word) return;
    const number = Math.max(1, Math.min(9, Number(el.clueNumber.value) || 1));
    Room.send({ type: "clue", word, number });
    el.clueInput.value = "";
  }

  el.passBtn.addEventListener("click", () => Room.send({ type: "pass" }));

  el.keyToggle.addEventListener("click", () => {
    keyHidden = !keyHidden;
    el.keyToggle.textContent = keyHidden ? "Afficher ma clé" : "Cacher ma clé";
    if (Room.state) renderBoard(Room.state);
  });

  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "codenames",
    minPlayers: 2,
    maxPlayers: 4,
    // Le nombre de connectés (2 ou 4) détermine seul le mode : pas de réglage
    // à envoyer, le serveur refuse (et prévient par toast) si ce n'est ni
    // l'un ni l'autre — pas besoin de le redire côté client.
    onState: (s) => {
      playSounds(s);
      render(s);
    },
  });
})();
