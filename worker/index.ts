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
}
interface Attachment {
  seat: Seat;
  pid: string;
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
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    switch (msg['t']) {
      case 'join':
        return this.onJoin(ws, String(msg['pid'] ?? ''));
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

  private async onJoin(ws: WebSocket, pid: string): Promise<void> {
    if (!pid) return;
    const seats = (await this.state.storage.get<Seats>('seats')) ?? {};
    let seat: Seat;
    if (seats.p1 === pid) seat = 'p1';
    else if (seats.p2 === pid) seat = 'p2';
    else if (!seats.p1) {
      seats.p1 = pid;
      seat = 'p1';
    } else if (!seats.p2) {
      seats.p2 = pid;
      seat = 'p2';
    } else {
      seat = 'spectator';
    }
    await this.state.storage.put('seats', seats);
    ws.serializeAttachment({ seat, pid } satisfies Attachment);

    ws.send(JSON.stringify({ t: 'welcome', seat }));
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
