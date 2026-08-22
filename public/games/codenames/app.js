(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    statusLine: $("status-line"),
    roster: $("roster"),
    countersLine: $("counters-line"),
    gameLive: $("game-live"),
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
    endBanner: $("end-banner"),
    endIcon: $("end-icon"),
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
    const ended = state.phase === "ended";
    el.gameLive.classList.toggle("hidden", ended);
    renderStatus(state);
    renderRoster(state);
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
    const ended = state.phase === "ended";
    el.countersLine.innerHTML = "";
    if (state.mode === "duet") {
      if (ended) {
        el.statusLine.textContent = "Partie terminée.";
      } else {
        const giver = state.players.find((p) => p.seat === state.duetTurnSeat);
        el.statusLine.textContent = state.currentClue
          ? `${nameOf(state, giver?.id)} a donné un indice, à l'autre de deviner.`
          : `Au tour de ${nameOf(state, giver?.id)} de donner un indice.`;
      }
      el.countersLine.appendChild(counterChip(`❤️ ${state.duetErrors}/${state.duetErrorsMax} erreurs restantes`));
      el.countersLine.appendChild(counterChip(`🎯 ${state.duetAgentsFound}/${state.duetAgentsTotal} agents trouvés`));
    } else if (state.mode === "teams") {
      if (ended) {
        el.statusLine.textContent = "Partie terminée.";
      } else {
        const spymaster = state.players.find((p) => p.team === state.turnTeam && p.role === "spymaster");
        const teamLabel = state.turnTeam === "A" ? "Équipe A" : "Équipe B";
        el.statusLine.textContent = state.currentClue
          ? `${teamLabel} devine (indice de ${nameOf(state, spymaster?.id)}).`
          : `${teamLabel} au tour : ${nameOf(state, spymaster?.id)} donne un indice.`;
      }
      el.countersLine.appendChild(counterChip(`🟢 Équipe A : ${state.remainingA} restants`));
      el.countersLine.appendChild(counterChip(`🔵 Équipe B : ${state.remainingB} restants`));
    }
  }

  function crown() {
    const span = document.createElement("span");
    span.className = "roster-crown";
    span.textContent = "🏆";
    return span;
  }

  // Qui joue avec qui, toujours visible (y compris à la fin) : la question
  // qu'on se pose le plus souvent en pleine manche.
  function renderRoster(state) {
    el.roster.innerHTML = "";
    const ended = state.phase === "ended";
    const you = state.you;

    if (state.mode === "duet") {
      for (const p of state.players) {
        const isYou = p.id === Room.playerId;
        const chip = document.createElement("span");
        chip.className = `roster-chip seat-${p.seat ?? ""}${isYou ? " you" : " mate"}`;
        chip.textContent = `${p.name}${isYou ? " (toi)" : " 🤝"} · Siège ${p.seat ?? "?"}`;
        if (ended && isWin(state)) chip.appendChild(crown());
        el.roster.appendChild(chip);
      }
    } else if (state.mode === "teams") {
      for (const p of state.players) {
        const isYou = p.id === Room.playerId;
        const isMate = !!you && !!p.team && p.team === you.team && !isYou;
        const chip = document.createElement("span");
        chip.className = `roster-chip team-${p.team ?? ""}${isYou ? " you" : ""}${isMate ? " mate" : ""}`;
        const roleLabel = p.role === "spymaster" ? "Chiffreur" : p.role === "operative" ? "Agent" : "";
        const teamLabel = p.team ? `Équipe ${p.team}` : "";
        chip.textContent = `${p.name}${isYou ? " (toi)" : isMate ? " 🤝" : ""} · ${[teamLabel, roleLabel].filter(Boolean).join(" ")}`;
        if (ended && state.winner === p.team) chip.appendChild(crown());
        el.roster.appendChild(chip);
      }
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

  function buildRecapColumn(label, words, colors) {
    const wrap = document.createElement("div");
    const head = document.createElement("p");
    head.className = "muted small";
    head.textContent = label;
    wrap.appendChild(head);
    wrap.appendChild(buildRecapGrid(words, colors));
    return wrap;
  }

  const DUET_TITLES = {
    "coop-win": "Victoire coopérative !",
    "coop-lose-errors": "Défaite : plus d'erreurs possibles",
    "coop-lose-assassin": "Défaite : l'assassin a été touché",
  };
  const DUET_ICONS = {
    "coop-win": "🎉",
    "coop-lose-errors": "😞",
    "coop-lose-assassin": "💀",
  };

  function renderEnd(state) {
    const active = state.phase === "ended";
    el.endPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const won = isWin(state);
    el.endBanner.classList.remove("win", "lose");
    el.endBanner.classList.add(won ? "win" : "lose");

    if (state.mode === "duet") {
      el.endIcon.textContent = DUET_ICONS[state.winner] || "🏁";
      el.endTitle.textContent = DUET_TITLES[state.winner] || "Partie terminée";
      el.endSummary.textContent = `${state.duetAgentsFound}/${state.duetAgentsTotal} agents trouvés.`;
    } else {
      el.endIcon.textContent = won ? "🏆" : "😞";
      el.endTitle.textContent = state.winner
        ? `${won ? "Vous avez gagné" : "Vous avez perdu"} — Équipe ${state.winner} gagne`
        : "Partie terminée";
      el.endSummary.textContent = `Équipe A : ${state.remainingA} restants · Équipe B : ${state.remainingB} restants.`;
    }

    el.endRecap.innerHTML = "";
    el.endRecap.classList.toggle("end-recap-duet", state.mode === "duet");
    const words = (state.board ?? []).map((c) => c.word);
    if (state.mode === "teams") {
      el.endRecap.appendChild(buildRecapGrid(words, (state.board ?? []).map((c) => c.color)));
    } else if (state.mode === "duet") {
      el.endRecap.appendChild(buildRecapColumn("Clé A", words, state.endKeyA ?? []));
      el.endRecap.appendChild(buildRecapColumn("Clé B", words, state.endKeyB ?? []));
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
