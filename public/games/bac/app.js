(() => {
  const $ = (id) => document.getElementById(id);

  // Kept in sync with src/games/bac/categories.ts.
  const CATEGORIES = [
    { id: "anime", label: "Anime / Manga" },
    { id: "hero", label: "Personnage principal" },
    { id: "sidekick", label: "Personnage secondaire" },
    { id: "villain", label: "Antagoniste" },
    { id: "technique", label: "Technique / Pouvoir" },
    { id: "item", label: "Objet / Arme" },
    { id: "place", label: "Lieu / Monde" },
    { id: "guild", label: "Guilde / Clan / Équipe" },
    { id: "creature", label: "Animal / Créature" },
    { id: "studio", label: "Studio d'animation" },
  ];
  const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

  const el = {

    categoryCheckboxes: $("category-checkboxes"),

    playLetter: $("play-letter"),
    playTimer: $("play-timer"),
    stopBtn: $("stop-btn"),
    stopHint: $("stop-hint"),
    answersForm: $("answers-form"),

    reviewTitle: $("review-title"),
    reviewStoppedBy: $("review-stopped-by"),
    reviewHint: $("review-hint"),
    reviewTable: $("review-table"),
    finishReviewBtn: $("finish-review-btn"),
    reviewWaitHint: $("review-wait-hint"),

    endTitle: $("end-title"),
    endStoppedBy: $("end-stopped-by"),
    resultsTable: $("results-table"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  // Kept in sync with src/games/bac/logic.ts's normalizeWord/isValidAnswer —
  // used only as a soft "looks valid" hint in the review table, the host
  // always makes the actual call.
  const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");
  function normalizeWord(word) {
    return (word || "").trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
  }
  function looksValid(answer, letter) {
    const n = normalizeWord(answer);
    return !!n && n[0] === normalizeWord(letter);
  }

  // ---- sons ----

  // Sound.onChange ignore le premier state reçu, donc rien ne sonne au
  // chargement ni à la reconnexion. Le changement de phase couvre l'essentiel :
  // quelqu'un a crié stop, ou la manche est finie.
  function playSounds(state) {
    Sound.onChange("bac:phase", state.phase, "notify");
  }

  // ---- rendering ----

  function populateCategoryCheckboxes() {
    el.categoryCheckboxes.innerHTML = "";
    for (const cat of CATEGORIES) {
      const label = document.createElement("label");
      label.className = "category-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = cat.id;
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(cat.label));
      el.categoryCheckboxes.appendChild(label);
    }
  }
  populateCategoryCheckboxes();

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
    } else if (state.phase === "play") {
      Room.showScreen("screen-play");
      renderPlay(state);
    } else if (state.phase === "review") {
      Room.showScreen("screen-review");
      renderReview(state);
    } else if (state.phase === "ended") {
      Room.showScreen("screen-ended");
      renderEnded(state);
    }
  }

  function renderLobby(state) {
    Room.renderLobby(state);
  }

  // Rebuilt only when a new round's letter shows up, so unrelated re-renders
  // (another player disconnecting, etc.) don't wipe out what you're typing.
  let answersFormLetter = null;
  const answerDebounce = {};
  let answerInputs = []; // les <input> de la manche en cours, pour compter les cases remplies

  // Chrono et verrou du bouton stop : ils dépendent du temps qui passe et de ce
  // qui est tapé localement (les réponses ne partent au serveur qu'après un
  // debounce), donc un timer local les rafraîchit sans attendre un state.
  let playTicker = null;

  function stopPlayTicker() {
    clearInterval(playTicker);
    playTicker = null;
  }

  function startPlayTicker(state) {
    stopPlayTicker();
    const needed = state.stopMinFilled ?? 0;
    const tick = () => {
      if (state.endsAt) {
        const left = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
        el.playTimer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
        el.playTimer.classList.toggle("urgent", left <= 60);
      } else {
        el.playTimer.textContent = "";
      }
      const filled = answerInputs.filter((i) => i.value.trim()).length;
      const missing = needed - filled;
      el.stopBtn.disabled = missing > 0;
      el.stopHint.textContent =
        missing > 0 ? `Encore ${missing} réponse(s) avant de pouvoir crier stop.` : "";
    };
    tick();
    playTicker = setInterval(tick, 1000);
  }

  function renderPlay(state) {
    el.playLetter.textContent = state.letter;

    if (answersFormLetter === state.letter) return;
    answersFormLetter = state.letter;

    el.answersForm.innerHTML = "";
    answerInputs = [];
    for (const catId of state.categories) {
      const row = document.createElement("div");
      row.className = "answer-row";

      const label = document.createElement("label");
      label.textContent = CATEGORY_LABELS[catId] ?? catId;
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 40;
      input.autocomplete = "off";
      input.value = state.you?.answers?.[catId] ?? "";
      input.placeholder = `Commence par ${state.letter}...`;
      input.addEventListener("input", () => {
        clearTimeout(answerDebounce[catId]);
        answerDebounce[catId] = setTimeout(() => {
          Room.send({ type: "answer", category: catId, text: input.value });
        }, 250);
      });
      row.appendChild(input);
      answerInputs.push(input);

      el.answersForm.appendChild(row);
    }

    startPlayTicker(state);
  }

  function renderReview(state) {
    answersFormLetter = null;
    stopPlayTicker();

    el.reviewTitle.textContent = `${state.stoppedByName ? "Stop" : "Temps écoulé"} ! Lettre ${state.result?.letter ?? ""}`;
    el.reviewStoppedBy.textContent = state.stoppedByName
      ? `${state.stoppedByName} a crié stop en premier.`
      : "Temps écoulé — la manche s'est arrêtée toute seule.";

    const isHost = state.hostId === Room.playerId;
    el.reviewHint.textContent = isHost
      ? "Clique sur une réponse pour la valider ou l'invalider. Rien n'est validé par défaut."
      : "L'hôte valide les réponses une par une...";

    renderResultsTable(state, el.reviewTable, isHost);

    el.finishReviewBtn.classList.toggle("hidden", !isHost);
    el.reviewWaitHint.classList.toggle("hidden", isHost);
  }

  function renderEnded(state) {
    answersFormLetter = null;
    stopPlayTicker();

    el.endTitle.textContent = `Résultats — Lettre ${state.result?.letter ?? ""}`;
    el.endStoppedBy.textContent = state.stoppedByName
      ? `${state.stoppedByName} a crié stop en premier.`
      : "Temps écoulé — la manche s'est arrêtée toute seule.";

    renderResultsTable(state, el.resultsTable, false);

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  function renderResultsTable(state, tableEl, editable) {
    const result = state.result;
    tableEl.innerHTML = "";
    if (!result) return;

    const players = state.players.filter((p) => result.totals[p.id] !== undefined);

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    for (const p of players) {
      const th = document.createElement("th");
      th.textContent = p.name + (p.id === Room.playerId ? " (toi)" : "");
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const catResult of result.byCategory) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.className = "category-name";
      th.textContent = CATEGORY_LABELS[catResult.category] ?? catResult.category;
      tr.appendChild(th);

      for (const p of players) {
        const entry = catResult.entries.find((e) => e.playerId === p.id);
        const td = document.createElement("td");
        if (entry) {
          td.classList.add(entry.valid ? (entry.points === 2 ? "score-unique" : "score-duplicate") : "score-invalid");
          if (editable) {
            td.classList.add("editable");
            if (!entry.valid && looksValid(entry.answer, result.letter)) td.classList.add("hint-valid");
            td.addEventListener("click", () => {
              Room.send({ type: "setValid", category: catResult.category, playerId: p.id, valid: !entry.valid });
            });
          }
          const answer = document.createElement("div");
          answer.className = "answer-text";
          answer.textContent = entry.answer.trim() || "—";
          td.appendChild(answer);
          const points = document.createElement("div");
          points.className = "answer-points";
          points.textContent = entry.valid
            ? `${entry.points} pt${entry.points > 1 ? "s" : ""}`
            : editable
              ? "à valider"
              : "invalide";
          td.appendChild(points);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);

    const maxTotal = Math.max(0, ...players.map((p) => result.totals[p.id] ?? 0));
    const tfoot = document.createElement("tfoot");
    const totalRow = document.createElement("tr");
    const totalTh = document.createElement("th");
    totalTh.textContent = "Total";
    totalRow.appendChild(totalTh);
    for (const p of players) {
      const td = document.createElement("td");
      td.className = "total-cell";
      const total = result.totals[p.id] ?? 0;
      td.textContent = total + (total === maxTotal && maxTotal > 0 ? " 🏆" : "");
      totalRow.appendChild(td);
    }
    tfoot.appendChild(totalRow);
    tableEl.appendChild(tfoot);
  }

  // ---- events ----

  el.stopBtn.addEventListener("click", () => Room.send({ type: "stop" }));
  el.finishReviewBtn.addEventListener("click", () => Room.send({ type: "finishReview" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "bac",
    minPlayers: 2,
    onStart: () => {
      const categories = Array.from(el.categoryCheckboxes.querySelectorAll("input:checked")).map(
        (input) => input.value
      );
      if (categories.length === 0) {
        Room.toast("Choisis au moins une catégorie.");
        return null;
      }
      return { categories };
    },
    onState: (s) => { playSounds(s); render(s); },
  });
})();
