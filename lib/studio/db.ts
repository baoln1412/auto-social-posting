/**
 * Studio's slice of the local SQLite file.
 *
 * Its own connection, deliberately: `app/lib/db.ts` exports no handle, and the plan
 * forbids editing it beyond one line — a second WAL connection to the same file costs
 * nothing and leaves that file's diff empty. Every table is `studio_`-prefixed and every
 * statement is CREATE ... IF NOT EXISTS, so opening this can never disturb what is there.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = () =>
  process.env.STUDIO_SQLITE_PATH ??
  process.env.SQLITE_PATH ??
  path.join(process.cwd(), 'data', 'local.db');

let db: Database.Database | null = null;

export function studioDb(): Database.Database {
  if (db) return db;
  const file = DB_PATH();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  ensureStudioTables(db);
  return db;
}

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export function ensureStudioTables(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS studio_channels (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      market_id     TEXT,
      kit_id        TEXT,
      sources_json  TEXT DEFAULT '[]',
      auto_continue INTEGER DEFAULT 0,
      tier_min      TEXT DEFAULT 'owner',
      makes_json    TEXT DEFAULT '["post","reel"]',
      created_at    TEXT DEFAULT ${NOW}
    );

    CREATE TABLE IF NOT EXISTS studio_kits (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      schema_version INTEGER DEFAULT 1,
      json           TEXT DEFAULT '{}',
      created_at     TEXT DEFAULT ${NOW},
      updated_at     TEXT DEFAULT ${NOW}
    );

    -- item_ref is a string (gold:<id> / url:<canonical> / text:<sha> / reddit:<id>) so a run
    -- outlives the lake row it came from.
    CREATE TABLE IF NOT EXISTS studio_runs (
      id             TEXT PRIMARY KEY,
      channel_id     TEXT,
      item_ref       TEXT,
      -- v1's run mode. Nothing writes or reads it any more: the template comes from the
      -- channel's makes. Kept, not dropped, so the rows already in the owner's db still load.
      mode           TEXT,
      status         TEXT,
      current_step   TEXT,
      overrides_json TEXT DEFAULT '{}',
      selection_json TEXT DEFAULT '{}',
      created_at     TEXT DEFAULT ${NOW},
      updated_at     TEXT DEFAULT ${NOW}
    );

    CREATE TABLE IF NOT EXISTS studio_media (
      id         TEXT PRIMARY KEY,
      kind       TEXT,
      path       TEXT,
      bytes      INTEGER,
      meta_json  TEXT DEFAULT '{}',
      created_at TEXT DEFAULT ${NOW}
    );

    CREATE TABLE IF NOT EXISTS studio_steps (
      id          TEXT PRIMARY KEY,
      run_id      TEXT,
      name        TEXT,
      status      TEXT,
      input_ref   TEXT,
      output_ref  TEXT,
      cost_usd    REAL DEFAULT 0,
      gate_json   TEXT,
      error       TEXT,
      started_at  TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS studio_assets (
      id         TEXT PRIMARY KEY,
      run_id     TEXT,
      kind       TEXT,
      path       TEXT,
      bytes      INTEGER,
      meta_json  TEXT DEFAULT '{}',
      created_at TEXT DEFAULT ${NOW}
    );

    -- Installation-level settings: a Telegram chat id belongs to the install, not a channel.
    CREATE TABLE IF NOT EXISTS studio_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT DEFAULT ${NOW}
    );

    CREATE INDEX IF NOT EXISTS studio_steps_run ON studio_steps (run_id);
    CREATE INDEX IF NOT EXISTS studio_assets_run ON studio_assets (run_id);
    CREATE INDEX IF NOT EXISTS studio_runs_channel ON studio_runs (channel_id);
  `);

  // SQLite has no IF NOT EXISTS for a column, and studio_channels already exists on this
  // machine from slice 0.
  ensureColumn(d, 'studio_channels', 'makes_json', `TEXT DEFAULT '["post","reel"]'`);
  ensureColumn(d, 'studio_assets', 'bytes', 'INTEGER');
}

function ensureColumn(d: Database.Database, table: string, name: string, def: string): void {
  const cols = (d.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
    (r) => r.name,
  );
  if (!cols.includes(name)) d.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${def}`);
}

/** Tests only: drop the handle so the next studioDb() re-opens (and re-creates) the file. */
export function resetStudioDbForTests(): void {
  db?.close();
  db = null;
  const file = DB_PATH();
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
}
