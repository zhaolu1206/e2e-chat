// 端对端加密群聊应用
class E2EGroupChat {
    constructor() {
        this.username = '';
        this.roomId = '';
        this.peers = new Map(); // peerId -> {rtcPeerConnection, dataChannel, encryptionKey}
        this.localPeerId = this.generatePeerId();
        this.encryptionKeys = new Map(); // peerId -> CryptoKey
        this.messageQueue = [];
        this.isConnected = false;
        
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
    }

    setupEventListeners() {
        // 生成随机房间 ID
        document.getElementById('generate-room').addEventListener('click', () => {
            this.roomIdInput.value = Math.random().toString(36).substring(2, 10);
        });

        // 加入房间
        this.joinBtn.addEventListener('click', () => this.joinRoom());
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // 发送消息
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 离开房间
        this.leaveBtn.addEventListener('click', () => this.leaveRoom());
    }

    async joinRoom() {
        const username = this.usernameInput.value.trim();
        const roomId = this.roomIdInput.value.trim();

        if (!username || !roomId) {
            alert('请输入昵称和房间 ID');
            return;
        }

        this.username = username;
        this.roomId = roomId;

        this.showLoading(true);
        this.loginScreen.classList.remove('active');
        this.chatScreen.classList.add('active');

        this.currentRoom.textContent = roomId;
        this.currentUser.textContent = username;

        // 初始化加密密钥
        await this.initializeEncryption();

        // 开始 WebRTC 连接发现
        await this.startPeerDiscovery();

        this.showLoading(false);
        this.updateConnectionStatus('已连接', 'connected');
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
    }

    async initializeEncryption() {
        // 为每个对等点生成加密密钥（在实际应用中，这应该通过密钥交换协议完成）
        // 这里我们使用房间 ID 作为密钥派生基础（简化版本）
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

        // 存储自己的加密密钥
        this.encryptionKeys.set(this.localPeerId, encryptionKey);
    }

    async startPeerDiscovery() {
        // 使用 WebRTC 的 mesh 网络
        // 在实际应用中，这里应该有一个信令服务器
        // 为了纯静态部署，我们使用一个简化的发现机制
        
        // 监听来自其他对等点的连接请求
        this.setupPeerListener();

        // 尝试连接到已知的对等点（如果有的话）
        // 在纯静态环境中，这需要用户手动分享连接信息
        // 或者使用一个公共的信令服务器（如 Cloudflare Workers）
        
        this.addSystemMessage('已加入房间。等待其他用户连接...');
        this.addSystemMessage('提示：将房间 ID 分享给其他人，他们可以使用相同的房间 ID 加入。');
    }

    setupPeerListener() {
        // 在纯静态环境中，我们需要一个信令机制
        // 这里我们使用一个简化的方案：通过 URL 参数或 localStorage 来发现对等点
        
        // 监听来自其他标签页的连接（通过 BroadcastChannel）
        if (typeof BroadcastChannel !== 'undefined') {
            this.broadcastChannel = new BroadcastChannel(`room-${this.roomId}`);
            
            this.broadcastChannel.onmessage = async (event) => {
                const data = event.data;
                if (data.type === 'peer-announce' && data.peerId !== this.localPeerId) {
                    await this.connectToPeer(data.peerId, data.offer);
                }
            };

            // 广播自己的存在
            this.broadcastChannel.postMessage({
                type: 'peer-announce',
                peerId: this.localPeerId,
                roomId: this.roomId
            });
        }

        // 定期广播自己的存在
        this.discoveryInterval = setInterval(() => {
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'peer-announce',
                    peerId: this.localPeerId,
                    roomId: this.roomId
                });
            }
        }, 3000);
    }

    async connectToPeer(remotePeerId, offer = null) {
        if (this.peers.has(remotePeerId)) {
            return; // 已经连接
        }

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        const pc = new RTCPeerConnection(configuration);
        const dataChannel = pc.createDataChannel('chat', {
            ordered: true
        });

        // 设置数据通道事件
        this.setupDataChannel(dataChannel, remotePeerId);

        // ICE 候选处理
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // 通过 BroadcastChannel 发送 ICE 候选
                if (this.broadcastChannel) {
                    this.broadcastChannel.postMessage({
                        type: 'ice-candidate',
                        peerId: this.localPeerId,
                        targetPeerId: remotePeerId,
                        candidate: event.candidate
                    });
                }
            }
        };

        // 连接状态处理
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === 'connected') {
                this.addSystemMessage(`用户 ${remotePeerId.substring(0, 8)}... 已连接`);
                this.updatePeerCount();
            } else if (state === 'disconnected' || state === 'failed') {
                this.removePeer(remotePeerId);
                this.addSystemMessage(`用户 ${remotePeerId.substring(0, 8)}... 已断开`);
                this.updatePeerCount();
            }
        };

        // 如果提供了 offer，创建 answer
        if (offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'answer',
                    peerId: this.localPeerId,
                    targetPeerId: remotePeerId,
                    answer: answer
                });
            }
        } else {
            // 创建 offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'offer',
                    peerId: this.localPeerId,
                    targetPeerId: remotePeerId,
                    offer: offer
                });
            }
        }

        // 存储对等点信息
        this.peers.set(remotePeerId, {
            pc,
            dataChannel,
            encryptionKey: this.encryptionKeys.get(this.localPeerId)
        });
    }

    setupDataChannel(channel, peerId) {
        channel.onopen = () => {
            console.log(`数据通道已打开: ${peerId}`);
            this.isConnected = true;
            this.updateConnectionStatus('已连接', 'connected');
        };

        channel.onclose = () => {
            console.log(`数据通道已关闭: ${peerId}`);
            this.removePeer(peerId);
        };

        channel.onerror = (error) => {
            console.error('数据通道错误:', error);
        };

        channel.onmessage = async (event) => {
            try {
                const encryptedData = JSON.parse(event.data);
                const decryptedMessage = await this.decryptMessage(encryptedData, peerId);
                this.displayMessage(decryptedMessage.username, decryptedMessage.content, false);
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

    async decryptMessage(encryptedData, peerId) {
        const key = this.encryptionKeys.get(this.localPeerId); // 使用共享密钥
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
        if (!content || !this.isConnected) return;

        const message = {
            username: this.username,
            content: content,
            timestamp: Date.now()
        };

        // 显示自己的消息
        this.displayMessage(this.username, content, true);

        // 加密并发送给所有对等点
        try {
            const encrypted = await this.encryptMessage(message);
            const encryptedData = JSON.stringify(encrypted);

            // 发送给所有已连接的对等点
            let sent = false;
            for (const [peerId, peer] of this.peers.entries()) {
                if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
                    peer.dataChannel.send(encryptedData);
                    sent = true;
                }
            }

            if (!sent) {
                // 如果没有对等点，将消息加入队列
                this.messageQueue.push(message);
                this.addSystemMessage('消息已保存，等待其他用户连接...');
            }
        } catch (error) {
            console.error('发送消息错误:', error);
            this.addSystemMessage('发送消息失败，请重试');
        }

        this.messageInput.value = '';
    }

    displayMessage(username, content, isOwn) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;

        const time = new Date().toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-username">${this.escapeHtml(username)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;

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

    updatePeerCount() {
        const count = Array.from(this.peers.values()).filter(
            peer => peer.pc.connectionState === 'connected'
        ).length;
        this.peerCount.textContent = `在线: ${count}`;
    }

    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            if (peer.dataChannel) peer.dataChannel.close();
            if (peer.pc) peer.pc.close();
            this.peers.delete(peerId);
        }
        this.updatePeerCount();
    }

    leaveRoom() {
        // 关闭所有连接
        for (const [peerId, peer] of this.peers.entries()) {
            this.removePeer(peerId);
        }

        // 清理
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
        }

        // 重置 UI
        this.chatScreen.classList.remove('active');
        this.loginScreen.classList.add('active');
        this.messagesContainer.innerHTML = '';
        this.messageInput.value = '';
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.isConnected = false;

        // 重置状态
        this.peers.clear();
        this.username = '';
        this.roomId = '';
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
