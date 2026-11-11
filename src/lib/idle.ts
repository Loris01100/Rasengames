// Purge des salons abandonnés. Un Durable Object garde son stockage pour
// toujours : sans ce ménage, chaque salon créé restait en SQLite à vie et sa
// sonde `exists` répondait vrai indéfiniment. Quand la dernière socket se
// ferme, on note une échéance ; si personne ne s'est reconnecté d'ici là,
// l'alarme efface tout (`deleteAll`).
//
// Un DO n'a qu'une alarme, que bombe, petit bac, qui est-ce et la soirée
// utilisent déjà pour leur jeu. L'échéance vit donc sous sa propre clé :
// - on ne remplace jamais une alarme de jeu en attente (un rafraîchissement
//   ferme la dernière socket en pleine manche, la mèche doit survivre) ;
// - `alarm()` regarde la clé d'abord : échue et salon vide, c'est la purge,
//   sinon c'est une alarme de jeu ;
// - après une alarme de jeu, `rearmIdlePurge` remet le réveil de purge si plus
//   rien n'est programmé.
// Ces fonctions ne font que des accès au stockage : les input gates du DO
// empêchent un autre événement (connexion, message) de s'intercaler au milieu.

export const IDLE_PURGE_MS = 24 * 60 * 60 * 1000;
const KEY = "idlePurgeAt";

// Après le handleClose d'un salon, avec le nombre de sockets restantes
// (spectateurs compris : un spectateur connecté garde le salon en vie).
export async function armIdlePurge(storage: DurableObjectStorage, sessionCount: number): Promise<void> {
  if (sessionCount > 0) return;
  const at = Date.now() + IDLE_PURGE_MS;
  await storage.put(KEY, at);
  if ((await storage.getAlarm()) === null) await storage.setAlarm(at);
}

// À chaque nouvelle connexion WebSocket : le salon revit, la purge est annulée
// (son alarme aussi, mais pas une alarme de jeu qui serait passée devant).
export async function cancelIdlePurge(storage: DurableObjectStorage): Promise<void> {
  const at = await storage.get<number>(KEY);
  if (at === undefined) return;
  await storage.delete(KEY);
  if ((await storage.getAlarm()) === at) await storage.deleteAlarm();
}

// En tête de `alarm()`. Vrai si le salon vient d'être effacé : l'appelant doit
// alors oublier son état en mémoire (`this.room = null`) et ne rien faire d'autre.
export async function purgeIfIdle(storage: DurableObjectStorage, sessionCount: number): Promise<boolean> {
  const at = await storage.get<number>(KEY);
  if (at === undefined || sessionCount > 0 || Date.now() < at) return false;
  // compatibility_date antérieure au 2026-02-24 : deleteAll() laisse l'alarme.
  await storage.deleteAlarm();
  await storage.deleteAll();
  return true;
}

// En fin de `alarm()` d'un jeu : l'alarme de jeu a consommé le réveil, on
// reprogramme la purge si elle est due et que rien d'autre n'est en attente.
export async function rearmIdlePurge(storage: DurableObjectStorage): Promise<void> {
  const at = await storage.get<number>(KEY);
  if (at === undefined || (await storage.getAlarm()) !== null) return;
  await storage.setAlarm(Math.max(at, Date.now()));
}
