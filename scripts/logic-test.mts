// Vérifie les fonctions pures de src/games/*/logic.ts : attribution des rôles,
// comptage des votes, rotation des tours et conditions de fin de manche.
// Pas de Durable Object, pas de WebSocket — juste des RoomState en mémoire.
import assert from "node:assert";

import * as undercover from "../src/games/undercover/logic.ts";
import { createEmptyRoom as emptyUndercover } from "../src/games/undercover/types.ts";
import * as bomb from "../src/games/bomb/logic.ts";
import { createEmptyRoom as emptyBomb } from "../src/games/bomb/types.ts";
import * as whoami from "../src/games/whoami/logic.ts";
import { createEmptyRoom as emptyWhoami } from "../src/games/whoami/types.ts";
import * as hundred from "../src/games/hundred/logic.ts";
import { createEmptyRoom as emptyHundred } from "../src/games/hundred/types.ts";
import * as note from "../src/games/note/logic.ts";
import { createEmptyRoom as emptyNote } from "../src/games/note/types.ts";
import * as detective from "../src/games/detective/logic.ts";
import { createEmptyRoom as emptyDetective } from "../src/games/detective/types.ts";
import { recomputeScores } from "../src/games/bac/logic.ts";
import { reassignHost } from "../src/lib/host.ts";

// Les sept Player partagent id/token/name/connected ; le reste (alive,
// eliminated, found, number...) est passé par jeu dans `extra`.
function addPlayers<R extends { players: Record<string, any>; playerOrder: string[] }>(
  room: R,
  players: Record<string, Record<string, unknown>>,
): R {
  for (const [id, extra] of Object.entries(players)) {
    room.players[id] = { id, token: id, name: id, connected: true, ...extra };
    room.playerOrder.push(id);
  }
  return room;
}

// --- Undercover : rôles, votes, victoire ------------------------------------

{
  const room = emptyUndercover("TEST");
  addPlayers(room, { a: {}, b: {}, c: {}, d: {}, e: {}, f: {} });
  room.settings = { undercoverCount: 2, mrWhiteCount: 1, category: "random" };
  undercover.assignRoles(room);

  const roles = Object.values(room.players).map((p) => p.role);
  assert.equal(roles.filter((r) => r === "undercover").length, 2, "2 undercover attendus");
  assert.equal(roles.filter((r) => r === "mrwhite").length, 1, "1 Mr White attendu");
  assert.equal(roles.filter((r) => r === "civilian").length, 3, "3 civils attendus");
  assert.notEqual(room.civilianWord, room.undercoverWord, "les deux mots doivent différer");
  for (const p of Object.values(room.players)) {
    assert.ok(p.alive, "tout le monde démarre vivant");
    if (p.role === "mrwhite") assert.equal(p.word, undefined, "Mr White n'a pas de mot");
    else assert.equal(p.word, p.role === "undercover" ? room.undercoverWord : room.civilianWord);
  }

  // Il doit toujours rester au moins 2 civils.
  assert.equal(undercover.validateSettings(6, { undercoverCount: 2, mrWhiteCount: 1, category: "random" }), null);
  assert.ok(undercover.validateSettings(4, { undercoverCount: 2, mrWhiteCount: 1, category: "random" }));
  assert.ok(undercover.validateSettings(5, { undercoverCount: -1, mrWhiteCount: 0, category: "random" }));
}

{
  const room = emptyUndercover("TEST");
  addPlayers(room, { a: {}, b: {}, c: {} });

  room.votes = { a: "b", c: "b", b: "a" };
  const clear = undercover.tallyVotes(room);
  assert.equal(clear.eliminatedId, "b");
  assert.equal(clear.tie, false);
  assert.deepEqual(clear.tally, { b: 2, a: 1 });

  // Égalité : personne n'est éliminé, la manche continue.
  room.votes = { a: "b", b: "a" };
  const tied = undercover.tallyVotes(room);
  assert.equal(tied.tie, true);
  assert.equal(tied.eliminatedId, null);

  // Personne n'a voté : pas d'élimination fantôme.
  room.votes = {};
  assert.equal(undercover.tallyVotes(room).eliminatedId, null);
}

{
  const win = (players: Record<string, Record<string, unknown>>) =>
    undercover.checkWinCondition(addPlayers(emptyUndercover("TEST"), players));

  const civ = { role: "civilian", alive: true };
  assert.equal(win({ a: civ, b: civ, c: { role: "undercover", alive: false } }), "civilians");
  assert.equal(win({ a: civ, b: civ, c: { role: "undercover", alive: true } }), null);
  // Parité 1 civil / 1 imposteur : les imposteurs l'emportent.
  assert.equal(win({ a: civ, b: { role: "undercover", alive: true } }), "undercover");
  assert.equal(win({ a: civ, b: { role: "mrwhite", alive: true } }), "undercover");
  // Un mort ne compte plus, quel que soit son rôle.
  assert.equal(win({ a: civ, b: civ, c: { role: "mrwhite", alive: false } }), "civilians");
}

// --- Bombe : rotation des tours, lettres -------------------------------------

{
  const room = emptyBomb("TEST");
  addPlayers(room, {
    a: { lives: 2, eliminated: false },
    b: { lives: 2, eliminated: true },
    c: { lives: 0, eliminated: false, connected: false },
    d: { lives: 1, eliminated: false },
  });

  assert.equal(bomb.nextTurn(room, "a"), "d", "b éliminé et c déconnecté sont sautés");
  assert.equal(bomb.nextTurn(room, "d"), "a", "la rotation boucle");
  assert.equal(bomb.nextTurn(room, null), "a", "premier tour");
  // Le piège documenté : afterId vient d'être éliminé, il faut quand même
  // repartir de sa position et ne pas se le réattribuer.
  room.players.a.eliminated = true;
  assert.equal(bomb.nextTurn(room, "a"), "d");
  // Plus personne d'éligible.
  room.players.d.eliminated = true;
  assert.equal(bomb.nextTurn(room, "a"), null);

  assert.deepEqual(bomb.aliveIds(room), ["c"], "éliminé reste éliminé même déconnecté");
  assert.deepEqual(bomb.connectedIds(room), ["a", "b", "d"]);
}

{
  assert.ok(bomb.startsWithLetter("Éren", "E"), "accents ignorés");
  assert.ok(bomb.startsWithLetter("  naruto", "N"), "espaces et casse ignorés");
  assert.ok(!bomb.startsWithLetter("Sasuke", "N"));
  assert.ok(!bomb.startsWithLetter("   ", "N"), "une réponse vide ne passe pas");

  const delay = bomb.randomBombDelay();
  assert.ok(delay >= 20_000 && delay < 50_000, `mèche hors bornes : ${delay}`);
}

// --- Qui suis-je : rotation et attribution des mots --------------------------

{
  const room = emptyWhoami("TEST");
  addPlayers(room, {
    a: { found: false },
    b: { found: true },
    c: { found: false, connected: false },
    d: { found: false },
  });
  assert.equal(whoami.nextTurn(room, "a"), "d", "trouvé et déconnecté sont sautés");
  // Règle « celui qui trouve fait sauter le suivant » : deux appels chaînés,
  // le second part d'un joueur devenu inéligible entre-temps.
  room.players.d.found = true;
  assert.equal(whoami.nextTurn(room, whoami.nextTurn(room, "a")!), "a");
}

{
  const room = emptyWhoami("TEST");
  addPlayers(room, {
    a: { submittedWord: "wa", submittedRef: "ra", ready: true },
    b: { submittedWord: "wb", submittedRef: "rb", ready: true },
    c: { submittedWord: "wc", submittedRef: "rc", ready: true },
    d: { submittedWord: "wd", submittedRef: "rd", ready: true },
  });
  whoami.assignWords(room);

  const words = Object.values(room.players).map((p) => p.word);
  assert.equal(new Set(words).size, 4, "chaque mot est attribué une seule fois");
  for (const id of ["a", "b", "c", "d"]) {
    const p = room.players[id];
    assert.notEqual(p.word, `w${id}`, `${id} ne doit pas recevoir son propre mot`);
    assert.equal(p.submittedWord, null, "les propositions sont consommées");
    assert.equal(p.ready, false);
    assert.equal(p.found, false);
  }
}

// --- 1 à 100 : nombres et score ----------------------------------------------

{
  const room = emptyHundred("TEST");
  addPlayers(room, { a: {}, b: {}, c: { connected: false } });
  hundred.assignNumbers(room);

  const numbers = [room.players.a.number, room.players.b.number];
  assert.equal(new Set(numbers).size, 2, "pas de doublon");
  for (const n of numbers) assert.ok(n >= 1 && n <= 100, `nombre hors bornes : ${n}`);
  assert.equal(room.players.c.number, null, "un déconnecté ne reçoit pas de nombre");

  assert.equal(hundred.allProposed(room), false);
  room.players.a.proposal = 1;
  room.players.b.proposal = 2;
  assert.equal(hundred.allProposed(room), true, "le déconnecté ne bloque pas la manche");
}

{
  const room = emptyHundred("TEST");
  addPlayers(room, { a: { number: 10 }, b: { number: 50 }, c: { number: 30 } });

  room.order = ["a", "b", "c"];
  assert.deepEqual(hundred.computeScore(room), { correctPairs: 1, total: 2, sortedFully: false });
  room.order = ["a", "c", "b"];
  assert.deepEqual(hundred.computeScore(room), { correctPairs: 2, total: 2, sortedFully: true });
  room.order = [];
  assert.equal(hundred.computeScore(room).sortedFully, false, "un ordre vide n'est pas une réussite");
}

// --- La note : devineur et étapes --------------------------------------------

{
  const room = emptyNote("TEST");
  addPlayers(room, { a: {}, b: {}, c: { connected: false } });
  room.guesserId = "a";

  assert.deepEqual(note.informedIds(room), ["b"], "le devineur ne voit pas le nombre");
  for (let i = 0; i < 20; i++) {
    assert.equal(note.pickGuesser(room), "b", "jamais deux fois le même devineur d'affilée");
  }
  assert.equal(note.pickGuesser(room, "a"), "a", "l'hôte peut forcer un devineur");
  assert.equal(note.pickGuesser(room, "zz"), "b", "un id inconnu retombe sur le tirage");

  // Seul en ligne : il se redevine lui-même plutôt que de bloquer le salon.
  room.players.b.connected = false;
  assert.equal(note.pickGuesser(room), "a");

  assert.equal(note.nextStep("character"), "anime");
  assert.equal(note.nextStep("anime"), "lastChance");
  assert.equal(note.nextStep("lastChance"), "guessing", "après la dernière étape, on devine");
}

// --- Détective : la rotation survit à une déconnexion -------------------------

{
  const room = emptyDetective("TEST");
  addPlayers(room, { a: {}, b: {}, c: {} });
  assert.equal(detective.nextTurn(room, "a"), "b");
  room.players.b.connected = false;
  assert.equal(detective.nextTurn(room, "a"), "c", "le tour saute le déconnecté");
  assert.deepEqual(detective.othersOf(room, "a"), ["c"]);
  room.players.c.connected = false;
  assert.equal(detective.nextTurn(room, "a"), "a", "seul rescapé : le tour lui revient");
}

// --- Petit Bac : 2 points seul, 1 point en doublon ----------------------------

{
  const result = {
    letter: "N",
    categories: ["anime"],
    totals: { a: 0, b: 0, c: 0 },
    byCategory: [
      {
        category: "anime",
        entries: [
          { playerId: "a", answer: "Naruto", valid: true, points: 0 },
          { playerId: "b", answer: "naruto uzumaki", valid: true, points: 0 },
          { playerId: "c", answer: "Nana", valid: true, points: 0 },
        ],
      },
    ],
  };
  recomputeScores(result);
  assert.deepEqual(result.totals, { a: 1, b: 1, c: 2 }, "doublon = 1 point, unique = 2");

  // Une réponse refusée par l'hôte ne compte pas — et ne rend plus l'autre doublon.
  result.byCategory[0].entries[1].valid = false;
  recomputeScores(result);
  assert.deepEqual(result.totals, { a: 2, b: 0, c: 2 });
}

// --- Hôte : un départ ne doit jamais figer le salon ---------------------------

{
  const room = emptyUndercover("TEST");
  addPlayers(room, { a: {}, b: { connected: false }, c: {} });
  room.hostId = "a";

  reassignHost(room, "b");
  assert.equal(room.hostId, "a", "le départ d'un non-hôte ne change rien");
  // handleClose marque le partant déconnecté avant d'appeler reassignHost.
  room.players.a.connected = false;
  reassignHost(room, "a");
  assert.equal(room.hostId, "c", "le suivant en ligne reprend la main");

  room.players.c.connected = false;
  reassignHost(room, "c");
  assert.equal(room.hostId, "c", "plus personne en ligne : l'hôte reste, il reviendra avec son token");
}

console.log("logic: ok");
