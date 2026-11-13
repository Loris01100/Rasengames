import { GAME_NAMESPACES, isGameSlug } from "./gameSlugs";
import type { Env } from "../env";
import { armIdlePurge } from "./idle";
import { createRoomCode } from "./rooms";

// La plomberie de session strictement identique dans les `room.ts` :
// vérifiée au diff, ces fonctions y étaient copiées à l'octet près. Même
// critère que `host.ts` — on ne factorise que ce qui ne diverge pas d'un jeu
// à l'autre (les tours, les votes et les phases, eux, restent chez chaque
// jeu). Typage structurel/générique plutôt qu'une classe de base : chaque
// `RoomState` garde sa forme, on ne décrit ici que les champs touchés.
export interface Session {
  ws: WebSocket;
  playerId: string;
  spectator: boolean;
  spectatorName: string;
  // Code du salon, retenu pour recharger l'état après une hibernation : un
  // salon où personne n'a encore rejoint n'a rien en stockage, et
  // `createEmptyRoom` a besoin du code.
  code: string;
  // Horodatages des derniers messages reçus, cf. lib/throttle.ts. Perdu à
  // l'hibernation, sans conséquence : un salon ne s'endort que s'il est calme.
  recent: number[];
}

export function sendError(ws: WebSocket, message: string): void {
  try {
    ws.send(JSON.stringify({ type: "error", message }));
  } catch {
    // socket already gone
  }
}

// --- WebSockets hibernables -------------------------------------------------
// Les salons acceptent leurs sockets par `state.acceptWebSocket()` et non plus
// `ws.accept()` : entre deux messages, le runtime peut décharger le DO de la
// mémoire sans fermer les connexions, et la durée d'exécution cesse d'être
// facturée pendant qu'un groupe réfléchit. Au réveil (message, fermeture,
// alarme), le constructeur repart de zéro : `this.room` est relu par
// `loadRoom()`, et chaque `Session` est reconstruite depuis l'« attachment »
// de sa socket, seul état par connexion qui survit à l'hibernation.
//
// Un `setTimeout` en attente empêche l'hibernation (doc Cloudflare) : l'écriture
// groupée du Petit Bac aboutit donc toujours, elle retarde juste l'endormissement.

interface Attachment {
  playerId: string;
  spectator: boolean;
  spectatorName: string;
  code: string;
}

function fromAttachment(ws: WebSocket): Session {
  const a = ws.deserializeAttachment() as Attachment | null;
  return {
    ws,
    playerId: a?.playerId ?? "",
    spectator: a?.spectator ?? false,
    spectatorName: a?.spectatorName ?? "",
    code: a?.code ?? "",
    recent: [],
  };
}

// À rappeler après toute modification de playerId/spectator : l'attachment est
// une copie, pas une référence. `dispatchMessage` le fait après chaque message,
// seul moment où une session change.
export function persistSession(session: Session): void {
  const a: Attachment = {
    playerId: session.playerId,
    spectator: session.spectator,
    spectatorName: session.spectatorName,
    code: session.code,
  };
  try {
    session.ws.serializeAttachment(a);
  } catch {
    // socket fermée pendant le traitement (kick) : plus rien à retenir
  }
}

// Dans le constructeur du salon : les sockets toujours ouvertes, telles
// qu'avant l'hibernation (tableau vide au tout premier démarrage).
export function restoreSessions(state: DurableObjectState): Session[] {
  return state.getWebSockets().map(fromAttachment);
}

// Dans `fetch()`, à la place de `server.accept()`.
export function acceptSession(state: DurableObjectState, sessions: Session[], ws: WebSocket, code: string): void {
  state.acceptWebSocket(ws);
  const session: Session = { ws, playerId: "", spectator: false, spectatorName: "", code, recent: [] };
  persistSession(session);
  sessions.push(session);
}

// La session d'une socket. Le repli ne devrait jamais servir (le constructeur
// a tout restauré) mais une socket inconnue ne doit pas perdre son message.
function sessionFor(sessions: Session[], ws: WebSocket): Session {
  let session = sessions.find((s) => s.ws === ws);
  if (!session) {
    session = fromAttachment(ws);
    sessions.push(session);
  }
  return session;
}

// Corps de `webSocketMessage()`. `load` recharge l'état du salon (no-op s'il est
// déjà en mémoire) : après une hibernation, `this.room` est null.
export async function dispatchMessage(
  sessions: Session[],
  ws: WebSocket,
  raw: string | ArrayBuffer,
  load: (code: string) => Promise<unknown>,
  onMessage: (session: Session, raw: string | ArrayBuffer) => Promise<void>,
): Promise<void> {
  const session = sessionFor(sessions, ws);
  try {
    await load(session.code);
    await onMessage(session, raw);
  } catch (err) {
    sendError(ws, err instanceof Error ? err.message : "Erreur inconnue.");
  } finally {
    persistSession(session);
  }
}

// Corps de `webSocketClose()` et `webSocketError()`. Les deux arrivent souvent
// pour la même socket : la session est retirée du tableau *avant* tout await,
// donc le second passage ne la trouve plus et onClose ne s'exécute qu'une fois.
export async function dispatchClose(
  sessions: Session[],
  ws: WebSocket,
  load: (code: string) => Promise<unknown>,
  onClose: (session: Session) => Promise<void>,
): Promise<void> {
  // compatibility_date antérieure au 2026-04-07 : le runtime ne répond pas
  // seul à la trame Close, c'est à nous de terminer la poignée de main.
  try {
    ws.close(1000, "");
  } catch {
    // déjà fermée
  }
  const index = sessions.findIndex((s) => s.ws === ws);
  if (index === -1) return;
  const [session] = sessions.splice(index, 1);
  await load(session.code);
  await onClose(session);
}

// Chaque socket reçoit une vue *personnalisée* : c'est `buildView` qui filtre
// l'information cachée par destinataire, jamais ce broadcast.
export function broadcastState<R>(
  sessions: Session[],
  room: R | null,
  buildView: (room: R, playerId: string) => unknown,
): void {
  if (!room) return;
  const spectatorCount = sessions.filter((session) => session.spectator).length;
  for (const session of sessions) {
    if (!session.playerId) continue;
    const view = buildView(room, session.playerId);
    const state = {
      ...(view as Record<string, unknown>),
      spectator: session.spectator,
      spectatorCount,
    };
    try {
      session.ws.send(JSON.stringify({ type: "state", state }));
    } catch {
      // socket already gone; the close handler will clean it up
    }
  }
}

// Un spectateur est une session éphémère : aucune place dans `players`, aucun
// token persistant, aucun rôle et aucune action de jeu. Son identifiant factice
// permet malgré tout de réutiliser les vues personnalisées existantes.
export function handleSpectatorMessage(
  session: Session,
  msg: Record<string, unknown>,
  gameInProgress: boolean,
): "continue" | "joined" | "blocked" {
  // Spectateur d'office (arrivé sans token en pleine partie) : de retour au
  // lobby, son join sans `spectator` le fait repasser par onJoin comme joueur.
  if (session.spectator && msg.type === "join" && msg.spectator !== true && !gameInProgress) {
    session.spectator = false;
    session.playerId = "";
    session.spectatorName = "";
    return "continue";
  }
  if (session.spectator) {
    sendError(session.ws, "Le mode spectateur est en lecture seule.");
    return "blocked";
  }
  const shouldSpectate = msg.spectator === true || (gameInProgress && !msg.token);
  if (msg.type !== "join" || !shouldSpectate || session.playerId) return "continue";

  const name = String(msg.name ?? "").trim();
  if (name.length < 4 || name.length > 20) {
    sendError(session.ws, "Le pseudo doit contenir entre 4 et 20 caractères.");
    return "blocked";
  }

  joinAsSpectator(session, name);
  return "joined";
}

// Fait de la session un spectateur éphémère. Sert aussi à onJoin pour un token
// inconnu en pleine partie (salon recréé, joueur exclu) : il est traité comme
// une arrivée sans token, jamais rangé dans `waiting`.
export function joinAsSpectator(session: Session, name: string): void {
  session.playerId = `spectator:${crypto.randomUUID()}`;
  session.spectator = true;
  session.spectatorName = name;
  session.ws.send(JSON.stringify({ type: "joined", playerId: session.playerId, spectator: true }));
}

export function nameTaken(
  room: { players: Record<string, { connected: boolean; name: string }>; waiting: { connected: boolean; name: string }[] },
  name: string,
): boolean {
  const taken = (p: { connected: boolean; name: string }) =>
    p.connected && p.name.toLowerCase() === name.toLowerCase();
  return Object.values(room.players).some(taken) || room.waiting.some(taken);
}

// Pseudo retenu quand un joueur revient avec son token. On ne refuse jamais la
// reconnexion (le client n'aurait qu'un toast et resterait sans identité en
// pleine manche) mais deux joueurs ne doivent jamais partager un pseudo, même
// si l'un est déconnecté : la soirée rattache les scores par pseudo
// (onFinishGame) et deux « Naruto » s'y partageraient un même score.
// Ordre : le pseudo demandé s'il est libre, sinon l'ancien, sinon l'ancien
// suffixé d'un numéro (cas d'un nouveau venu qui a pris le pseudo d'un absent).
export function rejoinName(
  room: { players: Record<string, { id: string; name: string }>; waiting: { id: string; name: string }[] },
  selfId: string,
  requested: string,
  current: string,
  maxLength: number,
): string {
  const others = [...Object.values(room.players), ...room.waiting].filter((p) => p.id !== selfId);
  const free = (name: string) => !others.some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (free(requested)) return requested;
  if (free(current)) return current;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = current.slice(0, maxLength - suffix.length).trimEnd() + suffix;
    if (free(candidate)) return candidate;
  }
}

// Lors d'un changement de jeu (ou d'un lancement en soirée), tous les
// navigateurs ouvrent un nouveau Durable Object et l'ancien hôte peut arriver
// après un autre joueur. Pour lui rendre la main sans dépendre de la course
// entre connexions, le salon d'origine dépose une clé à usage unique dans le
// salon cible (`issueHostKey`) et ne la transmet qu'à l'hôte. Un drapeau
// fourni par le client ne suffit pas : n'importe qui pourrait l'envoyer et
// prendre l'hôte d'un salon en cours.
const HOST_KEY = "hostKey";
const HOST_KEY_PATTERN = /^[0-9a-f-]{36}$/;

// Route interne, joignable seulement depuis le Worker : index.ts ne relaie
// vers un salon que `/ws/<slug>/<code>` (WebSocket) et `/exists/`.
export function isHostKeyRequest(request: Request, parts: string[]): boolean {
  return request.method === "POST" && parts[parts.length - 2] === "host-key";
}

export async function storeHostKey(storage: DurableObjectStorage, request: Request): Promise<Response> {
  const key = (await request.text()).trim();
  if (!HOST_KEY_PATTERN.test(key)) return new Response("Clé invalide", { status: 400 });
  await storage.put(HOST_KEY, key);
  // Personne n'est encore connecté : si le groupe ne vient jamais, la purge
  // habituelle efface la clé avec le reste.
  await armIdlePurge(storage, 0);
  return new Response(null, { status: 204 });
}

export async function issueHostKey(slug: string, namespace: DurableObjectNamespace, code: string): Promise<string> {
  const key = crypto.randomUUID();
  await namespace
    .get(namespace.idFromName(code))
    .fetch(new Request(`https://room/${slug}/host-key/${code}`, { method: "POST", body: key }));
  return key;
}

export async function assignHostAfterSwitch(
  storage: DurableObjectStorage,
  room: { hostId: string | null },
  playerId: string,
  msg: Record<string, unknown>,
): Promise<void> {
  if (!room.hostId) room.hostId = playerId;
  if (typeof msg.hostKey !== "string" || !msg.hostKey) return;
  const expected = await storage.get<string>(HOST_KEY);
  if (!expected || expected !== msg.hostKey) return;
  // Consommée au premier usage : un lien recopié ne resservira pas.
  await storage.delete(HOST_KEY);
  room.hostId = playerId;
}

// Les joueurs arrivés en cours de partie rejoignent la table au retour au
// lobby, avec l'id et le token qu'ils ont déjà en localStorage.
export function promoteWaiting<P extends { id: string }>(room: {
  players: Record<string, P>;
  playerOrder: string[];
  waiting: P[];
}): void {
  for (const p of room.waiting) {
    room.players[p.id] = p;
    room.playerOrder.push(p.id);
  }
  room.waiting = [];
}

// Au lobby seulement : un salon plein dont un joueur est parti libère la place
// du premier déconnecté (hors hôte) au profit du nouveau venu, sinon un seul
// départ bloque tout remplaçant tant que l'hôte n'exclut pas l'absent. En
// partie, le plafond compte toujours les absents (ils peuvent revenir).
export function lobbyFull<P extends { connected: boolean }>(
  room: { hostId: string | null; players: Record<string, P>; playerOrder: string[] },
  max: number,
): boolean {
  if (room.playerOrder.length < max) return false;
  const gone = room.playerOrder.find((id) => id !== room.hostId && !room.players[id]?.connected);
  if (!gone) return true;
  delete room.players[gone];
  room.playerOrder = room.playerOrder.filter((id) => id !== gone);
  return false;
}

// Host-only, lobby-only: mid-game removal would need per-game turn/vote
// fixups, and a disconnect already covers someone who just leaves.
// Renvoie true quand l'état a changé — au jeu de sauvegarder et diffuser.
export function kickPlayer<P>(
  sessions: Session[],
  session: Session,
  room: { hostId: string | null; phase: string; players: Record<string, P>; playerOrder: string[] },
  msg: Record<string, unknown>,
): boolean {
  if (session.playerId !== room.hostId) {
    sendError(session.ws, "Seul l'hôte peut exclure un joueur.");
    return false;
  }
  if (room.phase !== "lobby") {
    sendError(session.ws, "Impossible d'exclure quelqu'un en pleine partie.");
    return false;
  }
  const targetId = String(msg.playerId ?? "");
  if (!targetId || targetId === room.hostId || !room.players[targetId]) return false;

  delete room.players[targetId];
  room.playerOrder = room.playerOrder.filter((id) => id !== targetId);

  for (const s of sessions.filter((s) => s.playerId === targetId)) {
    try {
      s.ws.send(JSON.stringify({ type: "kicked" }));
      s.ws.close(1000, "kicked");
    } catch {
      // socket already gone
    }
  }
  return true;
}

// Redirige tout le groupe vers un salon neuf du jeu cible. Réutiliser le même
// code pouvait ressusciter une ancienne manche si le groupe revenait sur un
// jeu déjà visité ; le nouveau code reste transparent pour les joueurs.
export async function switchGame(
  sessions: Session[],
  session: Session,
  room: { code: string; hostId: string | null },
  msg: Record<string, unknown>,
  env: Env,
): Promise<void> {
  if (session.playerId !== room.hostId) {
    sendError(session.ws, "Seul l'hôte peut changer de jeu.");
    return;
  }
  const slug = String(msg.slug ?? "");
  if (!isGameSlug(slug)) {
    sendError(session.ws, "Jeu invalide.");
    return;
  }
  const namespace = GAME_NAMESPACES[slug](env);
  const code = await createRoomCode(slug, namespace);
  const hostKey = await issueHostKey(slug, namespace, code);
  for (const s of sessions) {
    try {
      s.ws.send(JSON.stringify({
        type: "switchGame",
        slug,
        code,
        // Seul l'hôte reçoit la clé : c'est elle, pas un drapeau, qui l'identifie.
        hostKey: s.playerId === room.hostId ? hostKey : undefined,
      }));
    } catch {
      // socket already gone
    }
  }
}
