/**
 * 本地 WebSocket 信令服务器（无需额外 npm 依赖）
 * 用于同一局域网多设备（手机/电脑）之间的 WebRTC 信令中转。
 *
 * 用法：
 *   node signaling-server.js 8001
 * 然后在客户端 URL 追加：
 *   ?signal=ws://你的电脑IP:8001
 */

const http = require('http');
const crypto = require('crypto');

const port = parseInt(process.argv[2] || '8001', 10);
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B';

// peerId -> { socket, roomId, isCreator }
const peers = new Map();
// roomId -> creatorPeerId
const roomCreators = new Map();
// roomId -> Set(peerId)
const waitingJoiners = new Map();
// peerId -> pending message[]
const pendingByPeer = new Map();

function sendWsJson(socket, obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const frameHead = [];
  frameHead.push(0x81); // FIN=1, opcode=1(text)
  const len = payload.length;
  if (len <= 125) {
    frameHead.push(len);
  } else if (len <= 0xffff) {
    frameHead.push(126);
    frameHead.push((len >> 8) & 0xff);
    frameHead.push(len & 0xff);
  } else {
    // 简化：不处理更长 payload
    socket.destroy();
    return;
  }
  const frame = Buffer.concat([Buffer.from(frameHead), payload]);
  socket.write(frame);
}

function unmaskPayload(payload, maskKey) {
  const out = Buffer.allocUnsafe(payload.length);
  for (let i = 0; i < payload.length; i++) {
    out[i] = payload[i] ^ maskKey[i % 4];
  }
  return out;
}

function parseWsFrames(buffer, onFrame) {
  let offset = 0;
  while (true) {
    if (buffer.length - offset < 2) break;
    const b1 = buffer[offset];
    const b2 = buffer[offset + 1];
    const fin = (b1 & 0x80) !== 0;
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let len = b2 & 0x7f;
    let headerLen = 2;

    if (!fin) return { consumed: offset }; // 不处理分片
    if (opcode === 8) {
      // close
      return { consumed: buffer.length };
    }

    if (!masked) {
      // 浏览器到服务器的帧必须是 masked
      return { consumed: offset };
    }

    if (len === 126) {
      if (buffer.length - offset < 4) break;
      len = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (len === 127) {
      // 简化：不支持 64-bit length
      return { consumed: offset };
    }

    if (buffer.length - offset < headerLen + 4 + len) break;
    const maskKey = buffer.slice(offset + headerLen, offset + headerLen + 4);
    const payloadStart = offset + headerLen + 4;
    const payload = buffer.slice(payloadStart, payloadStart + len);
    const unmasked = unmaskPayload(payload, maskKey);
    const text = unmasked.toString('utf8');

    onFrame(text);

    offset = payloadStart + len;
  }
  return { consumed: offset };
}

function handleMessage(socket, rawText) {
  let msg;
  try {
    msg = JSON.parse(rawText);
  } catch {
    return;
  }

  const type = msg.type;
  if (!type) return;

  if (type === 'register-creator') {
    const { roomId, creatorPeerId } = msg;
    if (!roomId || !creatorPeerId) return;
    peers.set(creatorPeerId, { socket, roomId, isCreator: true });
    roomCreators.set(roomId, creatorPeerId);

    // 通知等待加入者
    const waiting = waitingJoiners.get(roomId);
    if (waiting) {
      for (const peerId of waiting) {
        const peer = peers.get(peerId);
        if (peer) {
          sendWsJson(peer.socket, { type: 'creator-peer-id', roomId, creatorPeerId });
          // 同时清掉等待
          //（不在此处 delete set，避免竞态）
        }
      }
      waitingJoiners.set(roomId, new Set());
    }

    // 发送 pending 信令
    const pending = pendingByPeer.get(creatorPeerId);
    if (pending && pending.length > 0) {
      for (const p of pending) sendWsJson(socket, p);
      pendingByPeer.set(creatorPeerId, []);
    }
    return;
  }

  if (type === 'register-joiner') {
    const { roomId, peerId } = msg;
    if (!roomId || !peerId) return;
    peers.set(peerId, { socket, roomId, isCreator: false });

    const creatorPeerId = roomCreators.get(roomId);
    if (creatorPeerId) {
      sendWsJson(socket, { type: 'creator-peer-id', roomId, creatorPeerId });

      const pending = pendingByPeer.get(peerId);
      if (pending && pending.length > 0) {
        for (const p of pending) sendWsJson(socket, p);
        pendingByPeer.set(peerId, []);
      }
    } else {
      if (!waitingJoiners.has(roomId)) waitingJoiners.set(roomId, new Set());
      waitingJoiners.get(roomId).add(peerId);
    }
    return;
  }

  // 信令中转（offer/answer/ice-candidate）
  const targetPeerId = msg.targetPeerId;
  if (!targetPeerId) return;
  const peer = peers.get(targetPeerId);
  if (peer && peer.socket && !peer.socket.destroyed) {
    sendWsJson(peer.socket, msg);
  } else {
    if (!pendingByPeer.has(targetPeerId)) pendingByPeer.set(targetPeerId, []);
    pendingByPeer.get(targetPeerId).push(msg);
  }
}

server.on('upgrade', (req, socket) => {
  const upgrade = req.headers.upgrade;
  if (upgrade !== 'websocket') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(String(key) + GUID)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ].join('\r\n')
  );

  socket._wsBuffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    socket._wsBuffer = Buffer.concat([socket._wsBuffer, chunk]);
    const res = parseWsFrames(socket._wsBuffer, (text) => handleMessage(socket, text));
    if (res.consumed > 0) socket._wsBuffer = socket._wsBuffer.slice(res.consumed);
    if (socket._wsBuffer.length > 1024 * 1024) {
      // 防御：消息过大直接断开
      socket.destroy();
    }
  });

  socket.on('close', () => {
    for (const [peerId, info] of peers.entries()) {
      if (info.socket === socket) peers.delete(peerId);
    }
  });
});

server.listen(port, () => {
  console.log(`[signaling-server] listening on 0.0.0.0:${port}`);
});

