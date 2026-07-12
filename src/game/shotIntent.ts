import {
  BASELINE_X_MAX,
  BASELINE_X_MIN,
  MAX_STRIKER_SPEED,
  MIN_STRIKER_SPEED,
} from '../engine/constants';

export const SHOT_INTENT_VERSION = 1 as const;

/** Versioned online shot intent shared by clients and the rooms Worker. */
export interface ShotIntentV1 {
  v: typeof SHOT_INTENT_VERSION;
  strikerX: number;
  dir: { x: number; y: number };
  speed: number;
}

export type ShotIntent = ShotIntentV1;

export function isShotIntent(value: unknown): value is ShotIntentV1 {
  if (!value || typeof value !== 'object') return false;
  const shot = value as ShotIntentV1;
  return (
    shot.v === SHOT_INTENT_VERSION &&
    typeof shot.strikerX === 'number' &&
    Number.isFinite(shot.strikerX) &&
    shot.dir &&
    typeof shot.dir.x === 'number' &&
    typeof shot.dir.y === 'number' &&
    Number.isFinite(shot.dir.x) &&
    Number.isFinite(shot.dir.y) &&
    typeof shot.speed === 'number' &&
    Number.isFinite(shot.speed)
  );
}

export function validateShotIntent(shot: ShotIntentV1): boolean {
  if (shot.strikerX < BASELINE_X_MIN || shot.strikerX > BASELINE_X_MAX) return false;
  if (shot.speed < MIN_STRIKER_SPEED || shot.speed > MAX_STRIKER_SPEED) return false;
  const mag = Math.hypot(shot.dir.x, shot.dir.y);
  if (mag < 0.98 || mag > 1.02) return false;
  return true;
}

/** Normalize legacy LocalMove payloads into the versioned protocol. */
export function normalizeShotIntent(raw: unknown): ShotIntentV1 | null {
  if (isShotIntent(raw) && validateShotIntent(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw as { strikerX?: unknown; dir?: { x?: unknown; y?: unknown }; speed?: unknown };
  const candidate: ShotIntentV1 = {
    v: SHOT_INTENT_VERSION,
    strikerX: Number(legacy.strikerX),
    dir: { x: Number(legacy.dir?.x), y: Number(legacy.dir?.y) },
    speed: Number(legacy.speed),
  };
  return validateShotIntent(candidate) ? candidate : null;
}
