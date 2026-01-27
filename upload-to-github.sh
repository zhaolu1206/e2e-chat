#!/bin/bash

# GitHub 上传脚本
# 使用方法: ./upload-to-github.sh

echo "🚀 开始上传项目到 GitHub..."
echo ""

# 检查是否在项目目录
if [ ! -f "index.html" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查 Git 是否已安装
if ! command -v git &> /dev/null; then
    echo "❌ 错误: 未安装 Git，请先安装 Git"
    exit 1
fi

# 检查是否已初始化 Git
if [ ! -d ".git" ]; then
    echo "📦 初始化 Git 仓库..."
    git init
fi

# 检查是否已配置用户信息
if [ -z "$(git config user.name)" ]; then
    echo "⚠️  未配置 Git 用户信息"
    read -p "请输入你的 GitHub 用户名: " GIT_USERNAME
    read -p "请输入你的 GitHub 邮箱: " GIT_EMAIL
    git config --global user.name "$GIT_USERNAME"
    git config --global user.email "$GIT_EMAIL"
    echo "✅ 用户信息已配置"
fi

# 添加所有文件
echo "📝 添加文件到暂存区..."
git add .

# 检查是否有更改
if git diff --staged --quiet; then
    echo "ℹ️  没有需要提交的更改"
else
    # 提交
    echo "💾 提交更改..."
    read -p "请输入提交信息 (默认: Update files): " COMMIT_MSG
    COMMIT_MSG=${COMMIT_MSG:-"Update files"}
    git commit -m "$COMMIT_MSG"
    echo "✅ 文件已提交"
fi

# 检查是否已设置远程仓库
if ! git remote | grep -q "origin"; then
    echo "🔗 设置远程仓库..."
    read -p "请输入你的 GitHub 仓库地址 (例如: https://github.com/用户名/仓库名.git): " REPO_URL
    if [ -z "$REPO_URL" ]; then
        echo "❌ 错误: 仓库地址不能为空"
        exit 1
    fi
    git remote add origin "$REPO_URL"
    echo "✅ 远程仓库已设置"
fi

# 显示当前分支
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
echo "📌 当前分支: $CURRENT_BRANCH"

# 如果分支不是 main，重命名为 main
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "🔄 重命名分支为 main..."
    git branch -M main
fi

# 推送
echo "⬆️  推送到 GitHub..."
echo "⚠️  如果提示输入密码，请使用你的 GitHub Personal Access Token（不是账户密码）"
echo ""

if git push -u origin main 2>&1; then
    echo ""
    echo "✅ 成功！文件已上传到 GitHub"
    echo ""
    # 获取仓库 URL
    REPO_URL=$(git remote get-url origin)
    REPO_URL=${REPO_URL%.git}  # 移除 .git 后缀
    echo "🌐 你的仓库地址: $REPO_URL"
else
    echo ""
    echo "❌ 推送失败"
    echo ""
    echo "可能的原因:"
    echo "1. 未设置 Personal Access Token（GitHub 不再接受密码）"
    echo "2. Token 已过期"
    echo "3. 网络连接问题"
    echo ""
    echo "请查看 GIT-UPLOAD.md 获取详细帮助"
fi
