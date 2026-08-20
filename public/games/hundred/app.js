(() => {
  const $ = (id) => document.getElementById(id);

  // Kept in sync with src/games/hundred/themes.ts — duplicated client-side so
  // the host can preview the full list in a dropdown instead of typing blind.
  const THEMES_BY_MODE = {
    perso: [
      "Puissance",
      "Intelligence",
      "Popularité",
      "Charisme",
      "Drôle",
      "Loyauté",
      "Détermination",
      "Vitesse",
      "Instinct de sacrifice",
      "Ambition",
      "Cringe",
      "Talent pour les punchlines",
      "Style vestimentaire",
      "Capacité à mourir bêtement",
      "Histoire triste",
      "Capacité à retourner sa veste",
      "Bodycount",
      "Beauté (homme)",
      "Beauté (femme)",
      "Beauté des yeux",
      "Âge",
      "Perversité",
      "Nom stylé",
      "Flow",
      "Aura",
      "Énergie de pnj",
      "Probabilité de finir célib",
      "Leader",
      "Meilleur colocataire",
      "Meilleur prof",
      "Développement de personnage",
      "Transformation",
    ],
    anime: [
      "Personnages",
      "Personnage principal",
      "OST",
      "Openings",
      "Anime",
      "Animation",
      "Combats",
      "Antagonistes",
      "Qualité de la fin",
      "Popularité",
      "Les émotions (ça fait pleurer)",
      "Quantité de fanservice",
      "Qualité du rythme",
      "Sous-coté",
      "Sur-coté",
      "Worldbuilding",
      "Chara-design",
      "Présence r34",
    ],
  };

  // Formulations propres à chaque variante. Le serveur renvoie `mode` dans
  // chaque state, donc tout le monde voit les mêmes mots, pas seulement l'hôte.
  const WORDING = {
    perso: {
      indefinite: "un personnage",
      placeholder: "Un personnage qui correspond à ton chiffre",
    },
    anime: {
      indefinite: "un anime",
      placeholder: "Un anime qui correspond à ton chiffre",
    },
  };

  const wordingFor = (mode) => WORDING[mode] ?? WORDING.perso;

  // La variante ne se devinait qu'au placeholder du champ de proposition :
  // trop discret pour un truc qui change ce qu'on doit taper. Bandeau visible
  // en haut des trois écrans de manche.
  const MODE_BANNER = {
    perso: "🧑 Partie Personnages — on propose des persos",
    anime: "📺 Partie Animes — on propose des animes",
  };

  function renderModeBanner(node, mode) {
    const known = mode === "anime" ? "anime" : "perso";
    node.textContent = MODE_BANNER[known];
    node.className = `mode-banner mode-${known}`;
  }

  const el = {

    modeSelect: $("mode-select"),
    themeSelect: $("theme-select"),

    proposeMode: $("propose-mode"),
    proposeTheme: $("propose-theme"),
    myNumber: $("my-number"),
    proposeForm: $("propose-form"),
    proposalInput: $("proposal-input"),
    proposalSubmit: $("proposal-submit"),
    proposalDoneHint: $("proposal-done-hint"),
    proposeProgress: $("propose-progress"),
    proposalsSecretHint: $("proposals-secret-hint"),
    proposalsList: $("proposals-list"),

    arrangeMode: $("arrange-mode"),
    arrangeTheme: $("arrange-theme"),
    arrangeInstructions: $("arrange-instructions"),
    line: $("line"),
    revealBtn: $("reveal-btn"),
    revealHint: $("reveal-hint"),

    revealMode: $("reveal-mode"),
    revealTheme: $("reveal-theme"),
    lineReveal: $("line-reveal"),
    revealNextBtn: $("reveal-next-btn"),
    revealNextHint: $("reveal-next-hint"),
    revealProgress: $("reveal-progress"),

    endTitle: $("end-title"),
    endScore: $("end-score"),
    lineFinal: $("line-final"),
    restartBtn: $("restart-btn"),
    restartHint: $("restart-hint"),
  };

  let dragState = null; // { playerId, cardEl } while the local user is dragging a card

  // ---- sons ----

  // Sound.onIncrease / onChange ignorent le premier state reçu, donc rien ne
  // sonne au chargement ni à la reconnexion.
  function playSounds(state) {
    Sound.onChange("h:phase", state.phase, "notify");
    Sound.onIncrease("h:proposals", state.proposalsSubmitted ?? 0, "tick");
    Sound.onIncrease("h:revealed", state.revealedCount ?? 0, "notify");
  }

  // ---- rendering ----

  function populateThemeSelect() {
    el.themeSelect.innerHTML = "";
    const randomOpt = document.createElement("option");
    randomOpt.value = "";
    randomOpt.textContent = "🎲 Thème aléatoire";
    el.themeSelect.appendChild(randomOpt);
    for (const theme of THEMES_BY_MODE[el.modeSelect.value] ?? []) {
      const opt = document.createElement("option");
      opt.value = theme;
      opt.textContent = theme;
      el.themeSelect.appendChild(opt);
    }
  }
  populateThemeSelect();
  // Les deux variantes n'ont pas les mêmes thèmes : changer de variante
  // repeuple la liste (et retombe sur "aléatoire", le thème choisi n'existant
  // pas forcément dans l'autre).
  el.modeSelect.addEventListener("change", populateThemeSelect);

  // Other games the group can switch to without disbanding — see the
  // "switchGame" message handling below.

  function render(state) {
    Room.showSwitchGame(state.hostId === Room.playerId);

    if (state.phase === "lobby") {
      Room.showScreen("screen-lobby");
      renderLobby(state);
    } else if (state.phase === "propose") {
      Room.showScreen("screen-propose");
      renderPropose(state);
    } else if (state.phase === "arrange") {
      Room.showScreen("screen-arrange");
      renderArrange(state);
    } else if (state.phase === "reveal") {
      Room.showScreen("screen-reveal");
      renderReveal(state);
    } else if (state.phase === "ended") {
      Room.showScreen("screen-ended");
      renderEnded(state);
    }
  }

  function renderLobby(state) {
    Room.renderLobby(state);
  }

  function renderPropose(state) {
    renderModeBanner(el.proposeMode, state.mode);
    el.proposeTheme.textContent = state.theme;
    el.myNumber.textContent = state.you?.number ?? "—";

    const alreadyProposed = !!state.you?.proposal;
    el.proposeForm.classList.toggle("hidden", alreadyProposed);
    el.proposalDoneHint.classList.toggle("hidden", !alreadyProposed);
    const wording = wordingFor(state.mode);
    el.proposalInput.placeholder = wording.placeholder;
    el.proposalsSecretHint.textContent = `Les propositions des autres restent secrètes jusqu'à ce que tout le monde ait proposé ${wording.indefinite}.`;
    el.proposeProgress.textContent = `${state.proposalsSubmitted}/${state.proposalsNeeded} ont proposé ${wording.indefinite}`;

    el.proposalsList.innerHTML = "";
    for (const p of state.players) {
      const row = document.createElement("div");
      row.className = "player-row";
      if (p.id === Room.playerId) row.classList.add("you");
      if (p.connected === false) row.classList.add("offline");

      row.appendChild(makeAvatar(p.name));

      const dot = document.createElement("span");
      dot.className = "dot";
      row.appendChild(dot);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name + (p.id === Room.playerId ? " (toi)" : "");
      row.appendChild(name);

      const status = document.createElement("span");
      status.className = "tag";
      status.textContent =
        p.id === Room.playerId
          ? p.proposal ?? "réfléchit..."
          : p.hasProposed
            ? "✓ prêt"
            : "réfléchit...";
      row.appendChild(status);

      el.proposalsList.appendChild(row);
    }
  }

  function makeCard(state, playerId) {
    const p = state.players.find((pl) => pl.id === playerId);
    const card = document.createElement("div");
    card.className = "card-token";
    card.dataset.playerId = playerId;
    if (playerId === Room.playerId) card.classList.add("you");

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = p ? p.name + (playerId === Room.playerId ? " (toi)" : "") : "?";
    card.appendChild(name);

    if (p?.proposal) {
      const img = document.createElement("img");
      img.className = "card-image hidden";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      card.appendChild(img);
      Anilist.setImage(img, p.proposal, Room.state?.mode === "anime" ? "anime" : "character", p.proposalRef);
    }

    const proposal = document.createElement("div");
    proposal.className = "card-proposal";
    proposal.textContent = p?.proposal ?? "?";
    card.appendChild(proposal);

    if (p && p.number !== undefined && p.number !== null) {
      const number = document.createElement("div");
      number.className = "card-number";
      number.textContent = p.number;
      card.appendChild(number);
    }

    return card;
  }

  // A single pair of document-level listeners drives whichever card is being
  // dragged. Per-card listeners here would be more natural, but pointer
  // capture doesn't reliably scope pointermove/pointerup to one element
  // while the dragged card is being reinserted elsewhere in the DOM, which
  // let other cards' handlers react to the same event and fight over it.
  let dragLastSentIndex = null;

  function onLineDragMove(e) {
    if (!dragState) return;
    const cardEl = dragState.cardEl;
    const siblings = Array.from(el.line.children).filter((c) => c !== cardEl);
    let insertBefore = null;
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (e.clientX < rect.left + rect.width / 2) {
        insertBefore = sib;
        break;
      }
    }
    if (insertBefore) el.line.insertBefore(cardEl, insertBefore);
    else el.line.appendChild(cardEl);

    const newIndex = Array.from(el.line.children).indexOf(cardEl);
    if (newIndex !== dragLastSentIndex) {
      dragLastSentIndex = newIndex;
      Room.send({ type: "move", playerId: dragState.playerId, toIndex: newIndex });
    }
  }

  function endLineDrag() {
    if (!dragState) return;
    dragState.cardEl.classList.remove("dragging");
    dragState = null;
    dragLastSentIndex = null;
  }

  document.addEventListener("pointermove", onLineDragMove);
  document.addEventListener("pointerup", endLineDrag);
  document.addEventListener("pointercancel", endLineDrag);

  function attachDrag(card, playerId) {
    card.classList.add("grabbable");
    card.addEventListener("pointerdown", (e) => {
      if (!Room.state || Room.state.phase !== "arrange") return;
      if (Room.state.hostId !== Room.playerId) return;
      e.preventDefault();
      card.classList.add("dragging");
      dragState = { playerId, cardEl: card };
      dragLastSentIndex = Array.from(el.line.children).indexOf(card);
    });
  }

  function renderArrange(state) {
    renderModeBanner(el.arrangeMode, state.mode);
    el.arrangeTheme.textContent = state.theme;

    const isHost = state.hostId === Room.playerId;
    el.arrangeInstructions.textContent = isHost
      ? "Les chiffres sont cachés jusqu'à la révélation. Débattez, puis glisse les cartes pour les ranger du plus petit (gauche) au plus grand (droite)."
      : "Les chiffres sont cachés jusqu'à la révélation. Débattez pour trouver le bon ordre — seul l'hôte peut déplacer les cartes.";
    el.revealBtn.classList.toggle("hidden", !isHost);
    el.revealHint.classList.toggle("hidden", isHost);

    if (dragState) return; // avoid yanking the DOM out from under an active drag

    el.line.innerHTML = "";
    for (const playerId of state.order) {
      const card = makeCard(state, playerId);
      if (isHost) attachDrag(card, playerId);
      el.line.appendChild(card);
    }
  }

  // Colore les deux cartes de chaque paire déjà révélée : vert si l'ordre est
  // respecté, rouge sinon. Une carte coincée entre une bonne et une mauvaise
  // paire reçoit les deux classes — .incorrect est déclarée après .correct dans
  // le CSS, donc le rouge l'emporte, ce qui est bien le message à faire passer.
  function markPairs(state, cards, upTo) {
    const numberOf = (index) => state.players.find((p) => p.id === state.order[index])?.number;
    for (let i = 1; i < upTo; i++) {
      const prev = numberOf(i - 1);
      const cur = numberOf(i);
      if (prev == null || cur == null) continue;
      const klass = prev < cur ? "correct" : "incorrect";
      cards[i - 1].classList.add(klass);
      cards[i].classList.add(klass);
    }
  }

  function renderReveal(state) {
    renderModeBanner(el.revealMode, state.mode);
    el.revealTheme.textContent = state.theme;

    el.lineReveal.innerHTML = "";
    const cards = state.order.map((playerId) => makeCard(state, playerId));
    for (const card of cards) el.lineReveal.appendChild(card);

    markPairs(state, cards, state.revealedCount);

    el.revealProgress.textContent = `${state.revealedCount}/${state.order.length} cartes révélées`;

    const isHost = state.hostId === Room.playerId;
    const allRevealed = state.revealedCount >= state.order.length;
    el.revealNextBtn.classList.toggle("hidden", !isHost || allRevealed);
    el.revealNextHint.classList.toggle("hidden", isHost || allRevealed);
  }

  function renderEnded(state) {

    el.endTitle.textContent = state.score?.sortedFully ? "Ordre parfait ! 🎉" : "Résultat";
    el.endScore.textContent = state.score
      ? `${state.score.correctPairs}/${state.score.total} paires dans le bon ordre.`
      : "";

    el.lineFinal.innerHTML = "";
    const cards = state.order.map((playerId) => makeCard(state, playerId));
    markPairs(state, cards, cards.length);
    for (const card of cards) el.lineFinal.appendChild(card);

    const isHost = state.hostId === Room.playerId;
    el.restartBtn.classList.toggle("hidden", !isHost);
    el.restartHint.classList.toggle("hidden", isHost);
  }

  // ---- events ----

  el.proposalSubmit.addEventListener("click", submitProposal);
  el.proposalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitProposal();
  });

  async function submitProposal() {
    const text = el.proposalInput.value.trim();
    if (!text) return;
    const mode = Room.state?.mode === "anime" ? "anime" : "perso";
    const kind = mode === "anime" ? "anime" : "character";

    // Déjà validé par AniList au moment du clic dans la liste : inutile de
    // redemander (le quota est par IP, et la table est souvent derrière une
    // seule box). On ne saute que si le type correspond au mode en cours.
    const picked = el.proposalInput.dataset.anilistRef ?? "";
    if (picked.startsWith(kind === "anime" ? "anime:" : "character:")) {
      Room.send({ type: "propose", text, anilistRef: picked });
      return;
    }

    el.proposalSubmit.disabled = true;
    const originalLabel = el.proposalSubmit.textContent;
    el.proposalSubmit.textContent = "Vérification...";
    try {
      const check = await Anilist.exists(text, kind, true);
      if (check === "notfound") {
        Room.toast(
          mode === "anime"
            ? `"${text}" ne correspond à aucun anime connu sur AniList.`
            : `"${text}" ne correspond à aucun personnage connu sur AniList (c'est peut-être un titre d'anime ?).`
        );
        return;
      }
      if (check === "unknown") {
        Room.toast("Vérification AniList indisponible, proposition envoyée sans validation.");
      }
      Room.send({ type: "propose", text, anilistRef: el.proposalInput.dataset.anilistRef });
      el.proposalInput.value = "";
      delete el.proposalInput.dataset.anilistRef;
    } finally {
      el.proposalSubmit.disabled = false;
      el.proposalSubmit.textContent = originalLabel;
    }
  }

  el.revealBtn.addEventListener("click", () => Room.send({ type: "reveal" }));
  el.revealNextBtn.addEventListener("click", () => Room.send({ type: "revealNext" }));
  el.restartBtn.addEventListener("click", () => Room.send({ type: "restart" }));

  Suggest.attach(el.proposalInput, () => (Room.state?.mode === "anime" ? "anime" : "any"));

  Room.init({
    slug: "hundred",
    minPlayers: 3,
    onStart: () => ({ mode: el.modeSelect.value, theme: el.themeSelect.value }),
    onState: (s) => { playSounds(s); render(s); },
  });
})();
