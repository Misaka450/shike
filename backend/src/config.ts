import 'dotenv/config';

/** 读取布尔型环境变量：只有显式写 "true" 才视为开启，其余一律取默认值 */
function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

/** 读取正整数型环境变量，非法值自动回退到默认值 */
function envInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  /** 服务监听端口（与 docker-compose、前端 rewrites 保持统一为 8081） */
  PORT: envInt(process.env.PORT, 8081),

  /** CPA 多模态模型反向代理地址 */
  CPA_URL: process.env.CPA_URL || 'http://127.0.0.1:5201/v1',

  /** CPA 访问凭据 */
  CPA_API_KEY: process.env.CPA_API_KEY || '',

  /** SQLite 数据库文件路径 */
  DB_PATH: process.env.DB_PATH || '/opt/shike-ai/data/db/shike.db',

  /** 允许跨域访问的来源白名单（英文逗号分隔），取代原先的通配符 * */
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://127.0.0.1:3002,http://localhost:3002')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),

  /**
   * 是否信任反向代理传来的 X-Forwarded-For 头
   * 【安全提示】只有前置了 Nginx / Cloudflare 等可信代理时才开启；
   * 端口直连场景保持关闭，否则客户端可伪造该头绕过登录失败锁定
   */
  TRUST_PROXY: envBool(process.env.TRUST_PROXY, false),

  /** 登录会话有效期（天） */
  SESSION_TTL_DAYS: envInt(process.env.SESSION_TTL_DAYS, 30),

  /** 单张上传图片的体积上限（字节），默认 5MB */
  MAX_UPLOAD_BYTES: envInt(process.env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),

  /** 调用 CPA 上游服务的超时时间（毫秒），防止上游挂起导致请求永久等待 */
  CPA_TIMEOUT_MS: envInt(process.env.CPA_TIMEOUT_MS, 30_000),

  /** 是否为生产环境（生产环境会隐藏内部错误细节） */
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
};

export default config;