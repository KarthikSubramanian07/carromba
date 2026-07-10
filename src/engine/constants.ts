// Every measurement in Carromba lives in one normalized coordinate space so the
// physics never has to care about screen pixels. The board is a BOARD x BOARD
// square. (0,0) is top-left, x grows right, y grows down, matching canvas. The
// renderer scales this whole space to fit whatever screen it lands on.
//
// The proportions here are lifted from a real tournament board (roughly 29 inch
// playfield, 24mm men, 41mm striker, 45mm pockets) and then nudged for feel.
// This file is the single source of truth: tune the game from here.

export const BOARD = 1000;

// The wooden frame around the playfield. Pockets are cut into its inner corners.
export const FRAME = 76;

// The playfield is the felt square the pieces actually slide on.
export const PLAY_MIN = FRAME;
export const PLAY_MAX = BOARD - FRAME;
export const PLAY_SIZE = PLAY_MAX - PLAY_MIN;
export const CENTER = { x: BOARD / 2, y: BOARD / 2 };

// Piece and striker sizing. The striker is bigger and heavier, like the real
// thing, so it shoves men around convincingly instead of pinging off them.
// Sizes track a real tournament set scaled into board units: a 74cm board with
// 3.1cm men, 4.1cm striker, 4.45cm pockets. The striker is meaningfully heavier
// than a man (roughly 15g vs 5.4g), which is why it drives through the pack
// instead of pinging off it.
export const PIECE_RADIUS = 17;
export const STRIKER_RADIUS = 23;
export const PIECE_MASS = 1;
export const STRIKER_MASS = 2.7;

// Pockets sit at the four inner corners of the playfield. A body is pocketed
// when its center falls inside POCKET_RADIUS of a corner. Kept a hair above the
// real ratio so clean shots drop instead of rattling the lip forever, but not so
// wide that lazy shots fall in.
export const POCKET_RADIUS = 29;
export const POCKETS = [
  { x: PLAY_MIN, y: PLAY_MIN },
  { x: PLAY_MAX, y: PLAY_MIN },
  { x: PLAY_MIN, y: PLAY_MAX },
  { x: PLAY_MAX, y: PLAY_MAX },
] as const;

// The center circle where the pieces are racked and the Queen begins.
export const CENTER_CIRCLE_RADIUS = 130;
// The small ring drawn at the very center under the Queen.
export const CENTER_DOT_RADIUS = 22;

// Baselines. Each player places the striker along their own baseline, a
// horizontal segment inset from their edge, bounded by two base circles.
const BASE_INSET = 132; // distance of the baseline from the near wall
export const BASE_SIDE_INSET = 150; // how far the segment ends sit from the side walls
export const BASE_CIRCLE_RADIUS = 26; // the red circles that cap each baseline

// Player 1 shoots from the bottom, player 2 from the top.
export const BASELINE_Y = {
  p1: PLAY_MAX - BASE_INSET,
  p2: PLAY_MIN + BASE_INSET,
} as const;
export const BASELINE_X_MIN = PLAY_MIN + BASE_SIDE_INSET;
export const BASELINE_X_MAX = PLAY_MAX - BASE_SIDE_INSET;

// ---- Physics tuning ----
// Speeds are board-units per second, accelerations per second squared.

// Coulomb friction: a constant deceleration, the way a real disc sliding on felt
// loses speed and then simply stops. This is the single most important number
// for feel. Too low and pieces drift forever; too high and a flick dies instantly.
export const FRICTION_DECEL = 1150;

// A whisper of linear drag on top of Coulomb, so fast pieces have a slightly
// softer tail instead of a perfectly straight ramp to zero.
export const LINEAR_DAMPING = 0.4;

// Bounciness. Pieces clack off each other with some life; the walls (felt-lined
// cushions) eat a bit more energy.
export const RESTITUTION_PIECE = 0.62;
export const RESTITUTION_WALL = 0.5;

// The hardest a flick can launch the striker. Aim/power UX scales into this.
export const MAX_STRIKER_SPEED = 2300;
export const MIN_STRIKER_SPEED = 120; // below this a flick is treated as no shot

// A body slower than this (units/sec) is considered stopped. Coulomb friction
// snaps speeds to exactly zero near this floor so nothing jitters at rest.
export const REST_EPSILON = 5;

// Safety net: if a rally somehow never settles, force rest after this long.
export const MAX_SIM_SECONDS = 14;

// Overlap the solver tolerates before pushing bodies apart, and how firmly it
// pushes. Prevents the tightly-racked opening from buzzing against itself.
export const PENETRATION_SLOP = 0.4;
export const PENETRATION_CORRECTION = 0.8;
