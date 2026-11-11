import type { RoomState } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

// La mèche entière est tirée au sort une fois par bombe et continue de courir
// pendant tous les tours qui passent, sans jamais être révélée ni relancée par
// un simple passage de tour — c'est ce qui la rend "invisible".
export const BOMB_MIN_MS = 20_000;
export const BOMB_MAX_MS = 50_000;

export function randomBombDelay(): number {
  return BOMB_MIN_MS + Math.floor(Math.random() * (BOMB_MAX_MS - BOMB_MIN_MS));
}

// Insensible aux accents/majuscules ("Éren" doit compter pour la lettre E).
export function startsWithLetter(text: string, letter: string): boolean {
  const first = text
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .charAt(0)
    .toUpperCase();
  return first === letter.toUpperCase();
}

export function connectedIds(room: RoomState): string[] {
  return room.playerOrder.filter((id) => room.players[id]?.connected);
}

// Ceux qui peuvent encore recevoir la bombe — et donc les seuls qui comptent
// pour la fin de manche : un joueur parti sans être éliminé ne touche plus
// jamais la bombe, le laisser « survivre » lui offrait la victoire pendant que
// le dernier présent encaissait toutes les explosions à sa place.
export function connectedAliveIds(room: RoomState): string[] {
  return connectedIds(room).filter((id) => !room.players[id]?.eliminated);
}

// Ancre la recherche sur la position de `afterId` dans playerOrder (pas dans
// une liste déjà filtrée) : ça reste correct même quand afterId vient tout
// juste d'être éliminé et n'est donc plus lui-même éligible.
export function nextTurn(room: RoomState, afterId: string | null): string | null {
  const order = room.playerOrder;
  if (order.length === 0) return null;
  const eligible = (id: string) => {
    const p = room.players[id];
    return !!p && p.connected && !p.eliminated;
  };
  const startIndex = afterId ? order.indexOf(afterId) : -1;
  for (let step = 1; step <= order.length; step++) {
    const id = order[(startIndex + step + order.length) % order.length];
    if (eligible(id)) return id;
  }
  return null;
}
