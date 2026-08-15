// Single source of truth for valid game slugs, used to validate the
// "switchGame" message each game's room.ts accepts to redirect the whole
// group to another game without anyone having to leave and re-share a code.
export const GAME_SLUGS = ["undercover", "hundred", "bac", "whoami", "detective"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];
