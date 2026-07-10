import { describe, it, expect } from 'vitest';
import { World, simulateToRest } from './world';
import { createBody, speed } from './body';
import {
  PIECE_RADIUS,
  STRIKER_RADIUS,
  PIECE_MASS,
  STRIKER_MASS,
  PLAY_MIN,
  PLAY_MAX,
  POCKETS,
  CENTER,
} from './constants';

const DT = 1 / 120;

const piece = (x: number, y: number) =>
  createBody('white', { x, y }, PIECE_RADIUS, PIECE_MASS);
const striker = (x: number, y: number) =>
  createBody('striker', { x, y }, STRIKER_RADIUS, STRIKER_MASS);

describe('friction', () => {
  it('brings a moving piece to a complete stop', () => {
    const b = piece(CENTER.x, CENTER.y);
    b.vel = { x: 800, y: 0 };
    const w = new World([b]);
    simulateToRest(w, DT, 14);
    expect(w.atRest()).toBe(true);
    expect(speed(b)).toBe(0);
  });

  it('a harder flick travels farther than a soft one', () => {
    const soft = piece(200, 500);
    soft.vel = { x: 500, y: 0 };
    const hard = piece(200, 500);
    hard.vel = { x: 1500, y: 0 };
    simulateToRest(new World([soft]), DT, 14);
    simulateToRest(new World([hard]), DT, 14);
    expect(hard.pos.x).toBeGreaterThan(soft.pos.x + 50);
  });

  it('does not let a piece drift forever', () => {
    const b = piece(150, 500);
    b.vel = { x: 2000, y: 0 };
    const w = new World([b]);
    let ticks = 0;
    while (!w.atRest() && ticks < 2000) {
      w.step(DT);
      ticks++;
    }
    expect(w.atRest()).toBe(true);
    expect(ticks).toBeLessThan(1600); // well under the safety cap
  });
});

describe('collisions', () => {
  it('a head-on hit passes motion to the resting target (Newton\'s cradle-ish)', () => {
    const moving = piece(300, 500);
    moving.vel = { x: 1200, y: 0 };
    const target = piece(300 + PIECE_RADIUS * 2 + 2, 500);
    const w = new World([moving, target]);
    // step a handful of frames, enough to make contact
    for (let i = 0; i < 20; i++) w.step(DT);
    expect(target.vel.x).toBeGreaterThan(0); // target got shoved forward
    expect(target.pos.x).toBeGreaterThan(300 + PIECE_RADIUS * 2 + 2);
  });

  it('conserves momentum reasonably through a collision', () => {
    const a = piece(300, 500);
    a.vel = { x: 1000, y: 0 };
    const b = piece(360, 500);
    const w = new World([a, b]);
    const before = a.mass * a.vel.x + b.mass * b.vel.x;
    for (let i = 0; i < 6; i++) w.step(DT);
    const after = a.mass * a.vel.x + b.mass * b.vel.x;
    // Friction bleeds a little, but the bulk of momentum should carry through.
    expect(after).toBeGreaterThan(before * 0.7);
    expect(after).toBeLessThanOrEqual(before + 1);
  });

  it('a heavy striker drives a piece forward', () => {
    const s = striker(500, 700);
    s.vel = { x: 0, y: -1600 };
    const target = piece(500, 700 - (STRIKER_RADIUS + PIECE_RADIUS) - 2);
    const w = new World([s, target]);
    for (let i = 0; i < 15; i++) w.step(DT);
    expect(target.vel.y).toBeLessThan(0); // pushed upward
  });
});

describe('walls', () => {
  it('reflects a piece off a cushion and keeps it in bounds', () => {
    const b = piece(500, 500);
    b.vel = { x: 1400, y: 0 };
    const w = new World([b]);
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(b.pos.x).toBeLessThanOrEqual(PLAY_MAX - PIECE_RADIUS + 0.5);
    expect(b.pos.x).toBeGreaterThanOrEqual(PLAY_MIN + PIECE_RADIUS - 0.5);
  });

  it('never lets a fast piece escape the playfield', () => {
    const b = piece(500, 500);
    b.vel = { x: 2200, y: 1900 };
    const w = new World([b]);
    for (let i = 0; i < 400; i++) {
      w.step(DT);
      expect(b.pos.x).toBeGreaterThan(PLAY_MIN - 1);
      expect(b.pos.x).toBeLessThan(PLAY_MAX + 1);
      expect(b.pos.y).toBeGreaterThan(PLAY_MIN - 1);
      expect(b.pos.y).toBeLessThan(PLAY_MAX + 1);
    }
  });
});

describe('pockets', () => {
  it('captures a piece aimed straight at a corner', () => {
    const corner = POCKETS[0]!; // top-left
    const b = piece(corner.x + 120, corner.y + 120);
    const toCorner = { x: corner.x - b.pos.x, y: corner.y - b.pos.y };
    const l = Math.hypot(toCorner.x, toCorner.y);
    b.vel = { x: (toCorner.x / l) * 900, y: (toCorner.y / l) * 900 };
    const w = new World([b]);
    const events = simulateToRest(w, DT, 14);
    expect(b.pocketed).toBe(true);
    expect(events.pocketed).toHaveLength(1);
    expect(events.pocketed[0]!.pocketIndex).toBe(0);
  });

  it('reports a soft striker-on-man graze even when it is too gentle to make a sound', () => {
    // The contact impulse here is well below the audio/impact threshold, but the
    // "must touch a man" foul still has to see it. This is the regression guard
    // for a soft clip being misread as a whiff.
    const s = striker(500, 500);
    const man = piece(500 + STRIKER_RADIUS + PIECE_RADIUS - 0.1, 500);
    s.vel = { x: 20, y: 0 }; // barely creeping
    const w = new World([s, man]);
    const events = w.step(DT);
    expect(events.strikerHitPiece).toBe(true);
    expect(events.impacts).toHaveLength(0); // too soft to register as an impact
  });

  it('does not pocket a piece that rolls to a stop mid-board', () => {
    const b = piece(CENTER.x, CENTER.y);
    b.vel = { x: 300, y: 0 };
    const w = new World([b]);
    simulateToRest(w, DT, 14);
    expect(b.pocketed).toBe(false);
  });
});

describe('determinism', () => {
  it('same start produces the same finish', () => {
    const make = () => {
      const s = striker(500, 800);
      s.vel = { x: 240, y: -1800 };
      const rack = [piece(480, 500), piece(520, 500), piece(500, 470)];
      return new World([s, ...rack]);
    };
    const a = make();
    const b = make();
    simulateToRest(a, DT, 14);
    simulateToRest(b, DT, 14);
    for (let i = 0; i < a.bodies.length; i++) {
      expect(a.bodies[i]!.pos.x).toBeCloseTo(b.bodies[i]!.pos.x, 6);
      expect(a.bodies[i]!.pos.y).toBeCloseTo(b.bodies[i]!.pos.y, 6);
    }
  });
});
