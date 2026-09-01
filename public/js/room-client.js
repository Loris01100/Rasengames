// Shared room plumbing for every game's app.js (no bundler, so one global object).
//
// Owns everything that was copy-pasted identically in the app.js files:
// the WebSocket + reconnection, the join/create screen, localStorage identity,
// the room badge, the "changer de jeu" header, the toast, the player rows and
// the lobby. Each app.js keeps only its own game screens and messages.
//
// Usage, at the bottom of a game's app.js:
//   Room.init({ slug: "whoami", minPlayers: 2, maxPlayers: 5, onState: render });
// Games with lobby settings also pass onStart() -> extra fields for the "start"
// message, or a falsy value to refuse (see bac).
const Room = (() => {
  const $ = (id) => document.getElementById(id);

  // Gardé en phase avec MIN_NAME_LENGTH côté serveur (src/games/*/room.ts).
  const MIN_NAME_LENGTH = 4;
  const NAME_TOO_SHORT = `Entre un pseudo d'au moins ${MIN_NAME_LENGTH} caractères.`;

  const GAMES = [
    { slug: "undercover", label: "Undercover" },
    { slug: "hundred", label: "1 à 100" },
    { slug: "bac", label: "Petit Bac" },
    { slug: "whoami", label: "Qui suis-je" },
    { slug: "detective", label: "Détective Anime" },
    { slug: "note", label: "Le jeu de la note" },
    { slug: "bomb", label: "Alphabombe" },
    { slug: "codenames", label: "Codenames Anime" },
    { slug: "sync", label: "Même longueur d'onde" },
    { slug: "guesswho", label: "Qui est-ce ?" },
  ];

  const el = {};
  let cfg = null;
  let ws = null;
  let reconnectTimer = null;
  let toastTimer = null;
  let wantPublic = false;
  let reconnectDelay = 2000;

  const api = {
    playerId: null,
    code: null,
    state: null,
    spectator: false,
  };

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 4000);
  }

  // Le lien d'invitation n'a rien de nouveau côté serveur : ?room=CODE est
  // déjà lu au chargement (voir readUrl), il suffisait de le donner en un clic
  // plutôt que de dicter le code à l'oral.
  function inviteLink() {
    return `${location.origin}/games/${cfg.slug}/?room=${api.code}`;
  }

  async function copyInvite() {
    const link = inviteLink();
    try {
      await navigator.clipboard.writeText(link);
      toast("Lien d'invitation copié !");
    } catch {
      // Pas de presse-papier (http hors localhost, vieux navigateur) : au moins
      // le lien est affiché et sélectionnable.
      prompt("Copie ce lien et envoie-le :", link);
    }
  }

  function storageKey(code, suffix) {
    return `${cfg.slug}:${code}:${suffix}`;
  }

  // Deux clés par salon visité, plus jamais relues une fois la partie finie :
  // on ne garde que les dix derniers codes par jeu.
  function rememberRoom(code) {
    const key = `${cfg.slug}:rooms`;
    let codes = [];
    try {
      codes = JSON.parse(localStorage.getItem(key)) ?? [];
    } catch {
      codes = [];
    }
    codes = [code, ...codes.filter((c) => c !== code)];
    for (const old of codes.slice(10)) {
      localStorage.removeItem(storageKey(old, "token"));
      localStorage.removeItem(storageKey(old, "name"));
      localStorage.removeItem(storageKey(old, "spectator"));
    }
    localStorage.setItem(key, JSON.stringify(codes.slice(0, 10)));
  }

  // Le salon n'existe que si quelqu'un l'a créé : le DO, lui, naît à la
  // demande. En panne de sonde on laisse passer — mieux vaut un salon fantôme
  // qu'un joueur bloqué à la porte.
  async function roomExists(code) {
    try {
      const res = await fetch(`/api/${cfg.slug}/exists/${code}`);
      if (!res.ok) return true;
      const { exists } = await res.json();
      return exists;
    } catch {
      return true;
    }
  }

  function send(payload) {
    if (api.spectator && payload.type !== "join") {
      toast("Le mode spectateur est en lecture seule.");
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function connect(code, name, token, spectator = false, preserveHost = false) {
    api.code = code.toUpperCase();
    api.spectator = spectator;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/${cfg.slug}/${api.code}`);

    ws.addEventListener("open", () => {
      send({
        type: "join",
        name,
        token: token || undefined,
        spectator: spectator || undefined,
        preserveHost: preserveHost || undefined,
      });
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      handleServerMessage(msg);
    });

    ws.addEventListener("close", () => {
      if (api.playerId) {
        toast("Connexion perdue, reconnexion...");
        scheduleReconnect();
      } else {
        // Fermée avant même d'être entré : serveur injoignable ou WebSocket
        // bloqué. Sans ce toast, le clic sur "Rejoindre" ne répondait rien.
        toast("Connexion impossible pour le moment. Réessaie dans un instant.");
      }
    });

    ws.addEventListener("error", () => ws.close());
  }

  // Le backoff ne doit pas faire attendre 30 s celui qui revient : un onglet
  // remis au premier plan (mobile qui coupe le WebSocket en arrière-plan) ou
  // un réseau qui revient relance tout de suite.
  function reconnectNow() {
    if (!api.playerId || (ws && ws.readyState === WebSocket.OPEN)) return;
    reconnectDelay = 2000;
    clearTimeout(reconnectTimer);
    const token = localStorage.getItem(storageKey(api.code, "token"));
    const name = localStorage.getItem(storageKey(api.code, "name"));
    if (api.code && name && (api.spectator || token)) connect(api.code, name, token, api.spectator);
  }

  // Backoff : un onglet oublié en arrière-plan (ou un salon supprimé) tapait
  // toutes les 2 s indéfiniment. Remis à zéro dès qu'une connexion aboutit.
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      const token = localStorage.getItem(storageKey(api.code, "token"));
      const name = localStorage.getItem(storageKey(api.code, "name"));
      if (api.code && name && (api.spectator || token)) connect(api.code, name, token, api.spectator);
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }

  function handleServerMessage(msg) {
    if (msg.type === "joined") {
      api.playerId = msg.playerId;
      api.spectator = msg.spectator === true;
      reconnectDelay = 2000;
      const name = el.nameInput.value.trim() || "Joueur";
      if (api.spectator) {
        localStorage.removeItem(storageKey(api.code, "token"));
        localStorage.setItem(storageKey(api.code, "spectator"), "1");
      } else {
        localStorage.setItem(storageKey(api.code, "token"), msg.token);
        localStorage.removeItem(storageKey(api.code, "spectator"));
      }
      localStorage.setItem(storageKey(api.code, "name"), name);
      localStorage.setItem(`${cfg.slug}:lastName`, name);
      rememberRoom(api.code);
      const params = new URLSearchParams(location.search);
      params.set("room", api.code);
      if (api.spectator) params.set("spectator", "1");
      else params.delete("spectator");
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
      el.roomBadge.textContent = api.code;
      el.roomBadge.classList.remove("hidden");
      if (wantPublic) {
        wantPublic = false;
        send({ type: "setVisibility", visibility: "public" });
      }
    } else if (msg.type === "state") {
      const previous = api.state;
      api.state = msg.state;
      renderWaitingBadge(msg.state);
      renderSpectators(msg.state);
      renderBackToLobby(msg.state);
      // Arrivé en cours de partie : le serveur ne nous envoie rien de la manche
      // en cours (on n'y est pas), donc le jeu n'a rien à rendre.
      if ((msg.state.waiting ?? []).some((w) => w.id === api.playerId)) {
        showWaitingScreen();
        return;
      }
      cfg.onState(msg.state, previous);
      applySpectatorMode();
    } else if (msg.type === "switchGame") {
      const name = localStorage.getItem(storageKey(api.code, "name")) || "Joueur";
      const spectator = api.spectator ? "&spectator=1" : "";
      const preserveHost = msg.preserveHost ? "&host=1" : "";
      location.href = `/games/${msg.slug}/?room=${msg.code}&autojoin=${encodeURIComponent(name)}${spectator}${preserveHost}`;
    } else if (msg.type === "kicked") {
      // Token dropped so the auto-reconnect on the next page load doesn't
      // silently walk back into the salon we were just thrown out of.
      localStorage.removeItem(storageKey(api.code, "token"));
      api.playerId = null;
      alert("Tu as été exclu du salon par l'hôte.");
      location.href = "/";
    } else if (msg.type === "error") {
      toast(msg.message);
    }
  }

  // ---- shared rendering ----

  // Créé à la volée : aucun jeu n'a besoin de connaître cet écran, et les
  // index.html n'ont pas à porter une section identique.
  let waitingScreen = null;
  function showWaitingScreen() {
    if (!waitingScreen) {
      waitingScreen = document.createElement("section");
      waitingScreen.id = "screen-waiting";
      waitingScreen.className = "card narrow";
      const title = document.createElement("h2");
      title.textContent = "Une partie est en cours";
      const hint = document.createElement("p");
      hint.className = "muted";
      hint.textContent =
        "Tu gardes ta place : tu entreras automatiquement dans le salon à la fin de la manche, sans rien avoir à refaire.";
      waitingScreen.appendChild(title);
      waitingScreen.appendChild(hint);
      const anchor = $("screen-lobby");
      (anchor?.parentNode ?? document.body).appendChild(waitingScreen);
    }
    showScreen(waitingScreen);
    waitingScreen.classList.remove("hidden");
  }

  // Sortie de secours de l'hôte, valable pour tous les jeux (tous acceptent
  // "restart" depuis n'importe quelle phase sauf le lobby) : un joueur parti
  // en pleine manche sans revenir peut laisser une phase en attente de lui.
  function renderBackToLobby(state) {
    const show = state.phase !== "lobby" && state.hostId === api.playerId;
    el.backToLobbyBtn.classList.toggle("hidden", !show);
  }

  // Sinon l'hôte n'a aucune raison de relancer une manche : il ne sait pas
  // qu'on attend derrière la porte.
  function renderWaitingBadge(state) {
    const count = (state.waiting ?? []).filter((w) => w.id !== api.playerId).length;
    el.waitingBadge.textContent = count ? `${count} en attente` : "";
    el.waitingBadge.classList.toggle("hidden", count === 0);
  }

  function renderSpectators(state) {
    const count = state.spectatorCount ?? 0;
    el.spectatorBadge.textContent = api.spectator
      ? `👁 Spectateur${count > 1 ? ` · ${count}` : ""}`
      : count
        ? `👁 ${count} spectateur${count > 1 ? "s" : ""}`
        : "";
    el.spectatorBadge.classList.toggle("hidden", count === 0);
  }

  function applySpectatorMode() {
    document.body.classList.toggle("spectator-mode", api.spectator);
    if (!api.spectator) return;
    for (const control of document.querySelectorAll("main button, main input, main textarea, main select")) {
      control.disabled = true;
    }
  }

  // Les règles vivent dans un <template id="rules"> de la page du jeu, et le
  // <dialog> natif fournit le reste gratuitement : fond assombri, fermeture à
  // Échap, focus piégé. Il se peint dans la top layer, donc il échappe aussi
  // au piège d'empilement des .card (cf. suggest.js) sans classe de contournement.
  function initRules() {
    const template = $("rules");
    if (!template || !template.content) return;

    const dialog = document.createElement("dialog");
    dialog.id = "rules-dialog";
    dialog.className = "rules-dialog";
    dialog.appendChild(template.content.cloneNode(true));

    const close = document.createElement("button");
    close.className = "btn secondary small";
    close.textContent = "Fermer";
    close.addEventListener("click", () => dialog.close());
    dialog.appendChild(close);
    // Un clic dans le fond compte comme un clic sur le <dialog> lui-même.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    document.body.appendChild(dialog);

    const open = document.createElement("button");
    open.className = "btn secondary small";
    open.id = "rules-btn";
    open.textContent = "Règles";
    open.addEventListener("click", () => dialog.showModal());
    el.roomBadge.parentNode.appendChild(open);
  }

  // Every game screen is a <section id="screen-*">, so no per-game list needed.
  function showScreen(screen) {
    const target = typeof screen === "string" ? $(screen) : screen;
    for (const s of document.querySelectorAll("section[id^='screen-']")) {
      s.classList.toggle("hidden", s !== target);
    }
  }

  // `decorate(row, player)` is where a game hangs its own badges (roles, scores).
  function playerRow(p, decorate) {
    const row = document.createElement("div");
    row.className = "player-row";
    if (p.id === api.playerId) row.classList.add("you");
    if (p.alive === false) row.classList.add("dead");
    if (p.connected === false) row.classList.add("offline");

    row.appendChild(makeAvatar(p.name));

    const dot = document.createElement("span");
    dot.className = "dot";
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.name + (p.id === api.playerId ? " (toi)" : "");
    row.appendChild(name);

    if (p.isHost) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Hôte";
      row.appendChild(tag);
    }

    const points = api.state?.scores?.[p.id];
    if (points) {
      const tag = document.createElement("span");
      tag.className = "tag score-tag";
      tag.textContent = `${points} pt${points > 1 ? "s" : ""}`;
      row.appendChild(tag);
    }

    if (decorate) decorate(row, p);

    if (
      api.state &&
      api.state.phase === "lobby" &&
      api.state.hostId === api.playerId &&
      p.id !== api.playerId
    ) {
      // Les deux boutons de l'hôte partagent le même conteneur : c'est lui qui
      // porte le `margin-left: auto` qui les colle à droite de la ligne.
      const actions = document.createElement("div");
      actions.className = "row-actions";

      if (p.connected !== false) {
        const promote = document.createElement("button");
        promote.className = "btn secondary small";
        promote.textContent = "Passer hôte";
        promote.addEventListener("click", () => {
          if (confirm(`Donner le rôle d'hôte à ${p.name} ? Tu ne pourras plus lancer la partie.`)) {
            send({ type: "transferHost", playerId: p.id });
          }
        });
        actions.appendChild(promote);
      }

      const kick = document.createElement("button");
      kick.className = "btn secondary small";
      kick.textContent = "Exclure";
      kick.addEventListener("click", () => {
        if (confirm(`Exclure ${p.name} du salon ?`)) send({ type: "kick", playerId: p.id });
      });
      actions.appendChild(kick);

      row.appendChild(actions);
    }

    return row;
  }

  // Games with extra lobby controls (settings, selects) render them on top of
  // this, after calling it.
  function renderLobby(state, decorate) {
    el.lobbyCode.textContent = state.code;
    el.roomBadge.textContent = state.code;
    el.roomBadge.classList.remove("hidden");

    el.playersList.innerHTML = "";
    for (const p of state.players) el.playersList.appendChild(playerRow(p, decorate));

    const isHost = state.hostId === api.playerId;
    const connected = state.players.filter((p) => p.connected).length;
    const { minPlayers: min, maxPlayers: max } = cfg;

    el.hostSettings.classList.toggle("hidden", !isHost);
    el.waitingHost.classList.toggle("hidden", isHost);
    if (!isHost) return;

    el.publicToggle.checked = state.visibility === "public";
    const canStart = connected >= min && (!max || connected <= max);
    el.startBtn.disabled = !canStart;
    el.startHint.textContent = canStart
      ? ""
      : `Il faut ${max ? `entre ${min} et ${max}` : `au moins ${min}`} joueurs connectés (actuellement ${connected}).`;
  }

  // ---- boot ----

  function init(config) {
    cfg = config;

    Object.assign(el, {
      toast: $("toast"),
      roomBadge: $("room-badge"),
      switchGame: $("switch-game"),
      switchGameSelect: $("switch-game-select"),
      switchGameBtn: $("switch-game-btn"),
      nameInput: $("name-input"),
      codeInput: $("code-input"),
      createBtn: $("create-btn"),
      createPublic: $("create-public"),
      joinBtn: $("join-btn"),
      lobbyCode: $("lobby-code"),
      playersList: $("players-list"),
      hostSettings: $("host-settings"),
      publicToggle: $("public-toggle"),
      startBtn: $("start-btn"),
      startHint: $("start-hint"),
      waitingHost: $("waiting-host"),
    });

    el.waitingBadge = document.createElement("span");
    el.waitingBadge.className = "badge hidden";
    el.waitingBadge.id = "waiting-badge";
    el.roomBadge.parentNode.appendChild(el.waitingBadge);

    el.spectatorBadge = document.createElement("span");
    el.spectatorBadge.className = "badge spectator-badge hidden";
    el.spectatorBadge.id = "spectator-badge";
    el.roomBadge.parentNode.appendChild(el.spectatorBadge);

    el.backToLobbyBtn = document.createElement("button");
    el.backToLobbyBtn.className = "btn secondary small hidden";
    el.backToLobbyBtn.id = "back-to-lobby-btn";
    el.backToLobbyBtn.textContent = "Revenir au lobby";
    el.backToLobbyBtn.addEventListener("click", () => {
      if (confirm("Arrêter la manche en cours et revenir au lobby ?")) send({ type: "restart" });
    });
    el.roomBadge.parentNode.appendChild(el.backToLobbyBtn);

    el.inviteBtn = document.createElement("button");
    el.inviteBtn.className = "btn secondary small";
    el.inviteBtn.id = "invite-btn";
    el.inviteBtn.textContent = "Copier le lien";
    el.inviteBtn.addEventListener("click", copyInvite);
    el.lobbyCode.parentNode.appendChild(el.inviteBtn);

    el.spectateBtn = document.createElement("button");
    el.spectateBtn.className = "btn secondary spectator-join-btn";
    el.spectateBtn.id = "spectate-btn";
    el.spectateBtn.textContent = "👁 Regarder en spectateur";
    el.joinBtn.parentNode.parentNode.appendChild(el.spectateBtn);

    initRules();

    for (const g of GAMES) {
      if (g.slug === cfg.slug) continue;
      const opt = document.createElement("option");
      opt.value = g.slug;
      opt.textContent = g.label;
      el.switchGameSelect.appendChild(opt);
    }

    el.createBtn.addEventListener("click", async () => {
      const name = el.nameInput.value.trim();
      if (name.length < MIN_NAME_LENGTH) return toast(NAME_TOO_SHORT);
      el.createBtn.disabled = true;
      wantPublic = el.createPublic.checked;
      try {
        const res = await fetch(`/api/${cfg.slug}/create`, { method: "POST" });
        if (!res.ok) throw new Error("Erreur serveur");
        const { code } = await res.json();
        connect(code, name);
      } catch {
        toast("Impossible de créer un salon, réessaie.");
      } finally {
        el.createBtn.disabled = false;
      }
    });

    el.joinBtn.addEventListener("click", async () => {
      const name = el.nameInput.value.trim();
      const code = el.codeInput.value.trim().toUpperCase();
      if (name.length < MIN_NAME_LENGTH) return toast(NAME_TOO_SHORT);
      if (!code) return toast("Entre un code de salon.");
      el.joinBtn.disabled = true;
      const exists = await roomExists(code);
      el.joinBtn.disabled = false;
      if (!exists) return toast("Aucun salon avec ce code. Vérifie les lettres.");
      connect(code, name);
    });

    el.spectateBtn.addEventListener("click", async () => {
      const name = el.nameInput.value.trim();
      const code = el.codeInput.value.trim().toUpperCase();
      if (name.length < MIN_NAME_LENGTH) return toast(NAME_TOO_SHORT);
      if (!code) return toast("Entre un code de salon.");
      el.spectateBtn.disabled = true;
      const exists = await roomExists(code);
      el.spectateBtn.disabled = false;
      if (!exists) return toast("Aucun salon avec ce code. Vérifie les lettres.");
      connect(code, name, undefined, true);
    });

    el.codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.joinBtn.click();
    });

    el.publicToggle.addEventListener("change", () =>
      send({ type: "setVisibility", visibility: el.publicToggle.checked ? "public" : "private" })
    );

    // Games with lobby settings supply them (or refuse) via onStart().
    el.startBtn.addEventListener("click", () => {
      const extra = cfg.onStart ? cfg.onStart() : {};
      if (!extra) return;
      send({ type: "start", ...extra });
    });

    el.switchGameBtn.addEventListener("click", () => {
      const slug = el.switchGameSelect.value;
      if (!slug) return;
      const label = GAMES.find((g) => g.slug === slug)?.label ?? slug;
      if (!confirm(`Changer de jeu pour "${label}" ? Tout le monde du salon sera redirigé.`)) return;
      send({ type: "switchGame", slug });
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reconnectNow();
    });
    window.addEventListener("online", reconnectNow);

    const params = new URLSearchParams(location.search);
    const codeFromUrl = params.get("room");
    const lastName = localStorage.getItem(`${cfg.slug}:lastName`);
    if (lastName) el.nameInput.value = lastName;
    if (!codeFromUrl) return;

    const code = codeFromUrl.toUpperCase();
    el.codeInput.value = code;
    const token = localStorage.getItem(storageKey(code, "token"));
    const savedName = localStorage.getItem(storageKey(code, "name"));
    const spectatorFromUrl = params.get("spectator") === "1";
    if (spectatorFromUrl && savedName) {
      el.nameInput.value = savedName;
      connect(code, savedName, undefined, true);
      return;
    }
    if (token && savedName) {
      el.nameInput.value = savedName;
      connect(code, savedName, token);
      return;
    }

    const autojoinName = params.get("autojoin");
    if (autojoinName) {
      el.nameInput.value = autojoinName;
      connect(code, autojoinName, undefined, spectatorFromUrl, params.get("host") === "1");
    }
  }

  // Grille "lettres autorisées" du lobby (bombe, petit bac) : remplit le
  // conteneur de 26 cases cochées et rend le lecteur de la sélection.
  function letterPicker(container) {
    container.innerHTML = "";
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const label = document.createElement("label");
      label.className = "letter-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = letter;
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(letter));
      container.appendChild(label);
    }
    return () => Array.from(container.querySelectorAll("input:checked"), (i) => i.value);
  }

  return Object.assign(api, { init, send, toast, showScreen, playerRow, renderLobby, showSwitchGame, letterPicker });

  function showSwitchGame(visible) {
    el.switchGame.classList.toggle("hidden", !visible);
  }
})();
