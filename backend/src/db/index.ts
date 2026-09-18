import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// 确保数据库文件所在目录存在（首次启动时自动创建）
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.DB_PATH);

// WAL 模式让读写可以并发，性能与耐久性都更好
db.pragma('journal_mode = WAL');
// 开启外键约束，保证关联数据的一致性
db.pragma('foreign_keys = ON');

/**
 * 数据库迁移清单（重要约定）
 * ------------------------------------------------------------------
 * 数组下标 = 目标版本号，每一项负责把数据库从「版本 N」升级到「版本 N+1」。
 * 已发布的迁移项永远不要修改，新的结构变更一律往后追加，
 * 这样无论用户是从头安装还是从老版本升级，都能得到一致的最终结构。
 */
const MIGRATIONS: Array<(database: DatabaseType) => void> = [
  // v0 -> v1：初始表结构（用户、食材库存、烹饪历史、菜谱）
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nickname TEXT NOT NULL,
        avatar TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'guest',
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity TEXT NOT NULL,
        unit TEXT DEFAULT '',
        storage_location TEXT DEFAULT '冷藏',
        confidence REAL DEFAULT 1.0,
        storage_days INTEGER NOT NULL DEFAULT 3,
        expiry_date TEXT NOT NULL,
        added_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_user_status ON inventory_items (user_id, status);

      CREATE TABLE IF NOT EXISTS cooking_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'guest',
        recipe_id TEXT NOT NULL,
        recipe_name TEXT NOT NULL,
        cooked_at TEXT NOT NULL,
        ingredients_used TEXT NOT NULL,
        notes TEXT DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_cooking_history_user ON cooking_history (user_id);

      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '家常菜',
        cuisine TEXT DEFAULT '中餐',
        difficulty TEXT DEFAULT '简单',
        prep_time INTEGER DEFAULT 10,
        cook_time INTEGER DEFAULT 15,
        servings INTEGER DEFAULT 2,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        tips TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
  },

  // v1 -> v2：新增登录会话表与访客数据认领记录表
  (database) => {
    database.exec(`
      -- 登录会话：token 是服务端签发的唯一凭据，客户端无法伪造
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

      -- 访客数据认领记录：保证同一份访客数据只能被迁移一次，防止数据被反复劫持
      CREATE TABLE IF NOT EXISTS guest_claims (
        guest_user_id TEXT PRIMARY KEY,
        claimed_by TEXT NOT NULL,
        claimed_at TEXT NOT NULL
      );
    `);
  },

  // v2 -> v3：为菜谱表增加归属字段，让 AI 定制菜谱成为「用户私有内容」
  (database) => {
    // 内置菜谱 owner_id 为 NULL；AI 菜谱记录生成者的用户 ID
    // SQLite 对已存在的表新增列只能用 ALTER TABLE，老用户升级时自动补齐该列
    database.exec(`
      ALTER TABLE recipes ADD COLUMN owner_id TEXT;
    `);

    // 存量 AI 菜谱是旧版本在「无归属」机制下生成的全局共享数据，
    // 无法确定其真实创建者。它们本就是临时内容（旧机制还会按全局 50 条自动清理），
    // 因此直接清除，避免出现「任何人都无权删除、也无法被新上限机制回收」的无主数据堆积。
    // 内置菜谱（owner_id 为 NULL 的非 ai-recipe- 记录）不受影响。
    database.exec(`
      DELETE FROM recipes WHERE id LIKE 'ai-recipe-%';
    `);

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes (owner_id);
    `);
  },
];

/**
 * 执行数据库迁移
 * 借助 SQLite 内置的 user_version 记录当前结构版本，避免重复执行。
 * 每个迁移都包在事务里：失败会自动回滚，不会留下半成品结构。
 */
export function runMigrations(): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    const migrate = MIGRATIONS[version];
    db.transaction(() => {
      migrate(db);
      db.pragma(`user_version = ${version + 1}`);
    })();
    console.log(`✅ 数据库迁移完成：v${version} → v${version + 1}`);
  }
}

// 模块加载时立即执行迁移，确保任何查询开始前结构已就绪
runMigrations();

export default db;