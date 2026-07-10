import { describe, it, expect } from 'vitest';
import { createGame } from './setup';
import { chooseShot } from './ai';
import { World, simulateToRest } from '../engine/world';
import { createBody } from '../engine/body';
import type { GameState, Difficulty } from './types';
import {
  BASELINE_X_MIN,
  BASELINE_X_MAX,
  BASELINE_Y,
  MIN_STRIKER_SPEED,
  MAX_STRIKER_SPEED,
  STRIKER_RADIUS,
  STRIKER_MASS,
  PIECE_RADIUS,
  PIECE_MASS,
  POCKETS,
} from '../engine/constants';

// A tiny deterministic PRNG so the AI's "hand tremor" is repeatable in tests.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

describe('AI shot legality', () => {
  it('always returns a legal, on-baseline shot across many seeds and tiers', () => {
    for (const diff of DIFFS) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = createGame('ai', diff, 'p1');
        s.turn = 'p2'; // the bot's turn
        const shot = chooseShot(s, 'p2', mulberry32(seed));
        expect(shot.strikerX).toBeGreaterThanOrEqual(BASELINE_X_MIN - 1e-6);
        expect(shot.strikerX).toBeLessThanOrEqual(BASELINE_X_MAX + 1e-6);
        expect(shot.speed).toBeGreaterThanOrEqual(MIN_STRIKER_SPEED - 1e-6);
        expect(shot.speed).toBeLessThanOrEqual(MAX_STRIKER_SPEED + 1e-6);
        expect(Math.hypot(shot.dir.x, shot.dir.y)).toBeCloseTo(1, 4);
      }
    }
  });

  it('is deterministic given the same rng', () => {
    const a = createGame('ai', 'hard', 'p1');
    a.turn = 'p2';
    const b = createGame('ai', 'hard', 'p1');
    b.turn = 'p2';
    const s1 = chooseShot(a, 'p2', mulberry32(123));
    const s2 = chooseShot(b, 'p2', mulberry32(123));
    expect(s1.strikerX).toBeCloseTo(s2.strikerX, 9);
    expect(s1.dir.x).toBeCloseTo(s2.dir.x, 9);
    expect(s1.speed).toBeCloseTo(s2.speed, 9);
  });
});

describe('AI skill', () => {
  // One white man sitting on the line between a bottom pocket and player two's top
  // baseline, board otherwise empty. Build that board fresh each attempt.
  function straightInBoard(): GameState {
    const pocket = POCKETS[2]!; // bottom-left
    const from = { x: 500, y: BASELINE_Y.p2 };
    const tx = pocket.x + (from.x - pocket.x) * 0.4;
    const ty = pocket.y + (from.y - pocket.y) * 0.4;
    const world = new World([
      createBody('striker', { x: from.x, y: from.y }, STRIKER_RADIUS, STRIKER_MASS),
      createBody('white', { x: tx, y: ty }, PIECE_RADIUS, PIECE_MASS),
    ]);
    return {
      mode: 'ai',
      difficulty: 'hard',
      world,
      striker: world.bodies[0]!,
      turn: 'p2',
      colors: { p1: 'black', p2: 'white' },
      phase: 'aiming',
      queen: { onBoard: false, pocketedBy: 'p2', covered: true, pending: false },
      humanSide: 'p1',
      winner: null,
      lastEvent: '',
    };
  }

  function potsIt(state: GameState, rng: () => number): boolean {
    const shot = chooseShot(state, 'p2', rng);
    const w = state.world.clone();
    const st = w.bodies[0]!;
    st.pos.x = shot.strikerX;
    st.pos.y = BASELINE_Y.p2;
    st.vel.x = shot.dir.x * shot.speed;
    st.vel.y = shot.dir.y * shot.speed;
    const events = simulateToRest(w, 1 / 120, 12);
    return events.pocketed.some((p) => p.kind === 'white');
  }

  it('hard bot reliably pots a makeable man', () => {
    let made = 0;
    for (let seed = 1; seed <= 15; seed++) {
      if (potsIt(straightInBoard(), mulberry32(seed))) made += 1;
    }
    expect(made).toBeGreaterThanOrEqual(11); // strong, with a little human wobble
  });

  it('easy bot is meaningfully weaker on the same shot (it is beatable)', () => {
    let made = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const s = straightInBoard();
      s.difficulty = 'easy';
      if (potsIt(s, mulberry32(seed))) made += 1;
    }
    expect(made).toBeLessThanOrEqual(6); // sprays far more than hard does
  });
});
