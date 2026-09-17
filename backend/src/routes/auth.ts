import { Hono } from 'hono';
import { db } from '../db/index.js';
import type { AppEnv } from '../middleware/auth.js';
import { extractToken, optionalAuth, requireAuth } from '../middleware/auth.js';
import {
  createCaptcha,
  verifyAndConsumeCaptcha,
  checkLockout,
  recordFailedLogin,
  resetLoginFailures,
  getClientIp,
  hashPassword,
  verifyPassword,
  dummyTimingCheck,
} from '../services/authSecurity.js';
import {
  claimLegacyGuestData,
  createSession,
  destroySession,
  generateUserId,
} from '../services/sessionService.js';

export const authRoute = new Hono<AppEnv>();

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';

/** 用户名合法性校验：2-32 字符，不含空白字符与控制字符（允许中英文） */
function isValidUsername(name: string): boolean {
  if (name.length < 2 || name.length > 32) return false;
  return !/[\s\u0000-\u001f\u007f]/.test(name);
}

/** 昵称清洗：去除控制字符并限制长度，避免脏数据入库 */
function sanitizeNickname(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const cleaned = input.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, 32) : fallback;
}

// GET /captcha - 获取 SVG 验证码
authRoute.get('/captcha', (c) => {
  const captcha = createCaptcha();
  return c.json({
    success: true,
    data: captcha,
  });
});

/**
 * POST /guest - 创建访客会话
 *
 * 【安全修复 SEC-01】访客同样拥有由服务端签发的会话令牌，
 * 客户端不再自己"发明"用户 ID，身份完全由服务端掌握。
 * 请求体可选带 legacy_user_id：老版本前端在本地生成的用户 ID，
 * 用于把该设备此前录入的食材一次性迁移到新会话下（详见 sessionService.claimLegacyGuestData）。
 */
authRoute.post('/guest', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const legacyUserId =
    typeof body?.legacy_user_id === 'string' ? body.legacy_user_id.trim() : '';

  // 已持有有效访客会话时直接复用，避免同一台设备反复创建会话导致数据分裂
  const existingUserId = c.get('userId');
  const existingToken = extractToken(c);
  if (existingUserId && existingUserId.startsWith('guest_') && existingToken) {
    return c.json({
      success: true,
      data: {
        user_id: existingUserId,
        token: existingToken,
        nickname: '临时访客',
        avatar: DEFAULT_AVATAR,
        is_guest: true,
        migrated_legacy_data: false,
      },
    });
  }

  const guestId = generateUserId('guest');

  // 尝试认领旧版客户端遗留的数据（仅允许访客 ID，且每份数据只能认领一次）
  let migrated = false;
  if (legacyUserId) {
    migrated = claimLegacyGuestData(legacyUserId, guestId);
  }

  const session = createSession(guestId);

  return c.json({
    success: true,
    data: {
      user_id: guestId,
      token: session.token,
      expires_at: session.expiresAt,
      nickname: '临时访客',
      avatar: DEFAULT_AVATAR,
      is_guest: true,
      migrated_legacy_data: migrated,
    },
  });
});

// POST /register - 自定义用户名注册
authRoute.post('/register', optionalAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, password, nickname, captcha_key, captcha_code } = body;

  // 1. 验证码校验
  if (!captcha_key || !captcha_code || typeof captcha_code !== 'string') {
    return c.json({ success: false, code: 'CAPTCHA_REQUIRED', error: '请输入图形验证码' }, 400);
  }

  const isCaptchaValid = verifyAndConsumeCaptcha(captcha_key, captcha_code);
  if (!isCaptchaValid) {
    return c.json({ success: false, code: 'CAPTCHA_INVALID', error: '验证码错误或已过期，请重新输入' }, 400);
  }

  // 2. 字段校验
  const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!isValidUsername(cleanUser)) {
    return c.json(
      { success: false, code: 'USERNAME_INVALID', error: '用户名需为 2-32 个字符，且不能包含空格' },
      400
    );
  }
  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return c.json(
      { success: false, code: 'PASSWORD_WEAK', error: '密码长度需为 6-128 位' },
      400
    );
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
  if (existing) {
    return c.json({ success: false, code: 'USERNAME_TAKEN', error: '该用户名已被注册，请直接登录' }, 409);
  }

  // 3. 创建账号（用户 ID 使用完整 UUID，不再截断）
  const userId = generateUserId('usr');
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  const userNick = sanitizeNickname(nickname, cleanUser);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, nickname, avatar, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, cleanUser, passwordHash, userNick, DEFAULT_AVATAR, now, now);

  // 4. 迁移当前访客会话名下的数据
  // 【安全修复 SEC-02】身份取自服务端会话（客户端无法伪造），
  // 彻底移除了此前"传入任意 temp_user_id 就能搬走别人数据"的漏洞。
  const guestUserId = c.get('userId');
  let migrated = false;
  if (guestUserId && guestUserId.startsWith('guest_') && guestUserId !== userId) {
    migrated = claimLegacyGuestData(guestUserId, userId);
  }

  // 5. 旧访客令牌立即作废，签发正式账号会话
  const oldToken = extractToken(c);
  if (oldToken) destroySession(oldToken);
  const session = createSession(userId);

  return c.json({
    success: true,
    message: '注册成功并已自动登录',
    data: {
      user_id: userId,
      username: cleanUser,
      nickname: userNick,
      avatar: DEFAULT_AVATAR,
      token: session.token,
      expires_at: session.expiresAt,
      is_guest: false,
      migrated_guest_data: migrated,
    },
  });
});

// POST /login - 账号密码登录
authRoute.post('/login', optionalAuth, async (c) => {
  const ip = getClientIp(c);
  const body = await c.req.json().catch(() => ({}));
  const { username, password, captcha_key, captcha_code } = body;

  const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';

  // 1. 登录防爆破与频控检查（账号 / IP 级别）
  const lockout = checkLockout(ip, cleanUser || undefined);
  if (lockout.locked) {
    return c.json(
      {
        success: false,
        code: 'ACCOUNT_LOCKED',
        error: `登录尝试次数过多，已被临时锁定，请在 ${lockout.remainingMinutes} 分钟后再试`,
        remaining_seconds: lockout.remainingSeconds,
      },
      429
    );
  }

  // 2. 基础输入校验
  if (!cleanUser || !password || typeof password !== 'string') {
    return c.json({ success: false, code: 'CREDENTIALS_REQUIRED', error: '请输入用户名和密码' }, 400);
  }

  // 3. 验证码校验
  if (!captcha_key || !captcha_code || typeof captcha_code !== 'string') {
    return c.json({ success: false, code: 'CAPTCHA_REQUIRED', error: '请输入图形验证码' }, 400);
  }

  const isCaptchaValid = verifyAndConsumeCaptcha(captcha_key, captcha_code);
  if (!isCaptchaValid) {
    return c.json({ success: false, code: 'CAPTCHA_INVALID', error: '验证码错误或已过期，请重新输入' }, 400);
  }

  // 4. 用户查询及防枚举恒定时长密码校验
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUser) as
    | { id: string; username: string; password_hash: string; nickname: string; avatar: string }
    | undefined;

  let passwordValid = false;
  if (user && user.password_hash) {
    passwordValid = verifyPassword(password, user.password_hash);
  } else {
    // 假用户恒定耗时检查，防止基于响应时间的用户枚举攻击
    dummyTimingCheck(password);
  }

  if (!user || !passwordValid) {
    const failLock = recordFailedLogin(ip, cleanUser);
    if (failLock.locked) {
      return c.json(
        {
          success: false,
          code: 'ACCOUNT_LOCKED',
          error: `登录尝试次数过多，已被临时锁定，请在 ${failLock.remainingMinutes} 分钟后再试`,
          remaining_seconds: failLock.remainingSeconds,
        },
        429
      );
    }
    return c.json({ success: false, code: 'INVALID_CREDENTIALS', error: '用户名或密码错误' }, 401);
  }

  // 5. 登录成功：重置失败计数
  resetLoginFailures(ip, cleanUser);

  // 透明升级：若用户仍为旧版 sha256 密码哈希，自动升级为高安全性 scrypt 哈希
  if (user.password_hash && !user.password_hash.startsWith('scrypt:')) {
    const upgradedHash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(upgradedHash, user.id);
  }

  // 6. 迁移访客会话数据（身份来自服务端会话，客户端无法伪造）
  const guestUserId = c.get('userId');
  let migrated = false;
  if (guestUserId && guestUserId.startsWith('guest_') && guestUserId !== user.id) {
    migrated = claimLegacyGuestData(guestUserId, user.id);
  }

  // 7. 销毁访客会话并签发正式账号会话
  const oldToken = extractToken(c);
  if (oldToken) destroySession(oldToken);
  const session = createSession(user.id);

  return c.json({
    success: true,
    message: '登录成功',
    data: {
      user_id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar || DEFAULT_AVATAR,
      token: session.token,
      expires_at: session.expiresAt,
      is_guest: false,
      migrated_guest_data: migrated,
    },
  });
});

// GET /me - 获取当前登录用户信息（必须携带有效会话令牌）
authRoute.get('/me', requireAuth, (c) => {
  const userId = c.get('userId');
  const user = db
    .prepare('SELECT id, username, nickname, avatar FROM users WHERE id = ?')
    .get(userId) as
    | { id: string; username: string; nickname: string; avatar: string }
    | undefined;

  if (user) {
    return c.json({
      success: true,
      data: {
        user_id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar || DEFAULT_AVATAR,
        is_guest: false,
      },
    });
  }

  // 访客会话：没有对应的账号记录
  return c.json({
    success: true,
    data: {
      user_id: userId,
      nickname: '临时访客',
      avatar: DEFAULT_AVATAR,
      is_guest: true,
    },
  });
});

// POST /logout - 退出登录（服务端立即作废令牌，不再只是清空浏览器本地数据）
authRoute.post('/logout', (c) => {
  const token = extractToken(c);
  if (token) {
    destroySession(token);
  }
  return c.json({ success: true, message: '已退出登录' });
});