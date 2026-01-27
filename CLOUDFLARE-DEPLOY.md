# Cloudflare Pages 详细部署教程

本教程将详细指导你如何将端对端加密群聊应用部署到 Cloudflare Pages。

## 📋 前置要求

1. **Cloudflare 账户** - 如果没有，请访问 [cloudflare.com](https://www.cloudflare.com) 免费注册
2. **GitHub 账户** - 用于托管代码（推荐）
3. **Git 工具** - 用于版本控制（可选，如果使用 GitHub）

## 🚀 方法一：通过 GitHub 连接部署（推荐）

这是最简单的方法，支持自动部署和持续集成。

### 步骤 1: 准备 GitHub 仓库

#### 1.1 创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角的 `+` 号，选择 `New repository`
3. 填写仓库信息：
   - **Repository name**: `e2e-group-chat`（或你喜欢的名字）
   - **Description**: `端对端加密群聊应用`
   - **Visibility**: 选择 `Public`（免费账户）或 `Private`
   - **不要**勾选 "Initialize this repository with a README"（如果本地已有代码）
4. 点击 `Create repository`

#### 1.2 将本地代码推送到 GitHub

在项目目录中执行以下命令：

```bash
cd /home/luke/e2e-group-chat

# 初始化 Git 仓库（如果还没有）
git init

# 添加所有文件
git add .

# 提交更改
git commit -m "Initial commit: 端对端加密群聊应用"

# 添加远程仓库（替换 YOUR_USERNAME 和 YOUR_REPO_NAME）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

**注意**: 将 `YOUR_USERNAME` 替换为你的 GitHub 用户名，`YOUR_REPO_NAME` 替换为你的仓库名。

### 步骤 2: 在 Cloudflare 中创建 Pages 项目

#### 2.1 登录 Cloudflare Dashboard

1. 访问 [dash.cloudflare.com](https://dash.cloudflare.com)
2. 使用你的 Cloudflare 账户登录

#### 2.2 进入 Pages 页面

1. 在左侧导航栏，找到并点击 `Workers & Pages`
2. 点击 `Create Application` 按钮
3. 选择 `Pages` 标签页
4. 点击 `Connect to Git` 按钮

#### 2.3 连接 GitHub 账户

1. 如果这是第一次连接，Cloudflare 会要求你授权：
   - 点击 `Authorize Cloudflare Pages`
   - 选择你的 GitHub 账户
   - 点击 `Authorize Cloudflare`
   - 可能需要输入 GitHub 密码确认

2. 如果已经授权过，直接选择你的 GitHub 账户

#### 2.4 选择仓库

1. 在仓库列表中找到你的 `e2e-group-chat` 仓库
2. 点击仓库名称选择它
3. 点击 `Begin setup` 按钮

### 步骤 3: 配置构建设置

在配置页面中，填写以下信息：

#### 3.1 项目名称

- **Project name**: `e2e-group-chat`（或你喜欢的名字）
- 这将用于生成你的网站 URL：`https://e2e-group-chat.pages.dev`

#### 3.2 生产分支

- **Production branch**: `main`（或 `master`，取决于你的默认分支）

#### 3.3 构建设置（重要！）

由于这是一个纯静态网站，**不需要构建步骤**：

- **Framework preset**: 选择 `None` 或 `Plain HTML`
- **Build command**: **留空**（不要填写任何内容）
- **Build output directory**: 填写 `/` 或 `.`（表示根目录）

#### 3.4 环境变量

- **Environment variables**: 不需要设置，留空即可

#### 3.5 完成配置

1. 检查所有设置是否正确
2. 点击 `Save and Deploy` 按钮

### 步骤 4: 等待部署完成

1. Cloudflare 会自动开始部署过程
2. 你会看到一个部署进度页面
3. 通常需要 1-3 分钟完成首次部署
4. 部署完成后，你会看到：
   - ✅ 绿色的成功标记
   - 你的网站 URL（例如：`https://e2e-group-chat.pages.dev`）

### 步骤 5: 访问你的网站

1. 点击部署成功页面上的网站 URL
2. 或者在 Cloudflare Dashboard 中：
   - 进入 `Workers & Pages` > `Pages`
   - 点击你的项目名称
   - 在 `Deployments` 标签页中，点击最新的部署
   - 点击 `Visit site` 按钮

## 🔄 方法二：使用 Wrangler CLI 部署

如果你更喜欢使用命令行工具，可以使用 Wrangler CLI。

### 步骤 1: 安装 Wrangler

```bash
# 使用 npm 全局安装
npm install -g wrangler

# 或使用 yarn
yarn global add wrangler
```

### 步骤 2: 登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器，要求你授权 Wrangler 访问你的 Cloudflare 账户。

### 步骤 3: 部署到 Cloudflare Pages

```bash
cd /home/luke/e2e-group-chat

# 部署到 Cloudflare Pages
wrangler pages deploy . --project-name=e2e-group-chat
```

### 步骤 4: 查看部署结果

部署完成后，Wrangler 会显示你的网站 URL。

## 📝 方法三：直接上传文件（不推荐）

如果你不想使用 Git，也可以直接上传文件：

1. 在 Cloudflare Dashboard 中，进入 `Workers & Pages` > `Pages`
2. 点击 `Create a project`
3. 选择 `Upload assets` 选项
4. 将项目文件夹中的所有文件打包成 ZIP
5. 上传 ZIP 文件
6. 填写项目名称
7. 点击 `Deploy site`

**注意**: 这种方法不支持自动更新，每次更新都需要手动上传。

## 🔧 配置自定义域名（可选）

### 步骤 1: 添加自定义域名

1. 在 Cloudflare Dashboard 中，进入你的 Pages 项目
2. 点击 `Custom domains` 标签页
3. 点击 `Set up a custom domain`
4. 输入你的域名（例如：`chat.yourdomain.com`）
5. 点击 `Continue`

### 步骤 2: 配置 DNS

Cloudflare 会显示需要添加的 DNS 记录：

1. 在你的域名 DNS 设置中添加 CNAME 记录：
   - **Name**: `chat`（或你想要的子域名）
   - **Target**: `你的项目名.pages.dev`
   - **Proxy status**: 启用（橙色云朵）

2. 等待 DNS 传播（通常几分钟到几小时）

### 步骤 3: 验证域名

DNS 配置完成后，Cloudflare 会自动验证并激活你的自定义域名。

## 🔄 自动部署配置

### 自动部署的工作原理

当你使用 GitHub 连接方法时：

1. 每次你推送代码到 `main` 分支，Cloudflare 会自动触发新的部署
2. 部署过程通常需要 1-3 分钟
3. 部署完成后，新版本会自动上线

### 查看部署历史

1. 在 Cloudflare Dashboard 中，进入你的 Pages 项目
2. 点击 `Deployments` 标签页
3. 你可以看到所有的部署历史：
   - 部署时间
   - 部署状态（成功/失败）
   - 关联的 Git 提交
   - 部署预览 URL

### 回滚到之前的版本

如果新部署有问题，可以回滚：

1. 在 `Deployments` 标签页中，找到之前的成功部署
2. 点击该部署右侧的 `...` 菜单
3. 选择 `Retry deployment` 或 `Rollback to this deployment`

## 🐛 常见问题排查

### 问题 1: 部署失败

**症状**: 部署状态显示失败（红色标记）

**可能原因和解决方案**:

1. **构建命令错误**
   - 检查 `Build command` 是否留空
   - 如果填写了命令，确保命令正确

2. **输出目录错误**
   - 确保 `Build output directory` 设置为 `/` 或 `.`

3. **文件路径错误**
   - 确保 `index.html` 在项目根目录

**解决方法**:
- 进入项目设置，检查构建设置
- 查看部署日志，找到具体错误信息
- 根据错误信息修复问题

### 问题 2: 网站显示 404 错误

**症状**: 访问网站显示 404 Not Found

**可能原因和解决方案**:

1. **index.html 不在根目录**
   - 确保 `index.html` 在项目根目录
   - 检查文件结构是否正确

2. **输出目录配置错误**
   - 确保 `Build output directory` 设置为 `/`

**解决方法**:
- 检查项目文件结构
- 重新配置构建输出目录
- 重新部署

### 问题 3: 静态资源无法加载

**症状**: CSS 或 JavaScript 文件无法加载

**可能原因**:

1. **文件路径错误**
   - 检查 HTML 中的资源路径是否正确
   - 确保使用相对路径（如 `./styles.css` 而不是 `/styles.css`）

2. **文件未提交到 Git**
   - 确保所有文件都已推送到 GitHub

**解决方法**:
- 检查浏览器控制台的错误信息
- 验证所有文件都在仓库中
- 检查文件路径是否正确

### 问题 4: WebRTC 连接失败

**症状**: 无法与其他用户建立连接

**可能原因**:

1. **HTTPS 要求**
   - WebRTC 需要 HTTPS（Cloudflare Pages 默认提供）

2. **STUN 服务器问题**
   - 某些网络环境可能无法访问 Google STUN 服务器

**解决方法**:
- 确认网站使用 HTTPS
- 检查浏览器控制台的错误信息
- 考虑添加 TURN 服务器（需要配置）

### 问题 5: 部署速度慢

**症状**: 部署需要很长时间

**可能原因**:
- 首次部署通常较慢
- 网络问题
- Cloudflare 服务器负载

**解决方法**:
- 等待部署完成（通常 1-3 分钟）
- 如果超过 5 分钟，检查部署日志
- 可以尝试重新部署

## 📊 监控和统计

### 查看访问统计

1. 在 Cloudflare Dashboard 中，进入你的 Pages 项目
2. 点击 `Analytics` 标签页
3. 你可以看到：
   - 访问量
   - 带宽使用
   - 请求数
   - 错误率

### 查看实时日志

1. 在项目页面，点击 `Functions` 标签页
2. 可以查看实时请求日志和错误日志

## 🔐 安全设置

### 启用 HTTPS

Cloudflare Pages 默认启用 HTTPS，无需额外配置。

### 设置访问限制（可选）

如果你想让网站仅限特定用户访问：

1. 在项目设置中，找到 `Access` 或 `Security` 选项
2. 可以设置：
   - IP 访问限制
   - 密码保护
   - 单点登录（SSO）

## 📱 测试部署

部署完成后，建议进行以下测试：

1. **基本功能测试**:
   - [ ] 页面可以正常加载
   - [ ] CSS 样式正确应用
   - [ ] JavaScript 功能正常

2. **WebRTC 测试**:
   - [ ] 可以输入昵称和房间 ID
   - [ ] 可以加入房间
   - [ ] 可以发送和接收消息
   - [ ] 多个标签页可以互相通信

3. **加密测试**:
   - [ ] 打开浏览器开发者工具
   - [ ] 检查 Network 标签
   - [ ] 确认消息是加密传输的

## 🎉 完成！

恭喜！你的端对端加密群聊应用已经成功部署到 Cloudflare Pages。

### 下一步

1. **分享你的网站**: 将网站 URL 分享给朋友测试
2. **自定义域名**: 配置你自己的域名（可选）
3. **监控使用**: 定期查看访问统计
4. **持续更新**: 推送代码更新会自动触发新部署

### 有用的链接

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Cloudflare Dashboard](https://dash.cloudflare.com)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)

## 💡 提示

1. **使用环境变量**: 如果需要配置不同的设置（如 API 密钥），可以使用环境变量
2. **预览部署**: 在合并到主分支前，可以使用预览部署测试
3. **性能优化**: Cloudflare Pages 自动提供 CDN 加速，全球访问速度快
4. **免费额度**: Cloudflare Pages 免费账户有足够的额度用于个人项目

如有任何问题，请查看 Cloudflare 官方文档或提交 Issue。
