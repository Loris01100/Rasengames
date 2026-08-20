// Vérifie, sur un serveur `npm run dev` déjà lancé, qu'un salon survit au
// départ de son hôte : c'est lui seul qui peut démarrer, relancer, exclure ou
// changer de jeu, donc sans successeur le salon devient injouable.
//
//   npm run dev            (dans un autre terminal)
//   node scripts/disconnect-test.mjs
//
// Pas dans `npm test` : ça demande un serveur en face (cf. CLAUDE.md).
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const GAMES = ["undercover", "hundred", "bac", "whoami", "detective", "note", "bomb"];

function join(slug, code, name) {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws/${slug}/${code}`);
  const states = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== "state") return;
    states.push(msg.state);
    for (const resolve of waiters.splice(0)) resolve(msg.state);
  });
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", name })));
  return {
    ws,
    last: () => states[states.length - 1],
    next: () => new Promise((resolve) => waiters.push(resolve)),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  host.ws.close();
  const after = await guest.next();
  if (after.hostId === hostId) throw new Error(`${slug}: l'hôte parti reste hôte, salon bloqué`);
  if (!after.players.some((p) => p.id === after.hostId && p.connected)) {
    throw new Error(`${slug}: nouvel hôte introuvable ou déconnecté`);
  }

  guest.ws.close();
  console.log(`${slug}: ok`);
}

console.log("l'hôte est réattribué à sa déconnexion dans les 7 jeux");

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

process.exit(0);
