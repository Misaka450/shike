import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { bodyLimitResponse, limitRequestBody } from './middleware/bodyLimit.js';
import { initSeedRecipes } from './services/recipeService.js';
import { cleanupExpiredSessions } from './services/sessionService.js';

const port = config.PORT;

console.log(`🍳 Starting Shike AI (食刻 AI) Backend on port ${port}...`);

// 数据库迁移与内置菜谱初始化改为「显式调用」：
// 以前它们混在模块 import 的副作用里，只要别处 import 一次就会对数据库产生写入，
// 测试环境极易被污染。现在由入口统一负责，顺序也一目了然。
runMigrations();
initSeedRecipes();

/**
 * 全局请求体大小限制（修复 PERF-02 / SEC-04）
 *
 * 之前只靠 Content-Length 预检，而 HTTP/1.1 的 chunked 传输根本没有 Content-Length，
 * 攻击者可以完全绕过预检把任意大的数据灌进内存。
 * 这里在 fetch 入口对请求体做一层「计数包装」：累计超过阈值就直接让流报错，
 * 上游读取时会抛出异常，内存占用始终受控。
 */
const guardedFetch: typeof app.fetch = (request, env, executionCtx) => {
  const maxBytes = config.MAX_BODY_BYTES;

  // 没有请求体的请求（GET/HEAD）无需包装
  if (!request.body) {
    return app.fetch(request, env, executionCtx);
  }

  // 带 Content-Length 时先做一次廉价预检，避免为大请求白建一个流
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    return Promise.resolve(bodyLimitResponse(maxBytes));
  }

  const guardedRequest = new Request(request, {
    body: limitRequestBody(request.body, maxBytes),
    duplex: 'half',
  } as RequestInit);

  return app.fetch(guardedRequest, env, executionCtx);
};

const server = serve(
  {
    fetch: guardedFetch,
    port,
  },
  (info) => {
    console.log(`🚀 [Shike AI] Server listening on http://localhost:${info.port}`);
    console.log(`📦 Database path: ${config.DB_PATH}`);
    console.log(`👁️ Vision CPA URL: ${config.CPA_URL}`);
    console.log(`🔐 Trust proxy: ${config.TRUST_PROXY}（直连部署请保持 false）`);
  }
);

// 定时清理过期会话，避免 sessions 表无限增长（每小时执行一次）
const sessionCleanupTimer = setInterval(() => {
  const removed = cleanupExpiredSessions();
  if (removed > 0) {
    console.log(`🧹 已清理 ${removed} 个过期登录会话`);
  }
}, 60 * 60 * 1000);
sessionCleanupTimer.unref();

// Graceful shutdown
const shutdown = () => {
  console.log('🛑 Shutting down Shike AI server...');
  clearInterval(sessionCleanupTimer);
  server.close(() => {
    console.log('✅ Server terminated cleanly.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default server;