(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    modeSelect: $("mode-select"),

    playInstructions: $("play-instructions"),
    letterDisplay: $("letter-display"),
    turnBanner: $("turn-banner"),
    passBtn: $("pass-btn"),
    passHint: $("pass-hint"),
    playersListPlay: $("players-list-play"),

    endTitle: $("end-title"),
    endRanking: $("end-ranking"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  // ---- sons ----

  // Sound.onChange ignore le premier state reçu, donc rien ne sonne au
  // chargement ni à la reconnexion.
  function playSounds(previous, state) {
    const myTurn = state.turnId === Room.playerId;
    Sound.onChange("bomb:turn", `${state.phase}:${state.turnId}`, state.phase === "play" && myTurn ? "turn" : null);

    if (previous && previous.phase === "play" && state.phase === "play") {
      const me = state.players.find((p) => p.id === Room.playerId);
      const prevMe = previous.players.find((p) => p.id === Room.playerId);
      if (me && prevMe) {
        if (!prevMe.eliminated && me.eliminated) Sound.play("lose");
        else if (me.lives < prevMe.lives) Sound.play("no");
      }
    }
    if (state.phase === "ended" && previous && previous.phase !== "ended") {
      Sound.play(state.winnerId === Room.playerId ? "win" : "lose");
    }
  }

  // ---- rendering ----

  // Coeurs pleins pour les vies restantes, coeurs noirs pour celles perdues ;
  // un mort passe en tag distinct et hérite du style ".dead" via `alive`.
  function decorateLives(row, p) {
    const tag = document.createElement("span");
    tag.className = "tag lives-tag";
    tag.textContent = p.eliminated ? "💀 Éliminé" : "❤️".repeat(p.lives) + "🖤".repeat(Math.max(0, 2 - p.lives));
    row.appendChild(tag);
  }

  function withAlive(p) {
    return { ...p, alive: !p.eliminated };
  }

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      Room.renderLobby(state, decorateLives);
    } else if (state.phase === "play") {
      Room.showScreen("screen-play");
      renderPlay(state);
    } else if (state.phase === "ended") {
      Room.showScreen("screen-ended");
      renderEnded(state);
    }
  }

  function renderPlay(state) {
    const myTurn = state.turnId === Room.playerId;

    el.playInstructions.textContent =
      state.mode === "anime"
        ? "Dis un anime qui commence par cette lettre, puis passe la bombe."
        : "Dis un personnage qui commence par cette lettre, puis passe la bombe.";
    el.letterDisplay.textContent = state.letter ?? "—";

    el.turnBanner.textContent = !state.turnId
      ? "En attente..."
      : myTurn
        ? "C'est ton tour !"
        : `Au tour de ${state.turnName ?? "..."}`;
    el.turnBanner.classList.toggle("my-turn", myTurn);

    el.passBtn.classList.toggle("hidden", !myTurn);
    el.passHint.classList.toggle("hidden", myTurn || !state.turnId);
    if (!myTurn && state.turnId) el.passHint.textContent = `En attente que ${state.turnName} passe la bombe...`;

    el.playersListPlay.innerHTML = "";
    for (const p of state.players) el.playersListPlay.appendChild(Room.playerRow(withAlive(p), decorateLives));
  }

  function renderEnded(state) {
    el.endTitle.textContent = state.winnerName
      ? state.winnerId === Room.playerId
        ? `Tu as gagné, ${state.winnerName} ! 🏆`
        : `${state.winnerName} a gagné ! 🏆`
      : "Partie terminée";

    // Le gagnant en tête, puis les éliminés du plus tardif (2e place) au plus
    // précoce (dernière place) — c'est l'inverse de l'ordre d'élimination.
    const ranking = [];
    if (state.winnerId) ranking.push({ id: state.winnerId, name: state.winnerName });
    for (const e of (state.eliminationOrder ?? []).slice().reverse()) ranking.push(e);

    const medals = ["🥇", "🥈", "🧻"];
    el.endRanking.innerHTML = "";
    ranking.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "ranking-row";

      const medal = document.createElement("span");
      medal.className = "ranking-medal";
      medal.textContent = medals[i] ?? `${i + 1}e`;
      row.appendChild(medal);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = r.name + (r.id === Room.playerId ? " (toi)" : "");
      row.appendChild(name);

      el.endRanking.appendChild(row);
    });

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.passBtn.addEventListener("click", () => Room.send({ type: "pass" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "bomb",
    minPlayers: 2,
    maxPlayers: 10,
    onStart: () => ({ mode: el.modeSelect.value }),
    onState: (s, prev) => {
      playSounds(prev, s);
      render(s);
    },
  });
})();
