import { describe, expect, it } from 'vitest';
import { isShotIntent, normalizeShotIntent, validateShotIntent } from './shotIntent';

describe('shot intent validation', () => {
  it('accepts in-bounds shots', () => {
    const shot = {
      v: 1 as const,
      strikerX: 500,
      dir: { x: 0, y: -1 },
      speed: 800,
    };
    expect(isShotIntent(shot)).toBe(true);
    expect(validateShotIntent(shot)).toBe(true);
    expect(normalizeShotIntent(shot)).toEqual(shot);
  });

  it('rejects out-of-bounds striker positions and speeds', () => {
    expect(
      validateShotIntent({ v: 1, strikerX: 10, dir: { x: 0, y: -1 }, speed: 800 }),
    ).toBe(false);
    expect(
      validateShotIntent({ v: 1, strikerX: 500, dir: { x: 0, y: -1 }, speed: 40 }),
    ).toBe(false);
    expect(normalizeShotIntent({ strikerX: 500, dir: { x: 0, y: -1 }, speed: 800 })).toEqual({
      v: 1,
      strikerX: 500,
      dir: { x: 0, y: -1 },
      speed: 800,
    });
  });
});
