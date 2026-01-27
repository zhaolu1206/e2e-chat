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
        this.selectedFiles = []; // 选中的文件
        this.fileChunkSize = 16 * 1024; // 16KB 分块大小（DataChannel 限制）
        this.pendingFileTransfers = new Map(); // 正在传输的文件
        
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
        this.fileBtn = document.getElementById('file-btn');
        this.fileInput = document.getElementById('file-input');
        this.filePreview = document.getElementById('file-preview');
        this.uploadProgress = document.getElementById('upload-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
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

        this.sendBtn.addEventListener('click', async () => {
            // 如果有选中的文件，先发送文件
            if (this.selectedFiles.length > 0) {
                await this.sendFiles();
            }
            // 然后发送文本消息
            this.sendMessage();
        });
        this.messageInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // 如果有选中的文件，先发送文件
                if (this.selectedFiles.length > 0) {
                    await this.sendFiles();
                }
                // 然后发送文本消息
                this.sendMessage();
            }
        });

        this.leaveBtn.addEventListener('click', () => this.leaveRoom());

        // 文件上传
        this.fileBtn.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });
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
        this.fileBtn.disabled = false;
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
                
                // 处理不同类型的消息
                if (decryptedMessage.type === 'file' || decryptedMessage.type === 'file-info') {
                    this.displayFileMessage(decryptedMessage, false);
                } else {
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

    // 文件处理相关方法
    async handleFileSelect(files) {
        const maxFileSize = 10 * 1024 * 1024; // 10MB 限制
        const maxFiles = 5; // 最多5个文件

        if (files.length > maxFiles) {
            alert(`最多只能选择 ${maxFiles} 个文件`);
            return;
        }

        for (let file of files) {
            if (file.size > maxFileSize) {
                alert(`文件 ${file.name} 超过 10MB 限制`);
                continue;
            }

            // 压缩图片
            let processedFile = file;
            if (file.type.startsWith('image/')) {
                processedFile = await this.compressImage(file);
            }

            this.selectedFiles.push({
                file: processedFile,
                originalFile: file,
                type: file.type,
                name: file.name,
                size: processedFile.size
            });
        }

        this.updateFilePreview();
    }

    async compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // 限制最大尺寸
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

                    canvas.toBlob((blob) => {
                        resolve(blob || file);
                    }, file.type, 0.8); // 80% 质量
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    updateFilePreview() {
        this.filePreview.innerHTML = '';
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
                video.style.maxWidth = '150px';
                video.style.maxHeight = '150px';
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

        if (this.selectedFiles.length === 0) {
            this.filePreview.classList.add('hidden');
        }
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    async sendFiles() {
        if (this.selectedFiles.length === 0) return;

        for (const fileData of this.selectedFiles) {
            await this.sendFile(fileData);
        }

        this.selectedFiles = [];
        this.updateFilePreview();
    }

    async sendFile(fileData) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

            const message = {
                type: 'file',
                username: this.username,
                fileType: fileData.type,
                fileName: fileData.name,
                fileSize: fileData.size,
                fileData: base64,
                timestamp: Date.now()
            };

            // 如果文件太大，需要分块传输
            if (base64.length > this.fileChunkSize) {
                await this.sendFileInChunks(message);
            } else {
                await this.sendFileMessage(message);
            }
        };
        reader.readAsArrayBuffer(fileData.file);
    }

    async sendFileMessage(message) {
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

            if (sent) {
                this.displayFileMessage(message, true);
            } else {
                this.addSystemMessage('文件发送失败，等待其他用户连接...');
            }
        } catch (error) {
            console.error('发送文件错误:', error);
            this.addSystemMessage('发送文件失败，请重试');
        }
    }

    async sendFileInChunks(message) {
        const fileId = Date.now() + Math.random();
        const base64 = message.fileData;
        const totalChunks = Math.ceil(base64.length / this.fileChunkSize);

        // 发送文件信息
        const fileInfo = {
            type: 'file-info',
            fileId: fileId,
            fileName: message.fileName,
            fileType: message.fileType,
            fileSize: message.fileSize,
            totalChunks: totalChunks,
            username: this.username,
            timestamp: message.timestamp
        };

        await this.sendFileMessage(fileInfo);

        // 发送文件块
        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.fileChunkSize;
            const end = Math.min(start + this.fileChunkSize, base64.length);
            const chunk = base64.substring(start, end);

            const chunkMessage = {
                type: 'file-chunk',
                fileId: fileId,
                chunkIndex: i,
                chunkData: chunk,
                totalChunks: totalChunks
            };

            await this.sendFileMessage(chunkMessage);
            this.updateProgress((i + 1) / totalChunks * 100);
        }

        this.hideProgress();
    }

    updateProgress(percent) {
        this.uploadProgress.classList.remove('hidden');
        this.progressFill.style.width = percent + '%';
        this.progressText.textContent = `上传中... ${Math.round(percent)}%`;
    }

    hideProgress() {
        setTimeout(() => {
            this.uploadProgress.classList.add('hidden');
            this.progressFill.style.width = '0%';
        }, 500);
    }

    displayFileMessage(message, isOwn) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;

        const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        let mediaHtml = '';
        if (message.type === 'file' && message.fileData) {
            const dataUrl = `data:${message.fileType};base64,${message.fileData}`;
            if (message.fileType.startsWith('image/')) {
                mediaHtml = `<div class="message-media"><img src="${dataUrl}" alt="${message.fileName}"></div>`;
            } else if (message.fileType.startsWith('video/')) {
                mediaHtml = `<div class="message-media"><video controls><source src="${dataUrl}" type="${message.fileType}"></video></div>`;
            } else if (message.fileType.startsWith('audio/')) {
                mediaHtml = `<div class="message-media"><audio controls><source src="${dataUrl}" type="${message.fileType}"></audio></div>`;
            }
        }

        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-username">${this.escapeHtml(message.username)}</span>
                <span class="message-time">${time}</span>
            </div>
            ${mediaHtml}
            <div class="message-content">${this.escapeHtml(message.fileName)}</div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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
        this.fileBtn.disabled = true;
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
