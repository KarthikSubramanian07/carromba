import type { Vec } from '../engine/vec2';
import type { Player } from './types';
import {
  BASELINE_X_MIN,
  BASELINE_X_MAX,
  BASELINE_Y,
  MAX_STRIKER_SPEED,
  MIN_STRIKER_SPEED,
} from '../engine/constants';

// How far (in board units) you drag the striker back to reach full power. Past
// this, power is capped, so a wild yank does not launch the striker into orbit.
const MAX_PULL_DISTANCE = 340;

// A pull shorter than this is treated as a tap, not a shot. Prevents an
// accidental twitch from wasting a turn.
const MIN_PULL_DISTANCE = 14;

/** Snap an x coordinate onto the player's baseline segment. */
export function clampToBaseline(x: number, player: Player): Vec {
  const cx = Math.min(BASELINE_X_MAX, Math.max(BASELINE_X_MIN, x));
  return { x: cx, y: BASELINE_Y[player] };
}

export interface Flick {
  dir: Vec; // unit launch direction
  power: number; // 0..1, for the power meter
  speed: number; // resulting launch speed in board units per second
}

/**
 * Turn a slingshot drag into a shot. The striker stays on its baseline; the
 * player drags away from the target and the striker launches the opposite way,
 * the further the pull the harder the shot. Returns null when the drag is too
 * small to count as a stroke.
 */
export function computeFlick(strikerPos: Vec, pointer: Vec): Flick | null {
  const pullX = strikerPos.x - pointer.x;
  const pullY = strikerPos.y - pointer.y;
  const pull = Math.hypot(pullX, pullY);
  if (pull < MIN_PULL_DISTANCE) return null;

  const power = Math.min(1, pull / MAX_PULL_DISTANCE);
  const speed = MIN_STRIKER_SPEED + power * (MAX_STRIKER_SPEED - MIN_STRIKER_SPEED);
  return {
    dir: { x: pullX / pull, y: pullY / pull },
    power,
    speed,
  };
}
