# e2e-chat（VPS 部署版）

一个纯前端的端对端加密群聊页面，配套一个 **VPS 上运行的 WebSocket 信令服务**，实现跨设备（手机/电脑）加入同一房间并建立 WebRTC 连接。

## 你现在遇到的现象解释

- **同一浏览器两个标签能连上**：因为同设备/同浏览器环境可以用本地信令（BroadcastChannel 等）或更容易完成协商。
- **跨设备连不上**：跨设备必须要一个“双方都能访问到”的信令服务，用来中转 `offer/answer/ice-candidate`。
- **加入者互相收不到消息**：如果连接拓扑是“所有加入者只连创建者”，则加入者之间天然收不到。当前前端已实现“创建者中继转发密文”，让加入者之间也能互相看到消息/图片（仍保持端到端加密）。

## 目录结构（关键文件）

- `index.html`：页面
- `styles.css`：样式
- `app.js`：前端逻辑（WebRTC + AES-GCM + 文件分块）
- `server.js`：VPS 版服务端（静态托管 + WebSocket 信令 `/ws`）
- `package.json`：Node 依赖与启动脚本

> 你也可能看到 `worker.js/wrangler.toml`：那是 Cloudflare Workers 的信令实现，VPS 部署不需要它们。

## VPS 一键启动（推荐）

### 1) 在 VPS 上安装 Node.js（建议 18+）

### 2) 拉取代码并安装依赖

```bash
git clone https://github.com/zhaolu1206/e2e-chat.git
cd e2e-chat
npm install
```

### 3) 启动服务

```bash
PORT=8787 npm start
```

此时：
- 页面：`http://你的VPSIP:8787/`
- 信令：`ws://你的VPSIP:8787/ws`

前端默认会使用 **同域** `/ws` 作为信令（无需额外配置）。

## 生产部署建议（HTTPS）

WebRTC 在手机端/跨站点使用时通常需要 HTTPS（除 `localhost` 外）。

推荐用 Nginx/Caddy 做反向代理，提供 HTTPS 并把 WebSocket `/ws` 透传。

Nginx 反代示例（只示意）：

```nginx
location /ws {
  proxy_pass http://127.0.0.1:8787/ws;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}

location / {
  proxy_pass http://127.0.0.1:8787/;
}
```

## 使用方式

1. 打开页面
2. 输入昵称 + 房间 ID
3. 创建者点击“创建房间”
4. 其他人输入同一个房间 ID 点击“加入房间”

## 常见问题

### 手机一直“正在连接”

- 确认你是通过 HTTPS 访问（建议）
- 确认 VPS 的 `8787` 端口对外开放（或反代已配置）
- 如果你在内网，确认手机和 VPS/电脑能互相访问到端口

