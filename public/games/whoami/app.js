(() => {
  const $ = (id) => document.getElementById(id);

  const el = {

    submitModeSelect: $("submit-mode-select"),
    categoryField: $("category-field"),
    categoryInput: $("category-input"),

    wordForm: $("word-form"),
    wordInput: $("word-input"),
    wordSubmit: $("word-submit"),
    wordDoneHint: $("word-done-hint"),
    submitProgress: $("submit-progress"),
    submitCategory: $("submit-category"),

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

    endTitle: $("end-title"),
    endBest: $("end-best"),
    revealGrid: $("reveal-grid"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

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
    const myTurn = state.turnId === Room.playerId;
    Sound.onChange(
      "whoami:turn",
      `${state.phase}:${state.turnId}`,
      state.phase === "play" && myTurn ? "turn" : null
    );
  }

  // ---- rendering ----

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
    } else if (state.phase === "submit") {
      Room.showScreen("screen-submit");
      renderSubmit(state);
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

  function renderSubmit(state) {

    const you = state.players.find((p) => p.id === Room.playerId);
    const ready = !!you?.ready;
    el.wordForm.classList.toggle("hidden", ready);
    el.wordDoneHint.classList.toggle("hidden", !ready);

    el.submitCategory.classList.toggle("hidden", state.submitMode !== "categorie" || !state.category);
    el.submitCategory.textContent = `Catégorie imposée : ${state.category}`;

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

    if (p.word) {
      const img = document.createElement("img");
      img.className = "whoami-image hidden";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      card.appendChild(img);
      Anilist.setImage(img, p.word, "character", p.wordRef);
    }

    const name = document.createElement("div");
    name.className = "whoami-owner";
    name.textContent = p.name + (p.id === Room.playerId ? " (toi)" : "");
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
    yes.addEventListener("click", () => Room.send({ type: "validateGuess", playerId: p.id, correct: true }));
    const no = document.createElement("button");
    no.className = "btn secondary small";
    no.textContent = "Raté ✗";
    no.addEventListener("click", () => Room.send({ type: "validateGuess", playerId: p.id, correct: false }));
    row.appendChild(yes);
    row.appendChild(no);

    return row;
  }

  function renderPlay(state) {

    const you = state.players.find((p) => p.id === Room.playerId);
    const isHost = state.hostId === Room.playerId;
    const myTurn = state.turnId === Room.playerId;

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
        p.id !== Room.playerId &&
        (isHost || p.id === state.hostId)
    );
    el.validatePanel.classList.toggle("hidden", toValidate.length === 0);
    el.validateList.innerHTML = "";
    for (const p of toValidate) el.validateList.appendChild(validateRow(p));

    el.hostRoundActions.classList.toggle("hidden", !isHost);

    el.othersGrid.innerHTML = "";
    for (const p of state.players) {
      if (p.id === Room.playerId) continue;
      el.othersGrid.appendChild(characterCard(p));
    }

    const foundCount = state.players.filter((p) => p.connected && p.found).length;
    const totalCount = state.players.filter((p) => p.connected).length;
    el.playProgress.textContent = `${foundCount}/${totalCount} ont trouvé leur mot`;
  }

  function renderEnded(state) {

    const foundCount = state.players.filter((p) => p.found).length;
    const total = state.players.length;
    const you = state.players.find((p) => p.id === Room.playerId);
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
      el.endBest.textContent = `🏆 ${best.name}${best.id === Room.playerId ? " (toi)" : ""} a trouvé avec ${questions} question${questions > 1 ? "s" : ""} et ${tries} proposition${tries > 1 ? "s" : ""} (score ${cost(best)}) !`;
    }

    el.revealGrid.innerHTML = "";
    ranked.forEach((p, index) => el.revealGrid.appendChild(characterCard(p, p.found ? index + 1 : null)));

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.wordSubmit.addEventListener("click", submitWord);
  el.wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWord();
  });
  function submitWord() {
    const text = el.wordInput.value.trim();
    if (!text) return;
    Room.send({ type: "submitWord", text, anilistRef: el.wordInput.dataset.anilistRef });
  }

  el.guessSubmit.addEventListener("click", submitGuess);
  el.guessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  function submitGuess() {
    const text = el.guessInput.value.trim();
    if (!text) return;
    Room.send({ type: "guess", text });
    el.guessInput.value = "";
  }

  el.submitModeSelect.addEventListener("change", () => {
    el.categoryField.classList.toggle("hidden", el.submitModeSelect.value !== "categorie");
  });

  el.askedBtn.addEventListener("click", () => Room.send({ type: "askedQuestion" }));
  el.endRoundBtn.addEventListener("click", () => Room.send({ type: "endRound" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Suggest.attach(el.wordInput);

  Room.init({
    slug: "whoami",
    minPlayers: 2,
    maxPlayers: 5,
    onStart: () => {
      const submitMode = el.submitModeSelect.value;
      if (submitMode === "categorie") {
        const category = el.categoryInput.value.trim();
        if (!category) {
          Room.toast("Écris une catégorie, ou repasse en mode libre.");
          return null;
        }
        return { submitMode, category };
      }
      return { submitMode };
    },
    onState: (s) => { playSounds(s); render(s); },
  });
})();
