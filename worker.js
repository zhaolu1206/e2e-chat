// Cloudflare Workers 信令服务器（WebSocket）
// 用于跨设备/跨客户端连接：把 offer/answer/ice-candidate 转发到对应 peerId。
//
// 客户端需要通过 wss://<pages-domain>/ws 连接到该 Worker。

const peerSockets = new Map(); // peerId -> { ws, roomId }
const roomCreators = new Map(); // roomId -> creatorPeerId
const waitingJoiners = new Map(); // roomId -> Set<peerId>
const pendingByPeer = new Map(); // peerId -> message[]

function sendJson(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {
    // 忽略发送失败（对端可能已断开）
  }
}

export default {
  async fetch(request, env, ctx) {
    const upgrade = request.headers.get('Upgrade');
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (upgrade !== 'websocket') {
      if (pathname === '/health') {
        return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      return new Response('Not Found', { status: 404 });
    }

    if (pathname !== '/ws' && pathname !== '/signaling') {
      return new Response('Not Found', { status: 404 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    client.accept();

    let peerId = null;
    let roomId = null;

    server.addEventListener('message', (event) => {
      const data = event.data;
      const text = typeof data === 'string' ? data : '';
      if (!text) return;

      let msg = null;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }

      if (!msg || !msg.type) return;

      const type = msg.type;

      if (type === 'register-creator') {
        roomId = msg.roomId;
        peerId = msg.creatorPeerId;
        if (!roomId || !peerId) return;

        peerSockets.set(peerId, { ws: server, roomId });
        roomCreators.set(roomId, peerId);

        // 通知等待加入者
        const waitSet = waitingJoiners.get(roomId);
        if (waitSet && waitSet.size > 0) {
          for (const joinerId of waitSet) {
            const info = peerSockets.get(joinerId);
            if (info) {
              sendJson(info.ws, { type: 'creator-peer-id', roomId, creatorPeerId: peerId });
            } else {
              // 还没收到 register-joiner 的 joiner，先缓存待发
              if (!pendingByPeer.has(joinerId)) pendingByPeer.set(joinerId, []);
              pendingByPeer.get(joinerId).push({ type: 'creator-peer-id', roomId, creatorPeerId: peerId });
            }
          }
        }
        waitingJoiners.set(roomId, new Set());

        // 发送 pending 给 creator 自己（如果之前收到过转发）
        const pending = pendingByPeer.get(peerId);
        if (pending && pending.length > 0) {
          for (const p of pending) sendJson(server, p);
          pendingByPeer.set(peerId, []);
        }

        return;
      }

      if (type === 'register-joiner') {
        roomId = msg.roomId;
        peerId = msg.peerId;
        if (!roomId || !peerId) return;

        peerSockets.set(peerId, { ws: server, roomId });

        const creatorPeerId = roomCreators.get(roomId);
        if (creatorPeerId) {
          sendJson(server, { type: 'creator-peer-id', roomId, creatorPeerId });

          const pending = pendingByPeer.get(peerId);
          if (pending && pending.length > 0) {
            for (const p of pending) sendJson(server, p);
            pendingByPeer.set(peerId, []);
          }
        } else {
          if (!waitingJoiners.has(roomId)) waitingJoiners.set(roomId, new Set());
          waitingJoiners.get(roomId).add(peerId);
        }

        return;
      }

      // 信令转发：offer/answer/ice-candidate
      const targetPeerId = msg.targetPeerId;
      if (!targetPeerId) return;

      const target = peerSockets.get(targetPeerId);
      if (target && target.ws) {
        sendJson(target.ws, msg);
      } else {
        // 目标还没建立映射：缓存
        if (!pendingByPeer.has(targetPeerId)) pendingByPeer.set(targetPeerId, []);
        pendingByPeer.get(targetPeerId).push(msg);
      }
    });

    server.addEventListener('close', () => {
      if (peerId) peerSockets.delete(peerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  },
};

