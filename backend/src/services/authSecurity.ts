import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Context } from 'hono';
import { config } from '../config.js';

// --- Captcha Generator & Store ---

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();

/** 生成 [min, max] 闭区间内的密码学安全随机整数（安全场景不可使用 Math.random） */
function secureRandomInt(min: number, max: number): number {
  return crypto.randomInt(min, max + 1);
}

// Clean up expired captchas periodically
const captchaCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, item] of captchaStore.entries()) {
    if (now > item.expiresAt) {
      captchaStore.delete(key);
    }
  }
}, 30 * 1000);
captchaCleanupInterval.unref();

export function createCaptcha(): { captcha_key: string; svg: string } {
  const isPlus = secureRandomInt(0, 99) >= 35;
  let a = secureRandomInt(1, 12);
  let b = secureRandomInt(1, 9);
  let answer: string;
  let expression: string;

  if (isPlus) {
    answer = String(a + b);
    expression = `${a} + ${b} = ?`;
  } else {
    if (a < b) [a, b] = [b, a];
    answer = String(a - b);
    expression = `${a} - ${b} = ?`;
  }

  const width = 124;
  const height = 40;

  // Generate noise lines
  const palette = ['#10b981', '#64748b', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899'];
  let lines = '';
  for (let i = 0; i < 4; i++) {
    const x1 = secureRandomInt(0, width);
    const y1 = secureRandomInt(0, height);
    const x2 = secureRandomInt(0, width);
    const y2 = secureRandomInt(0, height);
    const color = palette[secureRandomInt(0, palette.length - 1)];
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" opacity="0.45" stroke-linecap="round"/>`;
  }

  // Generate noise dots
  let dots = '';
  for (let i = 0; i < 18; i++) {
    const cx = secureRandomInt(0, width);
    const cy = secureRandomInt(0, height);
    const r = (secureRandomInt(8, 15) / 10).toFixed(1);
    const color = palette[secureRandomInt(0, palette.length - 1)];
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.35"/>`;
  }

  // Text characters with slight rotation and offsets
  const startX = 14;
  const stepX = (width - 28) / expression.length;
  let charsSvg = '';
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    const x = startX + i * stepX;
    const y = 25 + secureRandomInt(-2, 2);
    const rot = (secureRandomInt(-70, 70) / 10).toFixed(1);
    const charColor = ['#0f172a', '#047857', '#0369a1', '#b45309', '#4338ca'][i % 5];
    charsSvg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="monospace, Arial, sans-serif" font-weight="700" font-size="18" fill="${charColor}" transform="rotate(${rot}, ${x.toFixed(1)}, ${y.toFixed(1)})">${char}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;user-select:none;cursor:pointer;display:block;"><title>点击更换验证码</title>${lines}${dots}${charsSvg}</svg>`;

  const captcha_key = `cap_${crypto.randomUUID()}`;
  // 2-minute expiration
  captchaStore.set(captcha_key, {
    code: answer,
    expiresAt: Date.now() + 2 * 60 * 1000,
  });

  return { captcha_key, svg };
}

export function verifyAndConsumeCaptcha(key?: string, code?: string): boolean {
  if (!key || typeof key !== 'string' || !code || typeof code !== 'string') {
    return false;
  }

  const entry = captchaStore.get(key);
  // Single-use: deleted immediately upon verification
  captchaStore.delete(key);

  if (!entry) {
    return false;
  }

  if (Date.now() > entry.expiresAt) {
    return false;
  }

  return code.trim().toLowerCase() === entry.code.toLowerCase();
}

// --- Generic Rate Limiter (used by AI-heavy endpoints) ---

/** 限流桶：key -> 该 key 最近的请求时间戳列表 */
const rateLimitBuckets = new Map<string, number[]>();

/**
 * 通用滑动窗口限流
 * @param key        限流维度标识（例如 `vision:${ip}`）
 * @param maxRequests 窗口内允许的最大请求数
 * @param windowMs    窗口长度（毫秒）
 * @returns allowed 是否放行；retryAfterSeconds 被拦截时建议等待的秒数
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const timestamps = (rateLimitBuckets.get(key) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    rateLimitBuckets.set(key, timestamps);
    const retryAfterSeconds = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  rateLimitBuckets.set(key, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

// --- Rate Limiting & Brute-force Lockout ---

interface LockoutRecord {
  attempts: number[];
  lockedUntil: number;
}

const ipLockouts = new Map<string, LockoutRecord>();
const userLockouts = new Map<string, LockoutRecord>();

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const MAX_FAILED_ATTEMPTS = 5;

// Clean up stale lockout records periodically
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();

  // 清理登录锁定记录
  for (const [key, item] of ipLockouts.entries()) {
    if (item.lockedUntil < now && item.attempts.every((t) => now - t > ATTEMPT_WINDOW_MS)) {
      ipLockouts.delete(key);
    }
  }
  for (const [key, item] of userLockouts.entries()) {
    if (item.lockedUntil < now && item.attempts.every((t) => now - t > ATTEMPT_WINDOW_MS)) {
      userLockouts.delete(key);
    }
  }

  // 清理通用限流桶中已经全部过期的记录，避免内存无限增长
  for (const [key, timestamps] of rateLimitBuckets.entries()) {
    const alive = timestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (alive.length === 0) {
      rateLimitBuckets.delete(key);
    } else if (alive.length !== timestamps.length) {
      rateLimitBuckets.set(key, alive);
    }
  }
}, 60 * 1000);
rateLimitCleanupInterval.unref();

export function checkLockout(ip: string, username?: string): { locked: boolean; remainingSeconds: number; remainingMinutes: number } {
  const now = Date.now();
  const ipRec = ipLockouts.get(ip);
  const userRec = username ? userLockouts.get(username) : undefined;

  let maxLockedUntil = 0;
  if (ipRec && ipRec.lockedUntil > now) {
    maxLockedUntil = Math.max(maxLockedUntil, ipRec.lockedUntil);
  }
  if (userRec && userRec.lockedUntil > now) {
    maxLockedUntil = Math.max(maxLockedUntil, userRec.lockedUntil);
  }

  if (maxLockedUntil > now) {
    const remainingSeconds = Math.max(1, Math.ceil((maxLockedUntil - now) / 1000));
    const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
    return { locked: true, remainingSeconds, remainingMinutes };
  }

  return { locked: false, remainingSeconds: 0, remainingMinutes: 0 };
}

export function recordFailedLogin(ip: string, username?: string): { locked: boolean; remainingSeconds: number; remainingMinutes: number } {
  const now = Date.now();

  function record(map: Map<string, LockoutRecord>, key: string): { locked: boolean; lockedUntil: number } {
    let rec = map.get(key);
    if (!rec) {
      rec = { attempts: [], lockedUntil: 0 };
      map.set(key, rec);
    }
    // Prune attempts older than 15 minutes
    rec.attempts = rec.attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
    rec.attempts.push(now);

    if (rec.attempts.length >= MAX_FAILED_ATTEMPTS) {
      rec.lockedUntil = now + LOCKOUT_DURATION_MS;
      return { locked: true, lockedUntil: rec.lockedUntil };
    }
    return { locked: false, lockedUntil: 0 };
  }

  const ipResult = record(ipLockouts, ip);
  const userResult = username ? record(userLockouts, username) : { locked: false, lockedUntil: 0 };

  if (ipResult.locked || userResult.locked) {
    const maxUntil = Math.max(ipResult.lockedUntil, userResult.lockedUntil);
    const remainingSeconds = Math.max(1, Math.ceil((maxUntil - now) / 1000));
    const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
    return { locked: true, remainingSeconds, remainingMinutes };
  }

  return { locked: false, remainingSeconds: 0, remainingMinutes: 0 };
}

export function resetLoginFailures(ip: string, username?: string): void {
  ipLockouts.delete(ip);
  if (username) {
    userLockouts.delete(username);
  }
}

/**
 * 获取客户端真实 IP
 *
 * 【安全修复 SEC-06】旧实现无条件信任 X-Forwarded-For 请求头，
 * 攻击者只要每次请求携带不同的伪造 IP，就能绕开"5 次失败即锁定"的防护，无限次暴力破解密码。
 * 现在改为：只有在明确配置了可信反向代理（TRUST_PROXY=true）时才采信该头，
 * 否则一律使用 TCP 连接的真实来源地址，客户端无法伪造。
 */
export function getClientIp(c: Context): string {
  if (config.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
    const realIp = c.req.header('x-real-ip');
    if (realIp && realIp.trim()) {
      return realIp.trim();
    }
  }

  // 直连场景：取 Node 底层 socket 的对端地址，这是无法被请求头伪造的
  const socketIp = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;
  return socketIp || 'unknown';
}

// --- Password Hashing & Timing-safe Verification ---

/**
 * scrypt 的异步版本（修复 PERF-01）
 *
 * scrypt 是刻意设计的「慢哈希」，单次计算就要占用事件循环几十上百毫秒。
 * 之前用 scryptSync，登录/注册期间整条 Node 主线程会被完全阻塞，
 * 并发请求全部排队等待，最坏情况下表现为服务假死。
 * 改成异步后计算扔进 libuv 线程池，主线程继续处理其它请求。
 */
const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (storedHash.startsWith('scrypt:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 3) return false;
      const salt = parts[1];
      const originalHash = parts[2];
      const derived = (await scryptAsync(password, salt, 64)).toString('hex');
      const a = Buffer.from(derived, 'hex');
      const b = Buffer.from(originalHash, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    }
    // Legacy sha256 fallback compatibility
    const legacy = crypto.createHash('sha256').update(password + '_shike_salt_2026').digest('hex');
    const a = Buffer.from(legacy, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Fixed dummy salt and hash to ensure constant-time checking for non-existent users
const DUMMY_SALT = 'e0f4a8b2c6d19375e0f4a8b2c6d19375';
const DUMMY_HASH = crypto.scryptSync('dummy_timing_seed_shike_2026', DUMMY_SALT, 64).toString('hex');

export async function dummyTimingCheck(password: string): Promise<void> {
  try {
    const derived = (await scryptAsync(password, DUMMY_SALT, 64)).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(DUMMY_HASH, 'hex');
    crypto.timingSafeEqual(a, b);
  } catch {
    // ignore
  }
}