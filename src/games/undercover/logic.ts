import type { Player, RoomState, Settings, VoteResult } from "./types";
import { pickRandomPair } from "./words";

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function defaultSettings(playerCount: number, category: Settings["category"] = "random"): Settings {
  if (playerCount <= 4) return { undercoverCount: 1, mrWhiteCount: 0, category };
  if (playerCount <= 6) return { undercoverCount: 1, mrWhiteCount: 1, category };
  if (playerCount <= 8) return { undercoverCount: 2, mrWhiteCount: 1, category };
  return { undercoverCount: 3, mrWhiteCount: 1, category };
}

export function validateSettings(playerCount: number, settings: Settings): string | null {
  const { undercoverCount, mrWhiteCount } = settings;
  if (undercoverCount < 0 || mrWhiteCount < 0) return "Les nombres de rÃ´les doivent Ãªtre positifs.";
  const specialCount = undercoverCount + mrWhiteCount;
  if (specialCount >= playerCount - 1) {
    return "Il doit rester au moins 2 civils.";
  }
  return null;
}

export function assignRoles(room: RoomState): void {
  const alivePlayers = room.playerOrder
    .map((id) => room.players[id])
    .filter((p): p is Player => !!p && p.connected !== false);

  const pair = pickRandomPair(room.settings.category);
  const [civilianWord, undercoverWord] = Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];
  room.civilianWord = civilianWord;
  room.undercoverWord = undercoverWord;

  const shuffled = shuffle(alivePlayers);
  const { undercoverCount, mrWhiteCount } = room.settings;

  shuffled.forEach((player, index) => {
    player.alive = true;
    if (index < undercoverCount) {
      player.role = "undercover";
      player.word = undercoverWord;
    } else if (index < undercoverCount + mrWhiteCount) {
      player.role = "mrwhite";
      player.word = undefined;
    } else {
      player.role = "civilian";
      player.word = civilianWord;
    }
  });
}

export function startNewRound(room: RoomState): void {
  const alive = room.playerOrder.filter((id) => room.players[id]?.alive);
  room.turnOrder = shuffle(alive);
  room.currentTurnIndex = 0;
  room.clues = [];
  room.votes = {};
  room.lastVoteResult = null;
  room.phase = "clue";
  room.round += 1;
}

export function tallyVotes(room: RoomState): VoteResult {
  const tally: Record<string, number> = {};
  for (const targetId of Object.values(room.votes)) {
    tally[targetId] = (tally[targetId] ?? 0) + 1;
  }
  let max = -1;
  let leaders: string[] = [];
  for (const [id, count] of Object.entries(tally)) {
    if (count > max) {
      max = count;
      leaders = [id];
    } else if (count === max) {
      leaders.push(id);
    }
  }
  const tie = leaders.length !== 1;
  return { tally, eliminatedId: tie ? null : leaders[0], tie };
}

export type WinnerResult = "civilians" | "undercover" | "mrwhite" | null;

export function checkWinCondition(room: RoomState): WinnerResult {
  const alivePlayers = room.playerOrder.map((id) => room.players[id]).filter((p): p is Player => !!p && p.alive);
  const aliveCivilians = alivePlayers.filter((p) => p.role === "civilian").length;
  const aliveUndercover = alivePlayers.filter((p) => p.role === "undercover").length;
  const aliveMrWhite = alivePlayers.filter((p) => p.role === "mrwhite").length;

  if (aliveUndercover === 0 && aliveMrWhite === 0) return "civilians";
  if (aliveUndercover + aliveMrWhite >= aliveCivilians) return "undercover";
  return null;
}
