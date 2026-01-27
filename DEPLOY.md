# 部署指南

## GitHub Pages 部署

### 方法 1: 使用 GitHub Actions（推荐）

1. 将代码推送到 GitHub 仓库
2. 在仓库设置中：
   - 进入 Settings > Pages
   - Source 选择 "GitHub Actions"
3. 推送代码到 `main` 分支，GitHub Actions 会自动部署

### 方法 2: 手动部署

1. 在仓库设置中：
   - 进入 Settings > Pages
   - Source 选择 "Deploy from a branch"
   - Branch 选择 `main`，文件夹选择 `/ (root)`
2. 保存后，GitHub Pages 会自动部署

访问地址：`https://你的用户名.github.io/仓库名/`

## Cloudflare Pages 部署

**📖 详细教程**: 请查看 [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) 获取完整的、带截图的详细部署教程。

### 快速步骤

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 Workers & Pages > Create Application > Pages > Connect to Git
3. 选择你的 GitHub 仓库
4. 配置：
   - Project name: `e2e-group-chat`
   - Production branch: `main`
   - Build command: （留空）
   - Build output directory: `/`
5. 点击 Save and Deploy

访问地址：`https://你的项目名.pages.dev`

### 使用 Wrangler CLI

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署到 Cloudflare Pages
wrangler pages deploy . --project-name=e2e-group-chat
```

## 本地测试

```bash
# 使用 Python
python3 -m http.server 8000

# 或使用 Node.js
npx serve .

# 然后在浏览器访问 http://localhost:8000
```

## 注意事项

1. **HTTPS 要求**: WebRTC 和 Web Crypto API 需要 HTTPS 环境（localhost 除外）
2. **信令服务器**: 当前版本使用 BroadcastChannel（仅限同浏览器标签页）或可选的 WebSocket 信令服务器
3. **跨设备连接**: 要实现真正的跨设备连接，需要部署 WebSocket 信令服务器（Cloudflare Workers + Durable Objects）

## 高级配置：WebSocket 信令服务器

如果需要支持跨设备、跨网络的群聊，可以部署 WebSocket 信令服务器：

1. 使用 Cloudflare Workers + Durable Objects
2. 修改 `app-improved.js` 中的 `getWebSocketUrl()` 函数，指向你的信令服务器
3. 部署信令服务器到 Cloudflare Workers

## 安全建议

- 房间 ID 应该足够随机和复杂
- 不要在不安全的网络上使用
- 定期更换房间 ID
- 考虑实现密钥轮换机制
