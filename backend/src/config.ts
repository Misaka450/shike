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

  /** 文本生成（AI 菜谱定制）使用的 CPA 模型名 */
  CPA_TEXT_MODEL: process.env.CPA_TEXT_MODEL || 'gemini-3.8-flash-high',

  /** 视觉识别（冰箱拍照识图）使用的 CPA 模型名单，逗号分隔，按顺序依次尝试 */
  CPA_VISION_MODELS: (
    process.env.CPA_VISION_MODELS || 'gemini-3.8-flash-high,gemini-2.5-flash'
  )
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),

  /**
   * SQLite 数据库文件路径
   * 默认使用相对路径（本地开发友好）；Docker 部署时由 docker-compose.yml 显式指定绝对路径
   */
  DB_PATH: process.env.DB_PATH || './data/db/shike.db',

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

  /**
   * 单个请求体的全局体积上限（字节），默认 15MB
   * 在 fetch 入口以流式计数方式强制执行，即使客户端使用 chunked 传输
   * （不声明 Content-Length）也无法绕过，防止超大请求把内存打爆
   */
  MAX_BODY_BYTES: envInt(process.env.MAX_BODY_BYTES, 15 * 1024 * 1024),

  /** 调用 CPA 上游服务的超时时间（毫秒），防止上游挂起导致请求永久等待 */
  CPA_TIMEOUT_MS: envInt(process.env.CPA_TIMEOUT_MS, 30_000),

  /**
   * 视觉识别的单次模型超时（毫秒），默认 15 秒
   * 【性能修复 PERF-03】识图会按 CPA_VISION_MODELS 顺序串行尝试多个模型，
   * 若每个都等满 CPA_TIMEOUT_MS（默认 30 秒），两模型最坏要让用户等 60 秒。
   * 这里给识图单独一个更短的超时：模型迟迟不返回时尽快放弃并转下一个候选。
   */
  CPA_VISION_TIMEOUT_MS: envInt(process.env.CPA_VISION_TIMEOUT_MS, 15_000),

  /** 是否为生产环境（生产环境会隐藏内部错误细节） */
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
};

export default config;