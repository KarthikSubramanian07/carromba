import type { Snapshot } from '../game/snapshot';
import type { Player } from '../game/types';

// The client half of online play: one WebSocket to the rooms Worker, a stable
// per-browser id so a dropped connection reclaims its seat, and reconnect with
// backoff. It knows nothing about carrom; it just moves messages and tells the
// controller what happened.

const WS_BASE = 'wss://carromba-rooms.karthik-e5e.workers.dev/room/';

export type Seat = Player | 'spectator';
export type NetStatus = 'connecting' | 'connected' | 'disconnected';

export interface RoomHandlers {
  onWelcome(seat: Seat): void;
  onStart(): void;
  onState(snap: Snapshot): void; // adopt an authoritative board (join / reconnect)
  onShot(shot: unknown, snap: Snapshot): void; // the opponent moved
  onReset(snap: Snapshot): void; // a rematch was started
  onPeer(p1: boolean, p2: boolean): void; // who is currently connected
  onStatus(status: NetStatus): void;
}

// Room codes: five unambiguous characters, easy to read off a screen or a text.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function playerId(): string {
  const key = 'carromba:pid';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(key, id);
    } catch {
      // private mode: a per-session id is fine, reconnect just may not restore seat
    }
  }
  return id;
}

export class Room {
  private ws: WebSocket | null = null;
  private pid = playerId();
  private closedByUs = false;
  private retry = 0;
  seat: Seat | null = null;

  constructor(
    readonly code: string,
    private handlers: RoomHandlers,
  ) {
    this.connect();
  }

  private connect(): void {
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(WS_BASE + this.code);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onStatus('connected');
      this.send({ t: 'join', pid: this.pid });
    };
    ws.onmessage = (e) => this.route(e.data as string);
    ws.onclose = () => {
      this.handlers.onStatus('disconnected');
      if (!this.closedByUs) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // onclose will handle reconnect
      }
    };
  }

  private route(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg['t']) {
      case 'welcome':
        this.seat = msg['seat'] as Seat;
        this.handlers.onWelcome(this.seat);
        break;
      case 'start':
        this.handlers.onStart();
        break;
      case 'state':
        this.handlers.onState(msg['snap'] as Snapshot);
        break;
      case 'shot':
        this.handlers.onShot(msg['shot'], msg['snap'] as Snapshot);
        break;
      case 'reset':
        this.handlers.onReset(msg['snap'] as Snapshot);
        break;
      case 'peer':
        this.handlers.onPeer(Boolean(msg['p1']), Boolean(msg['p2']));
        break;
    }
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendShot(shot: unknown, snap: Snapshot): void {
    this.send({ t: 'shot', shot, snap });
  }

  sendReset(snap: Snapshot): void {
    this.send({ t: 'reset', snap });
  }

  requestSync(): void {
    this.send({ t: 'sync' });
  }

  private scheduleReconnect(): void {
    this.retry += 1;
    const delay = Math.min(5000, 600 * this.retry);
    setTimeout(() => {
      if (!this.closedByUs) this.connect();
    }, delay);
  }

  close(): void {
    this.closedByUs = true;
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}
