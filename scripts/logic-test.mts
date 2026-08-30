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
import * as codenames from "../src/games/codenames/logic.ts";
import { createEmptyRoom as emptyCodenames } from "../src/games/codenames/types.ts";
import { WORDS as codenamesWords } from "../src/games/codenames/words.ts";
import * as sync from "../src/games/sync/logic.ts";
import { createEmptyRoom as emptySync } from "../src/games/sync/types.ts";
import { recomputeScores } from "../src/games/bac/logic.ts";
import { reassignHost, transferHost } from "../src/lib/host.ts";
import { switchGame } from "../src/lib/session.ts";

// Les neuf Player partagent id/token/name/connected ; le reste (alive,
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
  // Le trouveur devient inéligible : la rotation repart quand même de sa
  // position, et va au suivant — sans sauter personne au passage.
  assert.equal(whoami.nextTurn(room, "b"), "d", "on repart de l'inéligible sans sauter");
  room.players.d.found = true;
  assert.equal(whoami.nextTurn(room, "d"), "a", "d a trouvé : la main revient à a");
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

// --- Hôte : passer la main volontairement ------------------------------------

{
  const room = emptyUndercover("TEST");
  addPlayers(room, { a: {}, b: {}, c: { connected: false } });
  room.hostId = "a";
  // sendError écrit dans la socket : un faux ws suffit, on ne teste que l'état.
  const errors: string[] = [];
  const ws = { send: (raw: string) => errors.push(JSON.parse(raw).message) };
  const asSession = (playerId: string) => ({ ws, playerId, recent: [] }) as any;

  assert.equal(transferHost(asSession("b"), room, { playerId: "b" }), false, "seul l'hôte passe la main");
  assert.equal(room.hostId, "a");

  assert.equal(transferHost(asSession("a"), room, { playerId: "c" }), false, "pas vers un déconnecté");
  assert.equal(transferHost(asSession("a"), room, { playerId: "zz" }), false, "cible inconnue");
  assert.equal(transferHost(asSession("a"), room, { playerId: "a" }), false, "pas vers soi-même");
  assert.equal(room.hostId, "a");

  assert.equal(transferHost(asSession("a"), room, { playerId: "b" }), true);
  assert.equal(room.hostId, "b", "b est le nouvel hôte");
  assert.equal(
    transferHost(asSession("a"), room, { playerId: "a" }),
    false,
    "l'ancien hôte ne peut plus reprendre la main tout seul",
  );

  room.phase = "clue";
  assert.equal(transferHost(asSession("b"), room, { playerId: "a" }), false, "lobby seulement");
  assert.equal(room.hostId, "b");
}

// --- Codenames : clés, assignation, résolution des pioches -------------------

{
  // Chaque mot du plateau porte un indice de contexte (sa série d'origine) :
  // 25 mots uniques, chacun avec un indice non vide.
  const board = codenames.pickBoard();
  assert.equal(board.length, 25);
  assert.equal(new Set(board.map((e) => e.word)).size, 25, "pas de mot en double sur un plateau");
  assert.ok(board.every((e) => e.hint && e.hint.trim().length > 0), "chaque mot a un indice de contexte");
}

{
  const key = codenames.generateDuetKey(25);
  assert.equal(key.filter((c) => c === "agent").length, 9);
  assert.equal(key.filter((c) => c === "assassin").length, 3);
  assert.equal(key.filter((c) => c === "bystander").length, 13);
}

{
  // Union des deux clés : une case comptée une seule fois même si "agent" des deux côtés.
  const keyA = ["agent", "agent", "bystander", "assassin"] as const;
  const keyB = ["agent", "bystander", "agent", "agent"] as const;
  assert.equal(codenames.countDuetAgents([...keyA], [...keyB]), 4, "4 cases agent sur au moins une clé, sur 4");
}

{
  const keyA = codenames.generateTeamKey("A", 25);
  assert.equal(keyA.filter((c) => c === "agentA").length, 9, "l'équipe qui commence a 9 mots");
  assert.equal(keyA.filter((c) => c === "agentB").length, 8);
  assert.equal(keyA.filter((c) => c === "neutral").length, 7);
  assert.equal(keyA.filter((c) => c === "assassin").length, 1);

  const keyB = codenames.generateTeamKey("B", 25);
  assert.equal(keyB.filter((c) => c === "agentB").length, 9, "l'équipe B commence ici : 9 mots pour elle");
}

{
  const assignment = codenames.assignTeamsAndRoles(["a", "b", "c", "d"]);
  const ids = Object.keys(assignment);
  assert.deepEqual(ids.sort(), ["a", "b", "c", "d"]);
  const spymasters = ids.filter((id) => assignment[id].role === "spymaster");
  const operatives = ids.filter((id) => assignment[id].role === "operative");
  assert.equal(spymasters.length, 2, "un chiffreur par équipe");
  assert.equal(operatives.length, 2, "un agent de terrain par équipe");
  assert.deepEqual(spymasters.map((id) => assignment[id].team).sort(), ["A", "B"]);
  assert.deepEqual(operatives.map((id) => assignment[id].team).sort(), ["A", "B"]);
}

{
  const room = emptyCodenames("TEST") as any;
  addPlayers(room, { a: { seat: "A" }, b: { seat: "B" } });
  room.mode = "duet";
  room.keyA = ["agent", "bystander", "assassin", "agent"];
  room.keyB = ["bystander", "agent", "bystander", "assassin"];
  room.duetAgentsTotal = codenames.countDuetAgents(room.keyA, room.keyB);
  assert.equal(room.duetAgentsTotal, 3, "agent sur au moins une des deux clés : indices 0, 1 et 3");
  room.duetErrors = 5;
  room.duetErrorsMax = 5;
  room.revealed = [false, false, false, false];
  room.revealedColor = [null, null, null, null];
  room.duetTurnSeat = "A";
  room.phase = "playing";

  // A donne un indice, B devine juste (agent) : on continue à deviner.
  room.currentClue = { by: "a", word: "x", number: 1, guessesLeft: 2 };
  codenames.resolveDuetGuess(room, 0); // keyA[0] = agent
  assert.equal(room.revealedColor[0], "agent");
  assert.equal(room.duetTurnSeat, "A", "bonne pioche : on reste sur le même tour");
  assert.ok(room.currentClue, "l'indice reste actif tant qu'il reste des pioches");
  assert.equal(room.currentClue.guessesLeft, 1);

  // Deuxième et dernière pioche autorisée : le tour passe ensuite.
  codenames.resolveDuetGuess(room, 3); // keyA[3] = agent
  assert.equal(room.duetTurnSeat, "B", "plus de pioches : le tour passe");
  assert.equal(room.currentClue, null);
  assert.equal(room.phase, "playing", "pas encore gagné : il manque l'agent de la clé B");

  // B donne un indice à son tour, A devine mal (bystander pour la clé B active) : erreur.
  room.currentClue = { by: "b", word: "y", number: 1, guessesLeft: 2 };
  codenames.resolveDuetGuess(room, 2); // keyB[2] = bystander
  assert.equal(room.duetErrors, 4, "une erreur en moins");
  assert.equal(room.duetTurnSeat, "A", "le tour repasse à A");

  // Nouvel indice de B, A devine le dernier agent (celui de la clé B) : victoire.
  room.duetTurnSeat = "B";
  room.currentClue = { by: "b", word: "z", number: 1, guessesLeft: 2 };
  codenames.resolveDuetGuess(room, 1); // keyB[1] = agent
  assert.equal(room.phase, "ended");
  assert.equal(room.winner, "coop-win");
}

{
  // Toucher l'assassin met fin à la partie sur-le-champ.
  const room = emptyCodenames("TEST") as any;
  addPlayers(room, { a: { seat: "A" }, b: { seat: "B" } });
  room.mode = "duet";
  room.keyA = ["assassin"];
  room.keyB = ["bystander"];
  room.duetAgentsTotal = 0;
  room.duetErrors = 9;
  room.revealed = [false];
  room.revealedColor = [null];
  room.duetTurnSeat = "A";
  room.phase = "playing";
  room.currentClue = { by: "a", word: "x", number: 1, guessesLeft: 2 };
  codenames.resolveDuetGuess(room, 0);
  assert.equal(room.phase, "ended");
  assert.equal(room.winner, "coop-lose-assassin");
}

{
  // La réserve d'erreurs à 0 fait perdre, sans avoir touché l'assassin.
  const room = emptyCodenames("TEST") as any;
  addPlayers(room, { a: { seat: "A" }, b: { seat: "B" } });
  room.mode = "duet";
  room.keyA = ["bystander"];
  room.keyB = ["agent"];
  room.duetAgentsTotal = 1;
  room.duetErrors = 1;
  room.revealed = [false];
  room.revealedColor = [null];
  room.duetTurnSeat = "A";
  room.phase = "playing";
  room.currentClue = { by: "a", word: "x", number: 1, guessesLeft: 2 };
  codenames.resolveDuetGuess(room, 0);
  assert.equal(room.duetErrors, 0);
  assert.equal(room.phase, "ended");
  assert.equal(room.winner, "coop-lose-errors");
}

{
  const room = emptyCodenames("TEST") as any;
  addPlayers(room, {
    a: { team: "A", role: "spymaster" },
    b: { team: "A", role: "operative" },
    c: { team: "B", role: "spymaster" },
    d: { team: "B", role: "operative" },
  });
  room.mode = "teams";
  room.teamColors = ["agentA", "agentB", "neutral", "assassin", "agentA"];
  room.remainingA = 2; // indices 0 et 4
  room.remainingB = 1; // indice 1
  room.revealed = [false, false, false, false, false];
  room.revealedColor = [null, null, null, null, null];
  room.turnTeam = "A";
  room.phase = "playing";

  // Équipe A touche sa propre couleur : on continue, pas de changement de tour.
  room.currentClue = { by: "a", word: "x", number: 2, guessesLeft: 3 };
  codenames.resolveTeamGuess(room, 0);
  assert.equal(room.remainingA, 1);
  assert.equal(room.turnTeam, "A", "bonne pioche : l'équipe garde la main");
  assert.ok(room.currentClue);

  // Équipe A touche un mot neutre : le tour passe.
  codenames.resolveTeamGuess(room, 2);
  assert.equal(room.turnTeam, "B", "mot neutre : le tour passe");
  assert.equal(room.currentClue, null);

  // Équipe B (au tour) touche par erreur la couleur de l'équipe A : ça l'aide, et le tour passe.
  room.currentClue = { by: "c", word: "y", number: 1, guessesLeft: 2 };
  codenames.resolveTeamGuess(room, 4); // dernier agentA
  assert.equal(room.remainingA, 0, "l'équipe A a été involontairement aidée");
  assert.equal(room.phase, "ended", "elle vient de trouver son dernier mot");
  assert.equal(room.winner, "A", "même si ce n'est pas elle qui devinait");
}

{
  // L'assassin fait perdre l'équipe qui devine, gagner l'autre.
  const room = emptyCodenames("TEST") as any;
  addPlayers(room, {
    a: { team: "A", role: "spymaster" },
    b: { team: "A", role: "operative" },
    c: { team: "B", role: "spymaster" },
    d: { team: "B", role: "operative" },
  });
  room.mode = "teams";
  room.teamColors = ["assassin"];
  room.remainingA = 5;
  room.remainingB = 5;
  room.revealed = [false];
  room.revealedColor = [null];
  room.turnTeam = "A";
  room.phase = "playing";
  room.currentClue = { by: "a", word: "x", number: 1, guessesLeft: 2 };
  codenames.resolveTeamGuess(room, 0);
  assert.equal(room.phase, "ended");
  assert.equal(room.winner, "B", "l'équipe B gagne, ce n'est pas elle qui a touché l'assassin");
}

{
  const room = emptyCodenames("TEST") as any;
  addPlayers(room, { a: { role: "spymaster", team: "A" }, b: { role: "operative", team: "A" } });
  room.mode = "teams";
  room.teamColors = ["agentA", "assassin"];
  room.revealed = [false, false];
  room.revealedColor = [null, null];
  assert.equal(codenames.cellColorFor(room, 0, "a"), "agentA", "le chiffreur voit sa grille en permanence");
  assert.equal(codenames.cellColorFor(room, 0, "b"), null, "l'agent de terrain ne voit rien avant révélation");
  room.revealed[1] = true;
  room.revealedColor[1] = "assassin";
  assert.equal(codenames.cellColorFor(room, 1, "b"), "assassin", "une case révélée devient publique");
}

{
  const seen = new Set<string>();
  const duplicates = codenamesWords
    .map((entry) => entry.word)
    .filter((word) => seen.has(word) || !seen.add(word));
  assert.deepEqual(duplicates, [], "le plateau Codenames ne doit pas pouvoir tirer deux cartes identiques");
}

// --- Changement de jeu : salon neuf et hôte conservé -------------------------

{
  const messagesA: any[] = [];
  const messagesB: any[] = [];
  const sessions = [
    { playerId: "a", recent: [], ws: { send: (raw: string) => messagesA.push(JSON.parse(raw)) } },
    { playerId: "b", recent: [], ws: { send: (raw: string) => messagesB.push(JSON.parse(raw)) } },
  ] as any;
  const namespace = {
    idFromName: (code: string) => code,
    get: () => ({ fetch: async () => Response.json({ exists: false }) }),
  };
  const env = {
    UNDERCOVER_ROOM: namespace, HUNDRED_ROOM: namespace, BAC_ROOM: namespace,
    WHOAMI_ROOM: namespace, DETECTIVE_ROOM: namespace, NOTE_ROOM: namespace,
    BOMB_ROOM: namespace, CODENAMES_ROOM: namespace, SYNC_ROOM: namespace,
  } as any;
  await switchGame(sessions, sessions[0], { code: "TEST", hostId: "a" }, { slug: "bomb" }, env);
  assert.equal(messagesA[0].preserveHost, true, "l'ancien hôte doit être désigné dans le nouveau jeu");
  assert.equal(messagesB[0].preserveHost, false, "un invité ne doit pas récupérer le rôle d'hôte");
  assert.notEqual(messagesA[0].code, "TEST", "le jeu cible doit recevoir un salon neuf");
  assert.equal(messagesA[0].code, messagesB[0].code, "tout le groupe doit recevoir le même nouveau code");
}

// --- Même longueur d'onde : normalisation et groupes de réponses -----------

{
  assert.equal(sync.normalizeAnswer("  L'Attaque des Titans ! "), "l attaque des titans");
  assert.equal(sync.normalizeAnswer("RÉM"), "rem");

  const room = emptySync("TEST");
  addPlayers(room, { ref: {}, a: {}, b: {}, c: {} });
  assert.equal(sync.pickReferee(room, "b"), "b", "l'arbitre choisi doit être respecté");
  assert.ok(room.playerOrder.includes(sync.pickReferee(room) ?? ""), "l'arbitre aléatoire doit être connecté");
  room.refereeId = "ref";
  room.answers = {
    a: ["Itachi", "SNK", "Naruto"],
    b: ["itachi!", "One Piece", "Naruto"],
    c: ["Pain", "One Piece", "Bleach"],
  };
  assert.deepEqual(sync.answererIdsForQuestion(room, 1), ["a", "b", "c"]);
  room.answers.c = ["Pain"];
  assert.deepEqual(sync.answererIdsForQuestion(room, 1), ["a", "b"], "une réponse partielle ne crée pas de révélation vide");
  room.answers.c = ["Pain", "One Piece", "Bleach"];
  assert.deepEqual(sync.calculateScores(room), { a: 2, b: 3, c: 1 });
}

console.log("logic: ok");
