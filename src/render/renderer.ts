import { BOARD, BASELINE_Y, BASELINE_X_MIN, BASELINE_X_MAX, STRIKER_RADIUS } from '../engine/constants';
import type { Body, BodyKind } from '../engine/body';
import type { GameState, Player } from '../game/types';
import type { Vec } from '../engine/vec2';
import { drawBoard } from './board';
import { getTheme, type Theme } from './themes';
import type { Fx } from './fx';

// What the game wants drawn on top of the board this frame: the aiming line, the
// power reading, the pull gesture, and which baseline (if any) to light up while
// the striker is being placed.
export interface Overlay {
  showAim: boolean;
  aimDir: Vec | null;
  aimPower: number; // 0..1
  pullTo: Vec | null; // pointer, for the pull line
  highlightBaseline: Player | null;
  time: number; // seconds, for subtle pulsing
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private board: HTMLCanvasElement;
  private theme: Theme;
  private pixels = 0; // current device-pixel size of the (square) canvas

  constructor(private canvas: HTMLCanvasElement, themeId: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    this.ctx = ctx;
    this.theme = getTheme(themeId);
    this.board = document.createElement('canvas');
    this.resize();
  }

  setTheme(themeId: string): void {
    this.theme = getTheme(themeId);
    this.discGradients.clear();
    this.renderBoardCache();
  }

  get activeTheme(): Theme {
    return this.theme;
  }

  /** Match the backing store to the element's on-screen size and DPR. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssSize = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 480;
    const px = Math.max(1, Math.round(cssSize * dpr));
    if (px === this.pixels) return;
    this.pixels = px;
    this.canvas.width = px;
    this.canvas.height = px;
    this.board.width = px;
    this.board.height = px;
    this.renderBoardCache();
  }

  private renderBoardCache(): void {
    const bctx = this.board.getContext('2d');
    if (!bctx) return;
    const s = this.pixels / BOARD;
    bctx.setTransform(s, 0, 0, s, 0, 0);
    bctx.clearRect(0, 0, BOARD, BOARD);
    drawBoard(bctx, this.theme);
  }

  /** Convert a client (screen) point into board coordinates. */
  screenToBoard(clientX: number, clientY: number): Vec {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD,
      y: ((clientY - rect.top) / rect.height) * BOARD,
    };
  }

  render(state: GameState, overlay: Overlay, fx: Fx): void {
    const ctx = this.ctx;
    const s = this.pixels / BOARD;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.pixels, this.pixels);
    ctx.drawImage(this.board, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    if (overlay.highlightBaseline) this.drawBaselineGlow(overlay.highlightBaseline, overlay.time);

    // Men and Queen first, striker last so it sits on top of the pack.
    for (const b of state.world.bodies) {
      if (b.pocketed || b.kind === 'striker') continue;
      this.drawDisc(b);
    }
    if (!state.striker.pocketed) this.drawStriker(state.striker);

    fx.draw(ctx, this.theme);

    if (overlay.showAim && overlay.aimDir) this.drawAim(state.striker.pos, overlay);
  }

  private drawBaselineGlow(player: Player, time: number): void {
    const ctx = this.ctx;
    const y = BASELINE_Y[player];
    const pulse = 0.4 + 0.25 * Math.sin(time * 3);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(BASELINE_X_MIN, y);
    ctx.lineTo(BASELINE_X_MAX, y);
    ctx.stroke();
    ctx.restore();
  }

  private colorsFor(kind: BodyKind): { hi: string; base: string; edge: string } {
    const t = this.theme;
    switch (kind) {
      case 'white':
        return { hi: t.whiteHi, base: t.white, edge: t.whiteEdge };
      case 'black':
        return { hi: t.blackHi, base: t.black, edge: t.blackEdge };
      case 'queen':
        return { hi: t.queenHi, base: t.queen, edge: t.queenEdge };
      case 'striker':
        return { hi: t.strikerHi, base: t.striker, edge: t.strikerEdge };
    }
  }

  // Each disc kind's radial shading only depends on its color and radius, so the
  // gradient is built once and reused. A body is drawn under a translate to its
  // position, which is what lets one origin-centered gradient serve every disc.
  private discGradients = new Map<BodyKind, CanvasGradient>();

  private discGradient(kind: BodyKind, r: number): CanvasGradient {
    let g = this.discGradients.get(kind);
    if (!g) {
      const { hi, base } = this.colorsFor(kind);
      g = this.ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
      g.addColorStop(0, hi);
      g.addColorStop(1, base);
      this.discGradients.set(kind, g);
    }
    return g;
  }

  private drawDisc(b: Body): void {
    const ctx = this.ctx;
    const { hi, base, edge } = this.colorsFor(b.kind);
    const r = b.radius;

    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);

    // Soft contact shadow.
    ctx.save();
    ctx.shadowColor = this.theme.shadow;
    ctx.shadowBlur = r * 0.6;
    ctx.shadowOffsetY = r * 0.28;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rounded shading, lit from the top-left.
    ctx.fillStyle = this.discGradient(b.kind, r);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Edge.
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.75, 0, Math.PI * 2);
    ctx.stroke();

    // A crisp little specular dot.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(-r * 0.34, -r * 0.38, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // The Queen wears a faint inner ring so she reads at a glance.
    if (b.kind === 'queen') {
      ctx.strokeStyle = this.theme.queenHi;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private drawStriker(b: Body): void {
    this.drawDisc(b);
    const ctx = this.ctx;
    const { x, y } = b.pos;
    const r = b.radius;
    // The dimpled grip ring that sets a striker apart from a man.
    ctx.strokeStyle = this.theme.strikerGrip;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawAim(from: Vec, overlay: Overlay): void {
    const ctx = this.ctx;
    const dir = overlay.aimDir!;
    const power = overlay.aimPower;

    // The pull line back to the finger, dim and dashed.
    if (overlay.pullTo) {
      ctx.save();
      ctx.setLineDash([8, 10]);
      ctx.strokeStyle = this.theme.aimGhost;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(overlay.pullTo.x, overlay.pullTo.y);
      ctx.stroke();
      ctx.restore();
    }

    // The launch line forward, colored by power and tipped with an arrow.
    const length = 70 + power * 320;
    const ex = from.x + dir.x * length;
    const ey = from.y + dir.y * length;
    const col = lerpHex(this.theme.powerLo, this.theme.powerHi, power);

    // Ghost of where the striker heads.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = this.theme.aimGhost;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, STRIKER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = col;
    ctx.lineWidth = 3 + power * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x + dir.x * (STRIKER_RADIUS + 2), from.y + dir.y * (STRIKER_RADIUS + 2));
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const ang = Math.atan2(dir.y, dir.x);
    const ah = 16;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex + dir.x * ah, ey + dir.y * ah);
    ctx.lineTo(ex - ah * Math.cos(ang - 0.5), ey - ah * Math.sin(ang - 0.5));
    ctx.lineTo(ex - ah * Math.cos(ang + 0.5), ey - ah * Math.sin(ang + 0.5));
    ctx.closePath();
    ctx.fill();

    // Power ring around the striker.
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(from.x, from.y, STRIKER_RADIUS + 9, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2);
    ctx.stroke();
  }
}

// Blend two hex colors. Kept tiny and local; the aim line is the only caller.
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
