import Database, { type Database as DatabaseType } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// Ensure DB directory exists
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.DB_PATH);

// Set WAL mode for better concurrency and durability
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
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
}

// Automatically init database tables on load
initDatabase();

export default db;
