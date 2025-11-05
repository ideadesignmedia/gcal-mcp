import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export type DB = Database;

export async function openDb(dbPath: string): Promise<DB> {
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  return db;
}

export function run(db: DB, sql: string, params: any[] = []): Promise<void> {
  try { db.prepare(sql).run(...params); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
}

export function get<T = any>(db: DB, sql: string, params: any[] = []): Promise<T | undefined> {
  try { const row = db.prepare(sql).get(...params) as T | undefined; return Promise.resolve(row); } catch (e) { return Promise.reject(e); }
}

export function all<T = any>(db: DB, sql: string, params: any[] = []): Promise<T[]> {
  try { const rows = db.prepare(sql).all(...params) as T[]; return Promise.resolve(rows); } catch (e) { return Promise.reject(e); }
}

export async function tx<T>(db: DB, fn: () => Promise<T>): Promise<T> {
  db.exec('BEGIN IMMEDIATE');
  try { const out = await fn(); db.exec('COMMIT'); return out; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

export async function pragmas(db: DB) {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
}
export async function migrate(db: DB) {
  await tx(db, async () => {
    await run(db, `CREATE TABLE IF NOT EXISTS accounts(
      id TEXT PRIMARY KEY,
      google_user_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      scopes_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    await run(db, `CREATE TABLE IF NOT EXISTS credentials(
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      refresh_token TEXT,
      refresh_token_ct BLOB,
      refresh_token_iv BLOB,
      refresh_token_tag BLOB,
      access_token TEXT,
      access_expires_at INTEGER,
      token_version INTEGER NOT NULL DEFAULT 1
    )`);
    await run(db, `CREATE TABLE IF NOT EXISTS encryption_meta(
      id INTEGER PRIMARY KEY CHECK (id=1),
      is_locked INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      kdf TEXT NOT NULL DEFAULT 'scrypt',
      kdf_salt BLOB,
      kdf_params_json TEXT,
      dek_ct BLOB,
      dek_iv BLOB,
      dek_tag BLOB,
      password_hint TEXT
    )`);
    await run(db, `CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    const em = await get(db, 'SELECT * FROM encryption_meta WHERE id=1');
    if (!em) await run(db, 'INSERT INTO encryption_meta(id,is_locked,version,kdf) VALUES(1,0,1,?)', ['scrypt']);
  });
}
