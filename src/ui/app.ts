import { el, clear } from './dom';
import { GameController, type HudInfo } from './controller';
import { THEMES, getTheme, type Theme } from '../render/themes';
import { getPrefs, setPref, getStats } from '../store';
import type { Difficulty, Mode, Player } from '../game/types';

// The whole interface around the board: the home menu, the in-game HUD, and the
// modals. Plain DOM, driven by the controller's HUD callbacks. Copy is written to
// sound like a person, not a press release.

const RULES_URL = 'https://github.com/KarthikSubramanian07/carromba/blob/main/RULES.md';
const REPO_URL = 'https://github.com/KarthikSubramanian07/carromba';

export class App {
  private controller: GameController | null = null;
  private canvas!: HTMLCanvasElement;
  private difficulty: Difficulty;
  private theme: Theme;
  private muted: boolean;
  private reduceMotion: boolean;

  // In-game HUD element handles.
  private hud: {
    turnPill: HTMLElement;
    p1Chip: HTMLElement;
    p2Chip: HTMLElement;
    p1Count: HTMLElement;
    p2Count: HTMLElement;
    p1Name: HTMLElement;
    p2Name: HTMLElement;
    queen: HTMLElement;
    message: HTMLElement;
  } | null = null;

  private modalRoot!: HTMLElement;
  private screens = new Map<string, HTMLElement>();

  constructor(private root: HTMLElement) {
    const prefs = getPrefs();
    this.difficulty = prefs.lastDifficulty;
    this.theme = getTheme(prefs.theme);
    this.muted = prefs.muted;
    this.reduceMotion = prefs.reduceMotion;

    this.build();
    this.applyThemeVars();
    this.showScreen('home');
  }

  // ---- Layout ----
  private build(): void {
    clear(this.root);
    this.root.append(this.buildHome(), this.buildGame());
    this.modalRoot = el('div', { class: 'modal-root', hidden: true });
    this.root.append(this.modalRoot);
  }

  private buildHome(): HTMLElement {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Bot difficulty' });
    const diffButtons: Record<Difficulty, HTMLButtonElement> = {} as never;
    (['easy', 'medium', 'hard'] as Difficulty[]).forEach((d) => {
      const b = el(
        'button',
        {
          class: 'seg-btn' + (d === this.difficulty ? ' on' : ''),
          type: 'button',
          onclick: () => {
            this.difficulty = d;
            setPref('lastDifficulty', d);
            Object.values(diffButtons).forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
          },
        },
        d[0]!.toUpperCase() + d.slice(1),
      );
      diffButtons[d] = b;
      seg.append(b);
    });

    const home = el(
      'section',
      { class: 'screen home', 'data-screen': 'home' },
      el(
        'div',
        { class: 'home-inner' },
        el('h1', { class: 'wordmark' }, 'CARROMBA'),
        el(
          'p',
          { class: 'tagline' },
          'Carrom, online and instant. Flick, pocket, win. No app, no ads, no signup.',
        ),
        el(
          'div',
          { class: 'menu' },
          el(
            'div',
            { class: 'menu-card' },
            el('h2', {}, 'Play the bot'),
            el('p', { class: 'card-sub' }, 'Pick your poison. Easy is a warm-up, Hard does not miss much.'),
            seg,
            el(
              'button',
              { class: 'btn primary', type: 'button', onclick: () => this.startGame('ai') },
              'Break the pack',
            ),
          ),
          el(
            'div',
            { class: 'menu-card' },
            el('h2', {}, 'Pass and play'),
            el('p', { class: 'card-sub' }, 'Two players, one board, one device. Hand it back and forth.'),
            el(
              'button',
              { class: 'btn', type: 'button', onclick: () => this.startGame('local') },
              'Start a local game',
            ),
          ),
        ),
        el(
          'div',
          { class: 'home-links' },
          el('button', { class: 'link', type: 'button', onclick: () => this.openHowTo() }, 'How to play'),
          el('button', { class: 'link', type: 'button', onclick: () => this.openSettings() }, 'Themes and settings'),
          el('a', { class: 'link', href: RULES_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Full rules'),
        ),
        el('p', { class: 'stat-line' }, this.statLine()),
        el(
          'footer',
          { class: 'home-footer' },
          'Free forever. No ads, no accounts, no tracking. It runs on nothing and it always will.',
        ),
      ),
    );
    this.screens.set('home', home);
    return home;
  }

  private buildGame(): HTMLElement {
    this.canvas = el('canvas', { id: 'board', 'aria-label': 'Carrom board' });

    const turnPill = el('div', { class: 'turn-pill' }, 'Your turn');
    const p1Chip = el('span', { class: 'chip' });
    const p2Chip = el('span', { class: 'chip' });
    const p1Count = el('span', { class: 'count' }, '9');
    const p2Count = el('span', { class: 'count' }, '9');
    const p1Name = el('span', { class: 'side-name' }, 'You');
    const p2Name = el('span', { class: 'side-name' }, 'Bot');
    const queen = el('div', { class: 'queen-badge' }, 'Queen on board');
    const message = el('p', { class: 'message', role: 'status', 'aria-live': 'polite' }, '');

    this.hud = { turnPill, p1Chip, p2Chip, p1Count, p2Count, p1Name, p2Name, queen, message };

    const game = el(
      'section',
      { class: 'screen game', 'data-screen': 'game', hidden: true },
      el(
        'header',
        { class: 'topbar' },
        el('button', { class: 'icon-btn', type: 'button', title: 'Back to menu', onclick: () => this.goHome() }, '← Menu'),
        turnPill,
        el(
          'div',
          { class: 'topbar-actions' },
          el('button', { class: 'icon-btn', type: 'button', title: 'Restart board', onclick: () => this.restart() }, '↻'),
          el('button', { class: 'icon-btn', type: 'button', title: 'Settings', onclick: () => this.openSettings() }, '⚙'),
        ),
      ),
      el(
        'div',
        { class: 'scoreboard' },
        el('div', { class: 'side' }, p1Chip, el('div', { class: 'side-text' }, p1Name, p1Count)),
        queen,
        el('div', { class: 'side right' }, el('div', { class: 'side-text' }, p2Name, p2Count), p2Chip),
      ),
      el('div', { class: 'board-wrap' }, this.canvas),
      message,
      el('p', { class: 'hint' }, 'Grab the striker to aim. Pull back, let go. Drag along the baseline to reposition.'),
    );
    this.screens.set('game', game);
    return game;
  }

  // ---- Navigation ----
  private showScreen(name: string): void {
    for (const [key, node] of this.screens) node.hidden = key !== name;
  }

  private goHome(): void {
    this.controller?.destroy();
    this.controller = null;
    this.showScreen('home');
    // Refresh the record line, which may have changed.
    const line = this.screens.get('home')?.querySelector('.stat-line');
    if (line) line.textContent = this.statLine();
  }

  private startGame(mode: Mode): void {
    this.showScreen('game');
    if (!this.controller) {
      this.controller = new GameController(this.canvas, this.theme.id, {
        onHud: (info) => this.renderHud(info),
        onGameOver: (winner, humanWon) => this.showWin(winner, humanWon),
      });
      this.controller.setMuted(this.muted);
      this.controller.setReduceMotion(this.reduceMotion);
    }
    this.controller.start(mode, this.difficulty, 'p1');
    this.closeModal();
  }

  private restart(): void {
    if (!this.controller) return;
    this.controller.start(this.controller.state.mode, this.difficulty, 'p1');
    this.closeModal();
  }

  // ---- HUD ----
  private renderHud(info: HudInfo): void {
    if (!this.hud) return;
    const h = this.hud;
    const local = info.mode === 'local';
    h.p1Name.textContent = local ? 'Player 1' : 'You';
    h.p2Name.textContent = local ? 'Player 2' : 'Bot';
    h.p1Count.textContent = countText(info.leftP1);
    h.p2Count.textContent = countText(info.leftP2);
    setChip(h.p1Chip, info.colors.p1);
    setChip(h.p2Chip, info.colors.p2);

    const active = info.turn;
    this.screens.get('game')?.querySelector('.side')?.classList.toggle('active', active === 'p1');
    this.screens.get('game')?.querySelector('.side.right')?.classList.toggle('active', active === 'p2');

    if (info.thinking) {
      h.turnPill.textContent = 'Bot is lining it up...';
    } else if (local) {
      h.turnPill.textContent = active === 'p1' ? 'Player 1 to shoot' : 'Player 2 to shoot';
    } else {
      h.turnPill.textContent = active === info.humanSide ? 'Your turn' : "Bot's turn";
    }

    h.queen.textContent = queenText(info);
    h.queen.className = 'queen-badge' + (info.queen.covered ? ' done' : info.queen.pending ? ' pending' : '');
    if (info.message) h.message.textContent = info.message;
  }

  // ---- Modals ----
  private openModal(title: string, body: HTMLElement, footer?: HTMLElement): void {
    const card = el(
      'div',
      { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el(
        'div',
        { class: 'modal-head' },
        el('h2', {}, title),
        el('button', { class: 'icon-btn', type: 'button', title: 'Close', onclick: () => this.closeModal() }, '×'),
      ),
      body,
      footer ?? '',
    );
    clear(this.modalRoot);
    this.modalRoot.append(
      el('div', { class: 'modal-scrim', onclick: () => this.closeModal() }),
      card,
    );
    this.modalRoot.hidden = false;
  }

  private closeModal(): void {
    this.modalRoot.hidden = true;
    clear(this.modalRoot);
  }

  private showWin(winner: Player, humanWon: boolean): void {
    const mode = this.controller?.state.mode ?? 'ai';
    let headline: string;
    if (mode === 'local') headline = winner === 'p1' ? 'Player 1 takes it' : 'Player 2 takes it';
    else headline = humanWon ? 'You cleared the board' : 'The bot got there first';

    const body = el(
      'div',
      { class: 'modal-body win' },
      el('p', { class: 'win-sub' }, humanWon || mode === 'local' ? 'Clean sweep. Queen covered, board clear.' : 'Rematch? The pack is already set.'),
    );
    const footer = el(
      'div',
      { class: 'modal-foot' },
      el('button', { class: 'btn primary', type: 'button', onclick: () => this.restart() }, 'Play again'),
      el('button', { class: 'btn', type: 'button', onclick: () => this.goHome() }, 'Back to menu'),
    );
    this.openModal(headline, body, footer);
  }

  private openSettings(): void {
    const body = el('div', { class: 'modal-body' });

    body.append(el('h3', { class: 'group-label' }, 'Theme'));
    const themeGrid = el('div', { class: 'theme-grid' });
    for (const t of THEMES) {
      const swatch = el('div', { class: 'swatch' });
      swatch.append(
        el('span', { class: 'sw felt', style: `background:${t.felt}` }),
        el('span', { class: 'sw frame', style: `background:${t.frame}` }),
        el('span', { class: 'sw queen', style: `background:${t.queen}` }),
      );
      const btn = el(
        'button',
        {
          class: 'theme-btn' + (t.id === this.theme.id ? ' on' : ''),
          type: 'button',
          onclick: () => {
            this.setTheme(t.id);
            themeGrid.querySelectorAll('.theme-btn').forEach((x) => x.classList.remove('on'));
            btn.classList.add('on');
          },
        },
        swatch,
        el('div', { class: 'theme-meta' }, el('strong', {}, t.name), el('span', {}, t.blurb)),
      );
      themeGrid.append(btn);
    }
    body.append(themeGrid);

    body.append(el('h3', { class: 'group-label' }, 'Feel'));
    body.append(
      this.toggleRow('Sound', !this.muted, (on) => {
        this.muted = !on;
        setPref('muted', this.muted);
        this.controller?.setMuted(this.muted);
      }),
      this.toggleRow('Reduced motion', this.reduceMotion, (on) => {
        this.reduceMotion = on;
        setPref('reduceMotion', on);
        this.controller?.setReduceMotion(on);
      }),
    );

    body.append(el('h3', { class: 'group-label' }, 'Your record'), this.statsBlock());

    const footer = el(
      'div',
      { class: 'modal-foot' },
      el('a', { class: 'link', href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Source on GitHub'),
    );
    this.openModal('Themes and settings', body, footer);
  }

  private openHowTo(): void {
    const body = el(
      'div',
      { class: 'modal-body howto' },
      p('Set the striker anywhere on your baseline, pull back like a slingshot, and let go.'),
      p('Pocket one of your men and you shoot again. Miss, and it is the other side’s turn.'),
      p('Your color is decided the moment you sink your first man. From then on the whites are one player’s, the blacks the other’s.'),
      p('The red Queen is worth chasing, but you have to cover her: sink one of your own men on the same shot or the next one, or she goes back to the middle.'),
      p('Clear all your men and cover the Queen to win the board. Do not sink the striker, and do not pot your last man before the Queen is settled.'),
      el('a', { class: 'link', href: RULES_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Read the full rules'),
    );
    this.openModal('How to play', body);
  }

  private toggleRow(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
    const knob = el('span', { class: 'knob' });
    const sw = el('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': String(on) }, knob);
    sw.addEventListener('click', () => {
      const next = !sw.classList.contains('on');
      sw.classList.toggle('on', next);
      sw.setAttribute('aria-checked', String(next));
      onChange(next);
    });
    return el('div', { class: 'row' }, el('span', {}, label), sw);
  }

  private statsBlock(): HTMLElement {
    const s = getStats();
    const row = (label: string, value: string) =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-k' }, label), el('span', { class: 'stat-v' }, value));
    return el(
      'div',
      { class: 'stats' },
      row('Wins vs Easy', String(s.vsBot.easy.won)),
      row('Wins vs Medium', String(s.vsBot.medium.won)),
      row('Wins vs Hard', String(s.vsBot.hard.won)),
      row('Local games', String(s.localGames)),
      row('Queens covered', String(s.queensCovered)),
    );
  }

  private statLine(): string {
    const s = getStats();
    const wins = s.vsBot.easy.won + s.vsBot.medium.won + s.vsBot.hard.won;
    if (wins === 0 && s.localGames === 0) return 'No games yet. The board is waiting.';
    if (wins === 0) return `${s.localGames} local ${plural(s.localGames, 'game')} played.`;
    return `${wins} ${plural(wins, 'win')} against the bot so far.`;
  }

  // ---- Theme ----
  private setTheme(id: string): void {
    this.theme = getTheme(id);
    setPref('theme', id);
    this.applyThemeVars();
    this.controller?.setTheme(id);
  }

  private applyThemeVars(): void {
    const t = this.theme;
    const r = document.documentElement.style;
    r.setProperty('--bg', t.pageBg);
    r.setProperty('--bg2', t.pageBg2);
    r.setProperty('--ink', t.ink);
    r.setProperty('--ink-dim', t.inkDim);
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-ink', t.accentInk);
    r.setProperty('--panel', t.panel);
    r.setProperty('--panel-border', t.panelBorder);
    r.setProperty('--white-chip', t.white);
    r.setProperty('--black-chip', t.black);
    document.documentElement.dataset.theme = t.id;
  }
}

function p(text: string): HTMLElement {
  return el('p', {}, text);
}
function plural(n: number, word: string): string {
  return n === 1 ? word : word + 's';
}
function countText(left: number): string {
  return left < 0 ? '9' : String(left);
}
function setChip(node: HTMLElement, color: 'white' | 'black' | null): void {
  node.className = 'chip' + (color ? ' ' + color : ' open');
  node.title = color ? `${color} pieces` : 'color not decided yet';
}
function queenText(info: HudInfo): string {
  if (info.queen.covered) {
    const holder = info.queen.pocketedBy;
    const who = info.mode === 'local' ? (holder === 'p1' ? 'P1' : 'P2') : holder === info.humanSide ? 'you' : 'the bot';
    return `Queen covered by ${who}`;
  }
  if (info.queen.pending) return 'Queen needs covering';
  return 'Queen on board';
}
