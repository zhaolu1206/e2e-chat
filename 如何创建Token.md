# 🔑 如何创建 GitHub Personal Access Token

## 📍 方法一：直接链接（最快）

**直接点击这个链接**（需要先登录 GitHub）：
👉 **https://github.com/settings/tokens/new**

## 📍 方法二：手动导航

### 步骤 1: 登录 GitHub

1. 打开浏览器
2. 访问 [github.com](https://github.com)
3. 使用你的账户登录：
   - 用户名：`zhaolu1206`
   - 邮箱：`zhaolu1206@gmail.com`

### 步骤 2: 进入设置页面

1. 点击页面**右上角你的头像**（圆形头像图标）
2. 在下拉菜单中点击 **`Settings`**（设置）

### 步骤 3: 进入开发者设置

1. 在左侧菜单中，**向下滚动到最底部**
2. 找到并点击 **`Developer settings`**（开发者设置）

### 步骤 4: 进入 Token 页面

1. 在左侧菜单中，点击 **`Personal access tokens`**
2. 点击 **`Tokens (classic)`**

### 步骤 5: 创建新 Token

1. 点击 **`Generate new token`** 按钮
2. 选择 **`Generate new token (classic)`**

### 步骤 6: 填写 Token 信息

在页面中填写：

**Note（备注）**:
```
e2e-chat-upload
```
（给这个 Token 起个名字，方便以后识别）

**Expiration（过期时间）**:
- 点击下拉菜单
- 选择 **`90 days`**（90天）或 **`No expiration`**（永不过期）
- 建议选择 90 天，更安全

**Select scopes（选择权限）**:
- ✅ **勾选 `repo`**（完整仓库访问权限）
  - 这会自动勾选所有子权限：
    - ✅ repo:status
    - ✅ repo_deployment
    - ✅ public_repo
    - ✅ repo:invite
    - ✅ security_events

### 步骤 7: 生成 Token

1. **滚动到页面最底部**
2. 点击绿色的 **`Generate token`** 按钮
3. **重要**：页面会显示生成的 Token，格式类似：
   ```
   ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. **立即复制这个 Token**（只显示一次！）
   - 点击 Token 右侧的复制图标
   - 或手动选中并复制

### 步骤 8: 保存 Token

将 Token 保存在安全的地方，因为：
- Token 只显示一次
- 如果丢失，需要重新创建
- 以后推送代码时会用到

## 📤 使用 Token 推送代码

创建 Token 后，在终端执行：

```bash
cd /home/luke/e2e-group-chat
git push -u origin main
```

**当 Git 提示输入时**：

1. **Username（用户名）**: 
   ```
   zhaolu1206
   ```

2. **Password（密码）**: 
   ```
   粘贴你刚才复制的 Token
   ```
   ⚠️ **注意**：这里输入的是 Token，不是你的 GitHub 账户密码！

## 🎯 快速链接汇总

- **创建 Token**: https://github.com/settings/tokens/new
- **查看已有 Token**: https://github.com/settings/tokens
- **你的仓库**: https://github.com/zhaolu1206/e2e-chat

## ❓ 常见问题

### Q: Token 在哪里查看？

A: Token 创建后只显示一次。如果丢失：
1. 访问 https://github.com/settings/tokens
2. 可以看到 Token 列表，但看不到 Token 内容
3. 需要删除旧 Token 并重新创建

### Q: Token 格式是什么样的？

A: 格式类似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- 以 `ghp_` 开头
- 后面是一串随机字符

### Q: 输入 Token 时看不到字符？

A: 这是正常的，为了安全，密码输入时不会显示字符。直接粘贴后按回车即可。

### Q: 提示认证失败？

A: 可能的原因：
1. Token 复制不完整（确保复制完整）
2. Token 已过期（重新创建）
3. 用户名输入错误（应该是 `zhaolu1206`）

## ✅ 完成后的验证

推送成功后，访问你的仓库查看：
👉 https://github.com/zhaolu1206/e2e-chat

应该能看到所有上传的文件！
