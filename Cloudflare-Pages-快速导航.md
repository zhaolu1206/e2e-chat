# Cloudflare Pages 快速导航指南

## 🎯 问题：点击创建时默认是 Worker

当你进入 Cloudflare Dashboard 时，默认显示的是 **Workers**，需要手动切换到 **Pages**。

## 📍 正确的导航步骤

### 方法 1: 通过 Workers & Pages 切换

1. **登录 Cloudflare Dashboard**
   - 访问：https://dash.cloudflare.com
   - 使用你的账户登录

2. **进入 Workers & Pages**
   - 在左侧导航栏，点击 `Workers & Pages`

3. **切换到 Pages 标签** ⭐ **关键步骤**
   - 在页面**顶部**，你会看到两个标签：
     ```
     [Workers]  [Pages]  ← 点击这个！
     ```
   - 默认选中的是 `Workers`（通常是橙色或蓝色高亮）
   - **点击 `Pages` 标签**切换到 Pages 界面

4. **创建 Pages 项目**
   - 在 Pages 界面中，点击 `Create a project` 或 `Create Application` 按钮
   - 然后点击 `Connect to Git`

### 方法 2: 直接访问 Pages 页面（最快）

**直接打开这个链接**（需要先登录）：
👉 https://dash.cloudflare.com/?to=/:account/pages

这会直接跳转到 Pages 页面，跳过 Workers。

### 方法 3: 通过 URL 参数

在 Cloudflare Dashboard 中，URL 应该是：
```
https://dash.cloudflare.com/你的账户ID/workers-and-pages/pages
```

如果 URL 显示的是 `workers`，手动改成 `pages`。

## 🔍 如何区分 Workers 和 Pages 界面

### Workers 界面特征：
- 标题显示 "Workers"
- 有 "Create Application" 按钮
- 界面主要显示 Workers 列表
- URL 包含 `/workers`

### Pages 界面特征：
- 标题显示 "Pages"
- 有 "Create a project" 或 "Create Application" 按钮
- 界面显示 Pages 项目列表
- URL 包含 `/pages`
- 通常有 "Connect to Git" 选项

## 📸 视觉提示

在 Cloudflare Dashboard 中：

```
┌─────────────────────────────────────────┐
│  Workers & Pages                        │
├─────────────────────────────────────────┤
│  [Workers] [Pages]  ← 点击 Pages！      │
│    ↑默认选中                              │
└─────────────────────────────────────────┘
```

## ✅ 确认你在正确的页面

在 Pages 页面，你应该看到：
- ✅ 页面标题是 "Pages"
- ✅ 有 "Create a project" 按钮
- ✅ 有 "Connect to Git" 选项
- ✅ URL 包含 `/pages`

## 🚀 找到 Pages 后的下一步

一旦进入 Pages 页面：

1. 点击 `Create a project` 或 `Create Application`
2. 点击 `Connect to Git`
3. 选择你的 GitHub 仓库：`zhaolu1206/e2e-chat`
4. 配置：
   - Project name: `e2e-chat`
   - Production branch: `main`
   - Build command: **留空**
   - Build output directory: `/`
5. 点击 `Save and Deploy`

## 💡 提示

- 如果找不到 Pages 标签，可能是账户权限问题
- 免费账户也支持 Pages，确保账户已激活
- 如果还是找不到，尝试刷新页面或清除浏览器缓存

## 🆘 仍然找不到？

如果按照上述步骤仍然找不到 Pages：

1. **检查账户类型**：确保是 Cloudflare 账户（不是只有域名）
2. **尝试直接链接**：https://dash.cloudflare.com/?to=/:account/pages
3. **联系支持**：如果账户有问题，可能需要联系 Cloudflare 支持

## 📚 相关文档

- 完整部署教程：`CLOUDFLARE-DEPLOY.md`
- Cloudflare Pages 官方文档：https://developers.cloudflare.com/pages/
