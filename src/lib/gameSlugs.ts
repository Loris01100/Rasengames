import type { Env } from "../env";

// Source unique des mini-jeux : slug → namespace du Durable Object. Le routage
// de `index.ts`, le `switchGame` de `lib/session.ts` et le lancement d'un jeu
// par le mode soirée lisent tous cette table ; la liste des slugs valides et
// le type `GameSlug` en sont dérivés. Ajouter un jeu = une ligne ici.
export const GAME_NAMESPACES = {
  undercover: (env: Env) => env.UNDERCOVER_ROOM,
  hundred: (env: Env) => env.HUNDRED_ROOM,
  bac: (env: Env) => env.BAC_ROOM,
  whoami: (env: Env) => env.WHOAMI_ROOM,
  detective: (env: Env) => env.DETECTIVE_ROOM,
  note: (env: Env) => env.NOTE_ROOM,
  bomb: (env: Env) => env.BOMB_ROOM,
  codenames: (env: Env) => env.CODENAMES_ROOM,
  sync: (env: Env) => env.SYNC_ROOM,
  guesswho: (env: Env) => env.GUESSWHO_ROOM,
} satisfies Record<string, (env: Env) => DurableObjectNamespace>;

export type GameSlug = keyof typeof GAME_NAMESPACES;

export const GAME_SLUGS = Object.keys(GAME_NAMESPACES) as GameSlug[];

export function isGameSlug(slug: string): slug is GameSlug {
  return Object.prototype.hasOwnProperty.call(GAME_NAMESPACES, slug);
}
