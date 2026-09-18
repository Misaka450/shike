import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';

export interface SessionInfo {
  /** 服务端签发的会话令牌，客户端需通过 Authorization: Bearer <token> 携带 */
  token: string;
  /** 该会话归属的用户 ID */
  userId: string;
  /** 会话过期时间（ISO 字符串） */
  expiresAt: string;
}

/**
 * 生成会话令牌
 * 使用 32 字节密码学安全随机数（256 bit 熵），客户端完全无法猜测或伪造。
 */
function generateToken(): string {
  return `tok_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * 令牌入库前先做 sha256 摘要（与数据库迁移 v4 配套）
 * 【安全加固】sessions 表不再保存令牌明文：即使数据库文件被拖走，
 * 攻击者拿到的也只是不可逆摘要，无法用来冒充用户会话。
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 生成用户 ID
 * 【安全修复 SEC-02】一律使用完整 UUID（128 bit 熵），
 * 不再像旧版那样只截取 8 位十六进制字符（仅 32 bit，存在被枚举的风险）。
 */
export function generateUserId(prefix: 'usr' | 'guest'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** 创建新会话并写入数据库，返回令牌与过期时间 */
export function createSession(userId: string): SessionInfo {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(hashToken(token), userId, now.toISOString(), expiresAt);

  return { token, userId, expiresAt };
}

/**
 * 校验会话令牌
 * 返回归属的用户 ID；令牌不存在或已过期时返回 null（并顺手清理过期记录）。
 */
export function resolveSession(token: string): string | null {
  if (!token) return null;

  // 库中存的是令牌摘要，查询前先做同样的 sha256
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
    .get(hashToken(token)) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    destroySession(token);
    return null;
  }

  return row.user_id;
}

/** 销毁单个会话（用户主动退出登录时调用，让令牌立即失效） */
export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
}

/** 清理所有已过期会话，返回清理条数（由定时任务周期调用） */
export function cleanupExpiredSessions(): number {
  const result = db
    .prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .run(new Date().toISOString());
  return result.changes;
}

/**
 * 把旧版客户端生成的访客数据迁移到目标账号名下
 *
 * 【安全修复 SEC-02】相比旧实现的改进：
 * 1. 只允许认领旧版前端生成的访客 ID（user_ / guest_ 前缀），
 *    明确拒绝认领已注册账号 ID（usr_ 前缀），从根本上切断"指定他人账号 ID 搬走数据"的攻击路径；
 * 2. 借助 guest_claims 表的主键唯一约束，保证同一份访客数据只能被认领一次，无法反复搬移；
 * 3. 整个迁移过程包裹在事务中，失败自动回滚。
 *
 * @returns 是否真正执行了迁移
 */
export function claimLegacyGuestData(legacyUserId: string, targetUserId: string): boolean {
  if (!legacyUserId || typeof legacyUserId !== 'string') return false;
  if (legacyUserId === targetUserId) return false;

  // 第一道闸门：只认领旧版客户端的访客 ID，绝不认领正式账号 ID
  const isLegacyGuestId =
    legacyUserId.startsWith('user_') || legacyUserId.startsWith('guest_');
  if (!isLegacyGuestId) return false;

  // 第二道闸门：INSERT OR IGNORE 依赖主键唯一约束，changes 为 0 说明已被认领过
  const claim = db
    .prepare(
      'INSERT OR IGNORE INTO guest_claims (guest_user_id, claimed_by, claimed_at) VALUES (?, ?, ?)'
    )
    .run(legacyUserId, targetUserId, new Date().toISOString());

  if (claim.changes === 0) return false;

  // 第三道闸门：迁移动作放在同一个事务里，要么全部成功，要么全部回滚
  db.transaction(() => {
    db.prepare('UPDATE inventory_items SET user_id = ? WHERE user_id = ?').run(
      targetUserId,
      legacyUserId
    );
    db.prepare('UPDATE cooking_history SET user_id = ? WHERE user_id = ?').run(
      targetUserId,
      legacyUserId
    );
  })();

  return true;
}