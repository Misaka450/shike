# ---------- 构建阶段 ----------
FROM node:22-slim AS builder

WORKDIR /app

# better-sqlite3 需要编译工具链（从源码构建时才会用到）
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src
RUN npm run build
# 剔除开发依赖，只保留运行时真正需要的包
RUN npm prune --omit=dev

# ---------- 运行阶段 ----------
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# 健康检查脚本会用到的 curl 替代方案：使用 Node 内置 fetch，无需额外安装依赖
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json

# 启动脚本：修正数据目录属主后降权到 node 用户运行
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8081

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]