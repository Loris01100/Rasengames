// Landing-page list of live salons, fed by the registry Durable Object.
(() => {
  const list = document.getElementById("rooms-list");
  const empty = document.getElementById("rooms-empty");
  if (!list) return;

  const GAMES = {
    undercover: { label: "Undercover", icon: "🕵️" },
    hundred: { label: "1 à 100", icon: "🔢" },
    bac: { label: "Petit Bac", icon: "📝" },
    whoami: { label: "Qui suis-je", icon: "🎭" },
    detective: { label: "Détective Anime", icon: "🔍" },
    note: { label: "Le jeu de la note", icon: "🔟" },
    bomb: { label: "Alphabombe", icon: "💣" },
    codenames: { label: "Codenames Anime", icon: "🗂️" },
  };

  function roomRow(room) {
    const game = GAMES[room.slug] ?? { label: room.slug, icon: "🎮" };
    const open = room.phase === "lobby";

    const row = document.createElement("div");
    row.className = "room-row";

    const icon = document.createElement("span");
    icon.className = "room-icon";
    icon.textContent = game.icon;
    row.appendChild(icon);

    const info = document.createElement("div");
    info.className = "room-info";
    const title = document.createElement("strong");
    title.textContent = game.label;
    const meta = document.createElement("span");
    meta.className = "muted small";
    meta.textContent = `${room.code} · ${room.players} joueur${room.players > 1 ? "s" : ""} · ${
      open ? "en attente" : "en partie"
    }`;
    info.appendChild(title);
    info.appendChild(meta);
    row.appendChild(info);

    // Une partie en cours se rejoint aussi : le serveur met le nouveau venu
    // dans sa file d'attente et le fait entrer à la fin de la manche (écran
    // d'attente géré par room-client.js).
    const join = document.createElement("a");
    join.className = open ? "btn small" : "btn secondary small";
    join.href = `/games/${room.slug}/?room=${room.code}`;
    join.textContent = open ? "Rejoindre" : "Rejoindre (manche suivante)";
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
})();
