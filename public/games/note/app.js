(() => {
  const $ = (id) => document.getElementById(id);

  const STEP_LABELS = {
    character: "Donne un personnage que tu juges à ce niveau",
    anime: "Donne un anime que tu juges à ce niveau",
    lastChance: "Dernière chance : un arc, un lieu, un pouvoir, un groupe ou une arme",
  };

  const CLUE_COLUMNS = [
    { key: "character", label: "Personnage" },
    { key: "anime", label: "Anime" },
    { key: "lastChance", label: "Dernière chance" },
  ];

  const KIND_LABELS = { arc: "Arc", lieu: "Lieu", pouvoir: "Pouvoir", groupe: "Groupe", arme: "Arme" };

  const el = {

    guesserSelect: $("guesser-select"),

    numberPanel: $("number-panel"),
    numberDisplay: $("number-display"),
    guesserWaitPanel: $("guesser-wait-panel"),
    stepTitle: $("step-title"),
    clueForm: $("clue-form"),
    lastChanceKind: $("last-chance-kind"),
    clueInput: $("clue-input"),
    clueSubmit: $("clue-submit"),
    clueWaitHint: $("clue-wait-hint"),
    stepProgress: $("step-progress"),
    guessPanel: $("guess-panel"),
    guessNumbers: $("guess-numbers"),
    clueLog: $("clue-log"),

    endTitle: $("end-title"),
    endDetail: $("end-detail"),
    endClueLog: $("end-clue-log"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  // ---- sons ----

  // Sound.onIncrease ignore le premier state reçu, donc rien ne sonne au
  // chargement ni à la reconnexion.
  function playSounds(previous, state) {
    if (state.phase === "play") {
      Sound.onIncrease("note:clues", (state.clues ?? []).length, "notify");
    }
    if (state.phase === "ended" && previous && previous.phase !== "ended") {
      Sound.play(state.guess === state.number ? "win" : "lose");
    }
  }

  // ---- rendering ----

  function buildGuessButtons() {
    el.guessNumbers.innerHTML = "";
    for (let n = 1; n <= 10; n++) {
      const btn = document.createElement("button");
      btn.className = "btn secondary note-number-btn";
      btn.textContent = String(n);
      btn.addEventListener("click", () => Room.send({ type: "submitGuess", number: n }));
      el.guessNumbers.appendChild(btn);
    }
  }
  buildGuessButtons();

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
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

    fillSelect(
      el.guesserSelect,
      [{ value: "", label: "Aléatoire" }].concat(
        state.players
          .filter((p) => p.connected)
          .map((p) => ({ value: p.id, label: p.name + (p.id === Room.playerId ? " (toi)" : "") }))
      )
    );
  }

  // Rebuilt on every render like everything else; `keep` preserves the
  // host's pick across re-renders triggered by someone else joining.
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

  // One row per player rather than per answer: everyone's clues stay lined up
  // under the same three columns, in player order, whoever answered first.
  function renderClueLog(state, container) {
    container.innerHTML = "";
    const clues = state.clues ?? [];
    const authors = state.players.filter(
      (p) => p.id !== state.guesserId && clues.some((c) => c.playerId === p.id)
    );
    if (authors.length === 0) return;

    const cell = (text, className) => {
      const div = document.createElement("div");
      div.className = className;
      div.textContent = text;
      return div;
    };

    container.appendChild(cell("", "note-head"));
    for (const col of CLUE_COLUMNS) container.appendChild(cell(col.label, "note-head"));

    for (const player of authors) {
      container.appendChild(cell(player.name, "note-row-name"));
      for (const col of CLUE_COLUMNS) {
        const entry = clues.find((c) => c.playerId === player.id && c.step === col.key);
        if (!entry) {
          container.appendChild(cell("—", "note-chip empty"));
          continue;
        }
        const chip = document.createElement("div");
        chip.className = "note-chip";
        if (entry.kind) {
          const kind = document.createElement("span");
          kind.className = "note-author";
          kind.textContent = KIND_LABELS[entry.kind] ?? entry.kind;
          chip.appendChild(kind);
        }
        chip.appendChild(document.createTextNode(entry.text));
        container.appendChild(chip);
      }
    }
  }

  function renderPlay(state) {

    const iAmGuesser = state.guesserId === Room.playerId;
    const me = state.players.find((p) => p.id === Room.playerId);
    const isClueStep = state.step === "character" || state.step === "anime" || state.step === "lastChance";

    el.numberPanel.classList.toggle("hidden", iAmGuesser);
    if (!iAmGuesser) el.numberDisplay.textContent = state.number ?? "—";

    el.guesserWaitPanel.classList.toggle("hidden", !iAmGuesser || state.step === "guessing");

    el.stepTitle.textContent = isClueStep ? STEP_LABELS[state.step] : "Tout le monde a répondu !";

    const canSubmit = isClueStep && !iAmGuesser && !me?.submitted;
    el.clueForm.classList.toggle("hidden", !canSubmit);
    el.clueWaitHint.classList.toggle("hidden", !(isClueStep && !iAmGuesser && me?.submitted));
    el.lastChanceKind.classList.toggle("hidden", state.step !== "lastChance");

    const informed = state.players.filter((p) => p.connected && p.id !== state.guesserId);
    const submittedCount = informed.filter((p) => p.submitted).length;
    el.stepProgress.textContent = isClueStep ? `${submittedCount}/${informed.length} ont répondu` : "";

    el.guessPanel.classList.toggle("hidden", !(iAmGuesser && state.step === "guessing"));

    renderClueLog(state, el.clueLog);
  }

  function renderEnded(state) {

    const guesserName = state.players.find((p) => p.id === state.guesserId)?.name ?? "?";
    const iAmGuesser = state.guesserId === Room.playerId;
    const who = iAmGuesser ? "Tu as" : `${guesserName} a`;
    const exact = state.guess === state.number;

    el.endTitle.textContent = exact
      ? `${who} deviné pile le bon chiffre : ${state.number} ! 🎯`
      : `${who} dit ${state.guess}, c'était ${state.number}`;

    const diff = state.guess != null && state.number != null ? Math.abs(state.guess - state.number) : null;
    el.endDetail.textContent = exact || diff == null ? "" : `Écart de ${diff}.`;

    renderClueLog(state, el.endClueLog);

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
    const text = el.clueInput.value.trim();
    if (!text) return;
    const payload = { type: "submitClue", text };
    if (!el.lastChanceKind.classList.contains("hidden")) {
      const checked = el.lastChanceKind.querySelector("input[name=kind]:checked");
      payload.kind = checked ? checked.value : "arc";
    }
    Room.send(payload);
    el.clueInput.value = "";
  }

  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "note",
    minPlayers: 3,
    maxPlayers: 8,
    onStart: () => ({ guesserId: el.guesserSelect.value || undefined }),
    onState: (s, prev) => { playSounds(prev, s); render(s); },
  });
})();
