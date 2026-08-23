(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    statusLine: $("status-line"),
    roster: $("roster"),
    countersLine: $("counters-line"),
    gameLive: $("game-live"),
    clueDisplay: $("clue-display"),
    clueText: $("clue-text"),
    clueForm: $("clue-form"),
    clueInput: $("clue-input"),
    clueNumber: $("clue-number"),
    clueSubmit: $("clue-submit"),
    passBtn: $("pass-btn"),
    turnHint: $("turn-hint"),
    keyToggle: $("key-toggle"),
    boardGrid: $("board-grid"),
    endPanel: $("end-panel"),
    endBanner: $("end-banner"),
    endIcon: $("end-icon"),
    endTitle: $("end-title"),
    endSummary: $("end-summary"),
    endRecap: $("end-recap"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),

    rolesSetup: $("roles-setup"),
    rolesList: $("roles-list"),
    rolesShuffle: $("roles-shuffle"),

    wordFilterOpen: $("word-filter-open"),
    wordFilterSummary: $("word-filter-summary"),
    wordFilterDialog: $("word-filter-dialog"),
    wordFilterSearch: $("word-filter-search"),
    wordFilterCount: $("word-filter-count"),
    wordFilterCheckAll: $("word-filter-check-all"),
    wordFilterUncheckAll: $("word-filter-uncheck-all"),
    wordFilterList: $("word-filter-list"),
    wordFilterEmpty: $("word-filter-empty"),
    wordFilterCancel: $("word-filter-cancel"),
    wordFilterSave: $("word-filter-save"),
  };

  // N'affecte que les cases pas encore révélées : celles-ci restent la seule
  // info vraiment privée (les cases révélées sont publiques pour tout le monde).
  let keyHidden = false;

  // Doit rester égal à BOARD_SIZE côté serveur (src/games/codenames/logic.ts) :
  // en dessous, un plateau de 25 mots ne peut plus se former.
  const MIN_ACTIVE_WORDS = 25;

  function nameOf(state, id) {
    return state.players.find((p) => p.id === id)?.name ?? "?";
  }

  function isMyClueTurn(state) {
    if (state.phase !== "playing" || state.currentClue || !state.you) return false;
    if (state.mode === "duet") return state.you.seat === state.duetTurnSeat;
    if (state.mode === "teams") return state.you.role === "spymaster" && state.you.team === state.turnTeam;
    return false;
  }

  function isMyGuessTurn(state) {
    if (state.phase !== "playing" || !state.currentClue || !state.you) return false;
    if (state.mode === "duet") {
      const guesserSeat = state.duetTurnSeat === "A" ? "B" : "A";
      return state.you.seat === guesserSeat;
    }
    if (state.mode === "teams") return state.you.role === "operative" && state.you.team === state.turnTeam;
    return false;
  }

  function isWin(state) {
    if (state.mode === "duet") return state.winner === "coop-win";
    return !!state.you && state.you.team === state.winner;
  }

  // ---- sons ----

  function playSounds(state) {
    const myTurn = isMyClueTurn(state) || isMyGuessTurn(state);
    Sound.onChange("cn:turn", `${state.duetTurnSeat}:${state.turnTeam}:${!!state.currentClue}`, myTurn ? "turn" : null);
    Sound.onChange("cn:winner", state.winner, state.winner ? (isWin(state) ? "win" : "lose") : null);
  }

  // ---- rendering ----

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      Room.renderLobby(state);
      renderRolesSetup(state);
      renderWordFilterSummary(state);
      return;
    }

    Room.showScreen("screen-game");
    const ended = state.phase === "ended";
    el.gameLive.classList.toggle("hidden", ended);
    renderStatus(state);
    renderRoster(state);
    renderClue(state);
    renderBoard(state);
    renderEnd(state);
  }

  function counterChip(text) {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = text;
    return span;
  }

  function renderStatus(state) {
    const ended = state.phase === "ended";
    el.countersLine.innerHTML = "";
    if (state.mode === "duet") {
      if (ended) {
        el.statusLine.textContent = "Partie terminée.";
      } else {
        const giver = state.players.find((p) => p.seat === state.duetTurnSeat);
        el.statusLine.textContent = state.currentClue
          ? `${nameOf(state, giver?.id)} a donné un indice, à l'autre de deviner.`
          : `Au tour de ${nameOf(state, giver?.id)} de donner un indice.`;
      }
      el.countersLine.appendChild(counterChip(`❤️ ${state.duetErrors}/${state.duetErrorsMax} erreurs restantes`));
      el.countersLine.appendChild(counterChip(`🎯 ${state.duetAgentsFound}/${state.duetAgentsTotal} agents trouvés`));
    } else if (state.mode === "teams") {
      if (ended) {
        el.statusLine.textContent = "Partie terminée.";
      } else {
        const spymaster = state.players.find((p) => p.team === state.turnTeam && p.role === "spymaster");
        const teamLabel = state.turnTeam === "A" ? "Équipe A" : "Équipe B";
        el.statusLine.textContent = state.currentClue
          ? `${teamLabel} devine (indice de ${nameOf(state, spymaster?.id)}).`
          : `${teamLabel} au tour : ${nameOf(state, spymaster?.id)} donne un indice.`;
      }
      el.countersLine.appendChild(counterChip(`🟢 Équipe A : ${state.remainingA} restants`));
      el.countersLine.appendChild(counterChip(`🔵 Équipe B : ${state.remainingB} restants`));
    }
  }

  function crown() {
    const span = document.createElement("span");
    span.className = "roster-crown";
    span.textContent = "🏆";
    return span;
  }

  // Qui joue avec qui, toujours visible (y compris à la fin) : la question
  // qu'on se pose le plus souvent en pleine manche.
  function renderRoster(state) {
    el.roster.innerHTML = "";
    const ended = state.phase === "ended";
    const you = state.you;

    if (state.mode === "duet") {
      for (const p of state.players) {
        const isYou = p.id === Room.playerId;
        const chip = document.createElement("span");
        chip.className = `roster-chip seat-${p.seat ?? ""}${isYou ? " you" : " mate"}`;
        chip.textContent = `${p.name}${isYou ? " (toi)" : " 🤝"} · Siège ${p.seat ?? "?"}`;
        if (ended && isWin(state)) chip.appendChild(crown());
        el.roster.appendChild(chip);
      }
    } else if (state.mode === "teams") {
      for (const p of state.players) {
        const isYou = p.id === Room.playerId;
        const isMate = !!you && !!p.team && p.team === you.team && !isYou;
        const chip = document.createElement("span");
        chip.className = `roster-chip team-${p.team ?? ""}${isYou ? " you" : ""}${isMate ? " mate" : ""}`;
        const roleLabel = p.role === "spymaster" ? "Chiffreur" : p.role === "operative" ? "Agent" : "";
        const teamLabel = p.team ? `Équipe ${p.team}` : "";
        chip.textContent = `${p.name}${isYou ? " (toi)" : isMate ? " 🤝" : ""} · ${[teamLabel, roleLabel].filter(Boolean).join(" ")}`;
        if (ended && state.winner === p.team) chip.appendChild(crown());
        el.roster.appendChild(chip);
      }
    }
  }

  function renderClue(state) {
    const active = state.phase === "playing";
    el.clueDisplay.classList.toggle("hidden", !(active && state.currentClue));
    if (state.currentClue) {
      const n = state.currentClue.guessesLeft;
      el.clueText.textContent = `${state.currentClue.word} — ${state.currentClue.number} (${n} pioche${n > 1 ? "s" : ""} restante${n > 1 ? "s" : ""})`;
    }

    const myClueTurn = isMyClueTurn(state);
    el.clueForm.classList.toggle("hidden", !myClueTurn);

    const myGuessTurn = isMyGuessTurn(state);
    el.passBtn.classList.toggle("hidden", !myGuessTurn);

    if (!active) {
      el.turnHint.textContent = "";
    } else if (myClueTurn) {
      el.turnHint.textContent = "À toi de donner un indice.";
    } else if (myGuessTurn) {
      el.turnHint.textContent = "Devine, ou passe si tu n'es pas sûr.";
    } else if (!state.currentClue) {
      el.turnHint.textContent = "En attente d'un indice...";
    } else {
      el.turnHint.textContent = "En attente que l'autre devine...";
    }

    const seesKey =
      state.mode === "duet"
        ? !!state.you && (state.you.seat === "A" || state.you.seat === "B")
        : !!state.you && state.you.role === "spymaster";
    el.keyToggle.classList.toggle("hidden", !(active && seesKey));
  }

  function renderBoard(state) {
    el.boardGrid.innerHTML = "";
    const myGuessTurn = isMyGuessTurn(state);
    for (const [index, cell] of (state.board ?? []).entries()) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      if (cell.revealed) tile.classList.add("revealed");
      if (cell.color && (cell.revealed || !keyHidden)) tile.classList.add(`c-${cell.color}`);
      if (cell.color && !cell.revealed) tile.classList.add("key-hint");

      const label = document.createElement("span");
      label.className = "tile-word";
      label.textContent = cell.word;
      tile.appendChild(label);

      // Un mot d'anime pas forcément connu de tous : sa série d'origine en
      // petit aide à construire un indice même sans le reconnaître.
      if (cell.hint) {
        const hint = document.createElement("span");
        hint.className = "tile-hint";
        hint.textContent = cell.hint;
        tile.appendChild(hint);
      }

      if (myGuessTurn && !cell.revealed) {
        tile.addEventListener("click", () => Room.send({ type: "guess", index }));
      } else {
        tile.disabled = true;
      }
      el.boardGrid.appendChild(tile);
    }
  }

  function buildRecapGrid(words, colors) {
    const grid = document.createElement("div");
    grid.className = "board-grid small-grid";
    words.forEach((word, i) => {
      const tile = document.createElement("div");
      tile.className = "tile revealed recap";
      if (colors[i]) tile.classList.add(`c-${colors[i]}`);
      const label = document.createElement("span");
      label.textContent = word;
      tile.appendChild(label);
      grid.appendChild(tile);
    });
    return grid;
  }

  function buildRecapColumn(label, words, colors) {
    const wrap = document.createElement("div");
    const head = document.createElement("p");
    head.className = "muted small";
    head.textContent = label;
    wrap.appendChild(head);
    wrap.appendChild(buildRecapGrid(words, colors));
    return wrap;
  }

  const DUET_TITLES = {
    "coop-win": "Victoire coopérative !",
    "coop-lose-errors": "Défaite : plus d'erreurs possibles",
    "coop-lose-assassin": "Défaite : l'assassin a été touché",
  };
  const DUET_ICONS = {
    "coop-win": "🎉",
    "coop-lose-errors": "😞",
    "coop-lose-assassin": "💀",
  };

  function renderEnd(state) {
    const active = state.phase === "ended";
    el.endPanel.classList.toggle("hidden", !active);
    if (!active) return;

    const won = isWin(state);
    el.endBanner.classList.remove("win", "lose");
    el.endBanner.classList.add(won ? "win" : "lose");

    if (state.mode === "duet") {
      el.endIcon.textContent = DUET_ICONS[state.winner] || "🏁";
      el.endTitle.textContent = DUET_TITLES[state.winner] || "Partie terminée";
      el.endSummary.textContent = `${state.duetAgentsFound}/${state.duetAgentsTotal} agents trouvés.`;
    } else {
      el.endIcon.textContent = won ? "🏆" : "😞";
      el.endTitle.textContent = state.winner
        ? `${won ? "Vous avez gagné" : "Vous avez perdu"} — Équipe ${state.winner} gagne`
        : "Partie terminée";
      el.endSummary.textContent = `Équipe A : ${state.remainingA} restants · Équipe B : ${state.remainingB} restants.`;
    }

    el.endRecap.innerHTML = "";
    el.endRecap.classList.toggle("end-recap-duet", state.mode === "duet");
    const words = (state.board ?? []).map((c) => c.word);
    if (state.mode === "teams") {
      el.endRecap.appendChild(buildRecapGrid(words, (state.board ?? []).map((c) => c.color)));
    } else if (state.mode === "duet") {
      el.endRecap.appendChild(buildRecapColumn("Clé A", words, state.endKeyA ?? []));
      el.endRecap.appendChild(buildRecapColumn("Clé B", words, state.endKeyB ?? []));
    }

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- équipes et rôles (lobby, hôte, 4 joueurs) ----

  const ROLE_SLOTS = [
    { value: "A-spymaster", label: "Équipe A · Chiffreur" },
    { value: "A-operative", label: "Équipe A · Agent" },
    { value: "B-spymaster", label: "Équipe B · Chiffreur" },
    { value: "B-operative", label: "Équipe B · Agent" },
  ];

  // playerId -> place choisie. Toujours une permutation complète des quatre
  // places : les <select> s'échangent leurs valeurs plutôt que d'autoriser un
  // doublon, sinon il faudrait bloquer "Démarrer" sur un état invalide.
  let roleChoice = {};

  function syncRoleChoice(players) {
    const kept = {};
    const taken = new Set();
    for (const p of players) {
      const slot = roleChoice[p.id];
      if (slot && !taken.has(slot)) {
        kept[p.id] = slot;
        taken.add(slot);
      }
    }
    // Les arrivants (et ceux dont la place a été reprise) récupèrent ce qui
    // reste, dans l'ordre du salon.
    const free = ROLE_SLOTS.map((s) => s.value).filter((v) => !taken.has(v));
    for (const p of players) if (!kept[p.id]) kept[p.id] = free.shift();
    roleChoice = kept;
  }

  // Les déconnectés sont retirés du salon au démarrage côté serveur : on
  // répartit exactement les joueurs qui vont jouer, sinon l'envoi ne
  // correspondrait plus à la table au moment du lancement.
  const seated = (state) => state.players.filter((p) => p.connected);

  function renderRolesSetup(state) {
    const players = seated(state);
    const show = state.hostId === Room.playerId && players.length === 4;
    el.rolesSetup.classList.toggle("hidden", !show);
    if (!show) return;

    syncRoleChoice(players);
    el.rolesList.innerHTML = "";
    for (const p of players) {
      const row = document.createElement("div");
      row.className = "role-row";

      const name = document.createElement("span");
      name.className = "role-name";
      name.textContent = p.name;
      row.appendChild(name);

      const select = document.createElement("select");
      for (const slot of ROLE_SLOTS) {
        const option = document.createElement("option");
        option.value = slot.value;
        option.textContent = slot.label;
        select.appendChild(option);
      }
      select.value = roleChoice[p.id];
      select.addEventListener("change", () => swapRoleSlot(p.id, select.value));
      row.appendChild(select);

      el.rolesList.appendChild(row);
    }
  }

  function swapRoleSlot(playerId, wanted) {
    const previous = roleChoice[playerId];
    const other = Object.keys(roleChoice).find((id) => id !== playerId && roleChoice[id] === wanted);
    if (other) roleChoice[other] = previous;
    roleChoice[playerId] = wanted;
    if (Room.state) renderRolesSetup(Room.state);
  }

  el.rolesShuffle.addEventListener("click", () => {
    const ids = Object.keys(roleChoice);
    const slots = ROLE_SLOTS.map((s) => s.value);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    ids.forEach((id, i) => (roleChoice[id] = slots[i]));
    if (Room.state) renderRolesSetup(Room.state);
  });

  // ---- filtre de mots (lobby, hôte) ----

  // Catalogue complet {word, hint} servi par le Worker (src/games/codenames/words.ts),
  // récupéré une seule fois et mis en cache — c'est la seule donnée que ce jeu
  // va chercher hors du flux WebSocket habituel.
  let catalog = null;
  let catalogPromise = null;
  function ensureCatalog() {
    if (catalog) return Promise.resolve(catalog);
    if (!catalogPromise) {
      catalogPromise = fetch("/api/codenames/words")
        .then((res) => res.json())
        .then((data) => {
          catalog = Array.isArray(data) && data.length ? data : null;
          return catalog;
        })
        .catch(() => {
          // On laisse `catalog` à null : s'ouvrir sur une liste vide sans
          // rien dire ressemble à un bug, le bouton préfère prévenir.
          catalogPromise = null;
          return null;
        });
    }
    return catalogPromise;
  }
  ensureCatalog().then(() => {
    if (Room.state && Room.state.phase === "lobby") renderWordFilterSummary(Room.state);
  });

  function renderWordFilterSummary(state) {
    if (!catalog) {
      el.wordFilterSummary.textContent = "";
      return;
    }
    const total = catalog.length;
    const active = total - (state.excludedWords ?? []).length;
    el.wordFilterSummary.textContent = `${active}/${total} mots actifs`;
  }

  // Set d'exclusion édité localement pendant que la boîte de dialogue est
  // ouverte ; envoyé au serveur seulement sur "Enregistrer" (sinon 380+
  // messages en rafale à chaque case cochée, pour rien tant que ce n'est pas
  // confirmé).
  let excludedSet = new Set();
  let wordFilterRows = [];

  // "Demon" doit trouver "Démon" : sans ça un accent oublié vide la liste,
  // ce qui se lit comme un filtre cassé.
  const fold = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function buildWordFilterRows() {
    el.wordFilterList.innerHTML = "";
    wordFilterRows = [];
    for (const entry of catalog) {
      const row = document.createElement("label");
      row.className = "word-filter-row";
      row.dataset.search = fold(`${entry.word} ${entry.hint}`);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !excludedSet.has(entry.word);
      checkbox.addEventListener("change", () => onWordCheckboxChange(entry.word, checkbox));
      row.appendChild(checkbox);

      const word = document.createElement("span");
      word.className = "word-filter-word";
      word.textContent = entry.word;
      row.appendChild(word);

      const hint = document.createElement("span");
      hint.className = "word-filter-hint";
      hint.textContent = entry.hint;
      row.appendChild(hint);

      el.wordFilterList.appendChild(row);
      wordFilterRows.push({ row, checkbox, word: entry.word });
    }
    // Remis après le vidage de la liste : c'est lui qui s'affiche quand le
    // filtre ne laisse rien passer.
    el.wordFilterList.appendChild(el.wordFilterEmpty);
  }

  function onWordCheckboxChange(word, checkbox) {
    if (checkbox.checked) {
      excludedSet.delete(word);
    } else {
      const wouldRemain = catalog.length - excludedSet.size - 1;
      if (wouldRemain < MIN_ACTIVE_WORDS) {
        checkbox.checked = true;
        Room.toast(`Il faut garder au moins ${MIN_ACTIVE_WORDS} mots actifs.`);
        return;
      }
      excludedSet.add(word);
    }
    updateWordFilterCount();
  }

  function updateWordFilterCount() {
    const active = catalog.length - excludedSet.size;
    const visible = wordFilterRows.filter((r) => !r.row.hidden).length;
    el.wordFilterCount.textContent = `${active}/${catalog.length} mots actifs · ${visible} affichés`;
    // Une liste vide qui ne dit pas pourquoi passe pour un bug.
    const q = el.wordFilterSearch.value.trim();
    el.wordFilterEmpty.textContent = q ? `Aucun mot ne correspond à « ${q} ».` : "Aucun mot à afficher.";
    el.wordFilterEmpty.classList.toggle("hidden", visible > 0);
  }

  function filterWordFilterRows() {
    const q = fold(el.wordFilterSearch.value.trim());
    for (const { row } of wordFilterRows) {
      row.hidden = q.length > 0 && !row.dataset.search.includes(q);
    }
    updateWordFilterCount();
  }

  el.wordFilterOpen.addEventListener("click", async () => {
    // Deux clics pendant le chargement du catalogue lanceraient deux
    // `showModal()`, et le second lève une InvalidStateError.
    if (el.wordFilterDialog.open) return;
    if (!(await ensureCatalog())) {
      Room.toast("Liste des mots indisponible — vérifie ta connexion et réessaie.");
      return;
    }
    excludedSet = new Set(Room.state?.excludedWords ?? []);
    el.wordFilterSearch.value = "";
    buildWordFilterRows();
    filterWordFilterRows();
    if (!el.wordFilterDialog.open) el.wordFilterDialog.showModal();
  });

  el.wordFilterSearch.addEventListener("input", filterWordFilterRows);

  el.wordFilterCheckAll.addEventListener("click", () => {
    for (const { row, checkbox, word } of wordFilterRows) {
      if (row.hidden || checkbox.checked) continue;
      checkbox.checked = true;
      excludedSet.delete(word);
    }
    updateWordFilterCount();
  });

  el.wordFilterUncheckAll.addEventListener("click", () => {
    let blocked = false;
    for (const { row, checkbox, word } of wordFilterRows) {
      if (row.hidden || !checkbox.checked) continue;
      const wouldRemain = catalog.length - excludedSet.size - 1;
      if (wouldRemain < MIN_ACTIVE_WORDS) {
        blocked = true;
        break;
      }
      checkbox.checked = false;
      excludedSet.add(word);
    }
    if (blocked) Room.toast(`Il faut garder au moins ${MIN_ACTIVE_WORDS} mots actifs : certains mots affichés restent cochés.`);
    updateWordFilterCount();
  });

  el.wordFilterCancel.addEventListener("click", () => el.wordFilterDialog.close());
  // Un clic dans le fond compte comme "Annuler", comme le <dialog> des règles.
  el.wordFilterDialog.addEventListener("click", (e) => {
    if (e.target === el.wordFilterDialog) el.wordFilterDialog.close();
  });

  el.wordFilterSave.addEventListener("click", () => {
    Room.send({ type: "setWordFilter", excluded: [...excludedSet] });
    el.wordFilterDialog.close();
  });

  // ---- events ----

  el.clueSubmit.addEventListener("click", submitClue);
  el.clueInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitClue();
  });
  function submitClue() {
    const word = el.clueInput.value.trim();
    if (!word) return;
    const number = Math.max(1, Math.min(9, Number(el.clueNumber.value) || 1));
    Room.send({ type: "clue", word, number });
    el.clueInput.value = "";
  }

  el.passBtn.addEventListener("click", () => Room.send({ type: "pass" }));

  el.keyToggle.addEventListener("click", () => {
    keyHidden = !keyHidden;
    el.keyToggle.textContent = keyHidden ? "Afficher ma clé" : "Cacher ma clé";
    if (Room.state) renderBoard(Room.state);
  });

  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Room.init({
    slug: "codenames",
    minPlayers: 2,
    maxPlayers: 4,
    // Le nombre de connectés (2 ou 4) détermine seul le mode : pas de réglage
    // à envoyer, le serveur refuse (et prévient par toast) si ce n'est ni
    // l'un ni l'autre — pas besoin de le redire côté client.
    // À 2 joueurs il n'y a ni chiffreur ni agent (chacun donne ses indices
    // à son tour) : rien à envoyer, le serveur tire les sièges.
    onStart: () => {
      const state = Room.state;
      if (!state) return {};
      const players = seated(state);
      if (players.length !== 4) return {};
      syncRoleChoice(players);
      const assignment = {};
      for (const p of players) {
        const [team, role] = roleChoice[p.id].split("-");
        assignment[p.id] = { team, role };
      }
      return { assignment };
    },
    onState: (s) => {
      playSounds(s);
      render(s);
    },
  });
})();
