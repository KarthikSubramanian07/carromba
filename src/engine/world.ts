import type { Body, BodyKind } from './body';
import { cloneBody, speed } from './body';
import {
  PLAY_MIN,
  PLAY_MAX,
  POCKETS,
  POCKET_RADIUS,
  PIECE_RADIUS,
  FRICTION_DECEL,
  LINEAR_DAMPING,
  RESTITUTION_PIECE,
  RESTITUTION_WALL,
  REST_EPSILON,
  PENETRATION_SLOP,
  PENETRATION_CORRECTION,
} from './constants';

// A single contact worth telling the outside world about, for sound and for the
// "did the striker actually hit anything" foul check.
export interface Impact {
  kindA: BodyKind;
  kindB: BodyKind | 'wall';
  strength: number; // impulse magnitude, roughly "how hard"
  x: number;
  y: number;
}

export interface PocketEvent {
  id: number;
  kind: BodyKind;
  pocketIndex: number;
  x: number;
  y: number;
}

export interface WorldEvents {
  pocketed: PocketEvent[];
  impacts: Impact[];
  // True if the striker touched any man this step, however gently. This is kept
  // separate from `impacts` (which is thresholded for sound and sparks) because
  // the "you must hit something" foul has to notice even a feather-light graze.
  strikerHitPiece: boolean;
}

// Below this impulse we do not bother reporting a contact. Keeps resting bodies
// that are barely leaning on each other from machine-gunning the sound engine.
const IMPACT_REPORT_THRESHOLD = 40;

// The solver runs a couple of passes per substep so the tightly packed opening
// rack separates cleanly instead of squeezing itself into a jitter.
const SOLVER_ITERATIONS = 2;

// A body may travel at most this far per substep before we add more substeps.
// Well under a piece radius, so nothing tunnels through anything.
const MAX_TRAVEL_PER_STEP = PIECE_RADIUS * 0.4;

/**
 * The physical board. It knows nothing about turns, rules, or rendering: it just
 * moves circles around a felt square with friction, bounces them off cushions,
 * and drops them into corner pockets. That isolation is what lets the AI clone a
 * world and run a shot forward in its head.
 */
export class World {
  bodies: Body[];

  constructor(bodies: Body[]) {
    this.bodies = bodies;
  }

  clone(): World {
    return new World(this.bodies.map(cloneBody));
  }

  active(): Body[] {
    return this.bodies.filter((b) => !b.pocketed);
  }

  maxSpeed(): number {
    let m = 0;
    for (const b of this.bodies) {
      if (b.pocketed) continue;
      const s = speed(b);
      if (s > m) m = s;
    }
    return m;
  }

  atRest(): boolean {
    return this.maxSpeed() === 0;
  }

  /** Advance the whole board by dt seconds, returning everything worth reacting to. */
  step(dt: number): WorldEvents {
    const events: WorldEvents = { pocketed: [], impacts: [], strikerHitPiece: false };
    let active = this.active();

    // Pick a substep count so the fastest body never leaps more than a fraction
    // of a radius in one go. Fast striker, more substeps; a gentle tap, just one.
    const travel = this.maxSpeed() * dt;
    const substeps = Math.min(40, Math.max(1, Math.ceil(travel / MAX_TRAVEL_PER_STEP)));
    const h = dt / substeps;

    for (let s = 0; s < substeps; s++) {
      this.integrate(active, h);
      this.resolveCollisions(active, events);
      const sank = this.capturePockets(active, events);
      if (sank) active = active.filter((b) => !b.pocketed);
      this.resolveWalls(active, events);
    }

    return events;
  }

  // Friction first, then move. Coulomb friction (a flat deceleration) is what
  // makes a disc slide and then simply stop, the way felt actually behaves.
  private integrate(active: Body[], h: number): void {
    const drag = 1 - LINEAR_DAMPING * h;
    for (const b of active) {
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp > 0) {
        let next = sp - FRICTION_DECEL * h;
        next = next > 0 ? next * drag : 0;
        if (next < REST_EPSILON) {
          b.vel.x = 0;
          b.vel.y = 0;
        } else {
          const k = next / sp;
          b.vel.x *= k;
          b.vel.y *= k;
        }
      }
      b.pos.x += b.vel.x * h;
      b.pos.y += b.vel.y * h;
    }
  }

  private resolveCollisions(active: Body[], events: WorldEvents): void {
    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      const report = iter === 0; // only log the impact once per substep
      for (let i = 0; i < active.length; i++) {
        const a = active[i]!;
        for (let j = i + 1; j < active.length; j++) {
          const b = active[j]!;
          let nx = b.pos.x - a.pos.x;
          let ny = b.pos.y - a.pos.y;
          let d = Math.hypot(nx, ny);
          const rsum = a.radius + b.radius;
          if (d >= rsum) continue;

          // Contact of any strength counts for the "must touch a man" rule.
          if ((a.kind === 'striker') !== (b.kind === 'striker')) {
            events.strikerHitPiece = true;
          }

          if (d < 1e-6) {
            // Perfectly coincident (can happen with stacked spawns). Nudge apart
            // along a fixed axis so the result stays deterministic.
            nx = 1;
            ny = 0;
            d = 1e-6;
          } else {
            nx /= d;
            ny /= d;
          }

          // Push the pair apart, split by inverse mass, ignoring a sliver of slop.
          const pen = rsum - d;
          if (pen > PENETRATION_SLOP) {
            const corr =
              ((pen - PENETRATION_SLOP) * PENETRATION_CORRECTION) /
              (a.invMass + b.invMass);
            a.pos.x -= nx * corr * a.invMass;
            a.pos.y -= ny * corr * a.invMass;
            b.pos.x += nx * corr * b.invMass;
            b.pos.y += ny * corr * b.invMass;
          }

          // Only bounce bodies that are closing on each other.
          const rvx = b.vel.x - a.vel.x;
          const rvy = b.vel.y - a.vel.y;
          const along = rvx * nx + rvy * ny;
          if (along < 0) {
            const jImp =
              (-(1 + RESTITUTION_PIECE) * along) / (a.invMass + b.invMass);
            const ix = nx * jImp;
            const iy = ny * jImp;
            a.vel.x -= ix * a.invMass;
            a.vel.y -= iy * a.invMass;
            b.vel.x += ix * b.invMass;
            b.vel.y += iy * b.invMass;
            if (report && jImp > IMPACT_REPORT_THRESHOLD) {
              events.impacts.push({
                kindA: a.kind,
                kindB: b.kind,
                strength: jImp,
                x: (a.pos.x + b.pos.x) / 2,
                y: (a.pos.y + b.pos.y) / 2,
              });
            }
          }
        }
      }
    }
  }

  // Corner pockets win over cushions: a body whose center falls into a pocket is
  // gone, even if it is technically also touching a wall.
  private capturePockets(active: Body[], events: WorldEvents): boolean {
    let any = false;
    for (const b of active) {
      if (b.pocketed) continue;
      for (let p = 0; p < POCKETS.length; p++) {
        const pocket = POCKETS[p]!;
        const dx = b.pos.x - pocket.x;
        const dy = b.pos.y - pocket.y;
        if (dx * dx + dy * dy <= POCKET_RADIUS * POCKET_RADIUS) {
          b.pocketed = true;
          b.vel.x = 0;
          b.vel.y = 0;
          events.pocketed.push({
            id: b.id,
            kind: b.kind,
            pocketIndex: p,
            x: pocket.x,
            y: pocket.y,
          });
          any = true;
          break;
        }
      }
    }
    return any;
  }

  private resolveWalls(active: Body[], events: WorldEvents): void {
    for (const b of active) {
      // Near a corner pocket mouth, let the body roll on in rather than clipping
      // it against the cushion that the pocket has effectively cut away.
      if (this.nearPocketMouth(b)) continue;

      const left = PLAY_MIN + b.radius;
      const right = PLAY_MAX - b.radius;
      const top = PLAY_MIN + b.radius;
      const bottom = PLAY_MAX - b.radius;

      if (b.pos.x < left) {
        b.pos.x = left;
        if (b.vel.x < 0) {
          this.reportWall(events, b);
          b.vel.x = -b.vel.x * RESTITUTION_WALL;
        }
      } else if (b.pos.x > right) {
        b.pos.x = right;
        if (b.vel.x > 0) {
          this.reportWall(events, b);
          b.vel.x = -b.vel.x * RESTITUTION_WALL;
        }
      }

      if (b.pos.y < top) {
        b.pos.y = top;
        if (b.vel.y < 0) {
          this.reportWall(events, b);
          b.vel.y = -b.vel.y * RESTITUTION_WALL;
        }
      } else if (b.pos.y > bottom) {
        b.pos.y = bottom;
        if (b.vel.y > 0) {
          this.reportWall(events, b);
          b.vel.y = -b.vel.y * RESTITUTION_WALL;
        }
      }
    }
  }

  private nearPocketMouth(b: Body): boolean {
    const reach = POCKET_RADIUS + b.radius;
    const reach2 = reach * reach;
    for (const pocket of POCKETS) {
      const dx = b.pos.x - pocket.x;
      const dy = b.pos.y - pocket.y;
      if (dx * dx + dy * dy <= reach2) return true;
    }
    return false;
  }

  private reportWall(events: WorldEvents, b: Body): void {
    const strength = Math.hypot(b.vel.x, b.vel.y) * b.mass * (1 + RESTITUTION_WALL);
    if (strength > IMPACT_REPORT_THRESHOLD) {
      events.impacts.push({ kindA: b.kind, kindB: 'wall', strength, x: b.pos.x, y: b.pos.y });
    }
  }
}

/**
 * Run a world forward until everything stops (or the safety timer trips),
 * accumulating every event. Used by the game loop's headless paths and by the AI
 * to score a shot without touching the live board.
 */
export function simulateToRest(world: World, fixedDt: number, maxSeconds: number): WorldEvents {
  const all: WorldEvents = { pocketed: [], impacts: [], strikerHitPiece: false };
  let t = 0;
  while (t < maxSeconds && !world.atRest()) {
    const e = world.step(fixedDt);
    all.pocketed.push(...e.pocketed);
    all.impacts.push(...e.impacts);
    if (e.strikerHitPiece) all.strikerHitPiece = true;
    t += fixedDt;
  }
  return all;
}
