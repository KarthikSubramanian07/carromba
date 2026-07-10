import { createBody, type Body } from '../engine/body';
import { CENTER, PIECE_RADIUS, PIECE_MASS } from '../engine/constants';

// The opening cluster is 19 discs packed into a centered hexagon: the Queen in
// the middle, a ring of 6 touching her, and a ring of 12 around that (1+6+12).
// The cleanest way to get that geometry exactly right is to lay it out on a
// triangular lattice and keep every point within hex-distance 2 of the center.
//
// Colors alternate around each ring, the simple and symmetric arrangement the
// laws of carrom describe: three whites and three blacks inside, six and six
// outside, for the required nine of each. The Queen sits red at the heart of it.

// A hair of breathing room between touching discs so the solver never has to
// unstick the opening rack on the very first frame.
const GAP = 0.6;
const SPACING = 2 * PIECE_RADIUS + GAP;

interface LatticePoint {
  x: number;
  y: number;
  ring: number; // 1 = inner six, 2 = outer twelve
  angle: number;
}

function hexPoints(): LatticePoint[] {
  const pts: LatticePoint[] = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) continue; // the Queen owns the center
      const hexDist = (Math.abs(i) + Math.abs(j) + Math.abs(i + j)) / 2;
      if (hexDist > 2) continue;
      const x = (i + j / 2) * SPACING;
      const y = j * (Math.sqrt(3) / 2) * SPACING;
      pts.push({ x, y, ring: hexDist, angle: Math.atan2(y, x) });
    }
  }
  return pts;
}

/**
 * Build the full set of bodies for a fresh game: the Queen dead center, then the
 * eighteen men in their close-packed rings with colors alternating around each.
 * Positions are absolute board coordinates. The striker is created separately.
 */
export function buildRack(): Body[] {
  const bodies: Body[] = [];

  bodies.push(createBody('queen', { x: CENTER.x, y: CENTER.y }, PIECE_RADIUS, PIECE_MASS));

  const points = hexPoints();
  for (const ring of [1, 2]) {
    const inRing = points
      .filter((p) => p.ring === ring)
      .sort((a, b) => a.angle - b.angle);
    inRing.forEach((p, index) => {
      const color = index % 2 === 0 ? 'white' : 'black';
      bodies.push(
        createBody(color, { x: CENTER.x + p.x, y: CENTER.y + p.y }, PIECE_RADIUS, PIECE_MASS),
      );
    });
  }

  return bodies;
}

// Handy counts the rest of the game leans on, kept next to the layout that
// produces them so they can never drift out of sync.
export const MEN_PER_COLOR = 9;
