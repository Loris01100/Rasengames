(() => {
  const $ = (id) => document.getElementById(id);

  const el = {

    categoryForm: $("category-form"),
    categoryInput: $("category-input"),
    categorySubmit: $("category-submit"),
    categoryDoneHint: $("category-done-hint"),

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

    endTitle: $("end-title"),
    endRanking: $("end-ranking"),
    endFoundTally: $("end-found-tally"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  // ---- sons ----

  // Signale que l'adversaire a joué : une proposition arrive pour ma catégorie,
  // ou il vient de répondre à l'une des miennes. Sound.onIncrease ignore le
  // premier state reçu, donc pas de bip au chargement ni à la reconnexion.
  function playSounds(previous, state) {
    if (state.phase === "play") {
      Sound.onIncrease("detective:incoming", (state.you?.incoming ?? []).length, "notify");
      const answers = (state.log ?? []).filter((e) => e.from === Room.playerId);
      Sound.onIncrease("detective:answers", answers.length, answers.at(-1)?.fits ? "yes" : "no");
    }
    if (state.phase === "ended" && previous && previous.phase !== "ended") {
      Sound.play((state.solved ?? []).some((s) => s.by === Room.playerId) ? "win" : "lose");
    }
  }

  // ---- rendering ----

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
    } else if (state.phase === "setup") {
      Room.showScreen("screen-setup");
      renderSetup(state);
    } else if (state.phase === "play") {
      Room.showScreen("screen-play");
      renderPlay(state);
    } else if (state.phase === "ended") {
      Room.showScreen("screen-ended");
      renderEnded(state);
    }
  }

  function renderLobby(state) {
    Room.renderLobby(state);
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

    const you = state.players.find((p) => p.id === Room.playerId);
    const ready = !!you?.ready;
    el.categoryForm.classList.toggle("hidden", ready);
    el.categoryDoneHint.classList.toggle("hidden", !ready);
  }

  // One column per player: everything that was tested against THEIR
  // category, colored by whether it fit (or, for a guess, was correct).
  function renderLogColumns(state, containerEl) {
    containerEl.innerHTML = "";
    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    const targetIds = [Room.playerId, ...(state.others ?? []).map((o) => o.id)];

    for (const targetId of targetIds) {
      if (!targetId) continue;
      const column = document.createElement("div");
      column.className = "detective-column";

      const solvedEntry = (state.solved ?? []).find((s) => s.target === targetId);
      const title = document.createElement("h4");
      title.textContent =
        targetId === Room.playerId ? "Ta catégorie" : `Catégorie de ${nameOf(targetId)}`;
      column.appendChild(title);
      if (solvedEntry) {
        column.classList.add("solved");
        title.textContent += ` — trouvée par ${solvedEntry.byName} ✓`;
        const revealed =
          targetId === Room.playerId
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
    el.myCategory.textContent = state.you?.category ?? "";

    const myTurn = state.turnId === Room.playerId;
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

  const MEDALS = ["🥇", "🥈", "🧻"];

  function renderEnded(state) {

    const ranking = state.investigatorRanking ?? [];
    const winner = ranking[0];
    el.endTitle.textContent = winner
      ? winner.id === Room.playerId
        ? "Manche terminée — tu as gagné ! 🏆"
        : `Manche terminée — ${winner.name} a gagné ! 🏆`
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
      name.textContent = s.name + (s.id === Room.playerId ? " (toi)" : "");
      row.appendChild(name);

      const detail = document.createElement("span");
      detail.className = "muted small";
      detail.textContent = `${s.found} catégorie${s.found !== 1 ? "s" : ""} trouvée${s.found !== 1 ? "s" : ""} · ${s.questions} question${s.questions !== 1 ? "s" : ""}`;
      row.appendChild(detail);

      el.endRanking.appendChild(row);
    });

    el.endFoundTally.innerHTML = "";
    for (const p of (state.solved ?? []).slice().reverse()) {
      const row = document.createElement("div");
      row.className = "ranking-row";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.targetName + (p.target === Room.playerId ? " (toi)" : "");
      row.appendChild(name);

      const detail = document.createElement("span");
      detail.className = "muted small";
      const questionCount = (state.log ?? []).filter((entry) => entry.target === p.target).length;
      detail.textContent = `sa catégorie a résisté à ${questionCount} question${questionCount !== 1 ? "s" : ""}`;
      row.appendChild(detail);

      el.endFoundTally.appendChild(row);
    }

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.categorySubmit.addEventListener("click", submitCategory);
  el.categoryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitCategory();
  });
  function submitCategory() {
    const text = el.categoryInput.value.trim();
    if (!text) return;
    Room.send({ type: "setCategory", text });
  }

  el.incomingYes.addEventListener("click", () => Room.send({ type: "answerIncoming", fits: true }));
  el.incomingNo.addEventListener("click", () => Room.send({ type: "answerIncoming", fits: false }));

  el.proposeSubmit.addEventListener("click", submitPropose);
  el.proposeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPropose();
  });
  async function submitPropose() {
    if (el.proposeSubmit.disabled) return;
    const text = el.proposeInput.value.trim();
    if (!text) return;

    const picked = el.proposeInput.dataset.anilistRef;
    const characterRef = picked?.startsWith("character:") ? picked : undefined;
    if (!characterRef) {
      const originalLabel = el.proposeSubmit.textContent;
      el.proposeSubmit.disabled = true;
      el.proposeSubmit.textContent = "Vérification...";
      try {
        const check = await Anilist.exists(text, "character", true);
        if (check === "notfound") {
          Room.toast(`"${text}" ne correspond à aucun personnage AniList.`);
          return;
        }
        if (check === "unknown") {
          Room.toast("AniList est indisponible : réessaie dans un instant.");
          return;
        }
      } finally {
        el.proposeSubmit.disabled = false;
        el.proposeSubmit.textContent = originalLabel;
      }
    }

    Room.send({ type: "proposeCharacter", text, anilistRef: characterRef });
    el.proposeInput.value = "";
    delete el.proposeInput.dataset.anilistRef;
    delete el.proposeInput.dataset.anilistAnime;
  }

  el.guessSubmit.addEventListener("click", submitGuess);
  el.guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  function submitGuess() {
    const text = el.guessInput.value.trim();
    const target = el.guessTarget.value;
    if (!text || !target) return;
    Room.send({ type: "guessCategory", text, target });
    el.guessInput.value = "";
  }

  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Suggest.attach(el.proposeInput, () => "character");

  Room.init({
    slug: "detective",
    minPlayers: 2,
    maxPlayers: 3,
    onState: (s, prev) => { playSounds(prev, s); render(s); },
  });
})();
