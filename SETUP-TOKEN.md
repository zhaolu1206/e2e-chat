# GitHub Personal Access Token 设置指南

## ⚠️ 重要提示

GitHub 从 2021 年 8 月起不再接受账户密码进行 Git 操作，必须使用 **Personal Access Token**。

## 🔑 创建 Personal Access Token

### 步骤 1: 登录 GitHub

访问 [github.com](https://github.com) 并使用你的账户登录。

### 步骤 2: 进入设置页面

1. 点击右上角你的头像
2. 点击 `Settings`（设置）

### 步骤 3: 进入 Developer settings

1. 在左侧菜单最下方，找到并点击 `Developer settings`
2. 点击 `Personal access tokens`
3. 点击 `Tokens (classic)`

### 步骤 4: 生成新 Token

1. 点击 `Generate new token` 按钮
2. 选择 `Generate new token (classic)`

### 步骤 5: 配置 Token

填写以下信息：

- **Note**（备注）: 给 token 起个名字，例如：`本地开发` 或 `e2e-group-chat`
- **Expiration**（过期时间）: 
  - 选择 `90 days`（90天）
  - 或 `No expiration`（永不过期，不推荐）
- **Select scopes**（选择权限）: 
  - ✅ 勾选 `repo`（完整仓库访问权限）
    - 这会自动勾选所有子权限

### 步骤 6: 生成并复制 Token

1. 滚动到页面底部
2. 点击绿色的 `Generate token` 按钮
3. **重要**: 立即复制生成的 token（只显示一次！）
   - Token 格式类似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - 如果丢失，需要重新生成

### 步骤 7: 保存 Token

将 Token 保存在安全的地方，以后推送代码时会用到。

## 📝 使用 Token

当 Git 要求输入密码时：

1. **Username**（用户名）: 输入你的 GitHub 用户名：`zhaolu1206`
2. **Password**（密码）: **粘贴你的 Personal Access Token**（不是账户密码！）

## 🔄 如果 Token 丢失或过期

如果 Token 丢失或过期：

1. 重新按照上述步骤创建新 Token
2. 使用新 Token 进行认证
3. 如果之前保存过凭证，可能需要清除：
   ```bash
   # Linux
   git credential-cache exit
   
   # 或清除所有保存的凭证
   git config --global --unset credential.helper
   ```

## 💡 提示

- Token 就像密码一样重要，不要分享给他人
- 如果怀疑 Token 泄露，立即在 GitHub 设置中删除并重新创建
- 建议为不同用途创建不同的 Token
- 定期检查并删除不再使用的 Token

## ✅ 验证 Token 是否有效

创建 Token 后，可以尝试推送代码验证：

```bash
cd /home/luke/e2e-group-chat
git push -u origin main
```

当提示输入密码时，使用 Token 即可。
