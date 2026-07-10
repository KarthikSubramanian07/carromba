import { createBody } from '../engine/body';
import { World } from '../engine/world';
import {
  CENTER,
  BASELINE_Y,
  BASELINE_X_MIN,
  BASELINE_X_MAX,
  STRIKER_RADIUS,
  STRIKER_MASS,
} from '../engine/constants';
import { buildRack } from './rack';
import type { GameState, Mode, Difficulty, Player } from './types';

/** Fresh board, striker parked on player one's baseline, colors still open. */
export function createGame(mode: Mode, difficulty: Difficulty, humanSide: Player = 'p1'): GameState {
  const striker = createBody(
    'striker',
    { x: CENTER.x, y: BASELINE_Y.p1 },
    STRIKER_RADIUS,
    STRIKER_MASS,
  );
  const world = new World([striker, ...buildRack()]);

  const state: GameState = {
    mode,
    difficulty,
    world,
    striker,
    turn: 'p1',
    colors: { p1: null, p2: null },
    phase: 'placing',
    queen: { onBoard: true, pocketedBy: null, covered: false, pending: false },
    humanSide,
    winner: null,
    lastEvent:
      mode === 'ai'
        ? 'Your break. Slide the striker, pull back, let go.'
        : 'Player 1 to break.',
  };
  resetStrikerForTurn(state);
  return state;
}

/**
 * Ready the striker for whoever is about to shoot: undo any pocketing, drop it on
 * the shooter's baseline at a sensible starting x, and kill any leftover motion.
 * Keeps the previous x when it is still legal so the striker does not jump around
 * between a player's consecutive strokes.
 */
export function resetStrikerForTurn(state: GameState): void {
  const s = state.striker;
  s.pocketed = false;
  s.vel.x = 0;
  s.vel.y = 0;
  const x = Math.min(BASELINE_X_MAX, Math.max(BASELINE_X_MIN, s.pos.x || CENTER.x));
  s.pos.x = Number.isFinite(x) ? x : CENTER.x;
  s.pos.y = BASELINE_Y[state.turn];
  state.phase = 'placing';
}
