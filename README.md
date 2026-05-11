# 智选比价助手 - 后端服务

基于 NestJS + TypeScript 的智能购物比价助手后端 API。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | NestJS 10 + TypeScript 5 |
| 数据库 | MySQL 8.0 + Redis 7 + MongoDB 7 |
| 认证 | JWT + 微信小程序登录 |
| 爬虫 | Axios（HTTP）+ Puppeteer-core（JS渲染） |
| 文档 | Swagger UI |
| 部署 | Docker + Docker Compose |

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
# 1. 复制并编辑环境变量
cp .env.docker .env.prod
vi .env.prod   # 填写真实的微信AppID、JWT密钥等

# 2. 一键启动所有服务
docker-compose --env-file .env.prod up -d

# 3. 验证服务
curl http://localhost:3000/v1/health
```

### 方式二：本地开发

**前置条件**：MySQL 8.0 + Redis 7 + MongoDB 7 已运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写数据库连接信息

# 3. 启动开发服务（热重载）
npm run start:dev
```

## API 文档

启动后访问 [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

## 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /v1/auth/login | 微信登录 |
| GET  | /v1/user/profile | 个人信息 |
| POST | /v1/products/recognize | 识别商品 |
| POST | /v1/products/compare | 创建比价任务 |
| GET  | /v1/products/compare/:taskId/result | 查询比价结果 |
| GET  | /v1/products/search | 搜索商品 |
| POST | /v1/products/:id/watch | 降价提醒 |
| POST | /v1/orders/confirm | 确认购买（记录返利） |
| GET  | /v1/health | 健康检查 |

## 目录结构

```
src/
├── config/           # 配置文件（环境变量映射）
├── common/           # 公共模块（过滤器/拦截器/守卫/装饰器）
├── database/
│   ├── entities/     # TypeORM MySQL实体
│   └── schemas/      # Mongoose MongoDB Schema
└── modules/
    ├── auth/         # 认证模块（微信登录+JWT）
    ├── user/         # 用户模块
    ├── product/      # 商品+比价模块（核心）
    ├── price/        # 价格监控+返利模块
    └── crawler/      # 爬虫引擎
```

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| JWT_SECRET | JWT签名密钥（32位以上随机字符串） | ✅ |
| WECHAT_APPID | 微信小程序AppID | ✅ |
| WECHAT_SECRET | 微信小程序Secret | ✅ |
| DB_HOST/PORT/USERNAME/PASSWORD | MySQL连接配置 | ✅ |
| REDIS_HOST/PORT | Redis连接配置 | ✅ |
| MONGO_URI | MongoDB连接串 | ✅ |
| TENCENT_SECRET_ID/KEY | 腾讯云OCR密钥（可选） | ❌ |

## 注意事项

- **开发模式**：TypeORM 自动同步数据库表结构（`synchronize: true`）
- **生产模式**：关闭自动同步，需手动执行数据库迁移
- **爬虫合规**：请遵守《电子商务法》，确保数据采集合法合规
