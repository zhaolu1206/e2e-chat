// Cloudflare Workers 信令服务器（Durable Objects 版，解决多实例分裂问题）
// 客户端连接：wss://<worker-domain>/ws?roomId=<roomId>

function sendJson(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
}

export class SignalingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.peerSockets = new Map(); // peerId -> ws
    this.creatorPeerId = null;
    this.waitingJoiners = new Set(); // peerId
    this.pendingByPeer = new Map(); // peerId -> msg[]
  }

  async fetch(request) {
    const upgrade = request.headers.get('Upgrade');
    const url = new URL(request.url);
    if (upgrade !== 'websocket') {
      if (url.pathname === '/health') return new Response('ok');
      return new Response('Expected websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    client.accept();

    let peerId = null;

    server.addEventListener('message', (event) => {
      const text = typeof event.data === 'string' ? event.data : '';
      if (!text) return;

      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (!msg || !msg.type) return;

      const type = msg.type;

      if (type === 'register-creator') {
        peerId = msg.creatorPeerId;
        if (!peerId) return;
        this.creatorPeerId = peerId;
        this.peerSockets.set(peerId, server);

        // 通知等待加入者
        for (const joinerId of this.waitingJoiners) {
          const ws = this.peerSockets.get(joinerId);
          if (ws) sendJson(ws, { type: 'creator-peer-id', roomId: msg.roomId, creatorPeerId: peerId });
          else {
            if (!this.pendingByPeer.has(joinerId)) this.pendingByPeer.set(joinerId, []);
            this.pendingByPeer.get(joinerId).push({ type: 'creator-peer-id', roomId: msg.roomId, creatorPeerId: peerId });
          }
        }
        this.waitingJoiners = new Set();

        // flush pending
        const pending = this.pendingByPeer.get(peerId);
        if (pending && pending.length) {
          for (const p of pending) sendJson(server, p);
          this.pendingByPeer.set(peerId, []);
        }
        return;
      }

      if (type === 'register-joiner') {
        peerId = msg.peerId;
        if (!peerId) return;
        this.peerSockets.set(peerId, server);

        if (this.creatorPeerId) {
          sendJson(server, { type: 'creator-peer-id', roomId: msg.roomId, creatorPeerId: this.creatorPeerId });
          const pending = this.pendingByPeer.get(peerId);
          if (pending && pending.length) {
            for (const p of pending) sendJson(server, p);
            this.pendingByPeer.set(peerId, []);
          }
        } else {
          this.waitingJoiners.add(peerId);
        }
        return;
      }

      // 转发 offer/answer/ice-candidate
      const targetPeerId = msg.targetPeerId;
      if (!targetPeerId) return;
      const target = this.peerSockets.get(targetPeerId);
      if (target) {
        sendJson(target, msg);
      } else {
        if (!this.pendingByPeer.has(targetPeerId)) this.pendingByPeer.set(targetPeerId, []);
        this.pendingByPeer.get(targetPeerId).push(msg);
      }
    });

    server.addEventListener('close', () => {
      if (peerId) this.peerSockets.delete(peerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Not Found', { status: 404 });
    }

    if (url.pathname !== '/ws' && url.pathname !== '/signaling') {
      return new Response('Not Found', { status: 404 });
    }

    const roomId = url.searchParams.get('roomId');
    if (!roomId) return new Response('Missing roomId', { status: 400 });

    const id = env.SIGNALING_ROOM.idFromName(roomId);
    const stub = env.SIGNALING_ROOM.get(id);
    return stub.fetch(request);
  },
};

