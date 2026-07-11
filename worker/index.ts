/// <reference types="@cloudflare/workers-types" />

// Carromba's online backend: the smallest thing that lets two browsers share a
// game. It is a pure relay with a referee. It never runs physics or rules; the
// player who takes a shot resolves it locally and ships the resulting board, and
// this Worker just forwards that to the opponent and makes sure only the player
// whose turn it is can move. One Durable Object per room, addressed by the room
// code in the URL. That is the whole server.

export interface Env {
  ROOM: DurableObjectNamespace;
}

type Seat = 'p1' | 'p2' | 'spectator';
interface Seats {
  p1?: string; // the persistent player id holding this seat
  p2?: string;
  p1Token?: string;
  p2Token?: string;
}
interface Attachment {
  seat: Seat;
  pid: string;
  seatToken: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,32})$/);
    if (!match) {
      return new Response('Carromba rooms. Connect a websocket to /room/<code>.', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a websocket upgrade.', { status: 426 });
    }
    const id = env.ROOM.idFromName(match[1]!);
    return env.ROOM.get(id).fetch(req);
  },
};

export class Room {
  constructor(private state: DurableObjectState) {}

  async fetch(_req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // Hibernation-aware: the DO can sleep between shots and wake on the next
    // message without dropping anyone, which keeps a quiet room essentially free.
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    // Bound message size so a client cannot fill DO memory with a huge JSON blob.
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (text.length > 64_000) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    switch (msg['t']) {
      case 'join':
        return this.onJoin(ws, String(msg['pid'] ?? ''), String(msg['seatToken'] ?? ''));
      case 'shot':
        return this.onShot(ws, msg);
      case 'sync':
        return this.onSync(ws);
      case 'reset':
        return this.onReset(ws, msg['snap']);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closing
    }
    await this.broadcastPresence();
  }

  async webSocketError(): Promise<void> {
    await this.broadcastPresence();
  }

  private newSeatToken(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  private claimSeat(
    seats: Seats,
    pid: string,
    seat: 'p1' | 'p2',
    seatToken: string
  ): { seat: Seat; token: string } | null {
    const pidKey = seat;
    const tokenKey = seat === 'p1' ? 'p1Token' : 'p2Token';
    const heldPid = seats[pidKey];
    const heldToken = seats[tokenKey];
    if (heldPid === pid) {
      if (heldToken && seatToken && seatToken !== heldToken) return null;
      const token = heldToken ?? this.newSeatToken();
      seats[tokenKey] = token;
      return { seat, token };
    }
    if (!heldPid) {
      const token = this.newSeatToken();
      seats[pidKey] = pid;
      seats[tokenKey] = token;
      return { seat, token };
    }
    return null;
  }

  private async onJoin(ws: WebSocket, pid: string, seatToken: string): Promise<void> {
    // Client-supplied identity; keep it short and printable so storage stays bounded.
    if (!pid || pid.length > 64 || !/^[A-Za-z0-9_-]+$/.test(pid)) return;
    const seats = (await this.state.storage.get<Seats>('seats')) ?? {};
    let seat: Seat = 'spectator';
    let token = '';

    const p1 = this.claimSeat(seats, pid, 'p1', seatToken);
    if (p1) {
      seat = p1.seat;
      token = p1.token;
    } else {
      const p2 = this.claimSeat(seats, pid, 'p2', seatToken);
      if (p2) {
        seat = p2.seat;
        token = p2.token;
      }
    }

    await this.state.storage.put('seats', seats);
    ws.serializeAttachment({ seat, pid, seatToken: token } satisfies Attachment);

    ws.send(JSON.stringify({ t: 'welcome', seat, seatToken: token }));
    const snap = await this.state.storage.get('snap');
    if (snap) ws.send(JSON.stringify({ t: 'state', snap }));

    await this.broadcastPresence();
    if (seats.p1 && seats.p2) this.broadcast({ t: 'start' });
  }

  private async onShot(ws: WebSocket, msg: Record<string, unknown>): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || (att.seat !== 'p1' && att.seat !== 'p2')) return;
    // Referee: only the side whose turn it is may move. The stored snapshot's
    // `turn` is the source of truth; before the first shot, p1 breaks.
    const snap = (await this.state.storage.get('snap')) as { turn?: string } | undefined;
    const turn = snap?.turn ?? 'p1';
    if (att.seat !== turn) return;

    await this.state.storage.put('snap', msg['snap']);
    this.broadcastExcept(ws, { t: 'shot', shot: msg['shot'], snap: msg['snap'] });
  }

  private async onSync(ws: WebSocket): Promise<void> {
    const snap = await this.state.storage.get('snap');
    if (snap) ws.send(JSON.stringify({ t: 'state', snap }));
  }

  private async onReset(ws: WebSocket, snap: unknown): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || (att.seat !== 'p1' && att.seat !== 'p2')) return;
    await this.state.storage.put('snap', snap);
    this.broadcast({ t: 'reset', snap });
  }

  private broadcast(obj: unknown): void {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(s);
      } catch {
        // socket gone; presence will reconcile
      }
    }
  }

  private broadcastExcept(except: WebSocket, obj: unknown): void {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(s);
      } catch {
        // ignore
      }
    }
  }

  private async broadcastPresence(): Promise<void> {
    const live = { p1: false, p2: false };
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.seat === 'p1') live.p1 = true;
      if (att?.seat === 'p2') live.p2 = true;
    }
    this.broadcast({ t: 'peer', p1: live.p1, p2: live.p2 });
  }
}
