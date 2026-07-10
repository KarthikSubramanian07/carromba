import { describe, it, expect } from 'vitest';
import { buildRack, MEN_PER_COLOR } from './rack';
import { CENTER, PIECE_RADIUS } from '../engine/constants';

describe('opening rack', () => {
  const rack = buildRack();

  it('has one Queen and nine of each color', () => {
    expect(rack.filter((b) => b.kind === 'queen')).toHaveLength(1);
    expect(rack.filter((b) => b.kind === 'white')).toHaveLength(MEN_PER_COLOR);
    expect(rack.filter((b) => b.kind === 'black')).toHaveLength(MEN_PER_COLOR);
    expect(rack).toHaveLength(19);
  });

  it('puts the Queen dead center', () => {
    const queen = rack.find((b) => b.kind === 'queen')!;
    expect(queen.pos.x).toBeCloseTo(CENTER.x, 6);
    expect(queen.pos.y).toBeCloseTo(CENTER.y, 6);
  });

  it('never starts two men overlapping', () => {
    for (let i = 0; i < rack.length; i++) {
      for (let j = i + 1; j < rack.length; j++) {
        const a = rack[i]!;
        const b = rack[j]!;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        expect(d).toBeGreaterThan(2 * PIECE_RADIUS - 0.01);
      }
    }
  });

  it('is centered on the board (symmetric bounding box)', () => {
    const xs = rack.map((b) => b.pos.x);
    const ys = rack.map((b) => b.pos.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(midX).toBeCloseTo(CENTER.x, 3);
    expect(midY).toBeCloseTo(CENTER.y, 3);
  });
});
