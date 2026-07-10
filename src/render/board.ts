import {
  BOARD,
  FRAME,
  PLAY_MIN,
  PLAY_SIZE,
  CENTER,
  POCKETS,
  POCKET_RADIUS,
  CENTER_CIRCLE_RADIUS,
  CENTER_DOT_RADIUS,
  BASELINE_Y,
  BASELINE_X_MIN,
  BASELINE_X_MAX,
  BASE_CIRCLE_RADIUS,
} from '../engine/constants';
import type { Theme } from './themes';

// Draws the board once into whatever context it is handed, in board coordinates
// (0..BOARD). The renderer paints this onto an offscreen canvas and reuses it
// every frame, so the wood grain and inlays cost nothing after the first draw.

// A fixed-seed PRNG so the grain looks hand-done but never shimmers between
// frames or reloads.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawBoard(ctx: CanvasRenderingContext2D, theme: Theme): void {
  drawFrame(ctx, theme);
  drawFelt(ctx, theme);
  drawGrain(ctx, theme);
  drawMarkings(ctx, theme);
  drawPockets(ctx, theme);
}

function drawFrame(ctx: CanvasRenderingContext2D, theme: Theme): void {
  // The wood, lit from the top-left so the board reads as a physical object.
  const g = ctx.createLinearGradient(0, 0, BOARD, BOARD);
  g.addColorStop(0, theme.frameHi);
  g.addColorStop(0.5, theme.frame);
  g.addColorStop(1, theme.frameLo);
  roundRect(ctx, 0, 0, BOARD, BOARD, 34);
  ctx.fillStyle = g;
  ctx.fill();

  // Faint plank grain running along the frame.
  const rnd = seeded(99);
  ctx.save();
  roundRect(ctx, 0, 0, BOARD, BOARD, 34);
  ctx.clip();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = theme.frameLo;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 70; i++) {
    const y = rnd() * BOARD;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(BOARD * 0.3, y + (rnd() - 0.5) * 10, BOARD * 0.7, y + (rnd() - 0.5) * 10, BOARD, y);
    ctx.stroke();
  }
  ctx.restore();

  // A thin dark inlay just outside the felt.
  ctx.strokeStyle = theme.frameLine;
  ctx.lineWidth = 3;
  roundRect(ctx, FRAME - 6, FRAME - 6, PLAY_SIZE + 12, PLAY_SIZE + 12, 16);
  ctx.stroke();
}

function drawFelt(ctx: CanvasRenderingContext2D, theme: Theme): void {
  const r = ctx.createRadialGradient(CENTER.x, CENTER.y, 40, CENTER.x, CENTER.y, PLAY_SIZE * 0.72);
  r.addColorStop(0, theme.feltHi);
  r.addColorStop(1, theme.felt);
  roundRect(ctx, PLAY_MIN, PLAY_MIN, PLAY_SIZE, PLAY_SIZE, 14);
  ctx.fillStyle = r;
  ctx.fill();

  // Inner shadow where the felt meets the frame, for a little depth.
  ctx.save();
  roundRect(ctx, PLAY_MIN, PLAY_MIN, PLAY_SIZE, PLAY_SIZE, 14);
  ctx.clip();
  ctx.strokeStyle = theme.feltShadow;
  ctx.lineWidth = 18;
  ctx.globalAlpha = 0.55;
  roundRect(ctx, PLAY_MIN + 2, PLAY_MIN + 2, PLAY_SIZE - 4, PLAY_SIZE - 4, 14);
  ctx.stroke();
  ctx.restore();
}

function drawGrain(ctx: CanvasRenderingContext2D, theme: Theme): void {
  if (theme.grain <= 0) return;
  const rnd = seeded(7);
  ctx.save();
  roundRect(ctx, PLAY_MIN, PLAY_MIN, PLAY_SIZE, PLAY_SIZE, 14);
  ctx.clip();
  ctx.globalAlpha = 0.04 * theme.grain;
  ctx.fillStyle = theme.feltShadow;
  const speckles = Math.floor(1400 * theme.grain);
  for (let i = 0; i < speckles; i++) {
    const x = PLAY_MIN + rnd() * PLAY_SIZE;
    const y = PLAY_MIN + rnd() * PLAY_SIZE;
    ctx.fillRect(x, y, 1.3, 1.3);
  }
  ctx.restore();
}

function drawMarkings(ctx: CanvasRenderingContext2D, theme: Theme): void {
  ctx.lineCap = 'round';

  // Center rosette: two rings and a red spot for the Queen's home.
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 3;
  circle(ctx, CENTER.x, CENTER.y, CENTER_CIRCLE_RADIUS);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  circle(ctx, CENTER.x, CENTER.y, CENTER_CIRCLE_RADIUS - 12);
  ctx.stroke();

  // Little decorative petals around the rosette.
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = CENTER.x + Math.cos(a) * (CENTER_CIRCLE_RADIUS - 12);
    const y = CENTER.y + Math.sin(a) * (CENTER_CIRCLE_RADIUS - 12);
    circle(ctx, x, y, 5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = theme.lineStrong;
  ctx.globalAlpha = 0.9;
  circle(ctx, CENTER.x, CENTER.y, CENTER_DOT_RADIUS);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Baselines for both players, plus the base circles that bound the striker.
  for (const player of ['p1', 'p2'] as const) {
    const y = BASELINE_Y[player];
    ctx.strokeStyle = theme.lineStrong;
    ctx.lineWidth = 3.5;
    line(ctx, BASELINE_X_MIN, y, BASELINE_X_MAX, y);
    // A thin partner line, the classic double baseline.
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1.5;
    const off = player === 'p1' ? 9 : -9;
    line(ctx, BASELINE_X_MIN, y + off, BASELINE_X_MAX, y + off);

    ctx.strokeStyle = theme.lineStrong;
    ctx.lineWidth = 3.5;
    for (const bx of [BASELINE_X_MIN, BASELINE_X_MAX]) {
      circle(ctx, bx, y, BASE_CIRCLE_RADIUS);
      ctx.stroke();
    }
  }

  // The four corner arrows aiming inward, drawn faint like a real board's inlay.
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = theme.line;
  ctx.fillStyle = theme.line;
  for (const pk of POCKETS) {
    const toC = { x: CENTER.x - pk.x, y: CENTER.y - pk.y };
    const l = Math.hypot(toC.x, toC.y);
    const ux = toC.x / l;
    const uy = toC.y / l;
    const sx = pk.x + ux * (POCKET_RADIUS + 40);
    const sy = pk.y + uy * (POCKET_RADIUS + 40);
    const ex = pk.x + ux * (POCKET_RADIUS + 150);
    const ey = pk.y + uy * (POCKET_RADIUS + 150);
    ctx.lineWidth = 2.5;
    line(ctx, sx, sy, ex, ey);
    // arrowhead
    const ah = 12;
    const ang = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ah * Math.cos(ang - 0.4), ey - ah * Math.sin(ang - 0.4));
    ctx.lineTo(ex - ah * Math.cos(ang + 0.4), ey - ah * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPockets(ctx: CanvasRenderingContext2D, theme: Theme): void {
  for (const pk of POCKETS) {
    // A soft rim first, then the dark hole with a touch of inner depth.
    ctx.fillStyle = theme.pocketRim;
    circle(ctx, pk.x, pk.y, POCKET_RADIUS + 5);
    ctx.fill();

    const g = ctx.createRadialGradient(pk.x - 4, pk.y - 4, 2, pk.x, pk.y, POCKET_RADIUS);
    g.addColorStop(0, theme.pocket);
    g.addColorStop(1, theme.pocketRim);
    ctx.fillStyle = g;
    circle(ctx, pk.x, pk.y, POCKET_RADIUS);
    ctx.fill();

    ctx.fillStyle = theme.pocket;
    circle(ctx, pk.x, pk.y, POCKET_RADIUS - 3);
    ctx.fill();
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
