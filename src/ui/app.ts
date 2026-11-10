import { el, clear } from './dom';
import { GameController, type HudInfo, type LocalMove } from './controller';
import { THEMES, getTheme, type Theme } from '../render/themes';
import { getPrefs, setPref, getStats } from '../store';
import type { Difficulty, Mode, Player } from '../game/types';
import { Room, makeRoomCode, type Seat, type NetStatus } from '../net/room';
import { captureSnapshot } from '../game/snapshot';

// The whole interface around the board: the home menu, the in-game HUD, and the
// modals. Plain DOM, driven by the controller's HUD callbacks. Copy is written to
// sound like a person, not a press release.

const RULES_URL = 'https://github.com/KarthikSubramanian07/carromba/blob/main/RULES.md';
const REPO_URL = 'https://github.com/KarthikSubramanian07/carromba';
const COFFEE_URL = 'https://buymeacoffee.com/winnerkarthik';

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
    pauseBtn: HTMLButtonElement;
    pauseBanner: HTMLElement;
    hint: HTMLElement;
  } | null = null;

  private modalRoot!: HTMLElement;
  private liveRegion!: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  private lastAnnounced = '';
  private lastFocusBeforeModal: HTMLElement | null = null;
  private modalKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  // Online play.
  private room: Room | null = null;
  private seat: Seat | null = null;
  private started = false; // both players present at least once
  private netStatus: NetStatus = 'connecting';

  constructor(private root: HTMLElement) {
    const prefs = getPrefs();
    this.difficulty = prefs.lastDifficulty;
    this.theme = getTheme(prefs.theme);
    this.muted = prefs.muted;
    this.reduceMotion = prefs.reduceMotion;

    this.build();
    this.applyThemeVars();

    // A shared link lands here: carromba.pages.dev/#r/CODE joins that room.
    const code = this.roomCodeFromHash();
    if (code) this.enterRoom(code);
    else this.showScreen('home');

    window.addEventListener('hashchange', () => {
      const c = this.roomCodeFromHash();
      if (c && c !== this.room?.code) this.enterRoom(c);
    });
  }

  private roomCodeFromHash(): string | null {
    const m = location.hash.match(/^#r\/([A-Za-z0-9_-]{1,32})$/);
    return m ? m[1]! : null;
  }

  // ---- Layout ----
  private build(): void {
    clear(this.root);
    const skip = el(
      'a',
      { class: 'skip-link', href: '#main' },
      'Skip to main content',
    );
    this.liveRegion = el('div', {
      class: 'sr-only',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    });
    const main = el('main', { id: 'main', tabindex: -1 });
    main.append(this.buildHome(), this.buildGame());
    this.modalRoot = el('div', { class: 'modal-root', hidden: true });
    this.root.append(skip, this.liveRegion, main, this.modalRoot);
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
          'aria-pressed': String(d === this.difficulty),
          onclick: () => {
            this.difficulty = d;
            setPref('lastDifficulty', d);
            Object.values(diffButtons).forEach((x) => {
              x.classList.remove('on');
              x.setAttribute('aria-pressed', 'false');
            });
            b.classList.add('on');
            b.setAttribute('aria-pressed', 'true');
          },
        },
        d[0]!.toUpperCase() + d.slice(1),
      );
      diffButtons[d] = b;
      seg.append(b);
    });

    const home = el(
      'section',
      { class: 'screen home', 'data-screen': 'home', 'aria-label': 'Home' },
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
          el(
            'div',
            { class: 'menu-card' },
            el('h2', {}, 'Play online'),
            el('p', { class: 'card-sub' }, 'Get a private link, send it to a friend, play live from anywhere.'),
            el(
              'button',
              { class: 'btn', type: 'button', onclick: () => this.createRoom() },
              'Create a room',
            ),
          ),
        ),
        el(
          'div',
          { class: 'home-links' },
          el('button', { class: 'link', type: 'button', onclick: () => this.openHowTo() }, 'How to play'),
          el('button', { class: 'link', type: 'button', onclick: () => this.openSettings() }, 'Themes and settings'),
          el('a', { class: 'link', href: RULES_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Full rules'),
          el('a', { class: 'link coffee', href: COFFEE_URL, target: '_blank', rel: 'noopener noreferrer' }, '☕ Buy me a coffee'),
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
    this.canvas = el('canvas', {
      id: 'board',
      role: 'application',
      tabindex: 0,
      'aria-label': 'Carrom board',
      'aria-keyshortcuts': 'ArrowLeft ArrowRight ArrowUp ArrowDown Space Enter Escape P',
    });

    const turnPill = el('div', { class: 'turn-pill', 'aria-live': 'polite' }, 'Your turn');
    const p1Chip = el('span', { class: 'chip open', 'aria-hidden': 'true' }, '?');
    const p2Chip = el('span', { class: 'chip open', 'aria-hidden': 'true' }, '?');
    const p1Count = el('span', { class: 'count' }, '9');
    const p2Count = el('span', { class: 'count' }, '9');
    const p1Name = el('span', { class: 'side-name' }, 'You');
    const p2Name = el('span', { class: 'side-name' }, 'Bot');
    const queen = el('div', { class: 'queen-badge' }, 'Queen on board');
    const message = el('p', { class: 'message', role: 'status', 'aria-live': 'polite' }, '');
    const pauseBtn = el(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: 'Pause game',
        'aria-label': 'Pause game',
        'aria-pressed': 'false',
        onclick: () => this.controller?.togglePause(),
      },
      'Pause',
    );
    const pauseBanner = el(
      'div',
      { class: 'pause-banner', hidden: true, role: 'status' },
      el('p', {}, 'Game paused'),
      el(
        'button',
        { class: 'btn primary', type: 'button', onclick: () => this.controller?.setPaused(false) },
        'Resume',
      ),
    );
    const hint = el(
      'p',
      { class: 'hint', id: 'board-help' },
      'Keyboard: Left/Right or A/D place the striker. Q/E or [/] aim, Up/Down set power, Space or Enter fires. P pauses. Pointer: grab the striker, pull back, let go.',
    );
    this.canvas.setAttribute('aria-describedby', 'board-help');

    this.hud = {
      turnPill,
      p1Chip,
      p2Chip,
      p1Count,
      p2Count,
      p1Name,
      p2Name,
      queen,
      message,
      pauseBtn,
      pauseBanner,
      hint,
    };

    const game = el(
      'section',
      { class: 'screen game', 'data-screen': 'game', hidden: true, 'aria-label': 'Game board' },
      el(
        'header',
        { class: 'topbar' },
        el(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            title: 'Back to menu',
            'aria-label': 'Back to menu',
            onclick: () => this.goHome(),
          },
          '← Menu',
        ),
        turnPill,
        el(
          'div',
          { class: 'topbar-actions' },
          pauseBtn,
          el(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              title: 'Restart board',
              'aria-label': 'Restart board',
              onclick: () => this.restart(),
            },
            '↻',
          ),
          el(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              title: 'Settings',
              'aria-label': 'Settings',
              onclick: () => this.openSettings(),
            },
            '⚙',
          ),
        ),
      ),
      el(
        'div',
        { class: 'scoreboard', role: 'group', 'aria-label': 'Scoreboard' },
        el(
          'div',
          { class: 'side', 'data-side': 'p1' },
          p1Chip,
          el('div', { class: 'side-text' }, p1Name, p1Count),
        ),
        queen,
        el(
          'div',
          { class: 'side right', 'data-side': 'p2' },
          el('div', { class: 'side-text' }, p2Name, p2Count),
          p2Chip,
        ),
      ),
      el('div', { class: 'board-wrap' }, this.canvas, pauseBanner),
      message,
      hint,
    );
    this.screens.set('game', game);
    return game;
  }

  // ---- Navigation ----
  private showScreen(name: string): void {
    for (const [key, node] of this.screens) node.hidden = key !== name;
  }

  private ensureController(): void {
    if (this.controller) return;
    this.controller = new GameController(this.canvas, this.theme.id, {
      onHud: (info) => this.renderHud(info),
      onGameOver: (winner, humanWon) => this.showWin(winner, humanWon),
      onPauseChange: (paused) => this.renderPause(paused),
      onLocalMove: (move, snap) => {
        if (snap) this.room?.sendShot(move, snap);
        else this.room?.sendShot({ v: 1, ...move });
      },
    });
    this.controller.setMuted(this.muted);
    this.controller.setReduceMotion(this.reduceMotion);
  }

  private clearHash(): void {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  private goHome(): void {
    this.leaveRoom();
    this.clearHash();
    this.controller?.destroy();
    this.controller = null;
    this.lastAnnounced = '';
    this.closeModal();
    this.showScreen('home');
    // Refresh the record line, which may have changed.
    const line = this.screens.get('home')?.querySelector('.stat-line');
    if (line) line.textContent = this.statLine();
  }

  private startGame(mode: Mode): void {
    this.leaveRoom();
    this.clearHash();
    this.showScreen('game');
    this.ensureController();
    this.controller!.start(mode, this.difficulty, 'p1');
    this.closeModal();
    this.canvas.focus({ preventScroll: true });
  }

  private restart(): void {
    if (!this.controller) return;
    this.controller.start(this.controller.state.mode, this.difficulty, 'p1');
    this.closeModal();
  }

  // ---- Online ----
  private createRoom(): void {
    this.enterRoom(makeRoomCode());
  }

  private enterRoom(code: string): void {
    if (this.room && this.room.code === code) return;
    this.leaveRoom();
    if (location.hash !== `#r/${code}`) location.hash = `r/${code}`;
    this.showScreen('game');
    this.ensureController();
    this.seat = null;
    this.started = false;
    this.netStatus = 'connecting';
    this.room = new Room(code, {
      onStatus: (s) => {
        this.netStatus = s;
        this.refreshWaiting();
      },
      onWelcome: (seat) => {
        this.seat = seat;
        if (seat !== 'spectator') this.controller!.startOnline(seat);
        this.refreshWaiting();
      },
      onStart: () => {
        this.started = true;
        this.closeModal();
      },
      onState: (snap) => this.controller!.adoptSnapshot(snap),
      onShot: (shot, snap) => {
        if (!this.controller) return;
        if (this.controller.shouldAdoptServerSnap()) this.controller.applyServerShot(snap);
        else this.controller.applyRemoteShot(shot as LocalMove, snap);
      },
      onReset: (snap) => this.controller!.adoptSnapshot(snap),
      onPeer: (p1, p2) => this.onPeer(p1, p2),
    });
    this.showWaiting(code, false);
  }

  private leaveRoom(): void {
    this.room?.close();
    this.room = null;
    this.seat = null;
    this.started = false;
  }

  private onPeer(p1: boolean, p2: boolean): void {
    if (p1 && p2) {
      this.started = true;
      this.closeModal();
    } else if (this.started && this.seat !== 'spectator') {
      this.showWaiting(this.room?.code ?? '', true);
    } else {
      this.refreshWaiting();
    }
  }

  private rematch(): void {
    if (this.room && this.seat && this.seat !== 'spectator') {
      this.controller!.startOnline(this.seat);
      this.room.sendReset(captureSnapshot(this.controller!.state));
      this.closeModal();
    } else {
      this.restart();
    }
  }

  // ---- HUD ----
  private renderHud(info: HudInfo): void {
    if (!this.hud) return;
    const h = this.hud;
    const local = info.mode === 'local';
    const online = info.mode === 'online';
    const opponent = online ? 'Opponent' : 'Bot';
    if (local) {
      h.p1Name.textContent = 'Player 1';
      h.p2Name.textContent = 'Player 2';
    } else {
      h.p1Name.textContent = info.humanSide === 'p1' ? 'You' : opponent;
      h.p2Name.textContent = info.humanSide === 'p2' ? 'You' : opponent;
    }
    h.p1Count.textContent = countText(info.leftP1);
    h.p2Count.textContent = countText(info.leftP2);
    h.p1Count.setAttribute(
      'aria-label',
      info.leftP1 < 0 ? 'Men left undecided' : `${info.leftP1} men left`,
    );
    h.p2Count.setAttribute(
      'aria-label',
      info.leftP2 < 0 ? 'Men left undecided' : `${info.leftP2} men left`,
    );
    setChip(h.p1Chip, info.colors.p1);
    setChip(h.p2Chip, info.colors.p2);

    const active = info.turn;
    const game = this.screens.get('game');
    const side1 = game?.querySelector('.side[data-side="p1"]');
    const side2 = game?.querySelector('.side[data-side="p2"]');
    side1?.classList.toggle('active', active === 'p1');
    side2?.classList.toggle('active', active === 'p2');
    if (active === 'p1') {
      side1?.setAttribute('aria-current', 'true');
      side2?.removeAttribute('aria-current');
    } else {
      side2?.setAttribute('aria-current', 'true');
      side1?.removeAttribute('aria-current');
    }

    let turnText: string;
    if (info.paused) turnText = 'Paused';
    else if (info.thinking) turnText = 'Bot is lining it up...';
    else if (local) turnText = active === 'p1' ? 'Player 1 to shoot' : 'Player 2 to shoot';
    else if (active === info.humanSide) turnText = 'Your turn';
    else turnText = online ? "Opponent's turn" : "Bot's turn";
    h.turnPill.textContent = turnText;

    h.queen.textContent = queenText(info);
    h.queen.className =
      'queen-badge' + (info.queen.covered ? ' done' : info.queen.pending ? ' pending' : '');
    if (info.queen.pending) h.queen.setAttribute('data-state', 'pending');
    else if (info.queen.covered) h.queen.setAttribute('data-state', 'covered');
    else h.queen.setAttribute('data-state', 'on-board');

    if (info.message) h.message.textContent = info.message;
    this.renderPause(info.paused);
    this.announcePlay(info, turnText);
    if (this.controller) this.canvas.setAttribute('aria-label', this.controller.describeBoard());
  }

  private renderPause(paused: boolean): void {
    if (!this.hud) return;
    this.hud.pauseBanner.hidden = !paused;
    this.hud.pauseBtn.setAttribute('aria-pressed', String(paused));
    this.hud.pauseBtn.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
    this.hud.pauseBtn.title = paused ? 'Resume game' : 'Pause game';
    this.hud.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    this.screens.get('game')?.classList.toggle('is-paused', paused);
  }

  private announcePlay(info: HudInfo, turnText: string): void {
    const score =
      info.leftP1 < 0 || info.leftP2 < 0
        ? 'Colors not decided yet'
        : `Score: Player 1 ${info.leftP1} men left, Player 2 ${info.leftP2} men left`;
    const parts = [turnText];
    if (info.message) parts.push(info.message);
    parts.push(score, queenText(info));
    if (info.paused) parts.unshift('Game paused');
    const next = parts.join('. ');
    if (next === this.lastAnnounced) return;
    this.lastAnnounced = next;
    this.liveRegion.textContent = next;
  }

  // ---- Modals ----
  private openModal(title: string, body: HTMLElement, footer?: HTMLElement, dismissable = true): void {
    this.lastFocusBeforeModal =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const titleId = 'modal-title';
    const card = el(
      'div',
      {
        class: 'modal-card',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        tabindex: -1,
      },
      el(
        'div',
        { class: 'modal-head' },
        el('h2', { id: titleId }, title),
        dismissable
          ? el(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                title: 'Close',
                'aria-label': 'Close',
                onclick: () => this.closeModal(),
              },
              '×',
            )
          : '',
      ),
      body,
      footer ?? '',
    );
    clear(this.modalRoot);
    this.modalRoot.append(
      el('div', { class: 'modal-scrim', onclick: () => dismissable && this.closeModal() }),
      card,
    );
    this.modalRoot.hidden = false;
    this.screens.forEach((node) => node.setAttribute('inert', ''));
    this.bindModalFocus(card, dismissable);
    const focusable = this.modalFocusables(card);
    (focusable[0] ?? card).focus();
  }

  private closeModal(): void {
    this.unbindModalFocus();
    this.modalRoot.hidden = true;
    clear(this.modalRoot);
    this.screens.forEach((node) => node.removeAttribute('inert'));
    const restore = this.lastFocusBeforeModal;
    this.lastFocusBeforeModal = null;
    if (restore && document.contains(restore)) restore.focus({ preventScroll: true });
  }

  private modalFocusables(root: HTMLElement): HTMLElement[] {
    return [
      ...root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((n) => !n.hasAttribute('disabled') && n.getAttribute('aria-hidden') !== 'true');
  }

  private bindModalFocus(card: HTMLElement, dismissable: boolean): void {
    this.unbindModalFocus();
    this.modalKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.preventDefault();
        this.closeModal();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = this.modalFocusables(card);
      if (nodes.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', this.modalKeyHandler, true);
  }

  private unbindModalFocus(): void {
    if (this.modalKeyHandler) {
      window.removeEventListener('keydown', this.modalKeyHandler, true);
      this.modalKeyHandler = null;
    }
  }

  private showWin(winner: Player, humanWon: boolean): void {
    const mode = this.controller?.state.mode ?? 'ai';
    let headline: string;
    if (mode === 'local') headline = winner === 'p1' ? 'Player 1 takes it' : 'Player 2 takes it';
    else if (mode === 'online') headline = humanWon ? 'You win' : 'Opponent wins';
    else headline = humanWon ? 'You cleared the board' : 'The bot got there first';

    const positive = humanWon || mode === 'local';
    const body = el(
      'div',
      { class: 'modal-body win' },
      el('p', { class: 'win-sub' }, positive ? 'Clean sweep. Queen covered, board clear.' : 'Rematch? The pack is already set.'),
    );
    const footer = el(
      'div',
      { class: 'modal-foot' },
      el(
        'button',
        { class: 'btn primary', type: 'button', onclick: () => (mode === 'online' ? this.rematch() : this.restart()) },
        'Play again',
      ),
      el('button', { class: 'btn', type: 'button', onclick: () => this.goHome() }, 'Back to menu'),
    );
    this.openModal(headline, body, footer);
  }

  // ---- Online waiting / share screen ----
  private showWaiting(code: string, opponentLeft: boolean): void {
    const shareUrl = `${location.origin}/#r/${code}`;
    const full = this.seat === 'spectator';

    const body = el('div', { class: 'modal-body waiting' });
    if (full) {
      body.append(p('This room already has two players. Head back and start your own.'));
    } else {
      body.append(
        p(
          opponentLeft
            ? 'Your opponent dropped out. Hang on, the game resumes the moment they reopen the link.'
            : 'Send this link to whoever you want to play. The board comes alive the instant they open it.',
        ),
        el(
          'div',
          { class: 'share-row' },
          el('input', { class: 'share-input', readonly: true, value: shareUrl, 'aria-label': 'Room link' }),
          el('button', { class: 'btn copy-btn', type: 'button', onclick: (e: Event) => this.copyShare(shareUrl, e) }, 'Copy'),
        ),
        el('p', { class: 'room-code' }, `Room ${code}`),
      );
    }
    body.append(el('p', { class: 'net-status' }, this.netStatusText()));

    const footer = el(
      'div',
      { class: 'modal-foot' },
      el('button', { class: 'btn', type: 'button', onclick: () => this.goHome() }, 'Leave'),
    );
    this.openModal(opponentLeft ? 'Waiting for your opponent' : full ? 'Room is full' : 'Room ready', body, footer, false);
  }

  // Re-render the waiting modal if it is the one showing (status/seat changed).
  private refreshWaiting(): void {
    if (this.started || !this.room || this.modalRoot.hidden) return;
    this.showWaiting(this.room.code, false);
  }

  private netStatusText(): string {
    if (this.netStatus === 'connecting') return 'Connecting...';
    if (this.netStatus === 'disconnected') return 'Reconnecting...';
    if (this.seat === 'spectator') return 'Connected';
    return 'Connected. Waiting for someone to join.';
  }

  private copyShare(url: string, e: Event): void {
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard?.writeText(url).then(
      () => {
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1500);
      },
      () => {
        // Clipboard blocked: select the field so the user can copy by hand.
        const input = btn.parentElement?.querySelector('.share-input') as HTMLInputElement | null;
        input?.select();
      },
    );
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
          'aria-pressed': String(t.id === this.theme.id),
          onclick: () => {
            this.setTheme(t.id);
            themeGrid.querySelectorAll('.theme-btn').forEach((x) => {
              x.classList.remove('on');
              x.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('on');
            btn.setAttribute('aria-pressed', 'true');
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
      el('a', { class: 'link coffee', href: COFFEE_URL, target: '_blank', rel: 'noopener noreferrer' }, '☕ Buy me a coffee'),
    );
    this.openModal('Themes and settings', body, footer);
  }

  private openHowTo(): void {
    const body = el(
      'div',
      { class: 'modal-body howto' },
      p('Set the striker anywhere on your baseline, pull back like a slingshot, and let go.'),
      p(
        'Keyboard play: focus the board, then Left/Right or A/D to place, Q/E or [/] to aim, Up/Down for power, Space or Enter to fire. P pauses; Escape cancels aim or resumes.',
      ),
      p('Pocket one of your men and you shoot again. Miss, and it is the other side’s turn.'),
      p('Your color is decided the moment you sink your first man. From then on the whites are one player’s, the blacks the other’s.'),
      p('The red Queen is worth chasing, but you have to cover her: sink one of your own men on the same shot or the next one, or she goes back to the middle.'),
      p('Clear all your men and cover the Queen to win the board. Do not sink the striker, and do not pot your last man before the Queen is settled.'),
      el('a', { class: 'link', href: RULES_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Read the full rules'),
    );
    this.openModal('How to play', body);
  }

  private toggleRow(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
    const labelId = `switch-label-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const knob = el('span', { class: 'knob', 'aria-hidden': 'true' });
    const sw = el(
      'button',
      {
        class: 'switch' + (on ? ' on' : ''),
        type: 'button',
        role: 'switch',
        'aria-checked': String(on),
        'aria-labelledby': labelId,
        'aria-label': label,
      },
      knob,
    );
    sw.addEventListener('click', () => {
      const next = !sw.classList.contains('on');
      sw.classList.toggle('on', next);
      sw.setAttribute('aria-checked', String(next));
      onChange(next);
    });
    return el('div', { class: 'row' }, el('span', { id: labelId }, label), sw);
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
  // Letter marks keep side colours readable without relying on hue alone.
  node.textContent = color === 'white' ? 'W' : color === 'black' ? 'B' : '?';
  node.title = color ? `${color} pieces` : 'color not decided yet';
  node.setAttribute('aria-label', color ? `${color} pieces` : 'color not decided yet');
  node.removeAttribute('aria-hidden');
}
function queenText(info: HudInfo): string {
  if (info.queen.covered) {
    const holder = info.queen.pocketedBy;
    let who: string;
    if (info.mode === 'local') who = holder === 'p1' ? 'P1' : 'P2';
    else if (holder === info.humanSide) who = 'you';
    else who = info.mode === 'online' ? 'your opponent' : 'the bot';
    return `Queen covered by ${who}`;
  }
  if (info.queen.pending) return 'Queen needs covering';
  return 'Queen on board';
}
