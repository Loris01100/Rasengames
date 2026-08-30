(() => {
  const $ = (id) => document.getElementById(id);

  const el = {

    categorySelect: $("category-select"),
    undercoverCount: $("undercover-count"),
    mrwhiteCount: $("mrwhite-count"),

    wordImage: $("word-image"),
    wordDisplay: $("word-display"),
    wordHint: $("word-hint"),
    toggleWord: $("toggle-word"),
    roleHint: $("role-hint"),
    roundNumber: $("round-number"),
    categoryLabel: $("category-label"),
    phaseLabel: $("phase-label"),
    playersMini: $("players-mini"),

    clueList: $("clue-list"),
    clueForm: $("clue-form"),
    clueInput: $("clue-input"),
    clueSubmit: $("clue-submit"),
    clueTurnHint: $("clue-turn-hint"),

    votePanel: $("vote-panel"),
    voteProgress: $("vote-progress"),
    voteList: $("vote-list"),

    voteResultPanel: $("vote-result-panel"),
    voteResultList: $("vote-result-list"),
    voteResultSummary: $("vote-result-summary"),

    whiteguessPanel: $("whiteguess-panel"),
    whiteguessInfo: $("whiteguess-info"),
    whiteguessForm: $("whiteguess-form"),
    whiteguessInput: $("whiteguess-input"),
    whiteguessSubmit: $("whiteguess-submit"),

    historyPanel: $("history-panel"),
    historyList: $("history-list"),
    clueHistoryPanel: $("clue-history-panel"),
    clueHistory: $("clue-history"),

    endPanel: $("end-panel"),
    endTitle: $("end-title"),
    endWordsImages: $("end-words-images"),
    endWords: $("end-words"),
    endReveal: $("end-reveal"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  const CATEGORY_LABELS = {
    random: "Aléatoire",
    character: "Personnages",
    technique: "Pouvoirs",
    anime: "Titres d'anime",
    place: "Lieux",
    arc: "Arcs",
    group: "Groupes",
    object: "Objets",
  };

  // Other games the group can switch to without disbanding — see the
  // "switchGame" message handling below.

  let wordHidden = false;

  // ---- sons ----

  // Sound.onIncrease / onChange ignorent le premier state reçu, donc rien ne
  // sonne au chargement ni à la reconnexion.
  function playSounds(state) {
    // Seulement les indices des autres : on ne se bipe pas soi-même.
    const othersClues = (state.clues ?? []).filter((c) => c.playerId !== Room.playerId);
    Sound.onIncrease("uc:clues", othersClues.length, "notify");
    Sound.onIncrease("uc:votes", state.votesCast ?? 0, "tick");
    const myTurn = state.phase === "clue" && state.currentTurnPlayerId === Room.playerId;
    Sound.onChange("uc:turn", `${state.phase}:${state.currentTurnPlayerId}`, myTurn ? "turn" : null);
  }

  // ---- rendering ----

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
    } else {
      Room.showScreen("screen-game");
      renderGame(state);
    }
  }

  function addRoleTag(row, p) {
    if (!p.role) return;
    const tag = document.createElement("span");
    tag.className = `role-tag role-${p.role}`;
    tag.textContent = roleLabel(p.role);
    row.appendChild(tag);

    // Résumé des mots : le mot de chacun, en clair, à côté de son rôle —
    // Mr. White n'en a pas, sa ligne le dit plutôt que de rester vide.
    const word = document.createElement("span");
    word.className = "tag";
    word.textContent = p.word
      ? p.wordHint
        ? `${p.word} (${p.wordHint})`
        : p.word
      : p.role === "mrwhite"
        ? "pas de mot"
        : "";
    if (word.textContent) row.appendChild(word);
  }

  function roleLabel(role) {
    if (role === "civilian") return "Civil";
    if (role === "undercover") return "Undercover";
    if (role === "mrwhite") return "Mr. White";
    return role;
  }

  function renderLobby(state) {
    Room.renderLobby(state);

    if (state.hostId !== Room.playerId) return;
    if (document.activeElement !== el.undercoverCount) {
      el.undercoverCount.value = state.settings.undercoverCount;
    }
    if (document.activeElement !== el.mrwhiteCount) {
      el.mrwhiteCount.value = state.settings.mrWhiteCount;
    }
    if (document.activeElement !== el.categorySelect) {
      el.categorySelect.value = state.settings.category;
    }
  }

  function renderGame(state) {
    el.roundNumber.textContent = state.round;

    const phaseLabels = {
      clue: "🗣️ Donnez vos indices",
      vote: "🗳️ Votez pour éliminer un suspect",
      whiteguess: "🤔 Mr. White tente de deviner",
      ended: "🏁 Partie terminée",
    };
    el.phaseLabel.textContent = phaseLabels[state.phase] || "";
    // La catégorie tirée pour cette manche précisément (utile surtout en
    // réglage "Aléatoire" : sans ça, l'étiquette resterait bloquée sur
    // "Aléatoire" toute la manche au lieu de dire ce qui est vraiment sorti).
    el.categoryLabel.textContent = CATEGORY_LABELS[state.wordCategory ?? state.settings?.category] || "";

    renderRoleCard(state);
    renderPlayersMini(state);
    renderClues(state);
    renderVote(state);
    renderVoteResult(state);
    renderWhiteGuess(state);
    renderClueHistory(state);
    renderHistory(state);
    renderEnd(state);
  }

  // AniList ne connaît que des personnages et des anime. Chercher une image
  // pour un groupe ("Akatsuki"), un lieu ou une technique tombe forcément sur
  // un homonyme — un perso nommé Akatsuki plutôt que l'organisation. Pas
  // d'image vaut mieux qu'une fausse, d'où le null pour ces catégories.
  function wordKind(state) {
    const category = state.wordCategory ?? state.settings?.category;
    return category === "anime" ? "anime" : category === "character" ? "character" : null;
  }

  function showWordImage(img, word, state) {
    const kind = wordKind(state);
    if (word && kind) Anilist.setImage(img, word, kind);
    else img.classList.add("hidden");
  }

  function renderRoleCard(state) {
    const you = state.you;
    if (!you) return;
    const mrWhiteReveal =
      state.phase === "ended" && you.role === "mrwhite"
        ? `Civils : ${state.civilianWord} · Undercover : ${state.undercoverWord}`
        : null;
    const text = mrWhiteReveal ?? (you.word ? you.word : you.role === "mrwhite" ? "Tu es Mr. White (pas de mot !)" : "—");
    const hideWord = wordHidden && state.phase !== "ended";
    el.wordDisplay.textContent = hideWord ? "•••••" : text;
    el.wordDisplay.classList.toggle("hidden-word", hideWord);

    showWordImage(el.wordImage, !hideWord && you.word, state);

    el.wordHint.textContent = !hideWord && you.word && you.wordHint ? you.wordHint : "";

    el.roleHint.textContent = mrWhiteReveal
      ? "La partie est terminée : voici les deux mots de la manche."
      : you.role === "mrwhite"
        ? "Bluffe : tu n'as pas de mot, essaie de deviner celui des civils si tu es démasqué."
        : you.role === "undercover"
          ? "Ton mot ressemble à celui des civils, mais n'est pas identique."
          : "Décris ton mot sans le dire directement.";
  }

  function renderPlayersMini(state) {
    el.playersMini.innerHTML = "";
    for (const p of state.players) {
      const chip = document.createElement("span");
      chip.className = "chip";
      if (p.id === state.currentTurnPlayerId && state.phase === "clue") chip.classList.add("current");
      if (!p.alive) chip.classList.add("dead");
      chip.textContent = p.name;
      el.playersMini.appendChild(chip);
    }
  }

  function renderClues(state) {
    el.clueList.innerHTML = "";
    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    for (const clue of state.clues) {
      const li = document.createElement("li");
      const author = document.createElement("span");
      author.className = "clue-author";
      author.textContent = nameOf(clue.playerId) + " : ";
      li.appendChild(author);
      li.appendChild(document.createTextNode(clue.text));
      el.clueList.appendChild(li);
    }

    const isMyTurn = state.phase === "clue" && state.currentTurnPlayerId === Room.playerId;
    el.clueForm.classList.toggle("hidden", !isMyTurn);
    if (state.phase === "clue") {
      el.clueTurnHint.textContent = isMyTurn
        ? "C'est ton tour !"
        : `En attente de ${nameOf(state.currentTurnPlayerId)}...`;
    } else {
      el.clueTurnHint.textContent = "";
    }
  }

  function renderVote(state) {
    const active = state.phase === "vote";
    el.votePanel.classList.toggle("hidden", !active);
    if (!active) return;

    el.voteProgress.textContent = `${state.votesCast}/${state.votesNeeded} ont voté`;
    el.voteList.innerHTML = "";
    for (const p of state.players) {
      if (!p.alive) continue;
      const btn = document.createElement("button");
      btn.className = "vote-option";
      btn.textContent = p.name + (p.id === Room.playerId ? " (toi)" : "");
      if (state.myVote === p.id) btn.classList.add("selected");
      const me = state.players.find((pl) => pl.id === Room.playerId);
      if (!me || !me.alive) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => Room.send({ type: "vote", targetId: p.id }));
      }
      el.voteList.appendChild(btn);
    }
  }

  function renderVoteResult(state) {
    const result = state.lastVoteResult;
    const active = !!result && state.phase !== "vote";
    el.voteResultPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    el.voteResultList.innerHTML = "";
    const entries = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
    for (const [id, count] of entries) {
      const row = document.createElement("div");
      row.className = "player-row";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = nameOf(id);
      row.appendChild(name);

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `${count} vote${count > 1 ? "s" : ""}`;
      row.appendChild(tag);

      el.voteResultList.appendChild(row);
    }

    el.voteResultSummary.textContent = result.tie
      ? "Égalité : personne n'est éliminé, nouvelle manche."
      : `${nameOf(result.eliminatedId)} a été éliminé(e).`;
  }

  function renderWhiteGuess(state) {
    const active = state.phase === "whiteguess";
    el.whiteguessPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const isGuesser = state.pendingGuesserId === Room.playerId;
    const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? "?";
    el.whiteguessForm.classList.toggle("hidden", !isGuesser);
    el.whiteguessInfo.textContent = isGuesser
      ? "Tu as été démasqué ! Devine le mot des civils pour gagner."
      : `${nameOf(state.pendingGuesserId)} (Mr. White) a été démasqué et tente de deviner le mot des civils...`;
  }

  // Le `clue-list` au-dessus ne montre que la manche en cours. Ici, tout ce
  // que chacun a dit depuis le début de la partie, groupé par joueur : c'est
  // le recoupement d'une manche à l'autre qui trahit un undercover.
  function renderClueHistory(state) {
    const history = state.clueHistory ?? [];
    el.clueHistoryPanel.classList.toggle("hidden", history.length === 0);
    if (history.length === 0) return;

    el.clueHistory.innerHTML = "";
    for (const p of state.players) {
      const mine = history.filter((c) => c.playerId === p.id);
      if (mine.length === 0) continue;

      const row = document.createElement("div");
      row.className = "clue-history-row";
      if (!p.alive) row.classList.add("dead");

      const name = document.createElement("span");
      name.className = "clue-history-name";
      name.textContent = p.name + (p.id === Room.playerId ? " (toi)" : "");
      row.appendChild(name);

      const words = document.createElement("span");
      words.className = "clue-history-words";
      for (const clue of mine) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = clue.text;
        chip.title = `Manche ${clue.round}`;
        words.appendChild(chip);
      }
      row.appendChild(words);

      el.clueHistory.appendChild(row);
    }
  }

  function renderHistory(state) {
    const has = state.eliminatedHistory.length > 0;
    el.historyPanel.classList.toggle("hidden", !has);
    if (!has) return;
    el.historyList.innerHTML = "";
    for (const e of state.eliminatedHistory) {
      const li = document.createElement("li");
      li.textContent = `${e.name} était ${roleLabel(e.role)}`;
      el.historyList.appendChild(li);
    }
  }

  function renderEnd(state) {
    const active = state.phase === "ended";
    el.endPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const titles = {
      civilians: "Les civils gagnent 🎉",
      undercover: "Les undercover gagnent 😈",
      mrwhite: "Mr. White gagne en devinant le mot ! 🃏",
    };
    el.endTitle.textContent = titles[state.winner] || "Partie terminée";
    const civilianLabel = state.civilianWordHint ? `${state.civilianWord} (${state.civilianWordHint})` : state.civilianWord;
    const undercoverLabel = state.undercoverWordHint
      ? `${state.undercoverWord} (${state.undercoverWordHint})`
      : state.undercoverWord;
    el.endWords.textContent = `Mot des civils : ${civilianLabel} — Mot des undercover : ${undercoverLabel}`;

    el.endWordsImages.innerHTML = "";
    const wordCards = [
      { label: "Civils", word: state.civilianWord },
      { label: "Undercover", word: state.undercoverWord },
    ];
    for (const w of wordCards) {
      if (!w.word) continue;
      const fig = document.createElement("figure");
      fig.className = "end-word-figure";
      const img = document.createElement("img");
      img.className = "hidden";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      showWordImage(img, w.word, state);
      fig.appendChild(img);
      const caption = document.createElement("figcaption");
      caption.textContent = `${w.label} : ${w.word}`;
      fig.appendChild(caption);
      el.endWordsImages.appendChild(fig);
    }

    el.endReveal.innerHTML = "";
    for (const p of state.players) {
      el.endReveal.appendChild(Room.playerRow(p, addRoleTag));
    }

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.toggleWord.addEventListener("click", () => {
    wordHidden = !wordHidden;
    el.toggleWord.textContent = wordHidden ? "Afficher" : "Cacher";
    if (Room.state) renderRoleCard(Room.state);
  });

  el.clueSubmit.addEventListener("click", submitClue);
  el.clueInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitClue();
  });
  function submitClue() {
    const text = el.clueInput.value.trim();
    if (!text) return;
    Room.send({ type: "clue", text });
    el.clueInput.value = "";
  }

  el.whiteguessSubmit.addEventListener("click", submitWhiteGuess);
  el.whiteguessInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitWhiteGuess();
  });
  function submitWhiteGuess() {
    const word = el.whiteguessInput.value.trim();
    if (!word) return;
    Room.send({ type: "whiteGuess", word });
    el.whiteguessInput.value = "";
  }

  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "undercover",
    minPlayers: 3,
    onStart: () => ({
      settings: {
        undercoverCount: Number(el.undercoverCount.value) || 0,
        mrWhiteCount: Number(el.mrwhiteCount.value) || 0,
        category: el.categorySelect.value,
      },
    }),
    onState: (s) => { playSounds(s); render(s); },
  });
})();
