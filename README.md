# 端对端加密群聊 Web 应用

一个完全在客户端实现的端对端加密群聊应用，支持部署到 Cloudflare Pages 或 GitHub Pages。

## ✨ 特性

- 🔒 **端对端加密** - 使用 Web Crypto API (AES-GCM) 加密所有消息和文件
- 💬 **实时群聊** - 使用 WebRTC DataChannel 实现点对点通信
- 📸 **多媒体支持** - 支持发送图片、视频和语音消息
- 🖼️ **图片压缩** - 自动压缩图片以优化传输
- 📦 **文件分块传输** - 大文件自动分块传输，支持可靠传输
- 🌐 **纯静态部署** - 无需后端服务器，可直接部署到静态托管服务
- 🚀 **多平台支持** - 支持 Cloudflare Pages 和 GitHub Pages
- 🎨 **现代化 UI** - 美观的用户界面，响应式设计
- 🔐 **安全通信** - 所有消息和文件在客户端加密，服务器无法读取

## 🛠 技术栈

- **前端**: 纯 HTML/CSS/JavaScript (ES6+)
- **实时通信**: WebRTC DataChannel (P2P)
- **加密**: Web Crypto API (AES-GCM 256位)
- **信令**: BroadcastChannel (同浏览器) 或 WebSocket (跨设备)
- **STUN 服务器**: Google 公共 STUN 服务器

## 📦 项目结构

```
e2e-group-chat/
├── index.html          # 主页面
├── styles.css          # 样式文件
├── app-improved.js     # 主应用逻辑（支持 WebSocket 和本地模式）
├── app.js              # 基础版本（仅本地模式）
├── worker.js           # Cloudflare Workers 信令服务器（可选）
├── wrangler.toml       # Cloudflare Workers 配置
├── package.json        # 项目配置
├── README.md           # 本文件
├── DEPLOY.md           # 详细部署指南
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Actions 部署配置
```

## 🚀 快速开始

### 本地运行

```bash
# 克隆或下载项目
cd e2e-group-chat

# 使用 Python 启动本地服务器
python3 -m http.server 8000

# 或使用 Node.js
npx serve .

# 在浏览器访问 http://localhost:8000
```

### 部署到 GitHub Pages

1. 将代码推送到 GitHub 仓库
2. 在仓库 Settings > Pages 中：
   - Source 选择 "GitHub Actions"（推荐）或 "Deploy from a branch"
   - 如果选择分支部署，选择 `main` 分支和 `/ (root)` 文件夹
3. 等待部署完成，访问 `https://你的用户名.github.io/仓库名/`

详细步骤请参考：
- **Cloudflare Pages**: [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) - 超详细部署教程
- **GitHub Pages**: [DEPLOY.md](DEPLOY.md) - 快速部署指南

### 部署到 Cloudflare Pages

**📖 超详细教程**: 请查看 [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) 获取完整的、带截图的详细部署教程。

快速步骤：
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 Workers & Pages > Create Application > Pages > Connect to Git
3. 选择你的 GitHub 仓库
4. 配置：
   - Build command: （留空）
   - Build output directory: `/`
5. 点击 Save and Deploy

## 📖 使用方法

### 上传到 GitHub

**详细教程**: 查看 [GIT-UPLOAD.md](GIT-UPLOAD.md) 获取完整的上传指南。

**快速方法**:
```bash
cd /home/luke/e2e-group-chat
./upload-to-github.sh
```

或手动执行：
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

### 使用应用

1. **打开应用** - 在浏览器中访问部署的地址
2. **输入昵称** - 输入你想要显示的昵称
3. **创建或加入房间** - 输入房间 ID（或点击"生成随机房间 ID"）
4. **分享房间 ID** - 将房间 ID 分享给其他人，他们可以使用相同的房间 ID 加入
5. **开始聊天** - 输入消息并发送，所有消息都是端对端加密的

## 🔒 安全特性

- **端对端加密**: 所有消息使用 AES-GCM 256位加密
- **密钥派生**: 使用 PBKDF2 从房间 ID 派生加密密钥
- **P2P 通信**: 消息直接在对等点之间传输，不经过服务器
- **房间隔离**: 只有知道房间 ID 的用户才能加入和读取消息

## ⚠️ 注意事项

1. **HTTPS 要求**: WebRTC 和 Web Crypto API 需要 HTTPS 环境（localhost 除外）
2. **同浏览器限制**: 使用 BroadcastChannel 时，只能在同一浏览器的不同标签页之间连接
3. **跨设备连接**: 要实现真正的跨设备连接，需要部署 WebSocket 信令服务器
4. **NAT 穿透**: 某些网络环境可能无法建立 P2P 连接，需要 TURN 服务器

## 🔧 高级配置

### 启用 WebSocket 信令服务器

1. 部署 `worker.js` 到 Cloudflare Workers（需要 Durable Objects）
2. 修改 `app-improved.js` 中的 `getWebSocketUrl()` 函数
3. 指向你的 WebSocket 信令服务器地址

### 添加 TURN 服务器

如果需要支持更复杂的网络环境，可以在 `app-improved.js` 的 `configuration.iceServers` 中添加 TURN 服务器：

```javascript
{
    urls: 'turn:your-turn-server.com:3478',
    username: 'your-username',
    credential: 'your-password'
}
```

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 支持

如有问题或建议，请提交 GitHub Issue。
