import type { Theme } from './themes';

// Small, cheap juice: a ring and a few motes when a piece drops, a brief spark
// where two men clack. Nothing here affects the game, it just makes the board
// feel alive. All of it is transient and self-cleaning.

interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  color: string;
  from: number;
  to: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

export class Fx {
  private rings: Ring[] = [];
  private motes: Mote[] = [];

  pocket(x: number, y: number, color: string, glow: boolean): void {
    this.rings.push({ x, y, t: 0, life: 0.5, color, from: 6, to: glow ? 64 : 44 });
    const n = glow ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const sp = 60 + Math.random() * 160;
      this.motes.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        life: 0.45 + Math.random() * 0.3,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  hit(x: number, y: number, strength: number, color: string): void {
    // Only worth showing for a real clack, not every resting nudge.
    if (strength < 220) return;
    const power = Math.min(1, strength / 1400);
    this.rings.push({ x, y, t: 0, life: 0.22, color, from: 2, to: 10 + power * 22 });
  }

  update(dt: number): void {
    for (const r of this.rings) r.t += dt;
    for (const m of this.motes) {
      m.t += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 0.9;
      m.vy *= 0.9;
    }
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.motes = this.motes.filter((m) => m.t < m.life);
  }

  get active(): boolean {
    return this.rings.length > 0 || this.motes.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, theme: Theme): void {
    if (theme.glow) ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const p = r.t / r.life;
      const radius = r.from + (r.to - r.from) * easeOut(p);
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const m of this.motes) {
      const p = m.t / m.life;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * (1 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    this.rings.length = 0;
    this.motes.length = 0;
  }
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}
