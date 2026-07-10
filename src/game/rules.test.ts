import { describe, it, expect } from 'vitest';
import { createGame } from './setup';
import { resolveStroke, menOnBoard } from './rules';
import type { Body } from '../engine/body';
import type { GameState, PieceColor, StrokeResult } from './types';

// Helpers that let a test say "this stroke pocketed these bodies" without running
// the physics: mark the bodies pocketed (as the engine would) and hand the rules
// engine a matching stroke result.

function men(state: GameState, color: PieceColor): Body[] {
  return state.world.bodies.filter((b) => b.kind === color);
}
function queenBody(state: GameState): Body {
  return state.world.bodies.find((b) => b.kind === 'queen')!;
}
function sink(bodies: Body[]): void {
  for (const b of bodies) {
    b.pocketed = true;
    b.vel = { x: 0, y: 0 };
  }
}
function result(
  pocketed: Body[],
  opts: { strikerPocketed?: boolean; touched?: boolean } = {},
): StrokeResult {
  return {
    pocketed: pocketed.map((b) => ({ id: b.id, kind: b.kind })),
    strikerPocketed: opts.strikerPocketed ?? false,
    strikerTouchedPiece: opts.touched ?? true,
  };
}

describe('open rule (color assignment)', () => {
  it('the first man a player sinks fixes both colors', () => {
    const s = createGame('local', 'medium');
    const w = men(s, 'white')[0]!;
    sink([w]);
    const sum = resolveStroke(s, result([w]));
    expect(s.colors.p1).toBe('white');
    expect(s.colors.p2).toBe('black');
    expect(sum.continues).toBe(true);
    expect(s.turn).toBe('p1');
  });
});

describe('continue vs pass', () => {
  it('a clean own pocket keeps the turn', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const w = men(s, 'white')[0]!;
    sink([w]);
    const sum = resolveStroke(s, result([w]));
    expect(sum.continues).toBe(true);
    expect(s.turn).toBe('p1');
  });

  it('a clean miss passes the turn', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const sum = resolveStroke(s, result([], { touched: true }));
    expect(sum.continues).toBe(false);
    expect(s.turn).toBe('p2');
  });

  it('pocketing only an opponent man passes the turn', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const b = men(s, 'black')[0]!;
    sink([b]);
    const sum = resolveStroke(s, result([b]));
    expect(sum.continues).toBe(false);
    expect(s.turn).toBe('p2');
    expect(b.pocketed).toBe(true); // it stays down, credited to the opponent
  });
});

describe('fouls', () => {
  it('pocketing the striker is a foul, returns a man, passes the turn', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    men(s, 'white')[0]!.pocketed = true; // a man already banked, available as a due
    const sum = resolveStroke(s, {
      pocketed: [{ id: s.striker.id, kind: 'striker' }],
      strikerPocketed: true,
      strikerTouchedPiece: true,
    });
    expect(sum.foul).toBe('striker');
    expect(s.turn).toBe('p2');
    expect(menOnBoard(s, 'white')).toHaveLength(9); // the due came back
  });

  it('touching nothing is a whiff foul', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const sum = resolveStroke(s, result([], { touched: false }));
    expect(sum.foul).toBe('whiff');
    expect(s.turn).toBe('p2');
  });
});

describe('the Queen', () => {
  it('is covered when sunk together with an own man', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const w = men(s, 'white')[0]!;
    const q = queenBody(s);
    sink([w, q]);
    const sum = resolveStroke(s, result([w, q]));
    expect(sum.queenCovered).toBe(true);
    expect(s.queen.covered).toBe(true);
    expect(s.queen.pocketedBy).toBe('p1');
    expect(sum.continues).toBe(true);
  });

  it('sunk alone waits, then is covered on the next stroke', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const q = queenBody(s);
    sink([q]);
    const sum1 = resolveStroke(s, result([q]));
    expect(s.queen.pending).toBe(true);
    expect(sum1.continues).toBe(true); // earns the covering stroke
    expect(s.turn).toBe('p1');

    const w = men(s, 'white')[0]!;
    sink([w]);
    const sum2 = resolveStroke(s, result([w]));
    expect(sum2.queenCovered).toBe(true);
    expect(s.queen.covered).toBe(true);
  });

  it('goes back to center if the cover stroke misses', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const q = queenBody(s);
    sink([q]);
    resolveStroke(s, result([q]));
    const sum = resolveStroke(s, result([], { touched: true }));
    expect(sum.queenReturned).toBe(true);
    expect(s.queen.onBoard).toBe(true);
    expect(s.queen.pending).toBe(false);
    expect(s.turn).toBe('p2');
  });

  it('is never kept on a foul stroke', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const q = queenBody(s);
    sink([q]);
    const sum = resolveStroke(s, {
      pocketed: [
        { id: q.id, kind: 'queen' },
        { id: s.striker.id, kind: 'striker' },
      ],
      strikerPocketed: true,
      strikerTouchedPiece: true,
    });
    expect(sum.foul).toBe('striker');
    expect(s.queen.onBoard).toBe(true);
    expect(sum.queenReturned).toBe(true);
  });
});

describe('endgame', () => {
  it('cannot clear the last man before the Queen is settled', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const w = men(s, 'white');
    for (let i = 0; i < 8; i++) w[i]!.pocketed = true; // one white left
    sink([w[8]!]);
    const sum = resolveStroke(s, result([w[8]!]));
    expect(sum.foul).toBe('last-man');
    expect(menOnBoard(s, 'white').length).toBe(1); // it came back
    expect(s.winner).toBeNull();
    expect(s.turn).toBe('p2');
  });

  it('wins by clearing the last man once the Queen is covered', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    s.queen = { onBoard: false, pocketedBy: 'p1', covered: true, pending: false };
    const w = men(s, 'white');
    for (let i = 0; i < 8; i++) w[i]!.pocketed = true;
    sink([w[8]!]);
    const sum = resolveStroke(s, result([w[8]!]));
    expect(sum.winner).toBe('p1');
    expect(s.phase).toBe('gameover');
  });

  it('will not let you pocket the opponent\'s last man for them', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const b = men(s, 'black');
    for (let i = 0; i < 8; i++) b[i]!.pocketed = true; // one black left
    sink([b[8]!]);
    const sum = resolveStroke(s, result([b[8]!]));
    expect(sum.foul).toBe('opp-last');
    expect(menOnBoard(s, 'black').length).toBe(1); // returned to center
    expect(s.winner).toBeNull();
    expect(s.turn).toBe('p2');
  });

  it('sends the Queen home when she rides the stroke that pots the opponent\'s last man', () => {
    // Regression: the Queen must never be kept on a foul stroke, even when the
    // foul (opp-last) is only discovered after the cover was tentatively tallied.
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const black = men(s, 'black');
    for (let i = 0; i < 8; i++) black[i]!.pocketed = true; // one black left
    const q = queenBody(s);
    sink([q, black[8]!]); // pot the Queen and the opponent's last man, no white
    const sum = resolveStroke(s, result([q, black[8]!]));
    expect(sum.foul).toBe('opp-last');
    expect(s.queen.onBoard).toBe(true);
    expect(s.queen.pending).toBe(false);
    expect(s.queen.covered).toBe(false);
    expect(sum.queenReturned).toBe(true);
    expect(menOnBoard(s, 'black').length).toBe(1);
    expect(s.winner).toBeNull();
    expect(s.turn).toBe('p2');
  });

  it('wins with a Queen-and-final-man in the same stroke', () => {
    const s = createGame('local', 'medium');
    s.colors = { p1: 'white', p2: 'black' };
    const w = men(s, 'white');
    for (let i = 0; i < 8; i++) w[i]!.pocketed = true; // one white left
    const q = queenBody(s);
    sink([w[8]!, q]);
    const sum = resolveStroke(s, result([w[8]!, q]));
    expect(s.queen.covered).toBe(true);
    expect(sum.winner).toBe('p1');
  });
});
