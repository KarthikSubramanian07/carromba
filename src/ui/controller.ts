import { Renderer, type Overlay } from '../render/renderer';
import { Fx } from '../render/fx';
import type { WorldEvents } from '../engine/world';
import type { GameState, Mode, Difficulty, Player } from '../game/types';
import { createGame, resetStrikerForTurn } from '../game/setup';
import { resolveStroke, menLeftFor } from '../game/rules';
import { computeFlick, clampToBaseline } from '../game/striker';
import { chooseShot } from '../game/ai';
import type { Body } from '../engine/body';
import {
  BASELINE_Y,
  MAX_STRIKER_SPEED,
  MIN_STRIKER_SPEED,
  STRIKER_RADIUS,
  MAX_SIM_SECONDS,
} from '../engine/constants';
import type { Vec } from '../engine/vec2';
import * as audio from '../audio';
import { recordResult, recordQueenCovered } from '../store';

const FIXED_DT = 1 / 120;
// How close to the striker a press must land to count as "grab and aim", and how
// wide the baseline strip is for repositioning.
const GRAB_RADIUS = STRIKER_RADIUS * 2.6;
const PLACE_BAND = 80;

export interface HudInfo {
  turn: Player;
  humanSide: Player;
  mode: Mode;
  colors: GameState['colors'];
  leftP1: number;
  leftP2: number;
  queen: GameState['queen'];
  message: string;
  thinking: boolean;
}

export interface ControllerHooks {
  onHud(info: HudInfo): void;
  onGameOver(winner: Player, humanWon: boolean): void;
}

export class GameController {
  state: GameState;
  private renderer: Renderer;
  private fx = new Fx();
  private raf = 0;
  private lastTime = 0;
  private time = 0;

  private inputMode: 'place' | 'aim' | null = null;
  private pointer: Vec | null = null;
  private activePointerId: number | null = null;

  // Accumulated across the current stroke's simulation.
  private accumulator = 0;
  private simElapsed = 0;
  private pocketedThisStroke: { id: number; kind: Body['kind'] }[] = [];
  private strikerTouchedPiece = false;

  private thinking = false;
  private aiPreview: { dir: Vec; power: number } | null = null;
  private gen = 0; // bumped on every start/destroy to cancel stale async work

  constructor(
    private canvas: HTMLCanvasElement,
    themeId: string,
    private hooks: ControllerHooks,
  ) {
    this.renderer = new Renderer(canvas, themeId);
    this.state = createGame('ai', 'medium', 'p1');
    this.bindInput();
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  setTheme(themeId: string): void {
    this.renderer.setTheme(themeId);
  }

  setReduceMotion(reduce: boolean): void {
    if (reduce) this.fx.clear();
    this.reduceMotion = reduce;
  }
  private reduceMotion = false;

  setMuted(muted: boolean): void {
    audio.setMuted(muted);
  }

  start(mode: Mode, difficulty: Difficulty, humanSide: Player = 'p1'): void {
    this.gen += 1;
    // Restarting must not leave the previous frame loop running alongside the new
    // one, so always cancel before scheduling a fresh loop.
    cancelAnimationFrame(this.raf);
    this.state = createGame(mode, difficulty, humanSide);
    this.fx.clear();
    this.inputMode = null;
    this.pointer = null;
    this.thinking = false;
    this.aiPreview = null;
    this.lastTime = performance.now();
    this.renderer.resize();
    this.emitHud();
    this.loop(performance.now());
    this.maybeRunAI();
  }

  destroy(): void {
    this.gen += 1;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.unbindInput();
  }

  private onResize(): void {
    this.renderer.resize();
  }

  // ---- The frame loop ----
  private loop = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
    this.lastTime = now;
    this.time += dt;

    if (this.state.phase === 'simulating') this.stepSimulation(dt);
    if (!this.reduceMotion) this.fx.update(dt);

    this.renderer.render(this.state, this.buildOverlay(), this.fx);
    this.raf = requestAnimationFrame(this.loop);
  };

  private stepSimulation(dt: number): void {
    this.accumulator += dt;
    let rested = false;
    while (this.accumulator >= FIXED_DT) {
      const events = this.state.world.step(FIXED_DT);
      this.absorb(events);
      this.accumulator -= FIXED_DT;
      this.simElapsed += FIXED_DT;
      if (this.state.world.atRest()) {
        rested = true;
        break;
      }
    }
    if (rested || this.simElapsed >= MAX_SIM_SECONDS) this.finishStroke();
  }

  private absorb(events: WorldEvents): void {
    for (const p of events.pocketed) {
      this.pocketedThisStroke.push({ id: p.id, kind: p.kind });
      audio.playPocket();
      if (!this.reduceMotion) this.fx.pocket(p.x, p.y, this.pocketColor(p.kind), this.renderer.activeTheme.glow);
    }

    // Did the striker touch a man this frame? The engine reports this for even
    // the gentlest graze (the audio impacts below are thresholded and would miss
    // a soft clip), so the "must hit something" foul is judged correctly.
    if (events.strikerHitPiece) this.strikerTouchedPiece = true;

    // Audio and sparks: only the loudest couple of contacts per frame, so a busy
    // scatter never machine-guns the speakers.
    const loudest = [...events.impacts].sort((a, b) => b.strength - a.strength).slice(0, 2);
    for (const c of loudest) {
      audio.playClack(c.strength);
      if (!this.reduceMotion) this.fx.hit(c.x, c.y, c.strength, this.renderer.activeTheme.aim);
    }
  }

  private finishStroke(): void {
    const strikerPocketed = this.pocketedThisStroke.some((p) => p.kind === 'striker');
    const summary = resolveStroke(this.state, {
      pocketed: this.pocketedThisStroke,
      strikerPocketed,
      strikerTouchedPiece: this.strikerTouchedPiece,
    });
    if (summary.queenCovered) recordQueenCovered();

    this.pocketedThisStroke = [];
    this.strikerTouchedPiece = false;
    this.simElapsed = 0;
    this.accumulator = 0;

    this.emitHud();

    if (summary.winner) {
      this.state.phase = 'gameover';
      const humanWon = this.state.mode === 'local' ? true : summary.winner === this.state.humanSide;
      recordResult(this.state.mode, this.state.difficulty, humanWon);
      audio.playWin();
      this.hooks.onGameOver(summary.winner, humanWon);
      return;
    }

    resetStrikerForTurn(this.state);
    this.maybeRunAI();
  }

  // ---- AI turn: think, telegraph the shot, then take it ----
  private maybeRunAI(): void {
    if (this.state.mode !== 'ai' || this.state.phase === 'gameover') return;
    if (this.state.turn === this.state.humanSide) return;

    const gen = this.gen;
    this.thinking = true;
    this.emitHud();

    window.setTimeout(() => {
      if (gen !== this.gen) return;
      const shot = chooseShot(this.state, this.state.turn);
      this.state.striker.pocketed = false;
      this.state.striker.pos.x = shot.strikerX;
      this.state.striker.pos.y = BASELINE_Y[this.state.turn];
      this.thinking = false;
      this.aiPreview = {
        dir: shot.dir,
        power: (shot.speed - MIN_STRIKER_SPEED) / (MAX_STRIKER_SPEED - MIN_STRIKER_SPEED),
      };
      this.emitHud();

      window.setTimeout(() => {
        if (gen !== this.gen) return;
        this.aiPreview = null;
        this.state.striker.vel.x = shot.dir.x * shot.speed;
        this.state.striker.vel.y = shot.dir.y * shot.speed;
        this.beginSimulation();
      }, 640);
    }, 360);
  }

  private beginSimulation(): void {
    audio.unlockAudio();
    this.pocketedThisStroke = [];
    this.strikerTouchedPiece = false;
    this.simElapsed = 0;
    this.accumulator = 0;
    this.state.phase = 'simulating';
  }

  // ---- Input ----
  private isHumanTurn(): boolean {
    if (this.thinking || this.aiPreview) return false;
    if (this.state.phase !== 'placing' && this.state.phase !== 'aiming') return false;
    if (this.state.mode === 'ai' && this.state.turn !== this.state.humanSide) return false;
    return true;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.isHumanTurn()) return;
    audio.unlockAudio();
    const p = this.renderer.screenToBoard(e.clientX, e.clientY);
    this.activePointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);

    const s = this.state.striker.pos;
    const near = Math.hypot(p.x - s.x, p.y - s.y) <= GRAB_RADIUS;
    const onBaseline = Math.abs(p.y - BASELINE_Y[this.state.turn]) <= PLACE_BAND;

    if (near) {
      this.inputMode = 'aim';
      this.state.phase = 'aiming';
      this.pointer = p;
    } else if (onBaseline) {
      this.inputMode = 'place';
      this.placeAt(p.x);
    } else {
      this.inputMode = 'aim';
      this.state.phase = 'aiming';
      this.pointer = p;
    }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId || !this.inputMode) return;
    const p = this.renderer.screenToBoard(e.clientX, e.clientY);
    if (this.inputMode === 'place') this.placeAt(p.x);
    else this.pointer = p;
    e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId) return;
    if (this.inputMode === 'aim' && this.pointer) {
      const flick = computeFlick(this.state.striker.pos, this.pointer);
      if (flick) {
        this.state.striker.vel.x = flick.dir.x * flick.speed;
        this.state.striker.vel.y = flick.dir.y * flick.speed;
        this.beginSimulation();
      } else {
        this.state.phase = 'placing';
      }
    } else if (this.inputMode === 'place') {
      this.state.phase = 'placing';
    }
    this.inputMode = null;
    this.pointer = null;
    this.activePointerId = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone; harmless
    }
  };

  private placeAt(x: number): void {
    const pos = clampToBaseline(x, this.state.turn);
    this.state.striker.pos.x = pos.x;
    this.state.striker.pos.y = pos.y;
  }

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.style.touchAction = 'none';
  }
  private unbindInput(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  // ---- Overlay + HUD ----
  private buildOverlay(): Overlay {
    let showAim = false;
    let aimDir: Vec | null = null;
    let aimPower = 0;
    let pullTo: Vec | null = null;

    if (this.aiPreview) {
      showAim = true;
      aimDir = this.aiPreview.dir;
      aimPower = this.aiPreview.power;
    } else if (this.inputMode === 'aim' && this.pointer) {
      const flick = computeFlick(this.state.striker.pos, this.pointer);
      if (flick) {
        showAim = true;
        aimDir = flick.dir;
        aimPower = flick.power;
        pullTo = this.pointer;
      }
    }

    const highlightBaseline = this.isHumanTurn() && this.state.phase === 'placing' ? this.state.turn : null;

    return {
      showAim,
      aimDir,
      aimPower,
      pullTo,
      highlightBaseline,
      time: this.time,
    };
  }

  private emitHud(): void {
    this.hooks.onHud({
      turn: this.state.turn,
      humanSide: this.state.humanSide,
      mode: this.state.mode,
      colors: this.state.colors,
      leftP1: menLeftFor(this.state, 'p1'),
      leftP2: menLeftFor(this.state, 'p2'),
      queen: this.state.queen,
      message: this.state.lastEvent,
      thinking: this.thinking,
    });
  }

  private pocketColor(kind: Body['kind']): string {
    const t = this.renderer.activeTheme;
    if (kind === 'queen') return t.queen;
    if (kind === 'black') return t.blackHi;
    if (kind === 'striker') return t.striker;
    return t.white;
  }
}
