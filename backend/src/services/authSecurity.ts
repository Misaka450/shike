import crypto from 'node:crypto';
import type { Context } from 'hono';

// --- Captcha Generator & Store ---

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();

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
  const isPlus = Math.random() > 0.35;
  let a = Math.floor(Math.random() * 12) + 1;
  let b = Math.floor(Math.random() * 9) + 1;
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
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    const color = palette[Math.floor(Math.random() * palette.length)];
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" opacity="0.45" stroke-linecap="round"/>`;
  }

  // Generate noise dots
  let dots = '';
  for (let i = 0; i < 18; i++) {
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    const r = (Math.random() * 1.5 + 0.8).toFixed(1);
    const color = palette[Math.floor(Math.random() * palette.length)];
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.35"/>`;
  }

  // Text characters with slight rotation and offsets
  const startX = 14;
  const stepX = (width - 28) / expression.length;
  let charsSvg = '';
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    const x = startX + i * stepX;
    const y = 25 + (Math.random() * 4 - 2);
    const rot = (Math.random() * 14 - 7).toFixed(1);
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

export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  // @ts-ignore
  const socketIp = c.env?.incoming?.socket?.remoteAddress;
  if (socketIp) {
    return socketIp;
  }
  return '127.0.0.1';
}

// --- Password Hashing & Timing-safe Verification ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (storedHash.startsWith('scrypt:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 3) return false;
      const salt = parts[1];
      const originalHash = parts[2];
      const derived = crypto.scryptSync(password, salt, 64).toString('hex');
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

export function dummyTimingCheck(password: string): void {
  try {
    const derived = crypto.scryptSync(password, DUMMY_SALT, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(DUMMY_HASH, 'hex');
    crypto.timingSafeEqual(a, b);
  } catch {
    // ignore
  }
}
