(() => {
  const $ = (id) => document.getElementById(id);
  const GAMES = [
    { slug: "undercover", label: "Undercover", icon: "🕵️", min: 3 },
    { slug: "hundred", label: "1 à 100", icon: "🔢", min: 3 },
    { slug: "bac", label: "Petit Bac", icon: "📝", min: 2 },
    { slug: "whoami", label: "Qui suis-je", icon: "🎭", min: 2, max: 5 },
    { slug: "detective", label: "Détective Anime", icon: "🔍", min: 2, max: 3 },
    { slug: "note", label: "Le jeu de la note", icon: "🔟", min: 3 },
    { slug: "bomb", label: "Alphabombe", icon: "💣", min: 2 },
    { slug: "codenames", label: "Codenames Anime", icon: "🗂️", min: 2, exact: [2, 4] },
    { slug: "sync", label: "Même longueur d'onde", icon: "🧠", min: 3, max: 10 },
    { slug: "guesswho", label: "Qui est-ce ?", icon: "🧑‍🤝‍🧑", min: 2, max: 2 },
  ];
  let ws = null;
  let code = null;
  let playerId = null;
  let state = null;
  let reconnectTimer = null;
  let toastTimer = null;

  const storageKey = (suffix) => `party:${code}:${suffix}`;
  const gameBySlug = (slug) => GAMES.find((game) => game.slug === slug);
  const supports = (game, count) => game.exact ? game.exact.includes(count) : count >= game.min && (!game.max || count <= game.max);

  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 4000);
  }

  function show(name) {
    for (const section of document.querySelectorAll("main > section")) section.classList.add("hidden");
    $(`screen-${name}`).classList.remove("hidden");
  }

  function send(payload) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function connect(roomCode, name, token) {
    code = roomCode.toUpperCase();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/party/${code}`);
    ws.addEventListener("open", () => send({ type: "join", name, token: token || undefined }));
    ws.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === "joined") {
        playerId = msg.playerId;
        localStorage.setItem(storageKey("token"), msg.token);
        localStorage.setItem(storageKey("name"), name);
        localStorage.setItem("party:lastName", name);
        history.replaceState(null, "", `/party/?room=${code}`);
        $("party-badge").textContent = code;
        $("party-badge").classList.remove("hidden");
      } else if (msg.type === "state") {
        state = msg.state;
        render();
      } else if (msg.type === "launchGame") {
        const host = msg.preserveHost ? "&host=1" : "";
        location.href = `/games/${msg.slug}/?room=${msg.code}&autojoin=${encodeURIComponent(name)}${host}&party=${code}`;
      } else if (msg.type === "error") toast(msg.message);
    });
    ws.addEventListener("close", () => {
      if (!playerId) return toast("Connexion impossible. Vérifie le code et réessaie.");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(
        code,
        localStorage.getItem(storageKey("name")) || name,
        localStorage.getItem(storageKey("token")),
      ), 2000);
    });
  }

  function renderPlayers(container, players, scores = false) {
    container.innerHTML = "";
    for (const player of players) {
      const row = document.createElement("div");
      row.className = `party-player${player.connected ? "" : " offline"}`;
      row.textContent = `${player.isHost ? "👑 " : ""}${player.name}${player.id === playerId ? " (toi)" : ""}`;
      if (scores) {
        const score = document.createElement("span");
        score.className = "party-player-score";
        score.textContent = `${player.score} pt${player.score > 1 ? "s" : ""}`;
        row.appendChild(score);
      }
      container.appendChild(row);
    }
  }

  function renderPicker(isHost) {
    const picker = $("game-picker");
    picker.innerHTML = "";
    const count = state.players.filter((player) => player.connected).length;
    for (const game of GAMES) {
      const button = document.createElement("button");
      button.className = "btn secondary party-game";
      button.disabled = !isHost || !supports(game, count) || state.playlist.length >= 10;
      button.innerHTML = `<span>${game.icon}</span><span>${game.label}</span><small>${game.exact ? game.exact.join(" ou ") : `${game.min}${game.max ? `-${game.max}` : "+"}`}</small>`;
      button.addEventListener("click", () => send({ type: "setPlaylist", playlist: [...state.playlist, game.slug] }));
      picker.appendChild(button);
    }
  }

  function renderPlaylist(isHost) {
    const list = $("playlist");
    list.innerHTML = "";
    state.playlist.forEach((slug, index) => {
      const game = gameBySlug(slug);
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.className = "playlist-label";
      label.textContent = `${game?.icon ?? "🎮"} ${game?.label ?? slug}`;
      item.appendChild(label);
      for (const [symbol, offset] of [["↑", -1], ["↓", 1]]) {
        const button = document.createElement("button");
        button.className = "btn secondary small playlist-control";
        button.textContent = symbol;
        button.disabled = !isHost || index + offset < 0 || index + offset >= state.playlist.length;
        button.addEventListener("click", () => {
          const playlist = [...state.playlist];
          [playlist[index], playlist[index + offset]] = [playlist[index + offset], playlist[index]];
          send({ type: "setPlaylist", playlist });
        });
        item.appendChild(button);
      }
      const remove = document.createElement("button");
      remove.className = "btn secondary small playlist-control";
      remove.textContent = "×";
      remove.disabled = !isHost;
      remove.addEventListener("click", () => send({ type: "setPlaylist", playlist: state.playlist.filter((_, i) => i !== index) }));
      item.appendChild(remove);
      list.appendChild(item);
    });
    $("playlist-empty").classList.toggle("hidden", state.playlist.length > 0);
  }

  function rankingRows(container, players, useRound = false) {
    container.innerHTML = "";
    players.forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "ranking-row";
      const points = useRound ? `+${player.partyPoints} pt${player.partyPoints > 1 ? "s" : ""}` : `${player.score} pt${player.score > 1 ? "s" : ""}`;
      row.innerHTML = `<span class="ranking-rank">#${index + 1}</span><strong></strong><span class="ranking-points">${points}</span>`;
      row.querySelector("strong").textContent = player.name;
      container.appendChild(row);
    });
  }

  function render() {
    $("party-badge").textContent = state.code;
    $("party-badge").classList.remove("hidden");
    const isHost = state.hostId === playerId;
    if (state.phase === "lobby") {
      show("lobby");
      $("lobby-code").textContent = state.code;
      renderPlayers($("players-list"), state.players);
      renderPicker(isHost);
      renderPlaylist(isHost);
      $("host-actions").classList.toggle("hidden", !isHost);
      $("waiting-host").classList.toggle("hidden", isHost);
      const count = state.players.filter((player) => player.connected).length;
      const compatible = state.playlist.every((slug) => supports(gameBySlug(slug), count));
      $("start-btn").disabled = count < 2 || !state.playlist.length || !compatible;
      $("start-hint").textContent = count < 2 ? "Il faut au moins 2 joueurs." : !compatible ? "Un jeu de la playlist n'est pas compatible avec ce nombre de joueurs." : "";
      return;
    }
    if (state.phase === "playing") {
      show("playing");
      const game = gameBySlug(state.currentGame?.slug);
      $("current-icon").textContent = game?.icon ?? "🎮";
      $("current-name").textContent = game?.label ?? "Jeu en cours";
      $("current-progress").textContent = `Jeu ${state.currentIndex + 1} sur ${state.playlist.length}`;
      return;
    }
    const overall = [...state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    if (state.phase === "summary") {
      show("summary");
      $("summary-progress").textContent = `${state.currentIndex + 1}/${state.playlist.length}`;
      rankingRows($("round-result"), state.lastResult, true);
      rankingRows($("overall-ranking"), overall);
      $("next-btn").textContent = state.currentIndex + 1 >= state.playlist.length ? "Voir le podium →" : "Jeu suivant →";
      $("next-btn").classList.toggle("hidden", !isHost);
      $("next-wait").classList.toggle("hidden", isHost);
      return;
    }
    show("ended");
    rankingRows($("final-ranking"), overall);
    const podium = $("podium");
    podium.innerHTML = "";
    const classes = ["first", "second", "third"];
    const medals = ["🥇", "🥈", "🥉"];
    overall.slice(0, 3).forEach((player, index) => {
      const step = document.createElement("div");
      step.className = `podium-step ${classes[index]}`;
      step.innerHTML = `<span class="podium-medal">${medals[index]}</span><strong></strong><div>${player.score} pts</div>`;
      step.querySelector("strong").textContent = player.name;
      podium.appendChild(step);
    });
    $("restart-btn").classList.toggle("hidden", !isHost);
  }

  $("create-btn").addEventListener("click", async () => {
    const name = $("name-input").value.trim();
    if (name.length < 4) return toast("Entre un pseudo d'au moins 4 caractères.");
    $("create-btn").disabled = true;
    try {
      const response = await fetch("/api/party/create", { method: "POST" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      connect(data.code, name);
    } catch { toast("Impossible de créer la soirée."); }
    finally { $("create-btn").disabled = false; }
  });

  $("join-btn").addEventListener("click", async () => {
    const name = $("name-input").value.trim();
    const roomCode = $("code-input").value.trim().toUpperCase();
    if (name.length < 4) return toast("Entre un pseudo d'au moins 4 caractères.");
    if (!roomCode) return toast("Entre le code de la soirée.");
    try {
      const response = await fetch(`/api/party/exists/${roomCode}`);
      if (response.ok && !(await response.json()).exists) return toast("Cette soirée n'existe pas.");
    } catch { /* La WebSocket donnera l'erreur utile. */ }
    connect(roomCode, name, localStorage.getItem(`party:${roomCode}:token`));
  });

  $("code-input").addEventListener("keydown", (event) => { if (event.key === "Enter") $("join-btn").click(); });
  $("copy-btn").addEventListener("click", async () => {
    const link = `${location.origin}/party/?room=${code}`;
    try { await navigator.clipboard.writeText(link); toast("Invitation copiée !"); }
    catch { prompt("Copie ce lien :", link); }
  });
  $("random-btn").addEventListener("click", () => {
    const count = state.players.filter((player) => player.connected).length;
    const compatible = GAMES.filter((game) => supports(game, count)).sort(() => Math.random() - .5);
    send({ type: "setPlaylist", playlist: compatible.slice(0, 3).map((game) => game.slug) });
  });
  $("start-btn").addEventListener("click", () => send({ type: "start" }));
  $("next-btn").addEventListener("click", () => send({ type: "nextGame" }));
  $("restart-btn").addEventListener("click", () => send({ type: "restart" }));
  $("rejoin-btn").addEventListener("click", () => {
    if (!state.currentGame) return;
    const name = localStorage.getItem(storageKey("name")) || "Joueur";
    const host = state.hostId === playerId ? "&host=1" : "";
    location.href = `/games/${state.currentGame.slug}/?room=${state.currentGame.code}&autojoin=${encodeURIComponent(name)}${host}&party=${code}`;
  });

  const params = new URLSearchParams(location.search);
  const urlCode = params.get("room")?.toUpperCase();
  const lastName = localStorage.getItem("party:lastName");
  if (lastName) $("name-input").value = lastName;
  if (urlCode) {
    $("code-input").value = urlCode;
    const token = localStorage.getItem(`party:${urlCode}:token`);
    const name = localStorage.getItem(`party:${urlCode}:name`);
    if (token && name) connect(urlCode, name, token);
  }
})();
