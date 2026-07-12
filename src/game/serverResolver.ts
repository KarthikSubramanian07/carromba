import { simulateToRest } from '../engine/world';
import { BASELINE_Y, MAX_SIM_SECONDS } from '../engine/constants';
import type { Player } from './types';
import { createGame, resetStrikerForTurn } from './setup';
import { resolveStroke } from './rules';
import { applySnapshot, captureSnapshot, type Snapshot } from './snapshot';
import type { ShotIntentV1 } from './shotIntent';

const FIXED_DT = 1 / 120;

/** Replay a shot from a stored snapshot and return the resolved board. */
export function resolveShotFromSnapshot(
  prior: Snapshot,
  shot: ShotIntentV1,
  humanSide: Player = 'p1',
): Snapshot {
  const state = createGame('online', 'medium', humanSide);
  applySnapshot(state, prior);
  const shooter = state.turn;
  const s = state.striker;
  s.pocketed = false;
  s.pos.x = shot.strikerX;
  s.pos.y = BASELINE_Y[shooter];
  s.vel.x = shot.dir.x * shot.speed;
  s.vel.y = shot.dir.y * shot.speed;

  const events = simulateToRest(state.world, FIXED_DT, MAX_SIM_SECONDS);
  const strikerPocketed = events.pocketed.some((p) => p.kind === 'striker');
  resolveStroke(state, {
    pocketed: events.pocketed.map((p) => ({ id: p.id, kind: p.kind })),
    strikerPocketed,
    strikerTouchedPiece: events.strikerHitPiece,
  });
  if (!state.winner) resetStrikerForTurn(state);
  return captureSnapshot(state);
}

export function snapshotsEqual(a: Snapshot, b: Snapshot): boolean {
  if (a.turn !== b.turn || a.winner !== b.winner || a.msg !== b.msg) return false;
  if (a.colors[0] !== b.colors[0] || a.colors[1] !== b.colors[1]) return false;
  if (
    a.queen.onBoard !== b.queen.onBoard ||
    a.queen.pocketedBy !== b.queen.pocketedBy ||
    a.queen.covered !== b.queen.covered ||
    a.queen.pending !== b.queen.pending
  ) {
    return false;
  }
  if (a.b.length !== b.b.length) return false;
  for (let i = 0; i < a.b.length; i++) {
    const [ax, ay, ap] = a.b[i]!;
    const [bx, by, bp] = b.b[i]!;
    if (ap !== bp || Math.abs(ax - bx) > 0.02 || Math.abs(ay - by) > 0.02) return false;
  }
  return true;
}
