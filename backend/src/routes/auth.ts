import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
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

export const authRoute = new Hono();

// GET /captcha - 获取 SVG 验证码
authRoute.get('/captcha', (c) => {
  const captcha = createCaptcha();
  return c.json({
    success: true,
    data: captcha,
  });
});

// POST /register - 自定义用户名注册
authRoute.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, password, nickname, captcha_key, captcha_code, temp_user_id } = body;

  // 1. 验证码校验
  if (!captcha_key || !captcha_code || typeof captcha_code !== 'string') {
    return c.json({ success: false, error: '请输入图形验证码' }, 400);
  }

  const isCaptchaValid = verifyAndConsumeCaptcha(captcha_key, captcha_code);
  if (!isCaptchaValid) {
    return c.json({ success: false, error: '验证码错误或已过期，请重新输入' }, 400);
  }

  // 2. 字段校验
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return c.json({ success: false, error: '用户名至少需要2个字符' }, 400);
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return c.json({ success: false, error: '密码至少需要4个字符' }, 400);
  }

  const cleanUser = username.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
  if (existing) {
    return c.json({ success: false, error: '该用户名已被注册，请直接登录' }, 409);
  }

  const userId = `usr_${crypto.randomUUID().slice(0, 8)}`;
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  const userNick = (nickname && typeof nickname === 'string' && nickname.trim()) || username.trim();
  const avatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';

  db.prepare(`
    INSERT INTO users (id, username, password_hash, nickname, avatar, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, cleanUser, passwordHash, userNick, avatar, now, now);

  // 如果客户端带了 temp_user_id（临时访客ID），将临时录入的食材迁移归属到新注册账号下
  if (temp_user_id && typeof temp_user_id === 'string' && temp_user_id !== userId) {
    db.prepare('UPDATE inventory_items SET user_id = ? WHERE user_id = ?').run(userId, temp_user_id);
    db.prepare('UPDATE cooking_history SET user_id = ? WHERE user_id = ?').run(userId, temp_user_id);
  }

  const token = `tok_${crypto.randomBytes(16).toString('hex')}`;

  return c.json({
    success: true,
    message: '注册成功并已自动登录',
    data: {
      user_id: userId,
      username: cleanUser,
      nickname: userNick,
      avatar,
      token,
      is_guest: false,
    },
  });
});

// POST /login - 账号密码登录
authRoute.post('/login', async (c) => {
  const ip = getClientIp(c);
  const body = await c.req.json().catch(() => ({}));
  const { username, password, captcha_key, captcha_code, temp_user_id } = body;

  const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';

  // 1. 登录防爆破与频控检查（账号 / IP 级别）
  const lockout = checkLockout(ip, cleanUser || undefined);
  if (lockout.locked) {
    return c.json(
      {
        success: false,
        error: `登录尝试次数过多，已被临时锁定，请在 ${lockout.remainingMinutes} 分钟后再试`,
        remaining_seconds: lockout.remainingSeconds,
      },
      429
    );
  }

  // 2. 基础输入校验
  if (!cleanUser || !password || typeof password !== 'string') {
    return c.json({ success: false, error: '请输入用户名和密码' }, 400);
  }

  // 3. 验证码校验
  if (!captcha_key || !captcha_code || typeof captcha_code !== 'string') {
    return c.json({ success: false, error: '请输入图形验证码' }, 400);
  }

  const isCaptchaValid = verifyAndConsumeCaptcha(captcha_key, captcha_code);
  if (!isCaptchaValid) {
    return c.json({ success: false, error: '验证码错误或已过期，请重新输入' }, 400);
  }

  // 4. 用户查询及防枚举恒定时长密码校验
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUser) as any;
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
          error: `登录尝试次数过多，已被临时锁定，请在 ${failLock.remainingMinutes} 分钟后再试`,
          remaining_seconds: failLock.remainingSeconds,
        },
        429
      );
    }
    return c.json({ success: false, error: '用户名或密码错误' }, 401);
  }

  // 5. 登录成功：重置失败计数
  resetLoginFailures(ip, cleanUser);

  // 透明升级：若用户仍为旧版 sha256 密码哈希，自动升级为高安全性 scrypt 哈希
  if (user.password_hash && !user.password_hash.startsWith('scrypt:')) {
    const upgradedHash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(upgradedHash, user.id);
  }

  // 迁移当前设备上的临时食材（如果有）
  if (temp_user_id && typeof temp_user_id === 'string' && temp_user_id !== user.id) {
    db.prepare('UPDATE inventory_items SET user_id = ? WHERE user_id = ?').run(user.id, temp_user_id);
    db.prepare('UPDATE cooking_history SET user_id = ? WHERE user_id = ?').run(user.id, temp_user_id);
  }

  const token = `tok_${crypto.randomBytes(16).toString('hex')}`;

  return c.json({
    success: true,
    message: '登录成功',
    data: {
      user_id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      token,
      is_guest: false,
    },
  });
});

// GET /guest - 生成临时访客
authRoute.get('/guest', (c) => {
  const guestId = `guest_${crypto.randomUUID().slice(0, 8)}`;
  const token = `token_${crypto.randomBytes(16).toString('hex')}`;

  return c.json({
    success: true,
    data: {
      user_id: guestId,
      token,
      nickname: '临时访客',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      is_guest: true,
    },
  });
});

authRoute.post('/guest', (c) => {
  const guestId = `guest_${crypto.randomUUID().slice(0, 8)}`;
  const token = `token_${crypto.randomBytes(16).toString('hex')}`;

  return c.json({
    success: true,
    data: {
      user_id: guestId,
      token,
      nickname: '临时访客',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      is_guest: true,
    },
  });
});

// GET /me - 获取当前用户信息
authRoute.get('/me', (c) => {
  const userId = c.req.header('x-user-id') || 'guest';
  const user = db.prepare('SELECT id, username, nickname, avatar FROM users WHERE id = ?').get(userId) as any;

  if (user) {
    return c.json({
      success: true,
      data: {
        user_id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        is_guest: false,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      user_id: userId,
      nickname: userId.startsWith('guest_') || userId.startsWith('user_') ? '本地设备访客' : userId,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      is_guest: true,
    },
  });
});
