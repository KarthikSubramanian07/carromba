// Minimal 2D vector helpers. Bodies keep their pos/vel as plain mutable {x, y}
// objects so the physics loop can update them in place without allocating a new
// object every substep. These pure helpers are for the cold paths (aiming, AI
// geometry) where clarity beats a few bytes of garbage.

export interface Vec {
  x: number;
  y: number;
}

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

// Returns a unit vector. A zero vector stays zero rather than turning into NaN,
// which matters because we normalize collision normals for touching bodies.
export const normalize = (a: Vec): Vec => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
