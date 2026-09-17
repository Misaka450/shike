import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoute } from './routes/auth.js';
import { inventoryRoute } from './routes/inventory.js';
import { recipesRoute } from './routes/recipes.js';
import { visionRoute } from './routes/vision.js';

export const app = new Hono();

// Global middlewares
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
  })
);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'shike-ai-backend',
    time: new Date().toISOString(),
  });
});

// Root welcome
app.get('/', (c) => {
  return c.json({
    service: 'Shike AI (食刻 AI) - Smart Fridge and Recipe Recommender',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      vision: '/api/vision/fridge-scan',
      inventory: '/api/inventory',
      recipes: '/api/recipes',
    },
  });
});

// Route registration
app.route('/api/auth', authRoute);
app.route('/api/vision', visionRoute);
app.route('/api/inventory', inventoryRoute);
app.route('/api/recipes', recipesRoute);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: '接口不存在',
      path: c.req.path,
    },
    404
  );
});

// Global error handler
app.onError((err, c) => {
  console.error('[App Error]:', err);
  return c.json(
    {
      success: false,
      error: err.message || '内部服务器错误',
    },
    500
  );
});

export default app;
