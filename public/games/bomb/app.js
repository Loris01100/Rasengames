(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    modeSelect: $("mode-select"),

    playInstructions: $("play-instructions"),
    letterDisplay: $("letter-display"),
    turnBanner: $("turn-banner"),
    lastAnswer: $("last-answer"),
    wordForm: $("word-form"),
    wordInput: $("word-input"),
    wordSubmit: $("word-submit"),
    waitHint: $("wait-hint"),
    bombSeats: $("bomb-seats"),
    answersLog: $("answers-log"),

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
      // La bombe a explosé chez quelqu'un si les vies/l'élimination de
      // n'importe qui ont changé depuis le dernier state — tout le monde
      // entend le "boom", pas seulement la victime.
      const exploded = state.players.some((p) => {
        const before = previous.players.find((b) => b.id === p.id);
        return before && (before.lives !== p.lives || before.eliminated !== p.eliminated);
      });
      if (exploded) Sound.play("explode");

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
        ? "Tape un anime qui commence par cette lettre, puis envoie."
        : "Tape un personnage qui commence par cette lettre, puis envoie.";
    el.letterDisplay.textContent = state.letter ?? "—";

    el.turnBanner.textContent = !state.turnId
      ? "En attente..."
      : myTurn
        ? "C'est ton tour !"
        : `Au tour de ${state.turnName ?? "..."}`;
    el.turnBanner.classList.toggle("my-turn", myTurn);

    renderLastAnswer(state);

    el.wordForm.classList.toggle("hidden", !myTurn);
    el.waitHint.classList.toggle("hidden", myTurn || !state.turnId);
    if (!myTurn && state.turnId) el.waitHint.textContent = `En attente que ${state.turnName} réponde...`;

    renderSeats(state);

    renderAnswersLog(state);
  }

  // Les joueurs sont placés en cercle autour de la bombe : on voit d'un coup
  // d'oeil qui la tient et à qui elle va passer, ce qu'une liste verticale ne
  // montrait pas. La position vient d'un angle posé en variable CSS, le reste
  // est du pur CSS (cf. .bomb-seat).
  function renderSeats(state) {
    el.bombSeats.innerHTML = "";
    const players = state.players;
    players.forEach((p, index) => {
      const seat = document.createElement("div");
      seat.className = "bomb-seat";
      seat.style.setProperty("--angle", `${(360 / players.length) * index - 90}deg`);
      if (p.id === state.turnId) seat.classList.add("current");
      if (p.eliminated) seat.classList.add("dead");
      if (p.id === Room.playerId) seat.classList.add("you");
      if (p.connected === false) seat.classList.add("offline");

      const name = document.createElement("span");
      name.className = "bomb-seat-name";
      name.textContent = p.name + (p.id === Room.playerId ? " (toi)" : "");
      seat.appendChild(name);

      seat.appendChild(makeAvatar(p.name));

      const lives = document.createElement("span");
      lives.className = "bomb-seat-lives";
      lives.textContent = p.eliminated
        ? "💀"
        : "❤️".repeat(p.lives) + "🖤".repeat(Math.max(0, 2 - p.lives));
      seat.appendChild(lives);

      el.bombSeats.appendChild(seat);
    });
  }

  // L'historique complet reste tout en bas de l'écran, mais la dernière
  // réponse est aussi affichée ici, au milieu, à côté de la lettre — pas
  // besoin de scroller pour voir ce que la personne précédente vient de dire.
  function renderLastAnswer(state) {
    const last = (state.answers ?? []).at(-1);
    el.lastAnswer.classList.toggle("hidden", !last);
    if (!last) return;
    el.lastAnswer.textContent = "";

    const letter = document.createElement("span");
    letter.className = "bomb-log-letter";
    letter.textContent = last.letter;
    el.lastAnswer.appendChild(letter);

    const text = document.createElement("span");
    text.className = "bomb-log-text";
    text.textContent = last.text;
    el.lastAnswer.appendChild(text);

    const author = document.createElement("span");
    author.className = "muted small bomb-log-author";
    author.textContent = `— ${last.name}${last.playerId === Room.playerId ? " (toi)" : ""}`;
    el.lastAnswer.appendChild(author);
  }

  // Le plus récent en haut : c'est ce qui vient de se passer qui intéresse le
  // plus, pas de scroll à faire pour le retrouver à chaque nouvelle réponse.
  function renderAnswersLog(state) {
    el.answersLog.innerHTML = "";
    const answers = state.answers ?? [];
    if (answers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "Rien pour l'instant.";
      el.answersLog.appendChild(empty);
      return;
    }
    for (const a of answers.slice().reverse()) {
      const row = document.createElement("div");
      row.className = "bomb-log-row";

      const letter = document.createElement("span");
      letter.className = "bomb-log-letter";
      letter.textContent = a.letter;
      row.appendChild(letter);

      const text = document.createElement("span");
      text.className = "bomb-log-text";
      text.textContent = a.text;
      row.appendChild(text);

      const author = document.createElement("span");
      author.className = "muted small bomb-log-author";
      author.textContent = a.name + (a.playerId === Room.playerId ? " (toi)" : "");
      row.appendChild(author);

      el.answersLog.appendChild(row);
    }
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

  // Insensible aux accents/majuscules, comme la vérification côté serveur —
  // pas la peine d'attendre AniList pour rejeter une lettre déjà fausse.
  function startsWithLetter(text, letter) {
    const first = text.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").charAt(0).toUpperCase();
    return first === (letter || "").toUpperCase();
  }

  el.wordSubmit.addEventListener("click", submitWord);
  el.wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWord();
  });

  async function submitWord() {
    const text = el.wordInput.value.trim();
    if (!text) return;
    const letter = Room.state?.letter;
    if (letter && !startsWithLetter(text, letter)) {
      Room.toast(`Ta réponse doit commencer par la lettre ${letter}.`);
      return;
    }

    // Un mot pris dans la liste de suggestions sort déjà d'AniList : le
    // revérifier ne ferait que brûler le quota de la table (limite par IP, et
    // tout le monde joue souvent derrière la même box).
    const picked = el.wordInput.dataset.anilistRef;
    if (picked) {
      Room.send({ type: "submitWord", text });
      el.wordInput.value = "";
      delete el.wordInput.dataset.anilistRef;
      return;
    }

    const kind = Room.state?.mode === "anime" ? "anime" : "any";
    el.wordSubmit.disabled = true;
    const originalLabel = el.wordSubmit.textContent;
    el.wordSubmit.textContent = "Vérification...";
    try {
      const check = await Anilist.exists(text, kind === "any" ? "character" : kind);
      if (check === "notfound") {
        Room.toast(`"${text}" ne correspond à rien de connu sur AniList — vérifie l'orthographe.`);
        return;
      }
      if (check === "unknown") {
        Room.toast("Vérification AniList indisponible, réponse envoyée sans validation.");
      }
      Room.send({ type: "submitWord", text });
      el.wordInput.value = "";
      delete el.wordInput.dataset.anilistRef;
    } finally {
      el.wordSubmit.disabled = false;
      el.wordSubmit.textContent = originalLabel;
    }
  }

  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Suggest.attach(el.wordInput, () => (Room.state?.mode === "anime" ? "anime" : "any"));

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
