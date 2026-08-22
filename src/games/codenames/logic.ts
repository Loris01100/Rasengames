import type { RoomState, DuetColor, TeamColor, Seat, Team, Role } from "./types";
import { WORDS } from "./words";

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const BOARD_SIZE = 25;
export const DUET_AGENTS_PER_KEY = 9;
export const DUET_ASSASSINS_PER_KEY = 3;
export const DUET_MAX_ERRORS = 9;
export const TEAM_START_COUNT = 9;
export const TEAM_SECOND_COUNT = 8;

export function pickBoard(pool: string[] = WORDS, size = BOARD_SIZE): string[] {
  return shuffle(pool).slice(0, size);
}

function fillColors<C>(size: number, counts: [C, number][]): C[] {
  const colors: C[] = [];
  for (const [color, count] of counts) {
    for (let i = 0; i < count; i++) colors.push(color);
  }
  return shuffle(colors).slice(0, size);
}

export function generateDuetKey(size = BOARD_SIZE): DuetColor[] {
  const bystanders = size - DUET_AGENTS_PER_KEY - DUET_ASSASSINS_PER_KEY;
  return fillColors<DuetColor>(size, [
    ["agent", DUET_AGENTS_PER_KEY],
    ["assassin", DUET_ASSASSINS_PER_KEY],
    ["bystander", bystanders],
  ]);
}

// Une case peut être "agent" pour une clé et "assassin"/"bystander" pour
// l'autre : le total gagnant n'est donc pas fixe (contrairement au jeu
// physique) et se recalcule une fois au démarrage.
export function countDuetAgents(keyA: DuetColor[], keyB: DuetColor[]): number {
  let count = 0;
  for (let i = 0; i < keyA.length; i++) {
    if (keyA[i] === "agent" || keyB[i] === "agent") count++;
  }
  return count;
}

export function generateTeamKey(startingTeam: Team, size = BOARD_SIZE): TeamColor[] {
  const first: TeamColor = startingTeam === "A" ? "agentA" : "agentB";
  const second: TeamColor = startingTeam === "A" ? "agentB" : "agentA";
  const neutral = size - TEAM_START_COUNT - TEAM_SECOND_COUNT - 1;
  return fillColors<TeamColor>(size, [
    [first, TEAM_START_COUNT],
    [second, TEAM_SECOND_COUNT],
    ["neutral", neutral],
    ["assassin", 1],
  ]);
}

export function assignSeatsForDuet(playerIds: string[]): Record<string, Seat> {
  return { [playerIds[0]]: "A", [playerIds[1]]: "B" };
}

export function assignTeamsAndRoles(
  playerIds: string[],
): Record<string, { team: Team; role: Role }> {
  const [p0, p1, p2, p3] = shuffle(playerIds);
  return {
    [p0]: { team: "A", role: "spymaster" },
    [p1]: { team: "B", role: "spymaster" },
    [p2]: { team: "A", role: "operative" },
    [p3]: { team: "B", role: "operative" },
  };
}

// La couleur qu'un joueur donné a le droit de connaître pour une case : celle
// du plateau si elle est déjà révélée (publique à tous une fois retournée),
// sinon seulement celle de la clé qu'il détient (chiffreur en teams, siège
// correspondant en duet). Centralise tout le filtrage d'information cachée.
export function cellColorFor(
  room: RoomState,
  index: number,
  playerId: string,
): DuetColor | TeamColor | null {
  if (room.revealed[index]) return room.revealedColor[index];
  const player = room.players[playerId];
  if (!player) return null;
  if (room.mode === "teams") {
    return player.role === "spymaster" && room.teamColors ? room.teamColors[index] : null;
  }
  if (room.mode === "duet") {
    if (player.seat === "A") return room.keyA ? room.keyA[index] : null;
    if (player.seat === "B") return room.keyB ? room.keyB[index] : null;
  }
  return null;
}

export function countFoundAgents(room: RoomState): number {
  let n = 0;
  for (let i = 0; i < room.revealed.length; i++) {
    if (room.revealed[i] && room.revealedColor[i] === "agent") n++;
  }
  return n;
}

// ---- Duet : résolution d'une pioche -----------------------------------

export function switchDuetTurn(room: RoomState): void {
  room.duetTurnSeat = room.duetTurnSeat === "A" ? "B" : "A";
  room.currentClue = null;
}

export function passDuetTurn(room: RoomState): void {
  switchDuetTurn(room);
}

export function resolveDuetGuess(room: RoomState, index: number): DuetColor {
  const seat = room.duetTurnSeat!;
  const key = (seat === "A" ? room.keyA : room.keyB)!;
  const color = key[index];
  room.revealed[index] = true;
  room.revealedColor[index] = color;

  if (color === "assassin") {
    room.phase = "ended";
    room.winner = "coop-lose-assassin";
    return color;
  }

  if (color === "bystander") {
    room.duetErrors -= 1;
    if (room.duetErrors <= 0) {
      room.phase = "ended";
      room.winner = "coop-lose-errors";
    } else {
      switchDuetTurn(room);
    }
    return color;
  }

  // agent
  if (countFoundAgents(room) >= room.duetAgentsTotal) {
    room.phase = "ended";
    room.winner = "coop-win";
    return color;
  }
  const clue = room.currentClue!;
  clue.guessesLeft -= 1;
  if (clue.guessesLeft <= 0) switchDuetTurn(room);
  return color;
}

// ---- Teams : résolution d'une pioche -----------------------------------

export function switchTeamTurn(room: RoomState): void {
  room.turnTeam = room.turnTeam === "A" ? "B" : "A";
  room.currentClue = null;
}

export function passTeamTurn(room: RoomState): void {
  switchTeamTurn(room);
}

export function resolveTeamGuess(room: RoomState, index: number): TeamColor {
  const color = room.teamColors![index];
  room.revealed[index] = true;
  room.revealedColor[index] = color;
  const turnTeam = room.turnTeam!;

  if (color === "assassin") {
    room.phase = "ended";
    room.winner = turnTeam === "A" ? "B" : "A";
    return color;
  }

  if (color === "neutral") {
    switchTeamTurn(room);
    return color;
  }

  // agentA ou agentB : touche sa propre couleur, ou aide l'adversaire.
  const guessedTeam: Team = color === "agentA" ? "A" : "B";
  if (guessedTeam === "A") room.remainingA -= 1;
  else room.remainingB -= 1;

  if (room.remainingA <= 0) {
    room.phase = "ended";
    room.winner = "A";
    return color;
  }
  if (room.remainingB <= 0) {
    room.phase = "ended";
    room.winner = "B";
    return color;
  }

  if (guessedTeam !== turnTeam) {
    // A aidé l'équipe adverse sans le vouloir : le tour passe quoi qu'il arrive.
    switchTeamTurn(room);
    return color;
  }

  const clue = room.currentClue!;
  clue.guessesLeft -= 1;
  if (clue.guessesLeft <= 0) switchTeamTurn(room);
  return color;
}
