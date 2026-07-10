import type { Body } from '../engine/body';
import { CENTER, PIECE_RADIUS } from '../engine/constants';
import type { GameState, Player, PieceColor, StrokeResult } from './types';

// The complete rules of Carromba live here as one pure-ish function. It takes the
// board at rest plus what happened during the stroke, and works out the fallout:
// who owns which color, whether the Queen got covered, which fouls fired, whose
// turn is next, and whether anyone just won. See RULES.md for the plain-English
// version. Everything here matches that document line for line.

export interface StrokeSummary {
  foul: 'striker' | 'whiff' | 'last-man' | 'opp-last' | null;
  continues: boolean;
  queenCovered: boolean;
  queenReturned: boolean;
  colorAssigned: boolean;
  winner: Player | null;
  message: string;
}

const other = (p: Player): Player => (p === 'p1' ? 'p2' : 'p1');
const otherColor = (c: PieceColor): PieceColor => (c === 'white' ? 'black' : 'white');

/** Men of a given color still sitting on the board. */
export function menOnBoard(state: GameState, color: PieceColor): Body[] {
  return state.world.bodies.filter((b) => b.kind === color && !b.pocketed);
}

/** How many men the given player still has to sink. Null color means unassigned. */
export function menLeftFor(state: GameState, player: Player): number {
  const color = state.colors[player];
  if (!color) return -1; // unknown until the board opens
  return menOnBoard(state, color).length;
}

function findQueen(state: GameState): Body {
  return state.world.bodies.find((b) => b.kind === 'queen')!;
}

// Drop a returned disc back onto the board: dead center if it is free, otherwise
// the nearest clear spot spiralling outward. Used for the Queen coming back and
// for foul "dues" returning to the middle.
function returnToCenter(state: GameState, body: Body): void {
  const clashes = (x: number, y: number): boolean => {
    for (const b of state.world.bodies) {
      if (b === body || b.pocketed) continue;
      const dx = b.pos.x - x;
      const dy = b.pos.y - y;
      const min = b.radius + body.radius + 0.5;
      if (dx * dx + dy * dy < min * min) return true;
    }
    return false;
  };

  let target = { x: CENTER.x, y: CENTER.y };
  if (clashes(target.x, target.y)) {
    const step = 2 * PIECE_RADIUS + 1;
    outer: for (let ring = 1; ring <= 8; ring++) {
      const r = ring * step;
      const slots = 6 * ring;
      for (let k = 0; k < slots; k++) {
        const a = (k / slots) * Math.PI * 2;
        const x = CENTER.x + Math.cos(a) * r;
        const y = CENTER.y + Math.sin(a) * r;
        if (!clashes(x, y)) {
          target = { x, y };
          break outer;
        }
      }
    }
  }

  body.pos.x = target.x;
  body.pos.y = target.y;
  body.vel.x = 0;
  body.vel.y = 0;
  body.pocketed = false;
}

/**
 * Digest one stroke. Mutates `state` (turn, colors, queen, winner) and returns a
 * summary of what happened for the HUD and for the audio/fx layer.
 */
export function resolveStroke(state: GameState, result: StrokeResult): StrokeSummary {
  const shooter = state.turn;
  const summary: StrokeSummary = {
    foul: null,
    continues: false,
    queenCovered: false,
    queenReturned: false,
    colorAssigned: false,
    winner: null,
    message: '',
  };

  const menPocketed = result.pocketed.filter((p) => p.kind === 'white' || p.kind === 'black');
  const queenPocketedNow = result.pocketed.some((p) => p.kind === 'queen');

  // --- Open rule: the first man a player sinks fixes the colors for the game. ---
  if (state.colors[shooter] === null && menPocketed.length > 0) {
    const first = menPocketed[0]!.kind as PieceColor;
    state.colors[shooter] = first;
    state.colors[other(shooter)] = otherColor(first);
    summary.colorAssigned = true;
  }

  const shooterColor = state.colors[shooter];
  const ownMenPocketed = shooterColor
    ? menPocketed.filter((p) => p.kind === shooterColor).length
    : 0;

  const queen = findQueen(state);
  const queenWasPending = state.queen.pending && state.queen.pocketedBy === shooter;

  // --- Fouls the stroke commits outright. ---
  let foul: StrokeSummary['foul'] = null;
  if (result.strikerPocketed) foul = 'striker';
  else if (!result.strikerTouchedPiece) foul = 'whiff';

  // --- Queen and cover, but only on a clean stroke. If a striker/whiff foul is
  // already on the board, the Queen is settled by the foul handling further down,
  // never kept. ---
  if (!foul) {
    if (queenPocketedNow) {
      if (ownMenPocketed > 0) {
        state.queen = { onBoard: false, pocketedBy: shooter, covered: true, pending: false };
        summary.queenCovered = true;
      } else {
        // Sank her alone: she waits, to be covered on the very next stroke.
        state.queen = { onBoard: false, pocketedBy: shooter, covered: false, pending: true };
      }
    } else if (queenWasPending) {
      if (ownMenPocketed > 0) {
        state.queen = { onBoard: false, pocketedBy: shooter, covered: true, pending: false };
        summary.queenCovered = true;
      } else {
        // The cover window closed uncovered: back to the center she goes.
        returnToCenter(state, queen);
        state.queen = { onBoard: true, pocketedBy: null, covered: false, pending: false };
        summary.queenReturned = true;
      }
    }
  }

  // --- Last-man foul: you cannot clear your final man before the Queen is settled. ---
  const menLeft = shooterColor ? menOnBoard(state, shooterColor).length : -1;
  if (!foul && shooterColor && ownMenPocketed > 0 && menLeft === 0 && !state.queen.covered) {
    foul = 'last-man';
    // Return one just-sunk man of the shooter's color to the center.
    const sunk = state.world.bodies.find((b) => b.kind === shooterColor && b.pocketed);
    if (sunk) returnToCenter(state, sunk);
  }

  // --- Opponent's last man: you may not clear your opponent's board for them. ---
  // Returning one of their men keeps the win from landing in their lap and,
  // absent any other foul, costs you the turn.
  const oppColor = state.colors[other(shooter)];
  if (oppColor) {
    const oppPocketedNow = menPocketed.filter((p) => p.kind === oppColor).length;
    if (oppPocketedNow > 0 && menOnBoard(state, oppColor).length === 0) {
      const due = state.world.bodies.find((b) => b.kind === oppColor && b.pocketed);
      if (due) returnToCenter(state, due);
      if (!foul) foul = 'opp-last';
    }
  }

  summary.foul = foul;

  // --- Any foul sends the Queen home if she was in play this stroke. This is the
  // single place the "never kept on a foul stroke" rule is enforced, so it covers
  // every foul type, including one detected only after the cover was tallied. ---
  if (foul && (queenPocketedNow || queenWasPending)) {
    returnToCenter(state, queen);
    state.queen = { onBoard: true, pocketedBy: null, covered: false, pending: false };
    summary.queenReturned = true;
    summary.queenCovered = false;
  }

  // --- Foul dues: a striker/whiff foul sends one of your pocketed men back. ---
  if (foul === 'striker' || foul === 'whiff') {
    if (shooterColor) {
      const due = state.world.bodies.find((b) => b.kind === shooterColor && b.pocketed);
      if (due) returnToCenter(state, due);
    }
  }

  // --- Continue or pass. ---
  if (!foul) {
    if (ownMenPocketed > 0) summary.continues = true;
    else if (queenPocketedNow) summary.continues = true; // earned the cover stroke
  }

  // --- Win check: either side reaching zero men with the Queen settled wins. ---
  const winner = checkWinner(state);
  if (winner) {
    summary.winner = winner;
    state.winner = winner;
    state.phase = 'gameover';
  } else {
    if (!summary.continues) state.turn = other(shooter);
  }

  summary.message = describe(state, shooter, summary, ownMenPocketed, queenPocketedNow);
  state.lastEvent = summary.message;
  return summary;
}

// A side wins the board once all of its men are pocketed and the Queen has been
// covered by somebody. The Queen must be resolved first, which the last-man foul
// guarantees, so reaching zero men here is always a legal finish.
function checkWinner(state: GameState): Player | null {
  if (!state.queen.covered) return null;
  for (const player of ['p1', 'p2'] as Player[]) {
    const color = state.colors[player];
    if (color && menOnBoard(state, color).length === 0) return player;
  }
  return null;
}

function sideName(state: GameState, player: Player): string {
  if (state.mode === 'ai') return player === state.humanSide ? 'You' : 'The bot';
  return player === 'p1' ? 'Player 1' : 'Player 2';
}

function describe(
  state: GameState,
  shooter: Player,
  s: StrokeSummary,
  ownMen: number,
  queenNow: boolean,
): string {
  const who = sideName(state, shooter);
  if (s.winner) return `${sideName(state, s.winner)} cleared the board. Game.`;
  if (s.foul === 'striker') return `${who} pocketed the striker. Foul, turn passes.`;
  if (s.foul === 'whiff') return `${who} touched nothing. Foul, turn passes.`;
  if (s.foul === 'last-man') return `${who} can't finish before the Queen. Piece returned.`;
  if (s.foul === 'opp-last') return `${who} can't pot the opponent's last man. Returned.`;
  if (s.queenCovered) return `${who} pocketed and covered the Queen.`;
  if (s.queenReturned) return `The Queen goes back to center, uncovered.`;
  if (queenNow) return `${who} sank the Queen. Cover her this stroke.`;
  if (ownMen > 1) return `${who} sank ${ownMen}. Shoot again.`;
  if (ownMen === 1) return `${who} sank one. Shoot again.`;
  if (s.colorAssigned) return `${who} opens. Shoot again.`;
  return `${who} missed. Turn passes.`;
}
