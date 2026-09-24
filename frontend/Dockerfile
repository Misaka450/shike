# ---------- 构建阶段 ----------
FROM node:25-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:25-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# standalone 模式的 server.js 会读取 HOSTNAME，容器内必须显式绑定 0.0.0.0 才能被外部访问
ENV HOSTNAME=0.0.0.0

# 使用 Next.js standalone 产物：只包含运行所需的最小依赖，镜像体积显著减小
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# 以非 root 用户运行，降低容器被攻破后的影响范围
USER node

EXPOSE 3000
CMD ["node", "server.js"]