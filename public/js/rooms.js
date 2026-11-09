// Landing-page list of live salons, fed by the registry Durable Object.
(() => {
  const list = document.getElementById("rooms-list");
  const empty = document.getElementById("rooms-empty");
  if (!list) return;

  const GAMES = {
    undercover: { label: "Undercover" },
    hundred: { label: "1 à 100" },
    bac: { label: "Petit Bac" },
    whoami: { label: "Qui suis-je" },
    detective: { label: "Détective Anime" },
    note: { label: "Le jeu de la note" },
    bomb: { label: "Alphabombe" },
    codenames: { label: "Codenames Anime" },
    sync: { label: "Même longueur d'onde" },
  };

  function roomRow(room) {
    const game = GAMES[room.slug] ?? { label: room.slug };
    const open = room.phase === "lobby";

    const row = document.createElement("div");
    row.className = "room-row";

    const code = document.createElement("span");
    code.className = "room-code";
    code.textContent = room.code;
    row.appendChild(code);

    const info = document.createElement("div");
    info.className = "room-info";
    const title = document.createElement("strong");
    title.textContent = game.label;
    const meta = document.createElement("span");
    meta.className = "muted small";
    meta.textContent = `${room.players} joueur${room.players > 1 ? "s" : ""} · ${
      open ? "en attente" : "en partie"
    }`;
    info.appendChild(title);
    info.appendChild(meta);
    row.appendChild(info);

    // Une partie en cours reste visible sans perturber la manche : le serveur
    // transforme automatiquement le nouveau venu en spectateur.
    const join = document.createElement("a");
    join.className = open ? "btn small" : "btn secondary small";
    join.href = `/games/${room.slug}/?room=${room.code}`;
    join.textContent = open ? "Rejoindre" : "Regarder la partie";
    row.appendChild(join);

    return row;
  }

  async function refresh() {
    let rooms = [];
    try {
      const res = await fetch("/api/rooms");
      if (!res.ok) return;
      ({ rooms } = await res.json());
    } catch {
      return; // offline or a hiccup: keep whatever is already on screen
    }

    list.innerHTML = "";
    for (const room of rooms) list.appendChild(roomRow(room));
    empty.classList.toggle("hidden", rooms.length > 0);
  }

  refresh();
  setInterval(refresh, 15000);

  // Un code ne dit pas à quel jeu il appartient : on sonde les neuf jeux en
  // parallèle et on ouvre le premier qui le connaît. Sans ça il faudrait
  // deviner le bon jeu avant de pouvoir coller son code.
  const form = document.getElementById("code-form");
  const input = document.getElementById("home-code");
  const error = document.getElementById("code-error");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = input.value.trim().toUpperCase();
    error.classList.add("hidden");
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return showError("Un code fait 4 à 8 lettres ou chiffres.");
    const found = await Promise.all(
      Object.keys(GAMES).map(async (slug) => {
        try {
          const res = await fetch(`/api/${slug}/exists/${code}`);
          const probe = res.ok ? await res.json() : null;
          return probe?.exists ? { slug, live: probe.live } : null;
        } catch {
          return null;
        }
      }),
    );
    // Après un changement de jeu, le code existe aussi dans l'ancien jeu,
    // vide : on préfère celui où quelqu'un est connecté.
    const hit = found.find((f) => f?.live) ?? found.find(Boolean);
    if (!hit) return showError("Aucun salon avec ce code. Vérifie les lettres.");
    const { slug } = hit;
    location.href = `/games/${slug}/?room=${code}`;
  });

  function showError(message) {
    error.textContent = message;
    error.classList.remove("hidden");
  }
})();
