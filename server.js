/**
 * VPS 部署版：静态站点 + WebSocket 信令服务器
 *
 * - 静态站点：直接托管仓库根目录（index.html/app.js/styles.css）
 * - 信令：/ws 通过 WebSocket 转发 offer/answer/ice-candidate
 *
 * 运行：
 *   npm install
 *   npm start
 *
 * 默认端口：8787（可用 PORT 环境变量覆盖）
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8787', 10);

const app = express();
app.get('/health', (_req, res) => res.type('text').send('ok'));
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);

// roomId -> RoomState
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      creatorPeerId: null,
      peerSockets: new Map(), // peerId -> ws
      pendingByPeer: new Map(), // peerId -> msg[]
      waitingJoiners: new Set(), // peerId
    });
  }
  return rooms.get(roomId);
}

function sendJson(ws, obj) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(obj));
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('roomId');

  if (!roomId) {
    ws.close(1008, 'Missing roomId');
    return;
  }

  const room = getRoom(roomId);
  let peerId = null;

  ws.on('message', (data) => {
    let msg = null;
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch {
      return;
    }
    if (!msg || !msg.type) return;

    if (msg.type === 'register-creator') {
      peerId = msg.creatorPeerId;
      if (!peerId) return;

      room.creatorPeerId = peerId;
      room.peerSockets.set(peerId, ws);

      // 通知等待的 joiner
      for (const joinerId of room.waitingJoiners) {
        const joinerWs = room.peerSockets.get(joinerId);
        if (joinerWs) {
          sendJson(joinerWs, { type: 'creator-peer-id', roomId, creatorPeerId: peerId });
        } else {
          if (!room.pendingByPeer.has(joinerId)) room.pendingByPeer.set(joinerId, []);
          room.pendingByPeer.get(joinerId).push({ type: 'creator-peer-id', roomId, creatorPeerId: peerId });
        }
      }
      room.waitingJoiners = new Set();

      // flush pending -> creator
      const pending = room.pendingByPeer.get(peerId);
      if (pending && pending.length) {
        for (const p of pending) sendJson(ws, p);
        room.pendingByPeer.set(peerId, []);
      }
      return;
    }

    if (msg.type === 'register-joiner') {
      peerId = msg.peerId;
      if (!peerId) return;

      room.peerSockets.set(peerId, ws);

      if (room.creatorPeerId) {
        sendJson(ws, { type: 'creator-peer-id', roomId, creatorPeerId: room.creatorPeerId });

        const pending = room.pendingByPeer.get(peerId);
        if (pending && pending.length) {
          for (const p of pending) sendJson(ws, p);
          room.pendingByPeer.set(peerId, []);
        }
      } else {
        room.waitingJoiners.add(peerId);
      }
      return;
    }

    // 转发 offer/answer/ice-candidate
    const targetPeerId = msg.targetPeerId;
    if (!targetPeerId) return;

    const targetWs = room.peerSockets.get(targetPeerId);
    if (targetWs && targetWs.readyState === targetWs.OPEN) {
      sendJson(targetWs, msg);
    } else {
      if (!room.pendingByPeer.has(targetPeerId)) room.pendingByPeer.set(targetPeerId, []);
      room.pendingByPeer.get(targetPeerId).push(msg);
    }
  });

  ws.on('close', () => {
    if (peerId) room.peerSockets.delete(peerId);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[e2e-chat] http://0.0.0.0:${PORT}`);
  console.log(`[e2e-chat] ws://0.0.0.0:${PORT}/ws?roomId=<roomId>`);
});

