import type { Vec } from './vec2';

// What a body represents to the game layer. The physics engine treats every
// body identically (they are all just circles); this tag only rides along so the
// game and renderer can tell a striker from the Queen from a plain man.
export type BodyKind = 'white' | 'black' | 'queen' | 'striker';

export interface Body {
  id: number;
  kind: BodyKind;
  pos: Vec; // mutated in place by the solver
  vel: Vec; // mutated in place by the solver
  radius: number;
  mass: number;
  invMass: number; // 1/mass, precomputed; 0 would mean immovable (unused for now)
  pocketed: boolean;
}

let nextId = 1;

export function createBody(
  kind: BodyKind,
  pos: Vec,
  radius: number,
  mass: number,
): Body {
  return {
    id: nextId++,
    kind,
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius,
    mass,
    invMass: 1 / mass,
    pocketed: false,
  };
}

// Deep copy for headless AI simulation, where we must not disturb the live board.
export function cloneBody(b: Body): Body {
  return {
    id: b.id,
    kind: b.kind,
    pos: { x: b.pos.x, y: b.pos.y },
    vel: { x: b.vel.x, y: b.vel.y },
    radius: b.radius,
    mass: b.mass,
    invMass: b.invMass,
    pocketed: b.pocketed,
  };
}

export const speed = (b: Body): number => Math.hypot(b.vel.x, b.vel.y);
