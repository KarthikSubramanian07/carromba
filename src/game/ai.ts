import type { Vec } from '../engine/vec2';
import { normalize, sub, dist, len } from '../engine/vec2';
import type { Body } from '../engine/body';
import { simulateToRest } from '../engine/world';
import {
  POCKETS,
  PIECE_RADIUS,
  STRIKER_RADIUS,
  BASELINE_Y,
  BASELINE_X_MIN,
  BASELINE_X_MAX,
  FRICTION_DECEL,
  RESTITUTION_PIECE,
  PIECE_MASS,
  STRIKER_MASS,
  MAX_STRIKER_SPEED,
  MIN_STRIKER_SPEED,
} from '../engine/constants';
import type { GameState, Player, Difficulty } from './types';

// The bot the way the research said the good ones work: generate candidate shots
// with ghost-ball geometry, then actually roll each one forward through the same
// physics the human plays against and keep the board that comes out best. No
// machine learning, no lookup tables, just "try it in my head and see." The three
// difficulty tiers are the same brain with more or less hand tremor bolted on.

export interface AiShot {
  strikerX: number; // where on the baseline the striker is placed
  dir: Vec; // unit launch direction
  speed: number; // launch speed in board units per second
}

const DT = 1 / 120;
// Rallies almost always settle well inside this; a shorter cap than the live game
// keeps the bot quick when it is weighing dozens of shots.
const AI_SIM_SECONDS = 9;

interface Tier {
  candidates: number; // how many shots to actually simulate
  angleNoise: number; // radians of gaussian tremor on the final aim
  powerNoise: number; // fractional gaussian tremor on the final power
  blunderChance: number; // odds of picking a worse shot on purpose
}

// Aim error is on the striker's launch angle, and it amplifies badly on cut
// shots (a hair off the contact point swings the target wide), so these look
// smaller than they play. Easy sprays and second-guesses itself; hard is nearly
// a machine.
const TIERS: Record<Difficulty, Tier> = {
  easy: { candidates: 10, angleNoise: 0.03, powerNoise: 0.2, blunderChance: 0.45 },
  medium: { candidates: 22, angleNoise: 0.008, powerNoise: 0.08, blunderChance: 0.12 },
  hard: { candidates: 44, angleNoise: 0.0022, powerNoise: 0.015, blunderChance: 0 },
};

type Rng = () => number;

function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function rotate(dir: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
}

const clampSpeed = (v: number): number =>
  Math.min(MAX_STRIKER_SPEED, Math.max(MIN_STRIKER_SPEED, v));

// A physics-honest guess at the launch speed that pots a target: the man must
// still be rolling when it reaches the pocket, the collision only hands it a
// fraction of the striker's speed (heavier striker, restitution well under 1),
// and the striker itself bleeds speed sliding to the contact. Work backward
// through all three. It only needs to be close; the sampled power variants and
// the simulation do the rest.
function estimateLaunchSpeed(strikerRun: number, targetRun: number): number {
  const a = FRICTION_DECEL;
  const targetArrival = Math.sqrt(2 * a * Math.max(0, targetRun)) * 1.12;
  const transfer = ((1 + RESTITUTION_PIECE) * STRIKER_MASS) / (PIECE_MASS + STRIKER_MASS);
  const strikerAtContact = targetArrival / transfer;
  return clampSpeed(Math.sqrt(strikerAtContact * strikerAtContact + 2 * a * strikerRun) * 1.04);
}

// A plain "slide this far" speed, used only by the last-ditch fallback shot.
function speedForTravel(travel: number): number {
  return clampSpeed(Math.sqrt(2 * FRICTION_DECEL * Math.max(0, travel)) * 1.2);
}

function onBoard(state: GameState): Body[] {
  return state.world.bodies.filter((b) => !b.pocketed && b.kind !== 'striker');
}

function nearestPocketDist(pos: Vec): number {
  let m = Infinity;
  for (const p of POCKETS) m = Math.min(m, dist(pos, p));
  return m;
}

// Which men the bot is trying to sink. Before the board opens, anything goes.
function targetsFor(state: GameState, ai: Player): Body[] {
  const color = state.colors[ai];
  const men = onBoard(state).filter((b) => b.kind === 'white' || b.kind === 'black');
  const own = color ? men.filter((b) => b.kind === color) : men;
  const queen = state.world.bodies.find((b) => b.kind === 'queen' && !b.pocketed);
  // Chase the Queen once there is a man left to cover her with.
  if (queen && (!color || own.length >= 1)) return [...own, queen];
  return own;
}

interface Candidate extends AiShot {
  target: Body;
}

// A straight pot: place the striker where the pocket-through-target line meets the
// baseline, aim down that line, pick a power that carries the target home.
function directCandidate(
  target: Body,
  pocket: { x: number; y: number },
  ai: Player,
): Candidate | null {
  const baselineY = BASELINE_Y[ai];
  // Unit vector from pocket to target: the striker must strike from beyond this.
  const away = normalize(sub(target.pos, pocket));
  if (Math.abs(away.y) < 1e-3) return null; // line runs parallel to the baseline

  // Ghost point: where the striker's center sits at the moment of contact.
  const ghost = {
    x: target.pos.x + away.x * (PIECE_RADIUS + STRIKER_RADIUS),
    y: target.pos.y + away.y * (PIECE_RADIUS + STRIKER_RADIUS),
  };

  // Where that line crosses the shooter's baseline.
  const t = (baselineY - ghost.y) / away.y;
  const strikerX = ghost.x + away.x * t;
  if (strikerX < BASELINE_X_MIN || strikerX > BASELINE_X_MAX) return null;

  const from = { x: strikerX, y: baselineY };
  const dir = normalize(sub(ghost, from));
  // The striker must arrive at the ghost point from behind the target, so the
  // contact drives the target toward the pocket rather than away from it. (The
  // near corner pockets, behind the baseline, are perfectly valid targets, so we
  // never restrict which way the shot points, only that the hit is on the right
  // side of the target.)
  if (dir.x * away.x + dir.y * away.y > -0.2) return null;

  const speed = estimateLaunchSpeed(dist(from, ghost), dist(target.pos, pocket));
  return { strikerX, dir, speed, target };
}

// Is the striker's run-up to the ghost point clear of other men? A blocked lane
// almost never pots, so we drop it before wasting a simulation on it.
function laneClear(state: GameState, from: Vec, dir: Vec, target: Body): boolean {
  const reach = dist(from, target.pos);
  for (const b of onBoard(state)) {
    if (b === target) continue;
    // project b onto the launch ray
    const rel = sub(b.pos, from);
    const along = rel.x * dir.x + rel.y * dir.y;
    if (along <= 0 || along >= reach) continue;
    const perp = Math.abs(rel.x * -dir.y + rel.y * dir.x);
    if (perp < STRIKER_RADIUS + b.radius - 2) return false;
  }
  return true;
}

function scoreOutcome(state: GameState, ai: Player, shot: AiShot): number {
  const world = state.world.clone();
  const striker = world.bodies.find((b) => b.kind === 'striker')!;
  striker.pocketed = false;
  striker.pos.x = shot.strikerX;
  striker.pos.y = BASELINE_Y[ai];
  striker.vel.x = shot.dir.x * shot.speed;
  striker.vel.y = shot.dir.y * shot.speed;

  const events = simulateToRest(world, DT, AI_SIM_SECONDS);
  const color = state.colors[ai];

  let own = 0;
  let opp = 0;
  let strikerSank = false;
  let queenSank = false;
  for (const p of events.pocketed) {
    if (p.kind === 'striker') strikerSank = true;
    else if (p.kind === 'queen') queenSank = true;
    else if (!color) own += 1; // board still open: any man opens it
    else if (p.kind === color) own += 1;
    else opp += 1;
  }

  let score = own * 100;
  if (queenSank) score += own > 0 ? 170 : 45; // covered vs left pending (risky)
  if (strikerSank) score -= 320;
  score -= opp * 70;

  // Tie-breaker: nudge the bot toward leaving its remaining men near a pocket, so
  // a shot that pots nothing still prefers to set up rather than scatter.
  if (color) {
    let setup = 0;
    for (const b of world.bodies) {
      if (b.pocketed || b.kind !== color) continue;
      setup += nearestPocketDist(b.pos);
    }
    score -= setup * 0.01;
  }
  return score;
}

/**
 * Pick a shot for the bot. Deterministic given the same rng, so tests can pin it
 * down. The rng defaults to Math.random for real play.
 */
export function chooseShot(state: GameState, ai: Player, rng: Rng = Math.random): AiShot {
  const tier = TIERS[state.difficulty];
  const targets = targetsFor(state, ai);

  // Build direct candidates against the two nearest pockets for each target,
  // nearest targets first so the cap below keeps the most makeable shots.
  const bases: Candidate[] = [];
  const ordered = [...targets].sort(
    (a, b) => nearestPocketDist(a.pos) - nearestPocketDist(b.pos),
  );
  for (const target of ordered) {
    const nearest = [...POCKETS].sort((a, b) => dist(target.pos, a) - dist(target.pos, b)).slice(0, 2);
    for (const pocket of nearest) {
      const c = directCandidate(target, pocket, ai);
      if (!c) continue;
      if (!laneClear(state, { x: c.strikerX, y: BASELINE_Y[ai] }, c.dir, target)) continue;
      bases.push(c);
    }
  }

  // The aim from ghost-ball geometry is exact; the power is the uncertain part.
  // So fan each shot across several powers and let the simulation find the one
  // that actually drops (a soft touch, the estimate, or a firm drive).
  const POWER_MULTIPLIERS = [0.82, 1, 1.22, 1.5];
  const variants: AiShot[] = [];
  for (const b of bases) {
    for (const m of POWER_MULTIPLIERS) {
      variants.push({ strikerX: b.strikerX, dir: b.dir, speed: clampSpeed(b.speed * m) });
    }
  }

  // Always have something to shoot: if geometry gave us nothing (everything
  // blocked or awkward), fall back to a firm shot at the nearest target.
  if (variants.length === 0) {
    const fallback = fallbackShot(state, ai, ordered);
    return applyTremor(fallback, tier, rng);
  }

  // Simulate up to the tier's budget of variants and rank by outcome.
  const pool = variants.slice(0, Math.max(tier.candidates, POWER_MULTIPLIERS.length));
  const scored = pool
    .map((shot) => ({ shot, score: scoreOutcome(state, ai, shot) }))
    .sort((a, b) => b.score - a.score);

  let chosen = scored[0]!.shot;
  // Weaker tiers sometimes talk themselves into a worse shot.
  if (scored.length > 1 && rng() < tier.blunderChance) {
    const idx = 1 + Math.floor(rng() * (scored.length - 1));
    chosen = scored[Math.min(idx, scored.length - 1)]!.shot;
  }

  // The geometric aim tends to sit near the edge of the pocket's acceptance
  // window, not its middle. Sweep a few tiny angle offsets, simulate each, and
  // recenter on the best-scoring band, so the shot has slack on both sides before
  // any tremor is added. This is the aim a good player's eye finds by feel.
  if (scored[0]!.score > 0) chosen = refineAim(state, ai, chosen);

  return applyTremor(chosen, tier, rng);
}

function refineAim(state: GameState, ai: Player, shot: AiShot): AiShot {
  const N = 13;
  const spread = 0.012; // radians, about +/- 0.7 degrees
  const samples: { off: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    const off = -spread + (2 * spread * i) / (N - 1);
    samples.push({ off, score: scoreOutcome(state, ai, { ...shot, dir: rotate(shot.dir, off) }) });
  }
  const max = Math.max(...samples.map((s) => s.score));
  if (max <= 0) return shot;
  const winners = samples.filter((s) => s.score >= max - 1e-6).map((s) => s.off);
  const center = winners[Math.floor(winners.length / 2)] ?? 0;
  return { ...shot, dir: rotate(shot.dir, center) };
}

function fallbackShot(state: GameState, ai: Player, targets: Body[]): AiShot {
  const baselineY = BASELINE_Y[ai];
  const from = { x: (BASELINE_X_MIN + BASELINE_X_MAX) / 2, y: baselineY };
  const aim = targets[0] ?? state.world.bodies.find((b) => b.kind === 'queen')!;
  const dir = normalize(sub(aim.pos, from));
  const travel = len(sub(aim.pos, from)) * 1.1;
  return { strikerX: from.x, dir, speed: speedForTravel(travel) };
}

// Add human-like imprecision, then keep the shot legal: on the baseline and
// within the speed range.
function applyTremor(shot: AiShot, tier: Tier, rng: Rng): AiShot {
  const dir = rotate(shot.dir, gaussian(rng) * tier.angleNoise);
  const speed = clampSpeed(shot.speed * (1 + gaussian(rng) * tier.powerNoise));
  const strikerX = Math.min(BASELINE_X_MAX, Math.max(BASELINE_X_MIN, shot.strikerX));
  return { strikerX, dir, speed };
}
