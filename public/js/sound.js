// Shared audio, loaded on every page before each game's app.js.
//
// SFX are synthesized with the Web Audio API rather than shipped as files:
// nothing to download, nothing to license, no extra requests. The theme music
// is the one real file (/audio/theme.mp3, royalty-free, see public/audio/README.md);
// if it's missing the music button hides itself and everything else keeps working.

const Sound = (() => {
  const SFX_KEY = "rasen:sfx";
  const MUSIC_KEY = "rasen:music";

  let ctx = null;
  let sfxOn = localStorage.getItem(SFX_KEY) !== "off";
  let musicOn = localStorage.getItem(MUSIC_KEY) === "on";
  let music = null;
  const counters = new Map();

  // name -> [frequency, start offset in s, duration in s][]
  const RECIPES = {
    notify: [[880, 0, 0.12], [1320, 0.1, 0.18]], // l'autre a joué
    turn: [[660, 0, 0.1], [990, 0.09, 0.16]], // c'est à toi
    yes: [[784, 0, 0.1], [1046, 0.09, 0.2]],
    no: [[392, 0, 0.14], [294, 0.13, 0.24]],
    win: [[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.3]],
    lose: [[440, 0, 0.16], [330, 0.16, 0.32]],
    tick: [[1200, 0, 0.05]],
  };

  function play(name) {
    const recipe = RECIPES[name];
    if (!sfxOn || !recipe) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      for (const [freq, offset, duration] of recipe) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + duration + 0.02);
      }
    } catch {
      // pas d'audio disponible (vieux navigateur, contexte bloqué) : on ignore
    }
  }

  // Joue `name` quand un compteur venu du serveur augmente (nouvelle réponse,
  // nouvel indice...). Le premier appel initialise sans jouer, pour ne pas
  // sonner à la reconnexion ou au premier state reçu.
  function onIncrease(key, count, name) {
    const previous = counters.get(key);
    counters.set(key, count);
    if (previous !== undefined && count > previous) play(name);
  }

  // Joue `name` quand une valeur change (phase, joueur dont c'est le tour...).
  // `name` peut être null pour simplement suivre la valeur sans rien jouer.
  function onChange(key, value, name) {
    const previous = counters.get(key);
    counters.set(key, value);
    if (previous !== undefined && value !== previous) play(name);
  }

  // ---- musique de fond ----

  function ensureMusic() {
    if (music) return music;
    music = new Audio("/audio/theme.mp3");
    music.loop = true;
    music.volume = 0.2;
    music.addEventListener("error", () => {
      music = null;
      musicOn = false;
      const btn = document.getElementById("music-toggle");
      if (btn) btn.classList.add("hidden");
    });
    return music;
  }

  function syncMusic() {
    const audio = ensureMusic();
    if (!audio) return;
    if (musicOn) {
      // Les navigateurs bloquent la lecture avant toute interaction : on
      // retente au premier clic/touche si la promesse est rejetée.
      audio.play().catch(() => {
        const retry = () => {
          if (musicOn) audio.play().catch(() => {});
          document.removeEventListener("pointerdown", retry);
          document.removeEventListener("keydown", retry);
        };
        document.addEventListener("pointerdown", retry, { once: true });
        document.addEventListener("keydown", retry, { once: true });
      });
    } else {
      audio.pause();
    }
  }

  // ---- boutons dans l'entête ----

  function mountToggles() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    const wrap = document.createElement("div");
    wrap.className = "audio-toggles";

    const sfxBtn = document.createElement("button");
    sfxBtn.id = "sfx-toggle";
    sfxBtn.className = "audio-btn";
    sfxBtn.type = "button";
    const paintSfx = () => {
      sfxBtn.textContent = sfxOn ? "🔊" : "🔇";
      sfxBtn.title = sfxOn ? "Couper les sons" : "Activer les sons";
      sfxBtn.setAttribute("aria-label", sfxBtn.title);
    };
    paintSfx();
    sfxBtn.addEventListener("click", () => {
      sfxOn = !sfxOn;
      localStorage.setItem(SFX_KEY, sfxOn ? "on" : "off");
      paintSfx();
      if (sfxOn) play("tick");
    });

    const musicBtn = document.createElement("button");
    musicBtn.id = "music-toggle";
    musicBtn.className = "audio-btn";
    musicBtn.type = "button";
    const paintMusic = () => {
      musicBtn.textContent = musicOn ? "🎵" : "🎶";
      musicBtn.classList.toggle("off", !musicOn);
      musicBtn.title = musicOn ? "Couper la musique" : "Lancer la musique";
      musicBtn.setAttribute("aria-label", musicBtn.title);
    };
    paintMusic();
    musicBtn.addEventListener("click", () => {
      musicOn = !musicOn;
      localStorage.setItem(MUSIC_KEY, musicOn ? "on" : "off");
      paintMusic();
      syncMusic();
    });

    wrap.appendChild(sfxBtn);
    wrap.appendChild(musicBtn);
    header.appendChild(wrap);

    // Le fichier n'est chargé que si la musique est activée : tant qu'on ne
    // clique pas, aucune requête (et aucun 404 si theme.mp3 n'est pas encore là).
    if (musicOn) syncMusic();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggles);
  } else {
    mountToggles();
  }

  return { play, onIncrease, onChange };
})();
