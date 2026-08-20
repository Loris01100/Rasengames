// Garde-fou minimal sur le flux WebSocket entrant : rien n'authentifie un
// client, donc n'importe qui connaissant un code de salon peut envoyer ce
// qu'il veut aussi vite qu'il veut, et chaque message coûte une écriture de
// l'état du salon.
//
// Un client normal reste très en dessous : le plus bavard (Petit Bac) envoie
// une frappe débouncée toutes les 250 ms par catégorie remplie. On ignore les
// messages en trop sans fermer la socket — une rafale légitime ne doit pas
// éjecter un joueur en pleine manche.
export const MAX_MESSAGE_BYTES = 4096;
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 150;

// `recent` est le tampon de la session, modifié sur place.
export function tooManyMessages(recent: number[]): boolean {
  const now = Date.now();
  while (recent.length > 0 && now - recent[0] > WINDOW_MS) recent.shift();
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  return false;
}
