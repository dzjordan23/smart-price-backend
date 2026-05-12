FROM node:20-alpine AS builder

WORKDIR /app

# 安装全部依赖（包含 devDependencies 用于构建）
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build

# ─── 生产镜像 ────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# 只安装生产依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 复制编译产物
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

# 不设 Docker HEALTHCHECK —— Railway 用自己的 network healthcheck
# Railway 自动注入 PORT，应用已优先读取
EXPOSE ${PORT:-3000}

CMD ["node", "dist/main.js"]
