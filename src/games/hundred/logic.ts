import type { Player, RoomState, Score } from "./types";

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignNumbers(room: RoomState): void {
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  const pool = shuffle(Array.from({ length: 100 }, (_, i) => i + 1)).slice(0, connectedIds.length);

  connectedIds.forEach((id, index) => {
    const player = room.players[id];
    player.number = pool[index];
    player.proposal = null;
  });
}

export function computeScore(room: RoomState): Score {
  const numbers = room.order.map((id) => room.players[id]?.number ?? 0);
  let correctPairs = 0;
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] < numbers[i + 1]) correctPairs++;
  }
  const total = Math.max(0, numbers.length - 1);
  return { correctPairs, total, sortedFully: total > 0 && correctPairs === total };
}

export function allProposed(room: RoomState): boolean {
  const connectedIds = room.playerOrder.filter((id) => room.players[id]?.connected);
  return connectedIds.length > 0 && connectedIds.every((id) => room.players[id]?.proposal !== null);
}

export function playersById(room: RoomState): Player[] {
  return room.playerOrder.map((id) => room.players[id]).filter((p): p is Player => !!p);
}
