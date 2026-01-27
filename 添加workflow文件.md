# 如何添加 GitHub Actions Workflow 文件

## ✅ 当前状态

你的代码已经成功上传到 GitHub！但是 `.github/workflows/deploy.yml` 文件被临时移除了，因为你的 Token 缺少 `workflow` 权限。

## 🔧 解决方案

### 方法 1: 在 GitHub 网页上直接添加（推荐，最简单）

1. 访问你的仓库：https://github.com/zhaolu1206/e2e-chat
2. 点击 `Add file` → `Create new file`
3. 在文件名输入框中输入：`.github/workflows/deploy.yml`
4. 复制以下内容并粘贴到编辑器中：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Pages
        uses: actions/configure-pages@v4
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

5. 滚动到底部，点击 `Commit new file`
6. 完成！

### 方法 2: 重新创建 Token 并添加 workflow 权限

如果你想通过命令行添加，需要：

1. 访问：https://github.com/settings/tokens/new
2. 填写信息：
   - Note: `e2e-chat-with-workflow`
   - Expiration: 90 days
   - ✅ 勾选 `repo` 权限
   - ✅ **勾选 `workflow` 权限**（重要！）
3. 生成新 Token
4. 然后执行：
   ```bash
   cd /home/luke/e2e-group-chat
   git add .github/workflows/deploy.yml
   git commit -m "添加 GitHub Pages 部署 workflow"
   git push
   ```
   （推送时使用新 Token）

## 📝 说明

- Workflow 文件用于自动部署到 GitHub Pages
- 如果你不需要自动部署，可以不用添加这个文件
- 即使没有这个文件，你的代码也已经成功上传了

## ✅ 验证

添加 workflow 文件后，访问：
https://github.com/zhaolu1206/e2e-chat

应该能看到 `.github/workflows/deploy.yml` 文件。
