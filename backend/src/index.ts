import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';

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
  }
);

// Graceful shutdown
const shutdown = () => {
  console.log('🛑 Shutting down Shike AI server...');
  server.close(() => {
    console.log('✅ Server terminated cleanly.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default server;
