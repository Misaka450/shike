import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { db } from './db/index.js';
import type { AppEnv } from './middleware/auth.js';
import { bodyLimitResponse, isBodyLimitError } from './middleware/bodyLimit.js';
import { authRoute } from './routes/auth.js';
import { inventoryRoute } from './routes/inventory.js';
import { recipesRoute } from './routes/recipes.js';
import { visionRoute } from './routes/vision.js';

export const app = new Hono<AppEnv>();

// Global middlewares
app.use('*', logger());

/**
 * 全局安全响应头（SEC-11）
 * 这些头能显著降低点击劫持、MIME 嗅探攻击、来源信息泄露等常见风险。
 */
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-site');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.IS_PRODUCTION) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

/**
 * CORS 配置（SEC-04）
 * 【安全修复】旧实现使用 origin: '*' 并放行 x-user-id 自定义头，
 * 意味着任意第三方网站都能跨域读取用户数据。
 * 现在改为白名单：只有 CORS_ORIGINS 中列出的来源才被允许；
 * 同时移除 x-user-id（身份一律走 Authorization 会话令牌）。
 */
app.use(
  '*',
  cors({
    origin: (origin) => {
      // 同源请求或非浏览器请求不带 Origin 头，直接放行
      if (!origin) return config.CORS_ORIGINS[0];
      // 命中白名单则原样返回，否则返回一个不匹配的值让浏览器自行拦截
      return config.CORS_ORIGINS.includes(origin) ? origin : config.CORS_ORIGINS[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
  })
);

// Health check endpoint（存活探测：只表明进程在运行）
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'shike-ai-backend',
    time: new Date().toISOString(),
  });
});

// Readiness endpoint（就绪探测：额外确认数据库可读写，供 Docker healthcheck 使用）
app.get('/healthz', (c) => {
  try {
    db.prepare('SELECT 1').get();
    return c.json({
      status: 'ok',
      database: 'ok',
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /healthz] 数据库不可用：', err);
    return c.json(
      {
        status: 'degraded',
        database: 'error',
        time: new Date().toISOString(),
      },
      503
    );
  }
});

// Root welcome
app.get('/', (c) => {
  return c.json({
    service: 'Shike AI (食刻 AI) - Smart Fridge and Recipe Recommender',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      readiness: '/healthz',
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
      code: 'NOT_FOUND',
      error: '接口不存在',
      path: c.req.path,
    },
    404
  );
});

/**
 * 全局错误处理（SEC-08）
 * 【安全修复】旧实现把 err.message 直接返回给客户端，
 * 可能泄露 SQL 语句、文件路径、上游服务地址等内部细节。
 * 现在细节只写入服务端日志，对外统一返回友好文案。
 */
app.onError((err, c) => {
  // 请求体超限：这是调用方的问题（413），不应记成服务端 500 内部错误
  if (isBodyLimitError(err)) {
    return bodyLimitResponse(config.MAX_BODY_BYTES);
  }

  console.error(`[App Error] ${c.req.method} ${c.req.path}`, err);
  return c.json(
    {
      success: false,
      code: 'INTERNAL_ERROR',
      error: '服务开小差了，请稍后重试',
    },
    500
  );
});

export default app;