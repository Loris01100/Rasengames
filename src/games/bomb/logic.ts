import type { FuseKey, LetterRule, RoomState } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

// La mèche entière est tirée au sort une fois par bombe et continue de courir
// pendant tous les tours qui passent, sans jamais être révélée ni relancée par
// un simple passage de tour — c'est ce qui la rend "invisible". L'hôte choisit
// la plage au lobby ; seule la plage est publique, jamais le tirage.
export const FUSES: Record<FuseKey, { minMs: number; maxMs: number }> = {
  short: { minMs: 10_000, maxMs: 25_000 },
  normal: { minMs: 20_000, maxMs: 50_000 },
  long: { minMs: 40_000, maxMs: 80_000 },
  // Large écart : une bombe peut partir très vite comme traîner longtemps.
  wild: { minMs: 5_000, maxMs: 70_000 },
};

export function parseFuse(raw: unknown): FuseKey {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(FUSES, raw)
    ? (raw as FuseKey)
    : "normal";
}

export function randomBombDelay(fuse: FuseKey = "normal"): number {
  const { minMs, maxMs } = FUSES[fuse] ?? FUSES.normal;
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

// Vies de départ : nombre d'explosions encaissées sans être éliminé (la
// suivante élimine). 0 = mort subite.
export const DEFAULT_LIVES = 2;
export const MAX_LIVES = 5;

export function parseLives(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return DEFAULT_LIVES;
  return Math.min(MAX_LIVES, Math.max(0, n));
}

export const LETTER_RULES: LetterRule[] = ["start", "contains"];

export function parseLetterRule(raw: unknown): LetterRule {
  return LETTER_RULES.includes(raw as LetterRule) ? (raw as LetterRule) : "start";
}

// Insensible aux accents/majuscules ("Éren" doit compter pour la lettre E).
function normalize(text: string): string {
  return text.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

export function startsWithLetter(text: string, letter: string): boolean {
  return normalize(text).charAt(0) === letter.toUpperCase();
}

export function containsLetter(text: string, letter: string): boolean {
  return normalize(text).includes(letter.toUpperCase());
}

export function matchesLetter(text: string, letter: string, rule: LetterRule): boolean {
  return rule === "contains" ? containsLetter(text, letter) : startsWithLetter(text, letter);
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
