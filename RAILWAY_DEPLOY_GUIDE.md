# 智选比价助手 - Railway 部署详细操作手册

> 适用于：本地代码已 push 到 GitHub，准备在 Railway 上完成部署并验证联通

---

## Step 3：Railway 注册 & 导入 GitHub 仓库（详细版）

### 3.1 注册 Railway

1. 打开浏览器访问：**https://railway.app**
2. 右上角点 **Login** → 选择 **Login with GitHub**
3. 弹窗授权页面 → 点 **Authorize Railway** → GitHub 登录

> 注册成功后会进入 Railway Dashboard（空白项目列表页）

### 3.2 新建项目并导入 GitHub 仓库

1. 点 **Dashboard** 中间的 **New Project**（紫色大按钮）
2. 在弹出菜单中选 **Deploy from GitHub repo**
3. 如果是第一次操作，Railway 会请求 GitHub 授权：
   - 点 **Install Railway** → 选择 **Only select repositories**
   - 选中你的 `smart-price-backend` 仓库 → 点 **Install**
4. 回到 Railway，刷新页面，在仓库列表中找到 `smart-price-backend`
5. 点击该仓库名 → Railway 开始首次构建（自动识别 `railway.toml` + `Dockerfile`）

#### 此刻发生什么

Railway 会：
- 拉取 GitHub 上的代码
- 按 `railway.toml` → `Dockerfile` 执行构建
- 构建日志实时显示在 **Deployments** 标签页

#### 预期首次构建结果

> **会失败** —— 因为还没有数据库插件，TypeORM 连接 MySQL 会报错，这是正常的，继续 Step 4 即可。

---

## Step 4：添加数据库插件（详细版）

### 4.1 添加 MySQL 插件

1. 在 Railway Dashboard 点你的 **smart-price-backend** 项目
2. 点 **+ New**（上方工具栏，紫色按钮）
3. 在弹出列表中找到 **MySQL** → 点击
4. Railway 自动创建 MySQL 实例，显示 **MYSQL** 卡片
5. 点开 **MYSQL** 卡片 → 上方标签页切到 **Variables**
6. 找到变量 `DATABASE_URL` → 点右侧 **Copy** 图标（先记下来，后面验证用）

### 4.2 添加 Redis 插件

1. 回到项目页面，再点 **+ New**
2. 找到 **Redis** → 点击
3. 自动创建 Redis 实例 → 点开 **REDIS** 卡片
4. 切到 **Variables** → 找到 `REDIS_URL` → Copy 备用

### 4.3 添加 MongoDB 插件

1. 点 **+ New**
2. 找到 **MongoDB** → 点击
3. 自动创建 MongoDB 实例 → 点开 **MONGODB** 卡片
4. 切到 **Variables** → 找到 `MONGO_URL` → Copy 备用

#### Railway 自动注入机制

添加插件后，Railway 会**自动**把对应连接变量注入到 **smart-price-backend** 服务的环境变量中：

| 变量名 | 来源 | 是否需手动填写 |
|--------|------|----------------|
| `DATABASE_URL` | MySQL 插件自动注入 | ❌ 不需要 |
| `REDIS_URL` | Redis 插件自动注入 | ❌ 不需要 |
| `MONGO_URL` | MongoDB 插件自动注入 | ❌ 不需要 |
| `PORT` | Railway 平台自动注入 | ❌ 不需要 |

> 点开你的 **smart-price-backend** 服务卡片 → **Variables** 标签页 → 可以看到这 4 个变量已存在

---

## Step 5：配置环境变量（详细版）

### 5.1 进入变量配置页

1. 点 **smart-price-backend** 服务卡片（不是插件卡片）
2. 上方标签页选 **Variables**
3. 点 **+ New Variable**（紫色按钮）

### 5.2 逐个添加以下 6 个变量

每次填完点 **Add** 保存，然后继续加下一个：

#### 变量 1：`NODE_ENV`

```
NODE_ENV=production
```

#### 变量 2：`JWT_SECRET`

建议用随机字符串，生成方式（本地终端执行）：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
把输出的 64 位十六进制字符串填入：
```
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 变量 3：`WECHAT_APPID`

如果已有小程序 AppID 就填真实值，否则先填测试值：
```
WECHAT_APPID=wx_test_appid
```

#### 变量 4：`WECHAT_SECRET`

同上，有就填真实值，没有先填：
```
WECHAT_SECRET=test_secret_placeholder
```

#### 变量 5：`APP_NAME`（可选，用于 Swagger 标题）

```
APP_NAME=SmartPrice
```

#### 变量 6：`PORT`（Railway 端口映射，必须填）

```
PORT=3000
```
> Railway 会分配一个公网域名，并把外部 443 转发到容器内的 `PORT`

### 5.3 检查变量列表

在 Variables 页面，确认有以下变量（除了 DATABASE_URL 等自动注入的）：

| 变量名 | 值示例 | 来源 |
|--------|--------|------|
| `NODE_ENV` | `production` | 手动 |
| `JWT_SECRET` | `a3f...`（64位hex） | 手动 |
| `WECHAT_APPID` | `wx...` 或 `wx_test_appid` | 手动 |
| `WECHAT_SECRET` | `...` 或 `test_secret_placeholder` | 手动 |
| `DATABASE_URL` | `mysql://...` | 自动注入 ✅ |
| `REDIS_URL` | `redis://...` | 自动注入 ✅ |
| `MONGO_URL` | `mongodb://...` | 自动注入 ✅ |
| `PORT` | `3000` | Railway 自动注入 ✅ |

---

## Step 6：触发重新构建 & 监控日志（详细版）

### 6.1 手动触发重新部署

添加完所有变量后，Railway 通常会自动重新部署。如果没自动触发：

1. 点 **smart-price-backend** 服务卡片
2. 上方标签页选 **Deployments**
3. 点 **Deploy** 按钮 → 选 **Deploy Latest Commit**

### 6.2 监控构建日志

在 **Deployments** 页面，可以看到构建实时日志，重点关注：

#### ✅ 构建成功的标志（期望看到）

```
# Docker 构建阶段
=> [builder 1/5] FROM node:20-alpine
=> [builder 2/5] COPY package*.json ./
=> [builder 3/5] RUN npm ci
=> [builder 4/5] COPY . .
=> [builder 5/5] RUN npm run build
=> [production 1/3] COPY --from=builder /app/node_modules ./node_modules
=> [production 2/3] COPY --from=builder /app/dist ./dist

# 启动阶段
node dist/main.js
[Nest] 1  - 05/12/2026, 00:00:00     LOG 🚀 服务启动成功: http://localhost:3000/v1
[Nest] 1  - 05/12/2026, 00:00:00     LOG 环境: production
```

#### ❌ 常见构建失败 & 处理方法

**错误 1：`DATABASE_URL` 格式问题 / TypeORM 无法连接**

日志特征：
```
error: No database specified
```
解决：检查 MySQL 插件是否正常运行（点 MySQL 卡片 → Status 应为 `Running`）

**错误 2：`JWT_SECRET` 未设置，应用启动失败**

日志特征：
```
Error: JWT_SECRET is required
```
解决：回到 Variables 页面，确认 `JWT_SECRET` 已填写

**错误 3：Railway 免费额度用尽**

日志特征：
```
Deployment failed: out of memory
```
解决：Railway 免费额度有限（用量计费，约 $5 免费额度），可在 **Settings** → **Usage** 查看剩余额度

### 6.3 确认部署状态

部署成功后，在服务卡片顶部会看到：

```
🟢 Active
https://smart-price-backend-production-xxxx.up.railway.app
```

这就是你的**公网访问地址**。

---

## Step 7：验证联通（详细版）

### 7.1 获取公网域名

1. 点 **smart-price-backend** 服务卡片
2. 顶部 **Domains** 栏显示分配的域名，例如：
   ```
   https://smart-price-backend-production-xxxx.up.railway.app
   ```
3. 点域名右侧的**复制图标**复制完整 URL

### 7.2 浏览器直接访问（最快捷）

在浏览器地址栏输入：
```
https://你的域名.up.railway.app/v1/health
```

**期望响应（浏览器直接显示 JSON）：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok",
    "timestamp": "2026-05-12T00:00:00.000Z",
    "version": "1.0.0"
  },
  "timestamp": "2026-05-12T00:00:00.000Z"
}
```

### 7.3 命令行测试（更详细）

打开本地终端（Git Bash / PowerShell）执行：

```bash
# 基础健康检查
curl https://你的域名.up.railway.app/v1/health

# 带格式显示（推荐）
curl -s https://你的域名.up.railway.app/v1/health | python -m json.tool

# 查看 HTTP 状态码
curl -o /dev/null -s -w "%{http_code}\n" https://你的域名.up.railway.app/v1/health
# 期望输出：200
```

### 7.4 测试 Swagger 文档页（非生产环境才可见）

> 注意：`main.ts` 中配置了 `if (nodeEnv !== 'production')` 才显示 Swagger
> 当前 `NODE_ENV=production`，所以 `/api-docs` **不会显示**

如需临时查看 Swagger，在 Variables 里把 `NODE_ENV` 改为 `development`，重新部署，然后访问：
```
https://你的域名.up.railway.app/api-docs
```

### 7.5 测试微信登录接口（完整联通验证）

```bash
curl -X POST https://你的域名.up.railway.app/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"test_123456"}'
```

**期望响应（开发模式）：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "eyJ...",
    "user": { "openid": "test_123456", "nickname": "测试用户", "role": "free" }
  }
}
```

> 看到这个响应，说明：MySQL 连接 ✅ + JWT 签发 ✅ + 微信登录逻辑 ✅ → 后端全链路联通！

---

## 附录：Railway 免费额度说明

| 项目 | 免费额度 |
|------|-----------|
| 计算资源 | $5 用量额度（约可运行 1 个月小型服务） |
| MySQL 插件 | 包含在上述额度内 |
| Redis 插件 | 包含在上述额度内 |
| MongoDB 插件 | 包含在上述额度内 |
| 公网域名 | 免费提供 `.up.railway.app` 域名 |

额度用尽后服务会暂停，充值后可恢复（Pay as you go，约 $0.000003/秒）。

---

## 故障排查速查表

| 现象 | 可能原因 | 解决方法 |
|------|-----------|----------|
| 部署后访问域名报 `502 Bad Gateway` | 服务未启动 / `PORT` 不匹配 | 检查 `main.ts` 监听的端口与 `PORT` 变量是否一致（应为 3000） |
| `GET /v1/health` 返回 404 | 全局前缀 `v1` 未生效 | 检查 `main.ts` 中 `app.setGlobalPrefix('v1')` 是否存在 |
| 构建日志显示 `npm ci` 失败 | `package-lock.json` 未提交到 Git | 确认 `package-lock.json` 在 Git 仓库中（不应在 `.gitignore` 里） |
| 数据库连接超时 | MySQL 插件未正常运行 | 点 MySQL 卡片 → 查看 Status，应为 `Running` |
| 访问域名报 `404 Not Found` | 服务启动但路由不对 | 确认访问路径包含 `/v1/health`，而不是 `/health` |
