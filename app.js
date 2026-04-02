// 端对端加密群聊应用（本地 BroadcastChannel 信令版）
class E2EGroupChat {
 constructor() {
  this.username = '';
  this.roomId = '';
  this.peers = new Map(); // peerId -> { rtcPeerConnection, dataChannel }
  this.connectingPeers = new Set(); // 避免并发重复创建连接
  this.pendingIceCandidates = new Map(); // peerId -> RTCIceCandidateInit[]
  this.localPeerId = this.generatePeerId();
  this.encryptionKeys = new Map(); // peerId -> CryptoKey
  this.messageQueue = []; // 未连接成功前的文本消息
  this.selectedFiles = [];
  // base64 字符串分片大小（不是字节）
  // 调小可显著降低单条消息超过 DataChannel 限制导致的丢包/失败概率
  this.fileChunkSize = 8 * 1024;
  this.pendingFileTransfers = new Map(); // fileId -> { ... }
  this.maxFileSize = 10 * 1024 * 1024; // 10MB
  this.maxFiles = 5;
  this.isCreator = false;
  this.creatorPeerId = null;
  this.isConnected = false;

  // 可选：跨设备信令（需要 ws 信令服务器）
  this.ws = null;
  this.signalingUrl = null;
  this.signalingMode = false;

  this.initializeUI();
  this.setupEventListeners();
 }

 generatePeerId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
 }

 initializeUI() {
  this.loginScreen = document.getElementById('login-screen');
  this.chatScreen = document.getElementById('chat-screen');
  this.usernameInput = document.getElementById('username');
  this.roomIdInput = document.getElementById('room-id');
  this.createBtn = document.getElementById('create-btn');
  this.joinBtn = document.getElementById('join-btn');
  this.leaveBtn = document.getElementById('leave-btn');
  this.messageInput = document.getElementById('message-input');
  this.sendBtn = document.getElementById('send-btn');
  this.messagesContainer = document.getElementById('messages');
  this.statusBar = document.getElementById('status-bar');
  this.connectionStatus = document.getElementById('connection-status');
  this.peerCount = document.getElementById('peer-count');
  this.currentRoom = document.getElementById('current-room');
  this.currentUser = document.getElementById('current-user');
  this.loading = document.getElementById('loading');

  // 文件/多媒体相关
  this.fileBtn = document.getElementById('file-btn');
  this.fileInput = document.getElementById('file-input');
  this.filePreview = document.getElementById('file-preview');
  this.uploadProgress = document.getElementById('upload-progress');
  this.progressFill = document.getElementById('progress-fill');
  this.progressText = document.getElementById('progress-text');

  // 手动连接相关
  this.connectPeerBtn = document.getElementById('connect-peer-btn');
  this.connectDialog = document.getElementById('connect-dialog');
  this.connectCancel = document.getElementById('connect-cancel');
  this.connectConfirm = document.getElementById('connect-confirm');
  this.myPeerIdInput = document.getElementById('my-peer-id');
  this.copyPeerIdBtn = document.getElementById('copy-peer-id');
  this.remotePeerIdInput = document.getElementById('remote-peer-id');
 }

  serializeIceCandidate(candidate) {
   if (!candidate) return null;
   // RTCIceCandidate 在 BroadcastChannel 里不能直接结构化克隆，必须序列化成纯对象
   if (typeof candidate.toJSON === 'function') return candidate.toJSON();
   return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex
   };
  }

  getSignalingUrl() {
   try {
    const params = new URLSearchParams(window.location.search);
    const signal = params.get('signal');
    if (signal) return signal;

    // VPS 部署推荐：默认使用同域 /ws
    const isHttps = window.location.protocol === 'https:';
    const wsScheme = isHttps ? 'wss:' : 'ws:';
    return `${wsScheme}//${window.location.host}/ws`;
   } catch {
    return null;
   }
  }

  sendSignalingMessage(message) {
   // WebSocket 模式：跨设备
   if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify(message));
    return;
   }

   // 本地模式：同浏览器
   if (this.broadcastChannel) {
    this.broadcastChannel.postMessage(message);
   }
  }

  async startWebSocketSignaling(wsUrl) {
   this.signalingUrl = wsUrl;
   this.signalingMode = true;

   await new Promise((resolve, reject) => {
    try {
     // Durable Object 版信令需要 roomId 才能路由到同一个 DO 实例
     const u = new URL(wsUrl);
     if (!u.searchParams.get('roomId')) u.searchParams.set('roomId', this.roomId);
     this.ws = new WebSocket(u.toString());
    } catch (e) {
     reject(e);
     return;
    }

    this.ws.onopen = () => resolve();
    this.ws.onerror = (e) => reject(e);
   });

   // 注册
   if (this.isCreator) {
    this.ws.send(JSON.stringify({
     type: 'register-creator',
     roomId: this.roomId,
     creatorPeerId: this.localPeerId
    }));
   } else {
    this.ws.send(JSON.stringify({
     type: 'register-joiner',
     roomId: this.roomId,
     peerId: this.localPeerId
    }));
   }

   this.ws.onmessage = async (event) => {
    let msg = null;
    try {
     msg = JSON.parse(event.data);
    } catch {
     return;
    }

    if (!msg || msg.roomId !== this.roomId) return;

    if (msg.type === 'creator-peer-id') {
     if (msg.creatorPeerId && !this.peers.has(msg.creatorPeerId)) {
      this.creatorPeerId = msg.creatorPeerId;
      this.addSystemMessage('已连接到房间创建者，正在建立 P2P 连接...');
      // joiner 负责 createOffer
      await this.connectToPeer(this.creatorPeerId);
     }
     return;
    }

    if (msg.type === 'offer' && msg.targetPeerId === this.localPeerId) {
     await this.connectToPeer(msg.peerId, msg.offer);
     return;
    }

    if (msg.type === 'answer' && msg.targetPeerId === this.localPeerId) {
     const peer = this.peers.get(msg.peerId);
     if (peer && peer.pc) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      await this.flushPendingIceCandidates(msg.peerId);
     }
     return;
    }

    if (msg.type === 'ice-candidate' && msg.targetPeerId === this.localPeerId && msg.candidate) {
     const peerId = msg.peerId;
     const peer = this.peers.get(peerId);
     if (peer && peer.pc && peer.pc.remoteDescription) {
      try {
       await peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch (e) {
       console.error('ws addIceCandidate 失败:', e);
      }
     } else {
      const list = this.pendingIceCandidates.get(peerId) || [];
      list.push(msg.candidate);
      this.pendingIceCandidates.set(peerId, list);
     }
     return;
    }
   };

   this.ws.onclose = () => {
    this.signalingMode = false;
    this.addSystemMessage('信令服务器已断开，将无法跨设备连接。');
   };
  }

 setupEventListeners() {
  // 生成随机房间 ID
  document.getElementById('generate-room').addEventListener('click', () => {
   this.roomIdInput.value = Math.random().toString(36).substring(2, 10);
  });

  // 加入房间
  // 创建房间
  if (this.createBtn) {
   this.createBtn.addEventListener('click', () => this.joinRoom('create'));
  }
  // 加入房间（默认）
  this.joinBtn.addEventListener('click', () => this.joinRoom('join'));
  this.roomIdInput.addEventListener('keypress', (e) => {
   if (e.key === 'Enter') this.joinRoom('join');
  });
  this.usernameInput.addEventListener('keypress', (e) => {
   if (e.key === 'Enter') this.joinRoom('join');
  });

  // 发送消息
  this.sendBtn.addEventListener('click', async () => {
   if (this.selectedFiles.length > 0) {
    await this.sendFiles();
   }
   this.sendMessage();
  });
  this.messageInput.addEventListener('keypress', (e) => {
   if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    // 先发文件再发文本
    (async () => {
     if (this.selectedFiles.length > 0) {
      await this.sendFiles();
     }
     this.sendMessage();
    })();
   }
  });

  // 离开房间
  this.leaveBtn.addEventListener('click', () => this.leaveRoom());

  // 手动连接
  this.connectPeerBtn.addEventListener('click', () => {
   if (!this.localPeerId) return;
   this.myPeerIdInput.value = this.localPeerId;
   this.connectDialog.classList.remove('hidden');
  });

  this.connectCancel.addEventListener('click', () => {
   this.remotePeerIdInput.value = '';
   this.connectDialog.classList.add('hidden');
  });

  this.copyPeerIdBtn.addEventListener('click', async () => {
   try {
    await navigator.clipboard.writeText(this.localPeerId);
    this.addSystemMessage('Peer ID 已复制到剪贴板！');
   } catch {
    this.myPeerIdInput.select();
    document.execCommand('copy');
    this.addSystemMessage('Peer ID 已复制到剪贴板！');
   }
  });

  this.connectConfirm.addEventListener('click', () => {
   const remotePeerId = (this.remotePeerIdInput.value || '').trim();
   if (!remotePeerId) {
    alert('请输入对方的 Peer ID');
    return;
   }
   this.connectDialog.classList.add('hidden');
   this.remotePeerIdInput.value = '';
   this.connectToPeer(remotePeerId);
   this.addSystemMessage(`正在连接到 ${remotePeerId.substring(0, 8)}...`);
  });

  // 文件上传
  this.fileBtn.addEventListener('click', () => {
   if (this.fileInput && !this.fileInput.disabled) this.fileInput.click();
  });
  this.fileInput.addEventListener('change', (e) => {
   this.handleFileSelect(e.target.files);
  });
 }

async joinRoom(mode = 'join') {
  const username = this.usernameInput.value.trim();
  const roomId = this.roomIdInput.value.trim();

  if (!username || !roomId) {
   alert('请输入昵称和房间 ID');
   return;
  }

  this.username = username;
  this.roomId = roomId;
  this.isCreator = mode === 'create';
  this.creatorPeerId = null;
  console.log('[joinRoom]', { mode, roomId: this.roomId, localPeerId: this.localPeerId, isCreator: this.isCreator });

  this.showLoading(true);
  this.loginScreen.classList.remove('active');
  this.chatScreen.classList.add('active');

  this.currentRoom.textContent = roomId;
  this.currentUser.textContent = username;

  // 记录“创建者 Peer ID”，让加入方无需手动点连接
  try {
   const creatorKey = `room-${this.roomId}-creator`;
   if (this.isCreator) {
    this.creatorPeerId = this.localPeerId;
    localStorage.setItem(
     creatorKey,
     JSON.stringify({ creatorPeerId: this.creatorPeerId, timestamp: Date.now() })
    );
    console.log('[creator->localStorage]', { creatorKey, creatorPeerId: this.creatorPeerId });
   } else {
    const raw = localStorage.getItem(creatorKey);
    if (raw) {
     const parsed = JSON.parse(raw);
     if (parsed && parsed.creatorPeerId) {
      // 过期清理：超过 1 天认为无效（避免长期旧数据污染）
      const age = Date.now() - (parsed.timestamp || 0);
      if (!parsed.timestamp || age < 24 * 60 * 60 * 1000) {
       this.creatorPeerId = parsed.creatorPeerId;
      }
     }
    }
    console.log('[join->readLocalStorage]', { creatorKey, creatorPeerId: this.creatorPeerId });
   }
  } catch (e) {
   // localStorage 可能不可用，忽略
   console.warn('[localStorage read/set error]', e);
  }

  // 初始化加密密钥
  await this.initializeEncryption();

  // 开始 WebRTC 连接发现（BroadcastChannel 信令）
  await this.startPeerDiscovery();

  this.showLoading(false);

  // 连接建立前禁止发送按钮（连接后会自动启用）
  this.messageInput.disabled = false;
  this.sendBtn.disabled = true;
  this.fileBtn.disabled = true;
  this.isConnected = false;
  this.updateConnectionStatus('等待连接...', 'connecting');
 }

 async initializeEncryption() {
  // 为每个对等点生成加密密钥（这里直接用房间 ID 派生）
  const keyMaterial = await crypto.subtle.importKey(
   'raw',
   new TextEncoder().encode(this.roomId + 'encryption-key'),
   { name: 'PBKDF2' },
   false,
   ['deriveBits', 'deriveKey']
  );

  const encryptionKey = await crypto.subtle.deriveKey(
   {
    name: 'PBKDF2',
    salt: new TextEncoder().encode('e2e-chat-salt'),
    iterations: 100000,
    hash: 'SHA-256'
   },
   keyMaterial,
   { name: 'AES-GCM', length: 256 },
   false,
   ['encrypt', 'decrypt']
  );

  // 本地也存一份：所有 peer 基于同一个 roomId 派生相同 key
  this.encryptionKeys.set(this.localPeerId, encryptionKey);
 }

 async startPeerDiscovery() {
  const wsUrl = this.getSignalingUrl();
  if (wsUrl) {
   this.addSystemMessage('已启用跨设备信令，正在建立连接...');
   await this.startWebSocketSignaling(wsUrl);
   return;
  }

  // 本地模式：同浏览器标签页通信
  this.setupPeerListener();
  if (this.isCreator) {
   this.addSystemMessage('你是房间创建者。加入该房间的其他人将自动连接。');
   this.addSystemMessage(`你的创建者 Peer ID：${this.localPeerId}`);
  } else {
   this.addSystemMessage('正在加入房间...');
   if (this.creatorPeerId) {
    this.addSystemMessage('已识别创建者，正在建立连接...');
    // 直接尝试连接（依赖 BroadcastChannel / ICE 异步，因此这里用轻微延迟）
    setTimeout(() => {
     if (this.creatorPeerId && !this.peers.has(this.creatorPeerId)) {
      console.log('[join->autoConnect creator]', { creatorPeerId: this.creatorPeerId });
      this.connectToPeer(this.creatorPeerId);
     }
    }, 500);
   } else {
    this.addSystemMessage('等待创建者确认...');
   }
  }
 }

 setupPeerListener() {
  if (typeof BroadcastChannel === 'undefined') {
   alert('你的浏览器不支持 BroadcastChannel，无法进行点对点发现。');
   return;
  }

  this.broadcastChannel = new BroadcastChannel(`room-${this.roomId}`);
  this.broadcastChannel.onmessage = async (event) => {
   const data = event.data;
   // 同一个 BroadcastChannel（room-${this.roomId}）内天然隔离，所以这里不依赖 roomId 字段
   if (!data) return;

   if (data.type === 'room-creator') {
    console.log('[broadcast room-creator]', { fromPeer: data.creatorPeerId, localPeerId: this.localPeerId });
   }

   // 创建者广播：加入方读取后自动向创建者建立连接
   if (data.type === 'room-creator' && data.creatorPeerId && data.creatorPeerId !== this.localPeerId) {
    // 只处理当前房间广播（因为 broadcast channel 已经隔离 room-${roomId}，但仍保守校验）
    this.creatorPeerId = data.creatorPeerId;
    console.log('[join received creatorPeerId]', { creatorPeerId: this.creatorPeerId });
    if (!this.peers.has(this.creatorPeerId)) {
     await this.connectToPeer(this.creatorPeerId);
    }
    return;
   }

   // 收到对方“存在”的通知：发起连接
   if (data.type === 'peer-announce' && data.peerId !== this.localPeerId) {
    // 如果已经知道创建者 Peer ID，则忽略 peer-announce，避免多次协商冲突
    if (!this.isCreator && this.creatorPeerId) return;

    // 兜底：仅当还没获得 creatorPeerId 才使用 peer-announce 自动连接
    if (!this.isCreator && !this.creatorPeerId) {
     if (data.peerId) {
      // 在没有 creatorPeerId 的情况下不做强制连接，保持兼容（防止错误连接）
     }
    }
   }

   // 收到对方发来的 offer：作为应答方建立连接
   if (data.type === 'offer' && data.targetPeerId === this.localPeerId) {
    console.log('[recv offer]', { fromPeer: data.peerId, target: data.targetPeerId });
    await this.connectToPeer(data.peerId, data.offer);
   }

   // 收到对方发来的 answer：作为发起方设置远端描述
   if (data.type === 'answer' && data.targetPeerId === this.localPeerId) {
    console.log('[recv answer]', { fromPeer: data.peerId, target: data.targetPeerId });
    const peer = this.peers.get(data.peerId);
    if (peer && peer.pc) {
     await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
     await this.flushPendingIceCandidates(data.peerId);
    }
   }

   // 收到对方 ICE 候选：如果远端描述尚未就绪则暂存
   if (data.type === 'ice-candidate' && data.targetPeerId === this.localPeerId && data.candidate) {
    console.log('[recv ice]', { fromPeer: data.peerId, target: data.targetPeerId });
    const peerId = data.peerId;
    const peer = this.peers.get(peerId);
    if (peer && peer.pc && peer.pc.remoteDescription) {
     try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
     } catch (e) {
      console.error('addIceCandidate 失败:', e);
     }
    } else {
     const list = this.pendingIceCandidates.get(peerId) || [];
     list.push(data.candidate);
     this.pendingIceCandidates.set(peerId, list);
    }
   }
  };

  // 定期广播自己的存在
  this.discoveryInterval = setInterval(() => {
   if (this.isCreator && this.creatorPeerId === this.localPeerId) {
    this.broadcastChannel.postMessage({
     type: 'room-creator',
     creatorPeerId: this.localPeerId,
     roomId: this.roomId
    });
   }
   this.broadcastChannel.postMessage({
    type: 'peer-announce',
    peerId: this.localPeerId,
    roomId: this.roomId
   });
  }, 3000);

  // 立即广播一次
  if (this.isCreator && this.creatorPeerId === this.localPeerId) {
   this.broadcastChannel.postMessage({
    type: 'room-creator',
    creatorPeerId: this.localPeerId,
    roomId: this.roomId
   });
  }
  this.broadcastChannel.postMessage({
   type: 'peer-announce',
   peerId: this.localPeerId,
   roomId: this.roomId
  });
 }

 async connectToPeer(remotePeerId, offer = null) {
  // 角色控制避免 offer 冲突：
  // - 创建者（isCreator=true）只做应答方：不主动 createOffer
  // - 加入者连接创建者（remotePeerId === creatorPeerId）时主动 createOffer
  // - 如果没有 creatorPeerId（例如手动直连），退化为 peerId 字典序仲裁
  let shouldCreateOffer = false;
  if (!offer) {
   if (this.isCreator) {
    shouldCreateOffer = false;
   } else if (this.creatorPeerId) {
    shouldCreateOffer = remotePeerId === this.creatorPeerId;
   } else {
    shouldCreateOffer = this.localPeerId < remotePeerId;
   }
  }

  console.log('[connectToPeer]', {
   localPeerId: this.localPeerId,
   remotePeerId,
   hasOffer: !!offer,
   isCreator: this.isCreator,
   creatorPeerId: this.creatorPeerId,
   shouldCreateOffer
  });

  // 如果已存在 peer 连接：
  // - 仅当我们收到 offer（offer 参数不为 null）时，作为应答方补齐 setRemoteDescription + createAnswer
  const existing = this.peers.get(remotePeerId);
  if (existing) {
   if (offer) {
    await existing.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates(remotePeerId);

    const answer = await existing.pc.createAnswer();
    await existing.pc.setLocalDescription(answer);

    this.sendSignalingMessage({
     type: 'answer',
     roomId: this.roomId,
     peerId: this.localPeerId,
     targetPeerId: remotePeerId,
     answer: answer
    });
   }
   return;
  }

  if (this.connectingPeers.has(remotePeerId)) return;
  this.connectingPeers.add(remotePeerId);

  try {
   const configuration = {
    iceServers: [
     { urls: 'stun:stun.l.google.com:19302' },
     { urls: 'stun:stun1.l.google.com:19302' }
    ]
   };

   const pc = new RTCPeerConnection(configuration);

   // 先把连接对象存起来，避免 ICE 在 setRemoteDescription 之前到来丢失
   // dataChannel 在 offerer 端由 createDataChannel 创建；answerer 端由 ondatachannel 回调获取。
   this.peers.set(remotePeerId, {
    pc,
    dataChannel: null
   });

   if (shouldCreateOffer) {
    // offerer：创建 dataChannel
    const dataChannel = pc.createDataChannel('chat', { ordered: true });
    this.peers.get(remotePeerId).dataChannel = dataChannel;
    this.setupDataChannel(dataChannel, remotePeerId);
   } else {
    // 非 offerer：等待对方通过 offer 创建并触发 ondatachannel
    pc.ondatachannel = (e) => {
     this.setupDataChannel(e.channel, remotePeerId);
     const peer = this.peers.get(remotePeerId);
     if (peer) peer.dataChannel = e.channel;
    };
   }

   pc.onicecandidate = (event) => {
    if (event.candidate) {
     const serialized = this.serializeIceCandidate(event.candidate);
     this.sendSignalingMessage({
      type: 'ice-candidate',
      roomId: this.roomId,
      peerId: this.localPeerId,
      targetPeerId: remotePeerId,
      candidate: serialized
     });
    }
   };

   pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
     this.addSystemMessage(`用户 ${remotePeerId.substring(0, 8)}... 已连接`);
     this.updatePeerCountAndConnectionState();
    } else if (state === 'disconnected' || state === 'failed') {
     this.removePeer(remotePeerId);
     this.addSystemMessage(`用户 ${remotePeerId.substring(0, 8)}... 已断开`);
     this.updatePeerCountAndConnectionState();
    }
   };

   if (offer) {
    // 应答方：先设置远端 offer，再创建 answer
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates(remotePeerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignalingMessage({
     type: 'answer',
     roomId: this.roomId,
     peerId: this.localPeerId,
     targetPeerId: remotePeerId,
     answer: answer
    });
   } else {
    // 发起方：按仲裁规则决定是否真的创建 offer
    if (shouldCreateOffer) {
     const newOffer = await pc.createOffer();
     await pc.setLocalDescription(newOffer);

     this.sendSignalingMessage({
      type: 'offer',
      roomId: this.roomId,
      peerId: this.localPeerId,
      targetPeerId: remotePeerId,
      offer: newOffer
     });
    }
   }
  } finally {
   this.connectingPeers.delete(remotePeerId);
  }
 }

 async flushPendingIceCandidates(peerId) {
  const peer = this.peers.get(peerId);
  if (!peer || !peer.pc) return;
  const list = this.pendingIceCandidates.get(peerId);
  if (!list || list.length === 0) return;

  for (const candidate of list) {
   try {
    await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
   } catch (e) {
    console.error('flush addIceCandidate 失败:', e);
   }
  }
  this.pendingIceCandidates.delete(peerId);
 }

 setupDataChannel(channel, peerId) {
  channel.onopen = async () => {
   console.log(`数据通道已打开: ${peerId}`);
   // 数据通道已就绪时，认为连接成功（比 connectionState 更可靠）
   this.updatePeerCountAndConnectionState();
   this.updateConnectionStatus('已连接', 'connected');
   this.sendBtn.disabled = false;
   if (this.fileBtn) this.fileBtn.disabled = false;

   // 尝试把队列里的消息补发给新打开的数据通道
   if (this.messageQueue.length > 0) {
    const toSend = [...this.messageQueue];
    this.messageQueue = [];

    for (const msg of toSend) {
     try {
      const encrypted = await this.encryptMessage(msg);
      const encryptedData = JSON.stringify(encrypted);
      if (channel.readyState === 'open') channel.send(encryptedData);
     } catch (e) {
      console.error('发送队列消息失败:', e);
     }
    }
   }
  };

  channel.onclose = () => {
   console.log(`数据通道已关闭: ${peerId}`);
   this.removePeer(peerId);
   this.updatePeerCountAndConnectionState();
  };

  channel.onerror = (error) => {
   console.error('数据通道错误:', error);
  };

  channel.onmessage = async (event) => {
   try {
    const rawEncrypted = event.data; // 原始加密包（string），用于创建者中继转发
    const encryptedData = JSON.parse(rawEncrypted);
    const decryptedMessage = await this.decryptMessage(encryptedData);
    const type = decryptedMessage && decryptedMessage.type;
    const isOwn = decryptedMessage && decryptedMessage.username === this.username;

    // 创建者作为中继：把加入者发来的“加密包”原样转发给其他加入者
    // 这样加入者之间无需直连，也能互相看到消息/图片/文件（仍保持端到端加密）。
    if (this.isCreator && !isOwn) {
     for (const [otherPeerId, otherPeer] of this.peers.entries()) {
      if (otherPeerId === peerId) continue; // 不回发给发送者
      if (otherPeer?.dataChannel?.readyState === 'open') {
       otherPeer.dataChannel.send(rawEncrypted);
      }
     }
    }

    if (type === 'file' && decryptedMessage.fileData) {
     this.displayFileMessage(decryptedMessage, isOwn);
     return;
    }

    if (type === 'file-info' || type === 'file-chunk') {
     this.handleIncomingFileMessage(decryptedMessage);
     return;
    }

    // 默认按文本消息处理
    if (typeof decryptedMessage.content === 'string') {
     this.displayMessage(decryptedMessage.username, decryptedMessage.content, false);
    }
   } catch (error) {
    console.error('消息解密错误:', error);
   }
  };
 }

 async encryptMessage(message) {
  const key = this.encryptionKeys.get(this.localPeerId);
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(message));

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
   {
    name: 'AES-GCM',
    iv: iv
   },
   key,
   data
  );

  return {
   encrypted: Array.from(new Uint8Array(encrypted)),
   iv: Array.from(iv)
  };
 }

 async decryptMessage(encryptedData) {
  const key = this.encryptionKeys.get(this.localPeerId);
  const encrypted = new Uint8Array(encryptedData.encrypted);
  const iv = new Uint8Array(encryptedData.iv);

  const decrypted = await crypto.subtle.decrypt(
   {
    name: 'AES-GCM',
    iv: iv
   },
   key,
   encrypted
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
 }

 async sendMessage() {
  const content = this.messageInput.value.trim();
  if (!content) return;

  const message = {
   username: this.username,
   content: content,
   timestamp: Date.now()
  };

  // 显示自己的消息
  this.displayMessage(this.username, content, true);
  this.messageInput.value = '';

  try {
   const encrypted = await this.encryptMessage(message);
   const encryptedData = JSON.stringify(encrypted);

   let sent = false;
   for (const [, peer] of this.peers.entries()) {
    if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
     peer.dataChannel.send(encryptedData);
     sent = true;
    }
   }

   if (!sent) {
    // 连接尚未就绪时先入队，等待下次 DataChannel onopen 补发
    this.messageQueue.push(message);
    this.addSystemMessage('消息已保存，等待其他用户连接...');
   }
  } catch (error) {
   console.error('发送消息错误:', error);
   this.addSystemMessage('发送消息失败，请重试');
  }
 }

  // ---------- 文件传输与展示 ----------

  async handleFileSelect(files) {
   if (!files || files.length === 0) return;

   // 先清空上次选择（避免叠加太多）
   this.selectedFiles = [];
   this.pendingFileTransfers.clear();
   this.updateFilePreview();

   const fileList = Array.from(files);
   if (fileList.length > this.maxFiles) {
    alert(`最多只能选择 ${this.maxFiles} 个文件`);
    return;
   }

   for (const file of fileList) {
    if (file.size > this.maxFileSize) {
     alert(`文件 ${file.name} 超过 10MB 限制`);
     continue;
    }

    let processedFile = file;
    if (file.type && file.type.startsWith('image/')) {
     processedFile = await this.compressImage(file);
    }

    this.selectedFiles.push({
     file: processedFile,
     originalFileName: file.name,
     type: file.type || 'application/octet-stream',
     name: file.name,
     size: processedFile.size
    });
   }

   this.updateFilePreview();
  }

  compressImage(file) {
   return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
     const img = new Image();
     img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // 限制最大尺寸，避免大图导致超出传输限制
      const maxDimension = 1920;
      if (width > maxDimension || height > maxDimension) {
       if (width > height) {
        height = (height / width) * maxDimension;
        width = maxDimension;
       } else {
        width = (width / height) * maxDimension;
        height = maxDimension;
       }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
       (blob) => resolve(blob || file),
       file.type,
       0.8
      );
     };
     img.src = e.target.result;
    };
    reader.readAsDataURL(file);
   });
  }

  updateFilePreview() {
   if (!this.filePreview) return;

   this.filePreview.innerHTML = '';
   if (!this.selectedFiles || this.selectedFiles.length === 0) {
    this.filePreview.classList.add('hidden');
    return;
   }

   this.filePreview.classList.remove('hidden');

   this.selectedFiles.forEach((fileData, index) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';

    if (fileData.type.startsWith('image/')) {
     const img = document.createElement('img');
     img.src = URL.createObjectURL(fileData.file);
     item.appendChild(img);
    } else if (fileData.type.startsWith('video/')) {
     const video = document.createElement('video');
     video.src = URL.createObjectURL(fileData.file);
     video.controls = true;
     item.appendChild(video);
    } else if (fileData.type.startsWith('audio/')) {
     const audio = document.createElement('audio');
     audio.src = URL.createObjectURL(fileData.file);
     audio.controls = true;
     item.appendChild(audio);
    }

    const info = document.createElement('div');
    info.className = 'file-info';
    info.textContent = `${fileData.name} (${this.formatFileSize(fileData.size)})`;
    item.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
     this.selectedFiles.splice(index, 1);
     this.updateFilePreview();
    };
    item.appendChild(removeBtn);

    this.filePreview.appendChild(item);
   });
  }

  formatFileSize(bytes) {
   if (bytes < 1024) return bytes + ' B';
   if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
   return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async sendFiles() {
   if (!this.selectedFiles || this.selectedFiles.length === 0) return;

   // 发送时禁用输入，避免并发读取大文件
   this.fileBtn.disabled = true;
   this.sendBtn.disabled = true;

   try {
    for (const fileData of this.selectedFiles) {
     await this.sendFile(fileData);
    }
   } finally {
    this.selectedFiles = [];
    if (this.fileInput) this.fileInput.value = '';
    this.updateFilePreview();
    // 恢复按钮状态（取决于连接状态）
    this.updatePeerCountAndConnectionState();
   }
  }

  async sendFile(fileData) {
   const reader = new FileReader();
   const promise = new Promise((resolve, reject) => {
    reader.onerror = reject;
    reader.onload = resolve;
   });
   reader.readAsArrayBuffer(fileData.file);
   const arrayBuffer = await promise;

   const base64 = this.arrayBufferToBase64(arrayBuffer);
   const messageBase = {
    type: null,
    fileName: fileData.name,
    fileType: fileData.type,
    fileSize: fileData.size,
    username: this.username,
    timestamp: Date.now()
   };

   if (base64.length > this.fileChunkSize) {
    await this.sendFileInChunks({ ...messageBase, base64 });
   } else {
    const message = { ...messageBase, type: 'file', fileData: base64 };
    await this.sendFileMessage(message);
    this.displayFileMessage(message, true);
   }
  }

  arrayBufferToBase64(arrayBuffer) {
   const bytes = new Uint8Array(arrayBuffer);
   let binary = '';
   const chunkSize = 0x8000;
   for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, sub);
   }
   return btoa(binary);
  }

  async sendFileMessage(message) {
   const encrypted = await this.encryptMessage(message);
   const encryptedData = JSON.stringify(encrypted);

   let sent = false;
   for (const [, peer] of this.peers.entries()) {
    if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
     peer.dataChannel.send(encryptedData);
     sent = true;
    }
   }
   if (!sent) {
    this.addSystemMessage('文件发送失败：暂无已连接的设备');
   }
  }

  async sendFileInChunks(message) {
   this.updateProgress(0);

   const fileId = Date.now() + Math.random();
   const base64 = message.base64;
   const totalChunks = Math.ceil(base64.length / this.fileChunkSize);

   // 发送文件信息
   await this.sendFileMessage({
    type: 'file-info',
    fileId,
    fileName: message.fileName,
    fileType: message.fileType,
    fileSize: message.fileSize,
    totalChunks,
    username: message.username,
    timestamp: message.timestamp
   });

   // 发送文件块
   for (let i = 0; i < totalChunks; i++) {
    const start = i * this.fileChunkSize;
    const end = Math.min(start + this.fileChunkSize, base64.length);
    const chunk = base64.substring(start, end);

    await this.sendFileMessage({
     type: 'file-chunk',
     fileId,
     chunkIndex: i,
     chunkData: chunk,
     totalChunks
    });

    this.updateProgress(((i + 1) / totalChunks) * 100);
   }

   this.hideProgress();

   // 本端直接展示（避免等待对等端回传）
   await this.displayFileMessage({
    type: 'file',
    fileId,
    fileName: message.fileName,
    fileType: message.fileType,
    fileSize: message.fileSize,
    fileData: base64,
    username: message.username,
    timestamp: message.timestamp
   }, true);
  }

  updateProgress(percent) {
   if (!this.uploadProgress) return;
   this.uploadProgress.classList.remove('hidden');
   this.progressFill.style.width = percent + '%';
   this.progressText.textContent = `上传中... ${Math.round(percent)}%`;
  }

  hideProgress() {
   if (!this.uploadProgress) return;
   setTimeout(() => {
    this.uploadProgress.classList.add('hidden');
    this.progressFill.style.width = '0%';
   }, 300);
  }

  handleIncomingFileMessage(message) {
   const fileId = message.fileId;
   if (!fileId) return;

   const renderIfReady = (rec) => {
    if (!rec) return;
    if (!rec.fileType || !rec.fileData || rec.fileData.length === 0) return;
    if (rec.rendered) return;

    const finalMessage = {
     type: 'file',
     fileId: rec.fileId,
     fileName: rec.fileName || '文件',
     fileType: rec.fileType,
     fileSize: rec.fileSize,
     fileData: rec.fileData,
     username: rec.username || '',
     timestamp: rec.timestamp || Date.now()
    };

    rec.rendered = true;
    this.pendingFileTransfers.delete(fileId);
    const isOwn = finalMessage.username === this.username;
    this.displayFileMessage(finalMessage, isOwn);
   };

   if (message.type === 'file-info') {
    let rec = this.pendingFileTransfers.get(fileId);
    if (!rec) {
     rec = {
      fileId,
      totalChunks: message.totalChunks,
      receivedCount: 0,
      chunks: new Array(message.totalChunks).fill(null),
      fileName: message.fileName,
      fileType: message.fileType,
      fileSize: message.fileSize,
      username: message.username,
      timestamp: message.timestamp,
      fileData: null,
      rendered: false
     };
     this.pendingFileTransfers.set(fileId, rec);
    } else {
     rec.totalChunks = message.totalChunks || rec.totalChunks;
     if (!rec.chunks || rec.chunks.length !== rec.totalChunks) {
      rec.chunks = new Array(rec.totalChunks).fill(null);
     }
     rec.fileName = message.fileName;
     rec.fileType = message.fileType;
     rec.fileSize = message.fileSize;
     rec.username = message.username;
     rec.timestamp = message.timestamp;
    }

    // 如果 chunks 已经收齐过，则可以直接渲染
    if (rec.receivedCount === rec.totalChunks && !rec.fileData) {
     rec.fileData = rec.chunks.join('');
    }
    renderIfReady(rec);
    return;
   }

   if (message.type === 'file-chunk') {
    let rec = this.pendingFileTransfers.get(fileId);
    if (!rec) {
     rec = {
      fileId,
      totalChunks: message.totalChunks,
      receivedCount: 0,
      chunks: new Array(message.totalChunks).fill(null),
      fileName: '',
      fileType: '',
      fileSize: 0,
      username: '',
      timestamp: message.timestamp || Date.now(),
      fileData: null,
      rendered: false
     };
     this.pendingFileTransfers.set(fileId, rec);
    }

    // totalChunks 以消息为准（防止元数据先后到达造成不一致）
    if (typeof message.totalChunks === 'number' && message.totalChunks !== rec.totalChunks) {
     rec.totalChunks = message.totalChunks;
     if (!rec.chunks || rec.chunks.length !== rec.totalChunks) {
      rec.chunks = new Array(rec.totalChunks).fill(null);
      rec.receivedCount = 0; // 结构变化，保守重置
      rec.fileData = null;
     }
    }

    if (typeof message.chunkIndex === 'number' && rec.chunks[message.chunkIndex] == null) {
     rec.chunks[message.chunkIndex] = message.chunkData;
     rec.receivedCount += 1;
    }

    // 收齐后先拼出 fileData，等 file-info 抵达（或之前已抵达）再渲染
    if (rec.receivedCount === rec.totalChunks && !rec.fileData) {
     rec.fileData = rec.chunks.join('');
    }
    renderIfReady(rec);
   }
  }

  displayFileMessage(message, isOwn) {
   const messageDiv = document.createElement('div');
   messageDiv.className = `message ${isOwn ? 'own' : ''}`;

   const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
   });

   const fileName = message.fileName || '文件';
   const fileType = message.fileType || 'application/octet-stream';
   const dataUrl = `data:${fileType};base64,${message.fileData}`;

   const wrapper = document.createElement('div');
   wrapper.className = 'message-content';

   const header = document.createElement('div');
   header.className = 'message-header';

   const u = document.createElement('span');
   u.className = 'message-username';
   u.textContent = message.username || '';

   const t = document.createElement('span');
   t.className = 'message-time';
   t.textContent = time;

   header.appendChild(u);
   header.appendChild(t);
   wrapper.appendChild(header);

   const body = document.createElement('div');
   body.className = 'message-body';

   if (fileType.startsWith('image/')) {
    const media = document.createElement('div');
    media.className = 'message-media';
    const img = document.createElement('img');
    img.src = dataUrl;
    media.appendChild(img);
    body.appendChild(media);
   } else if (fileType.startsWith('video/')) {
    const media = document.createElement('div');
    media.className = 'message-media';
    const video = document.createElement('video');
    video.controls = true;
    video.src = dataUrl;
    media.appendChild(video);
    body.appendChild(media);
   } else if (fileType.startsWith('audio/')) {
    const media = document.createElement('div');
    media.className = 'message-media';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = dataUrl;
    media.appendChild(audio);
    body.appendChild(media);
   } else {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = fileName;
    link.textContent = `下载：${fileName}`;
    body.appendChild(link);
   }

   const fileInfo = document.createElement('div');
   fileInfo.textContent = fileName;
   body.appendChild(fileInfo);

   wrapper.appendChild(body);
   messageDiv.appendChild(wrapper);

   this.messagesContainer.appendChild(messageDiv);
   this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

 displayMessage(username, content, isOwn) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isOwn ? 'own' : ''}`;

  const time = new Date().toLocaleTimeString('zh-CN', {
   hour: '2-digit',
   minute: '2-digit'
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'message-content';

  const header = document.createElement('div');
  header.className = 'message-header';

  const u = document.createElement('span');
  u.className = 'message-username';
  u.textContent = username;

  const t = document.createElement('span');
  t.className = 'message-time';
  t.textContent = time;

  header.appendChild(u);
  header.appendChild(t);

  const body = document.createElement('div');
  body.textContent = content;

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  messageDiv.appendChild(wrapper);

  this.messagesContainer.appendChild(messageDiv);
  this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
 }

 addSystemMessage(content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system';
  messageDiv.textContent = content;
  this.messagesContainer.appendChild(messageDiv);
  this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
 }

 escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
 }

 updateConnectionStatus(status, className) {
  this.connectionStatus.textContent = status;
  this.connectionStatus.className = className;
 }

 updatePeerCountAndConnectionState() {
  const connectedPeers = Array.from(this.peers.values()).filter(peer => peer.dataChannel && peer.dataChannel.readyState === 'open').length;
  this.peerCount.textContent = `在线: ${connectedPeers}`;

  this.isConnected = connectedPeers > 0;
  if (this.isConnected) {
   this.updateConnectionStatus('已连接', 'connected');
   this.sendBtn.disabled = false;
   if (this.fileBtn) this.fileBtn.disabled = false;
  } else {
   this.updateConnectionStatus('等待连接...', 'connecting');
   this.sendBtn.disabled = true;
   if (this.fileBtn) this.fileBtn.disabled = true;
  }
 }

 removePeer(peerId) {
  const peer = this.peers.get(peerId);
  if (peer) {
   try {
    if (peer.dataChannel) peer.dataChannel.close();
   } catch {}
   try {
    if (peer.pc) peer.pc.close();
   } catch {}
   this.peers.delete(peerId);
  }
  this.updatePeerCountAndConnectionState();
 }

 leaveRoom() {
  // 关闭所有连接
  for (const [peerId] of this.peers.entries()) {
   this.removePeer(peerId);
  }

  // 清理
  try {
   if (this.broadcastChannel) this.broadcastChannel.close();
  } catch {}
  if (this.discoveryInterval) clearInterval(this.discoveryInterval);

  // 创建者离开时清理本地标记，避免后续加入方误连
  try {
   if (this.isCreator && this.roomId) {
    localStorage.removeItem(`room-${this.roomId}-creator`);
   }
  } catch {}

  // 重置 UI
  this.chatScreen.classList.remove('active');
  this.loginScreen.classList.add('active');
  this.messagesContainer.innerHTML = '';
  this.messageInput.value = '';
  this.messageInput.disabled = false;
  this.sendBtn.disabled = true;
  this.fileBtn.disabled = true;
  this.isConnected = false;

  // 重置状态
  this.peers.clear();
  this.pendingIceCandidates.clear();
  this.messageQueue = [];
  this.selectedFiles = [];
  this.pendingFileTransfers.clear();
  this.username = '';
  this.roomId = '';
  this.encryptionKeys.clear();
  this.connectingPeers.clear();
  this.isCreator = false;
  this.creatorPeerId = null;

  if (this.filePreview) {
   this.filePreview.innerHTML = '';
   this.filePreview.classList.add('hidden');
  }
  if (this.fileInput) this.fileInput.value = '';
  if (this.uploadProgress) this.uploadProgress.classList.add('hidden');
 }

 showLoading(show) {
  if (show) {
   this.loading.classList.remove('hidden');
  } else {
   this.loading.classList.add('hidden');
  }
 }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
 new E2EGroupChat();
});

