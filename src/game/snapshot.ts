import type { GameState, Player, PieceColor, QueenState } from './types';

// A compact, authoritative picture of the board, sent between the two browsers in
// an online game. Bodies are stored by their position in `world.bodies`, not by
// id: both clients build the exact same rack in the exact same order via
// createGame(), so index alignment is reliable even though the global id counter
// differs from one browser to the next.
//
// The online model is shooter-authoritative: whoever just shot resolves the
// stroke locally and ships this snapshot, and the other side adopts it verbatim
// after playing the shot animation. That sidesteps any cross-engine floating
// point drift, because only one machine's simulation is ever the truth.

export interface Snapshot {
  b: [number, number, 0 | 1][]; // [x, y, pocketed] per body, in world order
  turn: Player;
  colors: [PieceColor | null, PieceColor | null];
  queen: QueenState;
  winner: Player | null;
  msg: string;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function captureSnapshot(state: GameState): Snapshot {
  return {
    b: state.world.bodies.map((body) => [r2(body.pos.x), r2(body.pos.y), body.pocketed ? 1 : 0]),
    turn: state.turn,
    colors: [state.colors.p1, state.colors.p2],
    queen: { ...state.queen },
    winner: state.winner,
    msg: state.lastEvent,
  };
}

export function applySnapshot(state: GameState, snap: Snapshot): void {
  const bodies = state.world.bodies;
  for (let i = 0; i < bodies.length && i < snap.b.length; i++) {
    const body = bodies[i]!;
    const [x, y, pocketed] = snap.b[i]!;
    body.pos.x = x;
    body.pos.y = y;
    body.vel.x = 0;
    body.vel.y = 0;
    body.pocketed = pocketed === 1;
  }
  state.turn = snap.turn;
  state.colors = { p1: snap.colors[0], p2: snap.colors[1] };
  state.queen = { ...snap.queen };
  state.winner = snap.winner;
  state.lastEvent = snap.msg;
}
