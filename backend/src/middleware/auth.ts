import type { Context, MiddlewareHandler } from 'hono';
import { resolveSession } from '../services/sessionService.js';

/**
 * 应用级上下文类型声明
 * 鉴权中间件校验通过后，会把用户 ID 写入 c.set('userId', ...)，
 * 路由层统一从这里读取，绝不再直接从请求头或查询参数取身份。
 */
export type AppEnv = {
  Variables: {
    userId: string;
  };
};

/** 从 Authorization: Bearer <token> 请求头中提取会话令牌 */
export function extractToken(c: Context): string {
  const header = c.req.header('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

/**
 * 强制鉴权中间件
 * 【安全修复 SEC-01】会话无效时直接返回 401，业务路由不会被触达。
 * 这是修复"改一个请求头就能读写他人数据"越权漏洞的核心。
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = resolveSession(extractToken(c));

  if (!userId) {
    return c.json(
      { success: false, code: 'UNAUTHORIZED', error: '登录状态已失效，请重新登录' },
      401
    );
  }

  c.set('userId', userId);
  return next();
};

/**
 * 可选鉴权中间件
 * 已登录则注入 userId，未登录也不拦截。
 * 用于登录 / 注册 / 获取访客会话这类需要"识别访客身份但不强制登录"的接口。
 */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = resolveSession(extractToken(c));
  if (userId) {
    c.set('userId', userId);
  }
  await next();
};