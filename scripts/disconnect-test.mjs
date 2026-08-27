// Vérifie, sur un serveur `npm run dev` déjà lancé, qu'un salon survit au
// départ de son hôte : c'est lui seul qui peut démarrer, relancer, exclure ou
// changer de jeu, donc sans successeur le salon devient injouable.
//
//   npm run dev            (dans un autre terminal)
//   node scripts/disconnect-test.mjs
//
// Pas dans `npm test` : ça demande un serveur en face (cf. CLAUDE.md).
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const GAMES = ["undercover", "hundred", "bac", "whoami", "detective", "note", "bomb", "codenames", "sync"];

function join(slug, code, name, spectator = false) {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws/${slug}/${code}`);
  const states = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== "state") return;
    states.push(msg.state);
    for (const resolve of waiters.splice(0)) resolve(msg.state);
  });
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", name, spectator })));
  return {
    ws,
    last: () => states[states.length - 1],
    next: () => new Promise((resolve) => waiters.push(resolve)),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(client, predicate, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate(client.last())) return client.last();
    await sleep(50);
  }
  throw new Error(`délai dépassé : ${label}`);
}

for (const slug of GAMES) {
  const res = await fetch(`${BASE}/api/${slug}/create`, { method: "POST" });
  const { code } = await res.json();

  const host = join(slug, code, "Hote1");
  await host.next();
  const guest = join(slug, code, "Invite1");
  await guest.next();
  await sleep(200);

  const hostId = guest.last().hostId;
  if (!hostId || guest.last().players.length !== 2) {
    throw new Error(`${slug}: lobby incomplet (${JSON.stringify(guest.last().players)})`);
  }

  const spectator = join(slug, code, "Public1", true);
  const spectatorState = await spectator.next();
  await waitUntil(guest, (state) => state?.spectatorCount === 1, "arrivée du spectateur");
  if (!spectatorState.spectator || spectatorState.players.length !== 2 || spectatorState.waiting?.length) {
    throw new Error(`${slug}: le spectateur a pris une place (${JSON.stringify(spectatorState)})`);
  }

  spectator.ws.send(JSON.stringify({ type: "restart" }));
  await sleep(100);
  if (guest.last().phase !== "lobby") throw new Error(`${slug}: un spectateur a pu agir`);
  spectator.ws.close();
  await waitUntil(guest, (state) => state?.spectatorCount === 0, "départ du spectateur");

  host.ws.close();
  const after = await guest.next();
  if (after.hostId === hostId) throw new Error(`${slug}: l'hôte parti reste hôte, salon bloqué`);
  if (!after.players.some((p) => p.id === after.hostId && p.connected)) {
    throw new Error(`${slug}: nouvel hôte introuvable ou déconnecté`);
  }

  guest.ws.close();
  console.log(`${slug}: ok`);
}

console.log(`l'hôte est réattribué à sa déconnexion dans les ${GAMES.length} jeux`);

// Même longueur d'onde : l'arbitre choisi avant le départ reçoit les réponses
// en privé, tandis que les joueurs ne les découvrent qu'au rythme des clics de
// révélation. Le dernier clic doit calculer les scores et terminer la partie.
{
  const { code } = await (await fetch(`${BASE}/api/sync/create`, { method: "POST" })).json();
  const host = join("sync", code, "Hote1");
  await host.next();
  const p2 = join("sync", code, "Invite1");
  const referee = join("sync", code, "Arbitre1");
  await p2.next();
  await referee.next();
  await sleep(300);

  const refereeId = host.last().players.find((p) => p.name === "Arbitre1")?.id;
  host.ws.send(JSON.stringify({ type: "start", refereeId }));
  await sleep(200);
  if (host.last().phase !== "questions" || host.last().refereeId !== refereeId) {
    throw new Error("sync: l'arbitre choisi dans le lobby n'a pas été conservé");
  }

  referee.ws.send(JSON.stringify({
    type: "submitQuestions",
    questions: ["Le plus stylé ?", "Le plus beau ?", "Le meilleur héros ?"],
  }));
  await sleep(200);
  host.ws.send(JSON.stringify({ type: "submitAnswer", question: 0, answer: "Itachi" }));
  await waitUntil(host, (state) => state?.players.find((player) => player.name === "Hote1")?.answerCount === 1, "première réponse hôte");
  await waitUntil(p2, (state) => state?.players.find((player) => player.name === "Hote1")?.answerCount === 1, "progression publique hôte");
  await waitUntil(referee, (state) => state?.refereeAnswers?.flatMap((entry) => entry.values).length === 1, "réponse privée arbitre");

  const publicValues = p2.last().answers.flatMap((entry) => entry.values).filter(Boolean);
  const privateValues = referee.last().refereeAnswers.flatMap((entry) => entry.values).filter(Boolean);
  if (publicValues.length !== 0 || privateValues.length !== 1) {
    throw new Error("sync: les réponses en attente ne sont pas privées à l'arbitre");
  }

  host.ws.send(JSON.stringify({ type: "submitAnswer", question: 1, answer: "SNK" }));
  await waitUntil(host, (state) => state?.players.find((player) => player.name === "Hote1")?.answerCount === 2, "deuxième réponse hôte");
  host.ws.send(JSON.stringify({ type: "submitAnswer", question: 2, answer: "Naruto" }));
  await waitUntil(host, (state) => state?.players.find((player) => player.name === "Hote1")?.answerCount === 3, "troisième réponse hôte");
  p2.ws.send(JSON.stringify({ type: "submitAnswer", question: 0, answer: "itachi!" }));
  await waitUntil(p2, (state) => state?.players.find((player) => player.name === "Invite1")?.answerCount === 1, "première réponse invité");
  p2.ws.send(JSON.stringify({ type: "submitAnswer", question: 1, answer: "One Piece" }));
  await waitUntil(p2, (state) => state?.players.find((player) => player.name === "Invite1")?.answerCount === 2, "deuxième réponse invité");
  p2.ws.send(JSON.stringify({ type: "submitAnswer", question: 2, answer: "Naruto" }));
  await waitUntil(p2, (state) => state?.phase === "reveal", "début de la révélation");
  if (p2.last().phase !== "reveal") {
    throw new Error(`sync: la révélation n'a pas démarré (${JSON.stringify({
      phase: p2.last().phase,
      players: p2.last().players.map((player) => ({ name: player.name, answerCount: player.answerCount })),
    })})`);
  }

  referee.ws.send(JSON.stringify({ type: "revealNext" }));
  await waitUntil(host, (state) => state?.phase === "reveal" && state.revealedCounts?.[0] === 1, "première révélation");
  const firstReveal = host.last().answers.filter((entry) => entry.values[0] != null);
  if (firstReveal.length !== 1) throw new Error("sync: plus d'une réponse révélée par clic");

  for (let click = 0; click < 8; click++) {
    const before = JSON.stringify({
      phase: referee.last()?.phase,
      question: referee.last()?.revealQuestion,
      counts: referee.last()?.revealedCounts,
    });
    referee.ws.send(JSON.stringify({ type: "revealNext" }));
    await waitUntil(referee, (state) => JSON.stringify({
      phase: state?.phase,
      question: state?.revealQuestion,
      counts: state?.revealedCounts,
    }) !== before, `révélation ${click + 2}`);
  }
  if (host.last().phase !== "ended") throw new Error("sync: la partie ne se termine pas après trois questions");
  const respondentScores = Object.values(host.last().scores).sort((a, b) => a - b);
  if (JSON.stringify(respondentScores) !== JSON.stringify([2, 2])) {
    throw new Error(`sync: scores inattendus ${JSON.stringify(host.last().scores)}`);
  }

  host.ws.close();
  p2.ws.close();
  referee.ws.close();
  console.log("sync: arbitre, confidentialité, révélations et scores validés");
}

// Deuxième garde-fou : une phase qui attend "tout le monde" ne doit pas rester
// bloquée sur quelqu'un qui est parti. 1 à 100, phase "propose" : deux joueurs
// proposent, le troisième ferme son onglet -> la manche doit passer à "arrange".
{
  const { code } = await (await fetch(`${BASE}/api/hundred/create`, { method: "POST" })).json();
  const host = join("hundred", code, "Hote1");
  await host.next();
  const p2 = join("hundred", code, "Invite1");
  const p3 = join("hundred", code, "Invite2");
  await p2.next();
  await p3.next();
  await sleep(300);

  host.ws.send(JSON.stringify({ type: "start", mode: "perso" }));
  await sleep(300);
  if (host.last().phase !== "propose") throw new Error("hundred: la manche n'a pas démarré");

  host.ws.send(JSON.stringify({ type: "propose", text: "Naruto" }));
  p2.ws.send(JSON.stringify({ type: "propose", text: "Luffy" }));
  await sleep(300);
  if (host.last().phase !== "propose") throw new Error("hundred: phase avancée trop tôt");

  p3.ws.close();
  await sleep(500);
  if (host.last().phase !== "arrange") {
    throw new Error(`hundred: phase bloquée sur "${host.last().phase}" après le départ du dernier joueur attendu`);
  }
  host.ws.close();
  p2.ws.close();
  console.log("hundred: la phase se débloque quand le joueur attendu part");
}

// Un code jamais créé doit être annoncé comme inexistant : c'est ce que le
// client sonde avant de rejoindre. Sans ça, une faute de frappe ouvre un salon
// fantôme (le Durable Object naît à la demande) où le joueur attend seul.
{
  const unknown = Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const before = await (await fetch(`${BASE}/api/bomb/exists/${unknown}`)).json();
  if (before.exists) throw new Error("exists: un code jamais créé est annoncé comme existant");

  const { code } = await (await fetch(`${BASE}/api/bomb/create`, { method: "POST" })).json();
  const host = join("bomb", code, "Hote1");
  await host.next();
  const after = await (await fetch(`${BASE}/api/bomb/exists/${code}`)).json();
  if (!after.exists) throw new Error("exists: un salon créé et rejoint est annoncé comme inexistant");
  host.ws.close();
  console.log("exists: code inconnu refusé, salon réel reconnu");
}

process.exit(0);
