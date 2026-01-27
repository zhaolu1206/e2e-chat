# 快速开始指南

## 🚀 5 分钟快速部署

### 选项 1: Cloudflare Pages（推荐）

**详细教程**: 查看 [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md)

**快速步骤**:
1. 将代码推送到 GitHub
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
3. Workers & Pages > Create Application > Pages > Connect to Git
4. 选择仓库，构建设置留空，输出目录填 `/`
5. 点击 Save and Deploy

### 选项 2: GitHub Pages

**详细教程**: 查看 [DEPLOY.md](DEPLOY.md)

**快速步骤**:
1. 将代码推送到 GitHub
2. 仓库 Settings > Pages
3. Source 选择 "GitHub Actions" 或 "Deploy from a branch"
4. 等待部署完成

## 🧪 本地测试

```bash
cd /home/luke/e2e-group-chat
python3 -m http.server 8000
```

访问: http://localhost:8000

## 📚 完整文档

- [README.md](README.md) - 项目总览
- [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) - Cloudflare Pages 详细部署教程
- [DEPLOY.md](DEPLOY.md) - 部署指南
- [TESTING.md](TESTING.md) - 测试指南
