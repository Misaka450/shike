import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { cleanupExpiredSessions } from './services/sessionService.js';

const port = config.PORT;

console.log(`🍳 Starting Shike AI (食刻 AI) Backend on port ${port}...`);

const server = serve(
  {
    fetch: app.fetch,
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