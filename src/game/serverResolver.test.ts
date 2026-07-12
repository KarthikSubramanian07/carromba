import { describe, expect, it } from 'vitest';
import { captureSnapshot } from './snapshot';
import { createGame } from './setup';
import { resolveShotFromSnapshot, snapshotsEqual } from './serverResolver';
import { validateShotIntent, type ShotIntentV1 } from './shotIntent';

describe('resolveShotFromSnapshot', () => {
  it('replays a legal opening break deterministically', () => {
    const state = createGame('online', 'medium', 'p1');
    const prior = captureSnapshot(state);
    const shot: ShotIntentV1 = {
      v: 1,
      strikerX: 500,
      dir: { x: 0, y: -1 },
      speed: 900,
    };
    expect(validateShotIntent(shot)).toBe(true);
    const first = resolveShotFromSnapshot(prior, shot);
    const second = resolveShotFromSnapshot(prior, shot);
    expect(snapshotsEqual(first, second)).toBe(true);
    expect(first.b.some(([, , pocketed]) => pocketed === 1)).toBe(
      second.b.some(([, , pocketed]) => pocketed === 1),
    );
  });

  it('detects snapshot mismatches', () => {
    const state = createGame('online', 'medium', 'p1');
    const prior = captureSnapshot(state);
    const shot: ShotIntentV1 = {
      v: 1,
      strikerX: 500,
      dir: { x: 0.2, y: -0.98 },
      speed: 700,
    };
    const resolved = resolveShotFromSnapshot(prior, shot);
    const tweaked = { ...resolved, turn: resolved.turn === 'p1' ? 'p2' : 'p1' } as typeof resolved;
    expect(snapshotsEqual(resolved, tweaked)).toBe(false);
  });
});
