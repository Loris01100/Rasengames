// Chrono par action, facultatif (désactivé par défaut) : l'hôte choisit au
// lobby combien de secondes chacun a pour agir quand le salon l'attend — un
// indice, un vote, une réponse. À l'échéance, le jeu tranche à la place du
// retardataire (tour sauté, vote blanc, réponse vide), comme il le fait déjà
// pour un joueur parti.
//
// Plutôt que d'armer le chrono à chaque transition de chaque jeu (des dizaines
// d'endroits, et un oubli fige le salon), chaque salon décrit l'étape en cours
// par une clé (`stepKey`, null si personne n'est attendu) et appelle
// `syncStepTimer` dans son `saveRoom()`. Une clé nouvelle relance le chrono ;
// la même clé le laisse courir. La clé doit donc changer à chaque nouvelle
// attente (tour suivant, nouveau vote) : un compteur qui progresse y suffit.
//
// L'échéance utilise l'alarme du DO, partagée avec la purge (lib/idle.ts) : le
// chrono n'est armé que si un joueur est connecté, et tombe sinon — la purge,
// elle, n'est armée que quand plus personne ne l'est. Au retour du premier
// joueur, son `join` repasse par `saveRoom()` et relance un chrono complet.

// Secondes ; 0 = désactivé. Le client propose les mêmes valeurs.
export const STEP_TIMER_CHOICES = [0, 30, 45, 60, 90, 120] as const;

export interface StepTimer {
  seconds: number;
  key: string | null; // étape chronométrée en cours
  deadline: number | null; // epoch ms, jamais envoyé tel quel au client
}

export function emptyStepTimer(): StepTimer {
  return { seconds: 0, key: null, deadline: null };
}

// Réglage reçu avec `start` : une valeur hors liste vaut "désactivé".
export function parseStepTimer(raw: unknown): number {
  const seconds = Number(raw);
  return (STEP_TIMER_CHOICES as readonly number[]).includes(seconds) ? seconds : 0;
}

interface TimedRoom {
  players: Record<string, { connected: boolean }>;
  stepTimer: StepTimer;
}

function anyoneConnected(room: TimedRoom): boolean {
  return Object.values(room.players).some((p) => p.connected);
}

// Partie pure de `syncStepTimer` (testée dans logic-test) : met le chrono à
// jour et renvoie l'échéance à programmer, ou null s'il n'y a rien à armer.
export function updateStepTimer(room: TimedRoom, key: string | null, now: number): number | null {
  const timer = room.stepTimer;
  if (key === null || timer.seconds <= 0 || !anyoneConnected(room)) {
    timer.key = null;
    timer.deadline = null;
    return null;
  }
  if (timer.key === key && timer.deadline !== null) return null;
  timer.key = key;
  timer.deadline = now + timer.seconds * 1000;
  return timer.deadline;
}

// Dans `saveRoom()`, avant l'écriture de l'état.
export async function syncStepTimer(storage: DurableObjectStorage, room: TimedRoom, key: string | null): Promise<void> {
  const at = updateStepTimer(room, key, Date.now());
  if (at !== null) await storage.setAlarm(at);
}

// À la sonnerie, avec la clé de l'étape actuelle :
// - "timeout" : l'étape a expiré, le jeu doit trancher (puis sauvegarder) ;
// - "changed" : chrono tombé (plus personne de connecté), à sauvegarder ;
// - "none"    : alarme périmée ou en avance, rien à faire.
export async function checkStepTimer(
  storage: DurableObjectStorage,
  room: TimedRoom,
  key: string | null,
): Promise<"timeout" | "changed" | "none"> {
  const timer = room.stepTimer;
  if (timer.deadline === null || timer.key === null) return "none";
  if (!anyoneConnected(room) || key !== timer.key) {
    timer.key = null;
    timer.deadline = null;
    return "changed";
  }
  if (Date.now() < timer.deadline) {
    // Réveil en avance (une autre alarme a été consommée avant) : on se
    // reprogramme sur la vraie échéance.
    await storage.setAlarm(timer.deadline);
    return "none";
  }
  // Consommé : le `saveRoom()` qui suit armera l'étape suivante, même si sa
  // clé est identique (un tour sauté qui revient au même joueur).
  timer.key = null;
  timer.deadline = null;
  return "timeout";
}

// Pour la vue : durée restante (et non un instant — horloges des téléphones
// décalées, cf. src/CLAUDE.md « Chrono et écritures »).
export function stepEndsIn(room: TimedRoom): number | null {
  const deadline = room.stepTimer.deadline;
  return deadline === null ? null : Math.max(0, deadline - Date.now());
}
