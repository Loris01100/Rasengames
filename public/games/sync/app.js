(() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    refereeSelect: $("referee-select"),
    questionForm: $("question-form"),
    questionWait: $("question-wait"),
    questionWaitTitle: $("question-wait-title"),
    questionInputs: [$("question-1"), $("question-2"), $("question-3")],
    questionsSubmit: $("questions-submit"),
    playerAnswerCard: $("player-answer-card"),
    answerRole: $("answer-role"),
    answerStep: $("answer-step"),
    currentQuestion: $("current-question"),
    answerForm: $("answer-form"),
    answerWait: $("answer-wait"),
    answerInput: $("answer-input"),
    answerDots: $("answer-dots"),
    answersSubmit: $("answers-submit"),
    refereeLive: $("referee-live"),
    answerProgress: $("answer-progress"),
    answerProgressBar: $("answer-progress-bar"),
    refereePlayers: $("referee-players"),
    liveAnswers: $("live-answers"),
    revealStep: $("reveal-step"),
    revealQuestion: $("reveal-question"),
    revealedAnswers: $("revealed-answers"),
    revealNext: $("reveal-next"),
    revealWait: $("reveal-wait"),
    endReason: $("end-reason"),
    scoreList: $("score-list"),
    endAnswers: $("end-answers"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };
  let sentAnswerCount = null;

  function playerName(state, id) {
    return state.players.find((player) => player.id === id)?.name ?? "Joueur";
  }

  function fillRefereeSelect(players) {
    const keep = el.refereeSelect.value;
    el.refereeSelect.innerHTML = "";
    const random = document.createElement("option");
    random.value = "";
    random.textContent = "🎲 Aléatoire";
    el.refereeSelect.appendChild(random);
    for (const player of players.filter((candidate) => candidate.connected)) {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.name + (player.id === Room.playerId ? " (toi)" : "");
      el.refereeSelect.appendChild(option);
    }
    if (players.some((player) => player.id === keep && player.connected)) el.refereeSelect.value = keep;
  }

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);
    if (state.phase !== "answering") {
      sentAnswerCount = null;
      el.answersSubmit.disabled = false;
    }
    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      Room.renderLobby(state);
      fillRefereeSelect(state.players);
      el.answerInput.value = "";
      for (const input of el.questionInputs) input.value = "";
    } else if (state.phase === "questions") {
      Room.showScreen("screen-questions");
      renderQuestions(state);
    } else if (state.phase === "answering") {
      Room.showScreen("screen-answering");
      renderAnswering(state);
    } else if (state.phase === "reveal") {
      Room.showScreen("screen-reveal");
      renderReveal(state);
    } else if (state.phase === "ended") {
      Room.showScreen("screen-ended");
      renderEnded(state);
    }
  }

  function renderQuestions(state) {
    const isReferee = state.refereeId === Room.playerId;
    el.questionForm.classList.toggle("hidden", !isReferee);
    el.questionWait.classList.toggle("hidden", isReferee);
    el.questionWaitTitle.textContent = `${playerName(state, state.refereeId)} prépare les questions…`;
  }

  function renderAnswering(state) {
    const isReferee = state.refereeId === Room.playerId;
    const me = state.players.find((player) => player.id === Room.playerId);
    const answerCount = me?.answerCount ?? 0;
    const canAnswer = !isReferee && answerCount < 3;
    if (sentAnswerCount != null && answerCount > sentAnswerCount) {
      sentAnswerCount = null;
      el.answersSubmit.disabled = false;
      el.answerInput.focus();
    }

    el.playerAnswerCard.classList.toggle("hidden", isReferee);
    el.answerRole.textContent = "À toi de jouer";
    el.answerForm.classList.toggle("hidden", !canAnswer);
    el.answerWait.classList.toggle("hidden", isReferee || canAnswer);
    el.answerStep.textContent = canAnswer ? `Question ${answerCount + 1} sur 3` : "3 réponses sur 3";
    el.currentQuestion.textContent = canAnswer ? state.questions[answerCount] ?? "" : "C'est envoyé !";
    renderAnswerDots(answerCount);

    el.refereeLive.classList.toggle("hidden", !isReferee);
    if (!isReferee) return;
    const respondents = state.players.filter((player) => player.connected && player.id !== state.refereeId);
    const received = respondents.reduce((sum, player) => sum + (player.answerCount ?? 0), 0);
    const total = respondents.length * 3;
    el.answerProgress.textContent = `${received}/${total} réponses reçues`;
    el.answerProgressBar.style.width = `${total ? Math.round((received / total) * 100) : 0}%`;
    renderRefereePlayers(respondents);
    renderLiveAnswers(state);
  }

  function renderAnswerDots(answerCount) {
    el.answerDots.innerHTML = "";
    for (let index = 0; index < 3; index++) {
      const dot = document.createElement("span");
      dot.className = "sync-answer-dot";
      if (index < answerCount) dot.classList.add("done");
      if (index === answerCount) dot.classList.add("current");
      dot.textContent = index < answerCount ? "✓" : String(index + 1);
      el.answerDots.appendChild(dot);
    }
  }

  function renderRefereePlayers(players) {
    el.refereePlayers.innerHTML = "";
    for (const player of players) {
      const row = document.createElement("div");
      row.className = "sync-referee-player";
      const name = document.createElement("strong");
      name.textContent = player.name;
      const status = document.createElement("span");
      const count = player.answerCount ?? 0;
      status.textContent = count === 3 ? "Prêt ✓" : `Question ${count + 1}`;
      if (count === 3) status.className = "done";
      row.appendChild(name);
      row.appendChild(status);
      el.refereePlayers.appendChild(row);
    }
  }

  function renderLiveAnswers(state) {
    el.liveAnswers.innerHTML = "";
    state.questions.forEach((question, index) => {
      const card = document.createElement("div");
      card.className = "sync-live-question";
      const title = document.createElement("h3");
      title.textContent = `${index + 1}. ${question}`;
      card.appendChild(title);
      const entries = (state.refereeAnswers ?? []).filter((entry) => entry.values[index] != null);
      if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted small";
        empty.textContent = "Aucune réponse pour l'instant…";
        card.appendChild(empty);
      }
      for (const entry of entries) {
        const answer = document.createElement("div");
        answer.className = "sync-live-answer";
        const name = document.createElement("span");
        name.textContent = playerName(state, entry.playerId);
        const value = document.createElement("strong");
        value.textContent = entry.values[index];
        answer.appendChild(name);
        answer.appendChild(value);
        card.appendChild(answer);
      }
      el.liveAnswers.appendChild(card);
    });
  }

  function entriesForQuestion(state, question) {
    return (state.answers ?? []).filter((entry) => entry.values.length > question);
  }

  function visibleEntriesForQuestion(state, question) {
    return entriesForQuestion(state, question).filter((entry) => entry.values[question] != null);
  }

  function submitCurrentAnswer() {
    const state = Room.state;
    const me = state?.players?.find((player) => player.id === Room.playerId);
    const question = me?.answerCount ?? 0;
    const answer = el.answerInput.value.trim();
    if (!answer || question >= 3 || sentAnswerCount != null) return;
    sentAnswerCount = question;
    el.answersSubmit.disabled = true;
    Room.send({ type: "submitAnswer", question, answer });
    el.answerInput.value = "";
  }

  function renderReveal(state) {
    const question = state.revealQuestion ?? 0;
    const isReferee = state.refereeId === Room.playerId;
    const entries = visibleEntriesForQuestion(state, question);
    const total = entriesForQuestion(state, question).length;
    el.revealStep.textContent = `Question ${question + 1} sur 3`;
    el.revealQuestion.textContent = state.questions[question] ?? "";
    el.revealedAnswers.innerHTML = "";
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "sync-reveal-answer";
      const name = document.createElement("strong");
      name.textContent = playerName(state, entry.playerId);
      row.appendChild(name);
      row.appendChild(document.createTextNode(entry.values[question]));
      el.revealedAnswers.appendChild(row);
    }

    el.revealNext.classList.toggle("hidden", !isReferee);
    el.revealWait.classList.toggle("hidden", isReferee);
    if (entries.length < total) {
      el.revealNext.textContent = entries.length === 0 ? "Révéler la première réponse" : "Révéler la réponse suivante";
    } else if (question < 2) {
      el.revealNext.textContent = "Passer à la question suivante";
    } else {
      el.revealNext.textContent = "Afficher les résultats";
    }
  }

  function renderEnded(state) {
    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
    el.endReason.textContent = state.endReason ?? "";
    el.endReason.classList.toggle("hidden", !state.endReason);

    el.scoreList.innerHTML = "";
    const ranked = state.players
      .filter((player) => player.id !== state.refereeId)
      .sort((left, right) => (state.scores?.[right.id] ?? 0) - (state.scores?.[left.id] ?? 0));
    for (const player of ranked) {
      const row = document.createElement("div");
      row.className = "sync-score-row";
      const name = document.createElement("span");
      name.textContent = player.name;
      const points = document.createElement("span");
      const score = state.scores?.[player.id] ?? 0;
      points.className = "sync-score-points";
      points.textContent = `${score} pt${score > 1 ? "s" : ""}`;
      row.appendChild(name);
      row.appendChild(points);
      el.scoreList.appendChild(row);
    }

    el.endAnswers.innerHTML = "";
    state.questions.forEach((question, index) => {
      const card = document.createElement("div");
      card.className = "card sync-end-question";
      const title = document.createElement("h3");
      title.textContent = question;
      card.appendChild(title);
      for (const entry of visibleEntriesForQuestion(state, index)) {
        const line = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${playerName(state, entry.playerId)} : `;
        line.appendChild(strong);
        line.appendChild(document.createTextNode(entry.values[index]));
        card.appendChild(line);
      }
      el.endAnswers.appendChild(card);
    });
  }

  function playSounds(previous, state) {
    if (state.phase === "reveal") {
      const count = (state.revealedCounts ?? []).reduce((sum, value) => sum + value, 0);
      Sound.onIncrease("sync:reveals", count, "notify");
    }
    if (state.phase === "ended" && previous?.phase !== "ended") Sound.play("win");
  }

  el.questionsSubmit.addEventListener("click", () => {
    const questions = el.questionInputs.map((input) => input.value.trim());
    if (questions.some((question) => !question)) return Room.toast("Remplis les trois questions.");
    Room.send({ type: "submitQuestions", questions });
  });

  el.answersSubmit.addEventListener("click", submitCurrentAnswer);
  el.answerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitCurrentAnswer();
  });

  el.revealNext.addEventListener("click", () => Room.send({ type: "revealNext" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "sync",
    minPlayers: 3,
    maxPlayers: 10,
    onStart: () => ({ refereeId: el.refereeSelect.value || undefined }),
    onState: (state, previous) => {
      playSounds(previous, state);
      render(state);
    },
  });
})();
