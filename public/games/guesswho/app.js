(() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    guesserSelect: $("guesser-select"),
    roleKicker: $("role-kicker"),
    roleTitle: $("role-title"),
    roleHelp: $("role-help"),
    turnCounts: $("turn-counts"),
    endTurnBtn: $("end-turn-btn"),
    secretCard: $("secret-card"),
    secretImage: $("secret-image"),
    secretName: $("secret-name"),
    secretAnime: $("secret-anime"),
    board: $("character-board"),
    resultTitle: $("result-title"),
    resultDetail: $("result-detail"),
    resultCharacter: $("result-character"),
    endedBoard: $("ended-board"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  let renderedLobbyPlayers = "";
  let renderedRound = null;
  let imageLoadGeneration = 0;
  let autoGuessTimer = null;
  let eliminated = new Set();
  const IMAGE_SEARCH_NAMES = {
    "Giyu Tomioka": "Giyuu Tomioka",
    "Katsuki Bakugo": "Katsuki Bakugou",
    "Kyojuro Rengoku": "Kyoujurou Rengoku",
    "Levi Ackerman": "Levi",
    "Ochaco Uraraka": "Ochako Uraraka",
    "Ryomen Sukuna": "Ryoumen Sukuna",
    "Seishiro Nagi": "Seishirou Nagi",
    "Shoei Baro": "Shouei Barou",
    "Shoyo Hinata": "Shouyou Hinata",
    "Soshiro Hoshina": "Soushirou Hoshina",
    "Sosuke Aizen": "Sousuke Aizen",
    "Tanjiro Kamado": "Tanjirou Kamado",
    "Taro Sakamoto": "Tarou Sakamoto",
    "Yuta Okkotsu": "Yuuta Okkotsu",
  };

  function imageSearchName(character) {
    return IMAGE_SEARCH_NAMES[character.name] ?? character.name;
  }

  function imageRef(character) {
    return character.anilistRef ?? null;
  }

  function playerName(state, id) {
    return state.players.find((player) => player.id === id)?.name ?? "Un joueur";
  }

  function remainingCharacters(state) {
    return (state.board ?? []).filter((character) => !eliminated.has(character.id));
  }

  function cancelAutoGuess() {
    if (autoGuessTimer !== null) clearTimeout(autoGuessTimer);
    autoGuessTimer = null;
  }

  function maybeAutoGuess(state) {
    cancelAutoGuess();
    if (Room.spectator || Room.playerId !== state.currentTurnId) return;
    const remaining = remainingCharacters(state);
    if (remaining.length !== 1) return;
    const characterId = remaining[0].id;
    autoGuessTimer = setTimeout(() => {
      autoGuessTimer = null;
      if (Room.state?.phase !== "play" || Room.state.currentTurnId !== Room.playerId) return;
      const latestRemaining = remainingCharacters(Room.state);
      if (latestRemaining.length === 1 && latestRemaining[0].id === characterId) {
        Room.send({ type: "guess", characterId });
      }
    }, 700);
  }

  function renderLobby(state) {
    Room.renderLobby(state);
    const signature = state.players.map((player) => `${player.id}:${player.name}`).join("|");
    if (signature === renderedLobbyPlayers) return;
    renderedLobbyPlayers = signature;
    const previous = el.guesserSelect.value || "random";
    el.guesserSelect.innerHTML = "";
    const random = document.createElement("option");
    random.value = "random";
    random.textContent = "Au hasard";
    el.guesserSelect.appendChild(random);
    for (const player of state.players.filter((item) => item.connected)) {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.name;
      el.guesserSelect.appendChild(option);
    }
    el.guesserSelect.value = [...el.guesserSelect.children].some((option) => option.value === previous)
      ? previous
      : "random";
  }

  function makeCharacterCard(state, character, interactive, imageJobs) {
    const card = document.createElement("article");
    card.className = "character-card";
    card.dataset.characterId = character.id;
    if (eliminated.has(character.id)) card.classList.add("eliminated");
    if (state.revealedTargetId === character.id) card.classList.add("target");
    if (state.guessedId === character.id && state.guessedId !== state.revealedTargetId) card.classList.add("guessed-wrong");

    const imageWrap = document.createElement("div");
    imageWrap.className = "character-image-wrap";
    const initial = document.createElement("div");
    initial.className = "character-initial";
    initial.textContent = character.name[0] ?? "?";
    const image = document.createElement("img");
    image.alt = character.name;
    imageWrap.appendChild(initial);
    imageWrap.appendChild(image);
    imageJobs.push({ image, name: imageSearchName(character), ref: imageRef(character) });
    card.appendChild(imageWrap);

    const info = document.createElement("div");
    info.className = "character-info";
    const name = document.createElement("strong");
    name.textContent = character.name;
    const anime = document.createElement("span");
    anime.className = "muted small";
    anime.textContent = character.anime;
    info.appendChild(name);
    info.appendChild(anime);
    card.appendChild(info);

    if (interactive) {
      card.classList.add("interactive");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-pressed", String(eliminated.has(character.id)));
      const toggle = () => {
        if (eliminated.has(character.id)) {
          eliminated.delete(character.id);
        } else {
          if (remainingCharacters(state).length <= 1) {
            Room.toast("Il faut garder au moins un personnage.");
            return;
          }
          eliminated.add(character.id);
        }
        const isEliminated = eliminated.has(character.id);
        card.classList.toggle("eliminated", isEliminated);
        card.setAttribute("aria-pressed", String(isEliminated));
        maybeAutoGuess(state);
      };
      card.addEventListener("click", toggle);
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });
    }
    return card;
  }

  async function loadBoardImages(jobs, generation) {
    // `setCharacterImages` économise le quota AniList avec une seule requête.
    // Le repli individuel couvre un ancien anilist.js encore en cache et une
    // éventuelle requête groupée refusée : la grille ne reste jamais vide.
    await Promise.all(
      jobs.filter((job) => job.ref).map((job) =>
        Anilist.setImage(job.image, job.name, "character", job.ref)
      )
    );
    if (typeof Anilist.setCharacterImages === "function") {
      const searchable = jobs.filter((job) => !job.ref);
      await Anilist.setCharacterImages(searchable.map((job) => ({ img: job.image, name: job.name })));
    }
    // AniList limite les recherches par adresse IP : plusieurs joueurs d'un
    // même salon peuvent donc partager le quota. Les pauses couvrent le temps
    // de réouverture du quota sans recharger les portraits déjà trouvés.
    const retryDelays = [0, 3000, 12000, 30000, 60000];
    for (const delay of retryDelays) {
      if (generation !== imageLoadGeneration) return;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (generation !== imageLoadGeneration) return;
      const missing = jobs.filter((job) => job.image.classList.contains("hidden"));
      if (missing.length === 0) return;
      for (let index = 0; index < missing.length; index += 2) {
        if (generation !== imageLoadGeneration) return;
        await Promise.all(
          missing.slice(index, index + 2).map((job) =>
            Anilist.setImage(job.image, job.name, "character", job.ref)
          )
        );
      }
    }
  }

  function renderBoard(state, container, interactive) {
    const generation = ++imageLoadGeneration;
    container.innerHTML = "";
    const imageJobs = [];
    for (const character of state.board ?? []) {
      container.appendChild(makeCharacterCard(state, character, interactive, imageJobs));
    }
    void loadBoardImages(imageJobs, generation);
  }

  function showCharacter(container, character) {
    container.innerHTML = "";
    if (!character) return;
    const image = document.createElement("img");
    image.alt = character.name;
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = character.name;
    const anime = document.createElement("span");
    anime.className = "muted small";
    anime.textContent = character.anime;
    info.appendChild(name);
    info.appendChild(anime);
    container.appendChild(image);
    container.appendChild(info);
    Anilist.setImage(image, imageSearchName(character), "character", imageRef(character));
  }

  function questionLabel(count) {
    return `${count} question${count > 1 ? "s" : ""}`;
  }

  function renderPlay(state) {
    const newRound = renderedRound !== state.round;
    if (newRound) {
      cancelAutoGuess();
      renderedRound = state.round;
      eliminated = new Set();
    }
    const isPlayer = state.players.some((player) => player.id === Room.playerId);
    const isMyTurn = Room.playerId === state.currentTurnId;
    const activeName = playerName(state, state.currentTurnId);
    const opponent = state.players.find((player) => player.id !== Room.playerId);
    const target = state.board.find((card) => card.id === state.ownTargetId);
    el.roleKicker.textContent = Room.spectator ? "Mode spectateur" : isMyTurn ? "À toi de jouer" : `Au tour de ${activeName}`;
    el.roleTitle.textContent = Room.spectator
      ? `${activeName} pose une question`
      : isMyTurn
        ? `Pose une question à ${opponent?.name ?? "l'autre joueur"}`
        : `Réponds à ${activeName}`;
    el.roleHelp.textContent = isMyTurn
      ? "Pose une seule question, élimine tes suspects puis passe la main ou tente un personnage."
      : "Tu peux éliminer des cartes pendant l'attente, mais seul le joueur actif peut tenter une réponse.";
    el.turnCounts.textContent = state.players
      .map((player) => `${player.name} : ${questionLabel(state.questionCounts?.[player.id] ?? 0)}`)
      .join(" · ");
    el.endTurnBtn.classList.toggle("hidden", !isPlayer || Room.spectator);
    el.endTurnBtn.disabled = !isMyTurn;
    el.endTurnBtn.textContent = isMyTurn ? "J'ai posé ma question" : `En attente de ${activeName}`;
    el.secretCard.classList.toggle("hidden", !isPlayer || !target || Room.spectator);
    if (isPlayer && target && !Room.spectator) {
      el.secretName.textContent = target.name;
      el.secretAnime.textContent = target.anime;
      Anilist.setImage(el.secretImage, imageSearchName(target), "character", imageRef(target));
    }
    if (newRound) {
      renderBoard(state, el.board, isPlayer && !Room.spectator);
    }
    maybeAutoGuess(state);
  }

  function renderEnded(state) {
    cancelAutoGuess();
    const target = state.board.find((card) => card.id === state.revealedTargetId);
    const guessed = state.board.find((card) => card.id === state.guessedId);
    const correct = state.guessedId === state.revealedTargetId;
    const guessedBy = playerName(state, state.guessedById);
    const questionCount = state.questionCounts?.[state.guessedById] ?? 0;
    el.resultTitle.textContent = correct ? `${guessedBy} a trouvé en premier !` : `${playerName(state, state.winnerId)} remporte le point !`;
    el.resultDetail.textContent = correct
      ? `La bonne réponse était ${target?.name ?? "ce personnage"}, trouvée en ${questionLabel(questionCount)}.`
      : `${guessedBy} a tenté ${guessed?.name ?? "un autre personnage"} après ${questionLabel(questionCount)}.`;
    showCharacter(el.resultCharacter, target);
    renderBoard(state, el.endedBoard, false);
    const isHost = state.hostId === Room.playerId;
    const nextId = state.players.find((player) => player.id !== state.currentTurnId)?.id;
    const nextName = playerName(state, nextId);
    el.restartBtn.textContent = `Nouvelle manche : ${nextName} commence`;
    el.restartHint.textContent = `En attente que l'hôte lance la nouvelle manche…`;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);
    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
    } else if (state.phase === "play") {
      Room.showScreen("screen-play");
      renderPlay(state);
    } else {
      Room.showScreen("screen-ended");
      renderEnded(state);
    }
  }

  el.endTurnBtn.addEventListener("click", () => Room.send({ type: "endTurn" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "nextRound" }));

  Room.init({
    slug: "guesswho",
    minPlayers: 2,
    maxPlayers: 2,
    onStart: () => ({ guesserId: el.guesserSelect.value }),
    onState: (state) => {
      Sound.onChange("guesswho:phase", state.phase, "notify");
      render(state);
    },
  });
})();
