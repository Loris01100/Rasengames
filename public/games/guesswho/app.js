(() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    guesserSelect: $("guesser-select"),
    roleKicker: $("role-kicker"),
    roleTitle: $("role-title"),
    roleHelp: $("role-help"),
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

  function playerName(state, id) {
    return state.players.find((player) => player.id === id)?.name ?? "Un joueur";
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
    if (state.targetId === character.id) card.classList.add("target");
    if (state.guessedId === character.id && state.guessedId !== state.targetId) card.classList.add("guessed-wrong");

    const imageWrap = document.createElement("div");
    imageWrap.className = "character-image-wrap";
    const initial = document.createElement("div");
    initial.className = "character-initial";
    initial.textContent = character.name[0] ?? "?";
    const image = document.createElement("img");
    image.alt = character.name;
    imageWrap.appendChild(initial);
    imageWrap.appendChild(image);
    imageJobs.push({ image, name: imageSearchName(character) });
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
      const actions = document.createElement("div");
      actions.className = "character-actions";
      const eliminate = document.createElement("button");
      eliminate.className = "btn secondary small eliminate-btn";
      eliminate.textContent = eliminated.has(character.id) ? "↩" : "✕";
      eliminate.title = eliminated.has(character.id) ? "Remettre cette carte" : "Éliminer cette carte";
      eliminate.setAttribute("aria-label", eliminate.title);
      eliminate.addEventListener("click", () => {
        if (eliminated.has(character.id)) eliminated.delete(character.id);
        else eliminated.add(character.id);
        const isEliminated = eliminated.has(character.id);
        card.classList.toggle("eliminated", isEliminated);
        eliminate.textContent = isEliminated ? "↩" : "✕";
        eliminate.title = isEliminated ? "Remettre cette carte" : "Éliminer cette carte";
        eliminate.setAttribute("aria-label", eliminate.title);
        guess.disabled = isEliminated;
      });
      const guess = document.createElement("button");
      guess.className = "btn small";
      guess.textContent = "✓";
      guess.title = `Tenter ${character.name}`;
      guess.setAttribute("aria-label", guess.title);
      guess.disabled = eliminated.has(character.id);
      guess.addEventListener("click", () => {
        if (confirm(`Tu tentes ${character.name} ? La réponse sera définitive.`)) {
          Room.send({ type: "guess", characterId: character.id });
        }
      });
      actions.appendChild(eliminate);
      actions.appendChild(guess);
      card.appendChild(actions);
    }
    return card;
  }

  async function loadBoardImages(jobs, generation) {
    // `setCharacterImages` économise le quota AniList avec une seule requête.
    // Le repli individuel couvre un ancien anilist.js encore en cache et une
    // éventuelle requête groupée refusée : la grille ne reste jamais vide.
    if (typeof Anilist.setCharacterImages === "function") {
      await Anilist.setCharacterImages(jobs.map((job) => ({ img: job.image, name: job.name })));
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
            Anilist.setImage(job.image, job.name, "character")
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
    Anilist.setImage(image, imageSearchName(character), "character");
  }

  function renderPlay(state) {
    if (renderedRound !== state.round) {
      renderedRound = state.round;
      eliminated = new Set();
    }
    const isGuesser = Room.playerId === state.guesserId;
    const isClueGiver = Room.playerId === state.clueGiverId;
    const target = state.board.find((card) => card.id === state.targetId);
    el.roleKicker.textContent = Room.spectator ? "Mode spectateur" : isGuesser ? "Tu devines" : "Tu fais deviner";
    el.roleTitle.textContent = isGuesser
      ? `Interroge ${playerName(state, state.clueGiverId)}`
      : isClueGiver
        ? `Fais deviner à ${playerName(state, state.guesserId)}`
        : `${playerName(state, state.guesserId)} cherche le personnage`;
    el.roleHelp.textContent = isGuesser
      ? "Pose des questions à voix haute. Élimine les cartes impossibles, puis tente ta réponse."
      : isClueGiver
        ? "Garde le personnage secret et réponds seulement par oui ou non."
        : "Le personnage secret reste caché jusqu'au résultat.";
    el.secretCard.classList.toggle("hidden", !isClueGiver || !target);
    if (isClueGiver && target) {
      el.secretName.textContent = target.name;
      el.secretAnime.textContent = target.anime;
      Anilist.setImage(el.secretImage, imageSearchName(target), "character");
    }
    renderBoard(state, el.board, isGuesser && !Room.spectator);
  }

  function renderEnded(state) {
    const target = state.board.find((card) => card.id === state.targetId);
    const guessed = state.board.find((card) => card.id === state.guessedId);
    const correct = state.guessedId === state.targetId;
    el.resultTitle.textContent = correct ? `${playerName(state, state.guesserId)} a trouvé !` : `${playerName(state, state.clueGiverId)} remporte le point !`;
    el.resultDetail.textContent = correct
      ? `La bonne réponse était bien ${target?.name ?? "ce personnage"}.`
      : `${playerName(state, state.guesserId)} avait choisi ${guessed?.name ?? "un autre personnage"}.`;
    showCharacter(el.resultCharacter, target);
    renderBoard(state, el.endedBoard, false);
    const isHost = state.hostId === Room.playerId;
    const nextName = playerName(state, state.clueGiverId);
    el.restartBtn.textContent = `Manche suivante : ${nextName} devine`;
    el.restartHint.textContent = `En attente que l'hôte lance la manche de ${nextName}…`;
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
