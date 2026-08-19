// Name typeahead for the "écris un personnage" inputs, backed by /api/suggest
// (AniList). Picking a suggestion gives the exact AniList spelling, which is
// what makes the server-side image lookup land on the right character — and on
// the right homonym (Shouyou Hinata vs Hinata Hyuuga).
//
// This used to be a native <datalist>, which Chromium renders fine but Firefox
// does not: it won't refresh an open popup when the options are injected after
// the keystroke, so suggestions never showed up there (and mobile support is
// uneven). Hence this small menu instead — click, arrow keys, Enter, Escape.
const Suggest = (() => {
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 350;
  const cache = new Map();

  // `kindOf()` is a function, not a value: 1 à 100 switches between characters
  // and anime titles depending on the room's mode.
  function attach(input, kindOf = () => "any") {
    if (!input) return;

    const menu = document.createElement("div");
    menu.className = "suggest-menu hidden";
    input.setAttribute("autocomplete", "off");
    input.parentNode.classList.add("suggest-anchor"); // positions the menu
    input.parentNode.appendChild(menu);

    let timer = null;
    let items = [];
    let active = -1;

    function close() {
      menu.classList.add("hidden");
      active = -1;
    }

    function pick(index) {
      const chosen = items[index];
      if (!chosen) return;
      input.value = chosen.name;
      close();
      input.focus();
    }

    function highlight(index) {
      active = index;
      for (const [i, row] of [...menu.children].entries()) {
        row.classList.toggle("active", i === active);
      }
    }

    function show(results) {
      items = results;
      menu.innerHTML = "";
      if (results.length === 0) return close();

      for (const [i, s] of results.entries()) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "suggest-item";

        const name = document.createElement("span");
        name.className = "suggest-name";
        name.textContent = s.name;
        row.appendChild(name);

        if (s.from) {
          const from = document.createElement("span");
          from.className = "suggest-from";
          from.textContent = s.from;
          row.appendChild(from);
        }

        // mousedown, not click: the input's blur would close the menu first.
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(i);
        });
        menu.appendChild(row);
      }
      active = -1;
      menu.classList.remove("hidden");
    }

    input.addEventListener("input", () => {
      const q = input.value.trim();
      clearTimeout(timer);
      if (q.length < MIN_CHARS) return close();
      timer = setTimeout(() => load(q), DEBOUNCE_MS);
    });

    // Capture phase: the game's own Enter-to-submit listener sits on this same
    // input, and picking a suggestion has to win over sending the word.
    input.addEventListener(
      "keydown",
      (e) => {
        if (menu.classList.contains("hidden")) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const step = e.key === "ArrowDown" ? 1 : -1;
          highlight((active + step + items.length) % items.length);
        } else if (e.key === "Enter" && active >= 0) {
          e.preventDefault();
          e.stopPropagation();
          pick(active);
        } else if (e.key === "Escape") {
          close();
        }
      },
      true
    );

    input.addEventListener("blur", () => setTimeout(close, 100));

    async function load(q) {
      const kind = kindOf() || "any";
      const key = `${kind}:${q.toLowerCase()}`;
      let results = cache.get(key);
      if (!results) {
        try {
          const res = await fetch(`/api/suggest?kind=${kind}&q=${encodeURIComponent(q)}`);
          if (!res.ok) return;
          results = await res.json();
        } catch {
          return; // best effort: a failed lookup just means no suggestions
        }
        cache.set(key, results);
      }
      // Ignore a response that lost the race against newer typing.
      if (input.value.trim() !== q) return;
      show(results);
    }
  }

  return { attach };
})();
