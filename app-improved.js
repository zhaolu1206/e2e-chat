// 改进版：支持 WebSocket 信令服务器和纯静态模式
class E2EGroupChat {
    constructor() {
        this.username = '';
        this.roomId = '';
        this.peers = new Map();
        this.localPeerId = this.generatePeerId();
        this.encryptionKeys = new Map();
        this.messageQueue = [];
        this.isConnected = false;
        this.ws = null;
        this.useWebSocket = false; // 是否使用 WebSocket 信令服务器
        
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
        document.getElementById('generate-room').addEventListener('click', () => {
            this.roomIdInput.value = Math.random().toString(36).substring(2, 10);
        });

        this.joinBtn.addEventListener('click', () => this.joinRoom());
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

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

        await this.initializeEncryption();

        // 尝试连接 WebSocket 信令服务器，如果失败则使用 BroadcastChannel
        const wsUrl = this.getWebSocketUrl();
        if (wsUrl) {
            try {
                await this.connectWebSocket(wsUrl);
                this.useWebSocket = true;
            } catch (error) {
                console.log('WebSocket 连接失败，使用本地模式:', error);
                await this.startPeerDiscovery();
            }
        } else {
            await this.startPeerDiscovery();
        }

        this.showLoading(false);
        this.updateConnectionStatus('已连接', 'connected');
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
    }

    getWebSocketUrl() {
        // 尝试从环境或配置中获取 WebSocket URL
        // 如果部署在 Cloudflare Workers，可以使用相对路径
        const host = window.location.hostname;
        if (host.includes('cloudflare') || host.includes('workers.dev')) {
            return `wss://${host}/ws`;
        }
        // 可以在这里配置自定义的信令服务器 URL
        // return 'wss://your-signaling-server.com/ws';
        return null;
    }

    async connectWebSocket(url) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
                
                this.ws.onopen = () => {
                    console.log('WebSocket 已连接');
                    // 发送加入房间消息
                    this.ws.send(JSON.stringify({
                        type: 'join',
                        roomId: this.roomId,
                        peerId: this.localPeerId,
                        username: this.username
                    }));
                    resolve();
                };

                this.ws.onmessage = async (event) => {
                    const message = JSON.parse(event.data);
                    await this.handleSignalingMessage(message);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket 错误:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket 已关闭');
                    this.addSystemMessage('信令服务器连接已断开，切换到本地模式');
                    if (!this.useWebSocket) {
                        this.startPeerDiscovery();
                    }
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async handleSignalingMessage(message) {
        switch (message.type) {
            case 'peers':
                // 收到房间中的其他对等点列表
                for (const peerId of message.peers) {
                    if (peerId !== this.localPeerId && !this.peers.has(peerId)) {
                        await this.connectToPeer(peerId);
                    }
                }
                break;

            case 'peer-joined':
                if (message.peerId !== this.localPeerId) {
                    await this.connectToPeer(message.peerId);
                }
                break;

            case 'offer':
                await this.handleOffer(message);
                break;

            case 'answer':
                await this.handleAnswer(message);
                break;

            case 'ice-candidate':
                await this.handleIceCandidate(message);
                break;
        }
    }

    async initializeEncryption() {
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

        this.encryptionKeys.set(this.localPeerId, encryptionKey);
    }

    async startPeerDiscovery() {
        this.setupPeerListener();
        this.addSystemMessage('已加入房间。等待其他用户连接...');
        this.addSystemMessage('提示：将房间 ID 分享给其他人，他们可以使用相同的房间 ID 加入。');
    }

    setupPeerListener() {
        if (typeof BroadcastChannel !== 'undefined') {
            this.broadcastChannel = new BroadcastChannel(`room-${this.roomId}`);
            
            this.broadcastChannel.onmessage = async (event) => {
                const data = event.data;
                if (data.type === 'peer-announce' && data.peerId !== this.localPeerId) {
                    if (!this.peers.has(data.peerId)) {
                        await this.connectToPeer(data.peerId);
                    }
                } else if (data.type === 'offer' && data.targetPeerId === this.localPeerId) {
                    await this.handleOffer(data);
                } else if (data.type === 'answer' && data.targetPeerId === this.localPeerId) {
                    await this.handleAnswer(data);
                } else if (data.type === 'ice-candidate' && data.targetPeerId === this.localPeerId) {
                    await this.handleIceCandidate(data);
                }
            };

            this.broadcastChannel.postMessage({
                type: 'peer-announce',
                peerId: this.localPeerId,
                roomId: this.roomId
            });

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
    }

    async connectToPeer(remotePeerId, offer = null) {
        if (this.peers.has(remotePeerId)) {
            return;
        }

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        const pc = new RTCPeerConnection(configuration);
        const dataChannel = pc.createDataChannel('chat', {
            ordered: true
        });

        this.setupDataChannel(dataChannel, remotePeerId);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingMessage({
                    type: 'ice-candidate',
                    targetPeerId: remotePeerId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === 'connected') {
                this.addSystemMessage(`用户已连接`);
                this.updatePeerCount();
            } else if (state === 'disconnected' || state === 'failed') {
                this.removePeer(remotePeerId);
                this.addSystemMessage(`用户已断开`);
                this.updatePeerCount();
            }
        };

        if (offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.sendSignalingMessage({
                type: 'answer',
                targetPeerId: remotePeerId,
                answer: answer
            });
        } else {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.sendSignalingMessage({
                type: 'offer',
                targetPeerId: remotePeerId,
                offer: offer
            });
        }

        this.peers.set(remotePeerId, {
            pc,
            dataChannel,
            encryptionKey: this.encryptionKeys.get(this.localPeerId)
        });
    }

    async handleOffer(message) {
        const peer = this.peers.get(message.peerId);
        if (peer) {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(message.offer));
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            
            this.sendSignalingMessage({
                type: 'answer',
                targetPeerId: message.peerId,
                answer: answer
            });
        } else {
            // 创建新的连接
            await this.connectToPeer(message.peerId, message.offer);
        }
    }

    async handleAnswer(message) {
        const peer = this.peers.get(message.peerId);
        if (peer) {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
    }

    async handleIceCandidate(message) {
        const peer = this.peers.get(message.peerId);
        if (peer && message.candidate) {
            await peer.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    }

    sendSignalingMessage(message) {
        if (this.useWebSocket && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                ...message,
                roomId: this.roomId,
                peerId: this.localPeerId
            }));
        } else if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                ...message,
                peerId: this.localPeerId
            });
        }
    }

    setupDataChannel(channel, peerId) {
        channel.onopen = () => {
            console.log(`数据通道已打开: ${peerId}`);
            this.isConnected = true;
            this.updateConnectionStatus('已连接', 'connected');
            
            // 发送队列中的消息
            while (this.messageQueue.length > 0) {
                const msg = this.messageQueue.shift();
                this.sendMessageToPeer(peerId, msg);
            }
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

        this.displayMessage(this.username, content, true);

        try {
            const encrypted = await this.encryptMessage(message);
            const encryptedData = JSON.stringify(encrypted);

            let sent = false;
            for (const [peerId, peer] of this.peers.entries()) {
                if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
                    peer.dataChannel.send(encryptedData);
                    sent = true;
                }
            }

            if (!sent) {
                this.messageQueue.push(message);
                this.addSystemMessage('消息已保存，等待其他用户连接...');
            }
        } catch (error) {
            console.error('发送消息错误:', error);
            this.addSystemMessage('发送消息失败，请重试');
        }

        this.messageInput.value = '';
    }

    async sendMessageToPeer(peerId, message) {
        try {
            const encrypted = await this.encryptMessage(message);
            const encryptedData = JSON.stringify(encrypted);
            const peer = this.peers.get(peerId);
            if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
                peer.dataChannel.send(encryptedData);
            }
        } catch (error) {
            console.error('发送消息到对等点错误:', error);
        }
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
        for (const [peerId, peer] of this.peers.entries()) {
            this.removePeer(peerId);
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
        }

        this.chatScreen.classList.remove('active');
        this.loginScreen.classList.add('active');
        this.messagesContainer.innerHTML = '';
        this.messageInput.value = '';
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.isConnected = false;

        this.peers.clear();
        this.username = '';
        this.roomId = '';
        this.useWebSocket = false;
    }

    showLoading(show) {
        if (show) {
            this.loading.classList.remove('hidden');
        } else {
            this.loading.classList.add('hidden');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new E2EGroupChat();
});
