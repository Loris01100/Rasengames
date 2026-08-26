(() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    refereeSelect: $("referee-select"),
    questionForm: $("question-form"),
    questionWait: $("question-wait"),
    questionInputs: [$("question-1"), $("question-2"), $("question-3")],
    questionsSubmit: $("questions-submit"),
    answerRole: $("answer-role"),
    answerForm: $("answer-form"),
    answerWait: $("answer-wait"),
    answerLabels: [$("answer-label-1"), $("answer-label-2"), $("answer-label-3")],
    answerInputs: [$("answer-1"), $("answer-2"), $("answer-3")],
    answersSubmit: $("answers-submit"),
    refereeLive: $("referee-live"),
    answerProgress: $("answer-progress"),
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

  function playerName(state, id) {
    return state.players.find((player) => player.id === id)?.name ?? "Joueur";
  }

  function fillRefereeSelect(players) {
    const keep = el.refereeSelect.value;
    el.refereeSelect.innerHTML = "";
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
    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      Room.renderLobby(state);
      fillRefereeSelect(state.players);
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
  }

  function renderAnswering(state) {
    const isReferee = state.refereeId === Room.playerId;
    const me = state.players.find((player) => player.id === Room.playerId);
    const canAnswer = !isReferee && !me?.submitted;

    el.answerRole.textContent = isReferee ? "Tu es l'arbitre" : "À toi de jouer";
    el.answerForm.classList.toggle("hidden", !canAnswer);
    el.answerWait.classList.toggle("hidden", isReferee || canAnswer);
    for (let index = 0; index < 3; index++) {
      el.answerLabels[index].textContent = `${index + 1}. ${state.questions[index] ?? ""}`;
    }

    el.refereeLive.classList.toggle("hidden", !isReferee);
    if (!isReferee) return;
    const respondents = state.players.filter((player) => player.connected && player.id !== state.refereeId);
    const submitted = respondents.filter((player) => player.submitted).length;
    el.answerProgress.textContent = `${submitted}/${respondents.length} joueurs ont validé`;
    renderLiveAnswers(state);
  }

  function renderLiveAnswers(state) {
    el.liveAnswers.innerHTML = "";
    for (const entry of state.refereeAnswers ?? []) {
      const row = document.createElement("div");
      row.className = "sync-live-player";
      const name = document.createElement("strong");
      name.textContent = playerName(state, entry.playerId);
      row.appendChild(name);
      const values = document.createElement("div");
      values.className = "sync-live-values";
      entry.values.forEach((answer, index) => {
        const value = document.createElement("span");
        value.textContent = `${index + 1}. ${answer ?? "—"}`;
        values.appendChild(value);
      });
      row.appendChild(values);
      el.liveAnswers.appendChild(row);
    }
  }

  function visibleEntriesForQuestion(state, question) {
    return (state.answers ?? []).filter((entry) => entry.values[question] != null);
  }

  function renderReveal(state) {
    const question = state.revealQuestion ?? 0;
    const isReferee = state.refereeId === Room.playerId;
    const entries = visibleEntriesForQuestion(state, question);
    const total = (state.answers ?? []).length;
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

  el.answersSubmit.addEventListener("click", () => {
    const answers = el.answerInputs.map((input) => input.value.trim());
    if (answers.some((answer) => !answer)) return Room.toast("Réponds aux trois questions.");
    Room.send({ type: "submitAnswers", answers });
  });

  el.revealNext.addEventListener("click", () => Room.send({ type: "revealNext" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "sync",
    minPlayers: 3,
    maxPlayers: 10,
    onStart: () => ({ refereeId: el.refereeSelect.value }),
    onState: (state, previous) => {
      playSounds(previous, state);
      render(state);
    },
  });
})();
