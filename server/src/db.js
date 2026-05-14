import sqlite3 from 'sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'cundiconnection.db');
sqlite3.verbose();
export const db = new sqlite3.Database(dbPath);

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      campus TEXT DEFAULT 'Fusagasugá',
      program TEXT DEFAULT '',
      semester TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      interests TEXT DEFAULT '',
      avatar_gradient TEXT DEFAULT 'violet',
      avatar_url TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      role TEXT DEFAULT 'student' CHECK(role IN ('student','admin')),
      admin_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      approved_at TEXT,
      last_login_at TEXT
    );
  `);

  // Safe migration: add avatar_url to existing databases
  await run(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''`).catch(() => {});

  await run(`
    CREATE TABLE IF NOT EXISTS swipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swiper_id INTEGER NOT NULL,
      swiped_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('like','pass')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(swiper_id, swiped_id),
      FOREIGN KEY(swiper_id) REFERENCES users(id),
      FOREIGN KEY(swiped_id) REFERENCES users(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      target_user_id INTEGER,
      action TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(admin_id) REFERENCES users(id)
    );
  `);
}
