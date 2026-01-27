# 如何将项目文件上传到 GitHub 存储库

本指南将详细说明如何将本地项目文件上传到 GitHub 存储库。

## 📋 前置准备

1. **已创建 GitHub 存储库** - 如果没有，请先创建
2. **已安装 Git** - 检查是否已安装：`git --version`
3. **项目文件已准备好** - 确保所有文件都在项目目录中

## 🔍 方法一：使用 Git 命令行（推荐）

这是最常用和推荐的方法，适合所有操作系统。

### 步骤 1: 检查 Git 是否已安装

打开终端（Linux/Mac）或命令提示符/PowerShell（Windows），运行：

```bash
git --version
```

如果显示版本号（如 `git version 2.34.1`），说明已安装。如果没有，需要先安装 Git：

- **Linux**: `sudo apt install git` (Ubuntu/Debian) 或 `sudo yum install git` (CentOS/RHEL)
- **Mac**: 通常已预装，或使用 Homebrew: `brew install git`
- **Windows**: 下载安装 [Git for Windows](https://git-scm.com/download/win)

### 步骤 2: 进入项目目录

```bash
cd /home/luke/e2e-group-chat
```

### 步骤 3: 初始化 Git 仓库（如果还没有）

检查是否已经是 Git 仓库：

```bash
ls -la | grep .git
```

如果没有 `.git` 文件夹，需要初始化：

```bash
git init
```

### 步骤 4: 配置 Git 用户信息（首次使用需要）

如果这是你第一次使用 Git，需要配置你的身份信息：

```bash
# 设置用户名（替换为你的 GitHub 用户名）
git config --global user.name "你的GitHub用户名"

# 设置邮箱（替换为你的 GitHub 邮箱）
git config --global user.email "your-email@example.com"
```

**注意**: 只需要配置一次，之后所有项目都会使用这个配置。

### 步骤 5: 添加所有文件到暂存区

```bash
# 添加所有文件
git add .

# 或者添加特定文件
# git add index.html styles.css app-improved.js
```

**说明**:
- `git add .` 会添加当前目录下的所有文件（除了 `.gitignore` 中忽略的文件）
- 如果只想添加特定文件，可以指定文件名

### 步骤 6: 提交文件到本地仓库

```bash
git commit -m "Initial commit: 端对端加密群聊应用"
```

**说明**:
- `-m` 后面是提交信息，描述这次提交做了什么
- 提交信息应该清晰明了，方便以后查看历史

### 步骤 7: 添加远程仓库地址

首先，你需要获取你的 GitHub 仓库地址：

1. 打开你的 GitHub 仓库页面
2. 点击绿色的 `Code` 按钮
3. 复制 HTTPS 地址（格式：`https://github.com/用户名/仓库名.git`）

然后在终端运行：

```bash
# 替换为你的实际仓库地址
git remote add origin https://github.com/你的用户名/你的仓库名.git
```

**示例**:
```bash
git remote add origin https://github.com/zhangsan/e2e-group-chat.git
```

### 步骤 8: 验证远程仓库地址

```bash
git remote -v
```

应该显示你刚才添加的远程仓库地址。

### 步骤 9: 推送到 GitHub

```bash
# 首次推送，设置上游分支
git branch -M main
git push -u origin main
```

**说明**:
- `git branch -M main` 将当前分支重命名为 `main`（GitHub 默认分支名）
- `git push -u origin main` 推送到远程仓库的 `main` 分支
- `-u` 参数设置上游分支，以后可以直接使用 `git push`

### 步骤 10: 输入 GitHub 凭证

推送时，GitHub 会要求你输入凭证：

1. **用户名**: 输入你的 GitHub 用户名
2. **密码**: 输入你的 GitHub **Personal Access Token**（不是账户密码）

**重要**: GitHub 从 2021 年 8 月起不再接受账户密码，需要使用 Personal Access Token。

#### 如何创建 Personal Access Token:

1. 登录 GitHub
2. 点击右上角头像 > `Settings`
3. 左侧菜单最下方，点击 `Developer settings`
4. 点击 `Personal access tokens` > `Tokens (classic)`
5. 点击 `Generate new token` > `Generate new token (classic)`
6. 填写信息：
   - **Note**: 给 token 起个名字，如 "本地开发"
   - **Expiration**: 选择过期时间（建议 90 天或更长）
   - **Select scopes**: 勾选 `repo`（完整仓库访问权限）
7. 点击 `Generate token`
8. **重要**: 复制生成的 token（只显示一次，务必保存）

#### 使用 Token:

当 Git 要求输入密码时，直接粘贴你的 Personal Access Token。

### 步骤 11: 验证上传成功

推送完成后，刷新你的 GitHub 仓库页面，应该能看到所有文件。

## 🔄 后续更新文件

当你修改了文件，需要再次上传时：

```bash
# 1. 进入项目目录
cd /home/luke/e2e-group-chat

# 2. 查看修改的文件
git status

# 3. 添加修改的文件
git add .

# 4. 提交更改
git commit -m "更新：描述你做了什么修改"

# 5. 推送到 GitHub
git push
```

## 🖥️ 方法二：使用 GitHub Desktop（图形界面）

如果你不熟悉命令行，可以使用 GitHub Desktop 图形界面工具。

### 步骤 1: 下载安装 GitHub Desktop

访问 [desktop.github.com](https://desktop.github.com) 下载并安装。

### 步骤 2: 登录 GitHub 账户

打开 GitHub Desktop，使用你的 GitHub 账户登录。

### 步骤 3: 添加本地仓库

1. 点击 `File` > `Add Local Repository`
2. 点击 `Choose...` 选择项目文件夹（`/home/luke/e2e-group-chat`）
3. 点击 `Add Repository`

### 步骤 4: 发布到 GitHub

1. 点击 `Publish repository` 按钮
2. 填写信息：
   - **Name**: 仓库名称
   - **Description**: 仓库描述（可选）
   - **Keep this code private**: 是否设为私有（可选）
3. 点击 `Publish Repository`

### 步骤 5: 后续更新

修改文件后：
1. 在 GitHub Desktop 中会显示修改的文件
2. 在左下角填写提交信息
3. 点击 `Commit to main`
4. 点击 `Push origin` 推送到 GitHub

## 🌐 方法三：直接在 GitHub 网页上传（不推荐）

适用于文件很少的情况，不推荐用于整个项目。

### 步骤 1: 进入仓库页面

打开你的 GitHub 仓库页面。

### 步骤 2: 上传文件

1. 点击 `Add file` > `Upload files`
2. 将文件拖拽到页面，或点击 `choose your files` 选择文件
3. 在页面底部填写提交信息
4. 点击 `Commit changes`

**缺点**: 
- 一次只能上传有限数量的文件
- 无法批量上传整个文件夹结构
- 不适合大型项目

## 🐛 常见问题

### 问题 1: 提示 "remote origin already exists"

**原因**: 已经添加过远程仓库

**解决**:
```bash
# 查看现有远程仓库
git remote -v

# 如果需要更换，先删除
git remote remove origin

# 然后重新添加
git remote add origin https://github.com/你的用户名/你的仓库名.git
```

### 问题 2: 推送时提示 "Authentication failed"

**原因**: 凭证错误或过期

**解决**:
1. 检查用户名是否正确
2. 确认使用的是 Personal Access Token 而不是密码
3. 如果 token 过期，创建新的 token
4. 可以清除保存的凭证后重试：
   ```bash
   git credential-cache exit  # Linux
   # 或
   git credential-manager-core erase  # Windows
   ```

### 问题 3: 提示 "failed to push some refs"

**原因**: 远程仓库有本地没有的提交（比如在网页上创建了 README）

**解决**:
```bash
# 先拉取远程更改
git pull origin main --allow-unrelated-histories

# 解决可能的冲突后，再推送
git push -u origin main
```

### 问题 4: 某些文件没有上传

**原因**: 可能被 `.gitignore` 忽略了

**解决**:
1. 检查 `.gitignore` 文件内容
2. 如果确实需要上传被忽略的文件：
   ```bash
   git add -f 文件名  # -f 强制添加
   git commit -m "添加被忽略的文件"
   git push
   ```

### 问题 5: 上传了不想上传的文件

**解决**:
1. 从 Git 中删除（但保留本地文件）：
   ```bash
   git rm --cached 文件名
   git commit -m "移除不需要的文件"
   git push
   ```
2. 将文件添加到 `.gitignore`，防止以后误上传

## 📝 完整命令示例

以下是完整的命令序列（假设你已经创建了 GitHub 仓库）：

```bash
# 1. 进入项目目录
cd /home/luke/e2e-group-chat

# 2. 初始化 Git（如果还没有）
git init

# 3. 配置用户信息（首次使用）
git config --global user.name "你的GitHub用户名"
git config --global user.email "your-email@example.com"

# 4. 添加所有文件
git add .

# 5. 提交
git commit -m "Initial commit: 端对端加密群聊应用"

# 6. 添加远程仓库（替换为你的实际地址）
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 7. 推送到 GitHub
git branch -M main
git push -u origin main
```

## ✅ 验证上传成功

上传完成后，检查：

1. **刷新 GitHub 仓库页面**，应该能看到所有文件
2. **检查文件结构**，确保所有文件都在
3. **检查文件内容**，点击文件查看内容是否正确

## 🎉 完成！

恭喜！你的项目文件已经成功上传到 GitHub。

### 下一步

1. **配置 Cloudflare Pages**: 参考 [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md)
2. **配置 GitHub Pages**: 参考 [DEPLOY.md](DEPLOY.md)
3. **继续开发**: 修改文件后使用 `git add`, `git commit`, `git push` 更新

## 💡 提示

1. **定期提交**: 每完成一个功能就提交一次，不要等到最后
2. **清晰的提交信息**: 提交信息要描述清楚做了什么
3. **使用分支**: 对于大型项目，建议使用分支开发
4. **备份重要数据**: Git 是版本控制，但重要数据还是要额外备份

## 📚 相关文档

- [Git 官方文档](https://git-scm.com/doc)
- [GitHub 帮助文档](https://docs.github.com)
- [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) - Cloudflare Pages 部署教程

如有问题，请查看上述文档或提交 Issue。
