/**
 * Local SQLite data layer.
 *
 * Replaces the hosted Supabase backend with an embedded, file-based SQLite
 * database so all data lives on this machine. `query(table)` returns a small
 * chainable builder that mimics the subset of the supabase-js API used across
 * the API routes, so the call sites stay unchanged.
 *
 * Supported: select / insert / update / delete / upsert, with
 * eq · neq · gte · lte · in · is · or · filter · order · range · limit · single,
 * plus { count: 'exact', head } and onConflict upserts.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

// ── Connection ─────────────────────────────────────────────────────────────

const DB_PATH =
  process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data', 'local.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

// ── Schema ───────────────────────────────────────────────────────────────--

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS content_pages (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      system_prompt   TEXT DEFAULT '',
      user_prompt     TEXT DEFAULT '',
      platform_prompts TEXT DEFAULT '{}',
      keyword_config  TEXT DEFAULT '{}',
      last_fetch_time TEXT,
      -- Market fields (a content_page IS a market in the immigration tool)
      country_code    TEXT DEFAULT '',
      country_name    TEXT DEFAULT '',
      language        TEXT DEFAULT 'vi',
      -- Per-market generation context consumed by the writing skill
      glossary        TEXT DEFAULT '{}',
      wording_rules   TEXT DEFAULT '',
      writing_style   TEXT DEFAULT '',
      created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS rss_feeds (
      id              TEXT PRIMARY KEY,
      page_id         TEXT,
      name            TEXT NOT NULL,
      url             TEXT NOT NULL,
      feed_type       TEXT DEFAULT 'rss',
      scrape_selector TEXT,
      enabled         INTEGER DEFAULT 1,
      crime_specific  INTEGER NOT NULL DEFAULT 0,
      UNIQUE (url)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id                  TEXT PRIMARY KEY,
      page_id             TEXT,
      article_url         TEXT NOT NULL,
      article_title       TEXT,
      source              TEXT,
      pub_date            TEXT,
      image_url           TEXT,
      generated_image_url TEXT,
      description         TEXT,
      summary             TEXT,
      emoji_title         TEXT,
      facebook_text       TEXT,
      platform_drafts     TEXT DEFAULT '{}',
      fetch_time          TEXT,
      article_location    TEXT,
      is_done             INTEGER DEFAULT 0,
      status              TEXT DEFAULT 'draft',
      scheduled_at        TEXT,
      published_at        TEXT,
      engagement          TEXT,
      UNIQUE (article_url)
    );

    CREATE TABLE IF NOT EXISTS page_channels (
      id                 TEXT PRIMARY KEY,
      page_id            TEXT,
      platform           TEXT NOT NULL,
      platform_page_id   TEXT NOT NULL,
      platform_page_name TEXT,
      access_token       TEXT,
      connected_at       TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (page_id, platform, platform_page_id)
    );

    -- Idempotency: one marker per (channel + content) so a retry/double-click never double-posts.
    CREATE TABLE IF NOT EXISTS posted_markers (
      idempotency_key TEXT PRIMARY KEY,
      channel_id      TEXT,
      external_id     TEXT,
      created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Idempotent column migrations for DBs created before market fields existed.
  ensureColumns(d, 'content_pages', {
    country_code: "TEXT DEFAULT ''",
    country_name: "TEXT DEFAULT ''",
    language: "TEXT DEFAULT 'vi'",
    glossary: "TEXT DEFAULT '{}'",
    wording_rules: "TEXT DEFAULT ''",
    writing_style: "TEXT DEFAULT ''",
    // Per-market subset of the 12-topic taxonomy this market generates ('[]' = treat as all).
    enabled_topics: "TEXT DEFAULT '[]'",
  });
}

// ── Idempotency markers ──────────────────────────────────────────────────--
// A stable key = channel + content; the marker records the external post id. Before posting,
// look it up (already posted -> return the id, skip the API call); after a success, record it.

/** External post id if this (channel+content) was already posted, else null. */
export function findPostedMarker(key: string): string | null {
  const row = getDb()
    .prepare('SELECT external_id FROM posted_markers WHERE idempotency_key = ?')
    .get(key) as { external_id: string } | undefined;
  return row?.external_id ?? null;
}

/** Record a successful post so a later retry with the same content is skipped. Best-effort. */
export function recordPostedMarker(key: string, channelId: string, externalId: string): void {
  getDb()
    .prepare(
      'INSERT OR IGNORE INTO posted_markers (idempotency_key, channel_id, external_id) VALUES (?, ?, ?)',
    )
    .run(key, channelId, externalId);
}

/** Add any missing columns to an existing table (SQLite has no IF NOT EXISTS for columns). */
function ensureColumns(
  d: Database.Database,
  table: string,
  cols: Record<string, string>,
): void {
  const existing = new Set(
    (d.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  for (const [name, def] of Object.entries(cols)) {
    if (!existing.has(name)) {
      d.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${def}`);
    }
  }
}

// ── Per-table column metadata (JSON + boolean coercion) ──────────────────────

const JSON_COLS: Record<string, string[]> = {
  posts: ['platform_drafts', 'engagement'],
  content_pages: ['platform_prompts', 'keyword_config', 'glossary', 'enabled_topics'],
  rss_feeds: [],
  page_channels: [],
};

const BOOL_COLS: Record<string, string[]> = {
  posts: ['is_done'],
  rss_feeds: ['enabled', 'crime_specific'],
  content_pages: [],
  page_channels: [],
};

/** Decode a raw SQLite row into the JS shape the app expects. */
function decodeRow(table: string, row: Record<string, any> | undefined): any {
  if (!row) return row;
  const jsonCols = JSON_COLS[table] ?? [];
  const boolCols = BOOL_COLS[table] ?? [];
  const out: Record<string, any> = { ...row };
  for (const c of jsonCols) {
    if (typeof out[c] === 'string') {
      try {
        out[c] = JSON.parse(out[c]);
      } catch {
        /* leave as-is */
      }
    }
  }
  for (const c of boolCols) {
    if (out[c] !== null && out[c] !== undefined) out[c] = Boolean(out[c]);
  }
  return out;
}

/** Encode a JS value for storage (objects → JSON, booleans → 0/1). */
function encodeValue(v: any): any {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ── Error shape compatible with supabase-js ──────────────────────────────────

interface PgError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

function toPgError(err: unknown): PgError {
  const message = err instanceof Error ? err.message : String(err);
  // Map SQLite unique-constraint failures to Postgres' 23505 so existing
  // `error.code === '23505'` checks keep working.
  if (/UNIQUE constraint failed/i.test(message)) {
    return { message, code: '23505' };
  }
  return { message };
}

// ── Query builder ────────────────────────────────────────────────────────────

interface Filter {
  type: 'eq' | 'neq' | 'gte' | 'lte' | 'in' | 'is' | 'like';
  col: string;
  value: any;
}

interface OrGroup {
  /** raw supabase `.or()` string, e.g. "a.ilike.%x%,b.ilike.%x%" */
  raw: string;
}

type Result = { data: any; error: PgError | null; count: number | null };

/**
 * Mirrors supabase-js typing so existing call sites keep their inferred types:
 * a plain query resolves `data: any[] | null`, and `.single()` narrows it to
 * `any | null`. This keeps `.map()/.filter()` callback params contextually
 * typed (no implicit-any) while still allowing `data.id` after `.single()`.
 */
type TypedResult<TData> = { data: TData | null; error: PgError | null; count: number | null };

class QueryBuilder<TData = any[]> implements PromiseLike<TypedResult<TData>> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private filters: Filter[] = [];
  private ors: OrGroup[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private rangeTo: number | null = null;
  private selectCols = '*';
  private wantCount = false;
  private headOnly = false;
  private isSingle = false;
  private returnRows = false;
  private onConflict: string | null = null;

  constructor(private table: string) {}

  // — terminal-ish op setters —
  select(cols = '*', opts?: { count?: string; head?: boolean }): this {
    if (this.op === 'select') this.selectCols = cols || '*';
    if (this.op === 'insert' || this.op === 'update' || this.op === 'upsert') {
      this.returnRows = true;
    }
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  insert(values: any): this {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  update(values: any): this {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  upsert(values: any, opts?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = values;
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  // — filters —
  eq(col: string, value: any): this {
    this.filters.push({ type: 'eq', col, value });
    return this;
  }
  neq(col: string, value: any): this {
    this.filters.push({ type: 'neq', col, value });
    return this;
  }
  gte(col: string, value: any): this {
    this.filters.push({ type: 'gte', col, value });
    return this;
  }
  lte(col: string, value: any): this {
    this.filters.push({ type: 'lte', col, value });
    return this;
  }
  in(col: string, value: any[]): this {
    this.filters.push({ type: 'in', col, value });
    return this;
  }
  is(col: string, value: any): this {
    this.filters.push({ type: 'is', col, value });
    return this;
  }
  /** supabase `.filter(col, op, value)` — only the `like` op is used. */
  filter(col: string, _op: string, value: any): this {
    this.filters.push({ type: 'like', col: col.replace(/::\w+$/, ''), value });
    return this;
  }
  or(raw: string): this {
    this.ors.push({ raw });
    return this;
  }

  // — modifiers —
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number): this {
    this.offsetN = from;
    this.rangeTo = to;
    return this;
  }
  single(): QueryBuilder<any> {
    this.isSingle = true;
    return this as unknown as QueryBuilder<any>;
  }
  maybeSingle(): QueryBuilder<any> {
    this.isSingle = true;
    return this as unknown as QueryBuilder<any>;
  }

  // — WHERE clause assembly —
  private buildWhere(): { sql: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];
    for (const f of this.filters) {
      switch (f.type) {
        case 'eq':
          clauses.push(`"${f.col}" = ?`);
          params.push(encodeValue(f.value));
          break;
        case 'neq':
          clauses.push(`"${f.col}" != ?`);
          params.push(encodeValue(f.value));
          break;
        case 'gte':
          clauses.push(`"${f.col}" >= ?`);
          params.push(encodeValue(f.value));
          break;
        case 'lte':
          clauses.push(`"${f.col}" <= ?`);
          params.push(encodeValue(f.value));
          break;
        case 'in': {
          const arr = (f.value ?? []) as any[];
          if (arr.length === 0) {
            clauses.push('0 = 1');
          } else {
            clauses.push(`"${f.col}" IN (${arr.map(() => '?').join(',')})`);
            params.push(...arr.map(encodeValue));
          }
          break;
        }
        case 'is':
          clauses.push(f.value === null ? `"${f.col}" IS NULL` : `"${f.col}" IS ?`);
          if (f.value !== null) params.push(encodeValue(f.value));
          break;
        case 'like':
          clauses.push(`"${f.col}" LIKE ?`);
          params.push(f.value);
          break;
      }
    }
    for (const og of this.ors) {
      const parsed = parseOr(og.raw);
      if (parsed.sql) {
        clauses.push(`(${parsed.sql})`);
        params.push(...parsed.params);
      }
    }
    return {
      sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  // — execution —
  private run(): Result {
    const d = getDb();
    try {
      switch (this.op) {
        case 'select':
          return this.runSelect(d);
        case 'insert':
          return this.runInsert(d, false);
        case 'upsert':
          return this.runInsert(d, true);
        case 'update':
          return this.runUpdate(d);
        case 'delete':
          return this.runDelete(d);
      }
    } catch (err) {
      return { data: null, error: toPgError(err), count: null };
    }
  }

  private runSelect(d: Database.Database): Result {
    const where = this.buildWhere();

    let count: number | null = null;
    if (this.wantCount) {
      const row = d
        .prepare(`SELECT COUNT(*) AS c FROM "${this.table}"${where.sql}`)
        .get(...where.params) as { c: number };
      count = row.c;
    }

    if (this.headOnly) {
      return { data: null, error: null, count };
    }

    let sql = `SELECT ${this.selectCols} FROM "${this.table}"${where.sql}`;
    if (this.orderCol) {
      sql += ` ORDER BY "${this.orderCol}" ${this.orderAsc ? 'ASC' : 'DESC'}`;
    }
    if (this.offsetN !== null && this.rangeTo !== null) {
      sql += ` LIMIT ${this.rangeTo - this.offsetN + 1} OFFSET ${this.offsetN}`;
    } else if (this.limitN !== null) {
      sql += ` LIMIT ${this.limitN}`;
    }

    const rows = d.prepare(sql).all(...where.params) as Record<string, any>[];
    const decoded = rows.map((r) => decodeRow(this.table, r));

    if (this.isSingle) {
      return { data: decoded[0] ?? null, error: null, count };
    }
    return { data: decoded, error: null, count };
  }

  private prepRecord(rec: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (rec.id === undefined || rec.id === null) out.id = randomUUID();
    for (const [k, v] of Object.entries(rec)) out[k] = encodeValue(v);
    if (out.id === undefined) out.id = randomUUID();
    return out;
  }

  private runInsert(d: Database.Database, upsert: boolean): Result {
    const records: Record<string, any>[] = Array.isArray(this.payload)
      ? this.payload
      : [this.payload];

    const insertedIds: any[] = [];
    const tx = d.transaction(() => {
      for (const raw of records) {
        const rec = this.prepRecord(raw);
        const cols = Object.keys(rec);
        const placeholders = cols.map(() => '?').join(',');
        let sql = `INSERT INTO "${this.table}" (${cols
          .map((c) => `"${c}"`)
          .join(',')}) VALUES (${placeholders})`;

        if (upsert) {
          const conflictCols = (this.onConflict ?? 'id')
            .split(',')
            .map((c) => `"${c.trim()}"`)
            .join(',');
          const updates = cols
            .filter((c) => !(this.onConflict ?? 'id').split(',').map((x) => x.trim()).includes(c))
            .map((c) => `"${c}" = excluded."${c}"`)
            .join(', ');
          sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${
            updates || `"id" = "${this.table}"."id"`
          }`;
        }

        d.prepare(sql).run(...cols.map((c) => rec[c]));
        insertedIds.push(rec.id);
      }
    });
    tx();

    if (this.returnRows) {
      const rows = insertedIds.map((id) =>
        decodeRow(
          this.table,
          d.prepare(`SELECT * FROM "${this.table}" WHERE "id" = ?`).get(id) as any,
        ),
      );
      return {
        data: this.isSingle ? rows[0] ?? null : rows,
        error: null,
        count: null,
      };
    }
    return { data: null, error: null, count: null };
  }

  private runUpdate(d: Database.Database): Result {
    const rec: Record<string, any> = {};
    for (const [k, v] of Object.entries(this.payload)) rec[k] = encodeValue(v);
    const cols = Object.keys(rec);
    const where = this.buildWhere();
    const sql = `UPDATE "${this.table}" SET ${cols
      .map((c) => `"${c}" = ?`)
      .join(', ')}${where.sql}`;
    d.prepare(sql).run(...cols.map((c) => rec[c]), ...where.params);

    if (this.returnRows) {
      const rows = (
        d
          .prepare(`SELECT * FROM "${this.table}"${where.sql}`)
          .all(...where.params) as Record<string, any>[]
      ).map((r) => decodeRow(this.table, r));
      return {
        data: this.isSingle ? rows[0] ?? null : rows,
        error: null,
        count: null,
      };
    }
    return { data: null, error: null, count: null };
  }

  private runDelete(d: Database.Database): Result {
    const where = this.buildWhere();
    d.prepare(`DELETE FROM "${this.table}"${where.sql}`).run(...where.params);
    return { data: null, error: null, count: null };
  }

  // — make the builder awaitable —
  then<TResult1 = TypedResult<TData>, TResult2 = never>(
    onfulfilled?: ((value: TypedResult<TData>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run() as TypedResult<TData>).then(onfulfilled, onrejected);
  }
}

/** Parse a supabase `.or()` string into a SQL OR clause. */
function parseOr(raw: string): { sql: string; params: any[] } {
  const parts = raw.split(',');
  const clauses: string[] = [];
  const params: any[] = [];
  for (const part of parts) {
    const [col, op, ...rest] = part.split('.');
    const value = rest.join('.');
    if (op === 'ilike' || op === 'like') {
      clauses.push(`"${col}" LIKE ?`);
      params.push(value);
    } else if (op === 'eq') {
      clauses.push(`"${col}" = ?`);
      params.push(value);
    }
  }
  return { sql: clauses.join(' OR '), params };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** supabase-compatible entry point: `query('posts').select()...` */
export function query(table: string): QueryBuilder {
  return new QueryBuilder(table);
}

/** A `.from()`-style client object matching the supabase-js surface. */
export interface LocalClient {
  from(table: string): QueryBuilder;
}

export function getLocalClient(): LocalClient {
  // Touch the connection eagerly so schema is ready.
  getDb();
  return { from: (table: string) => new QueryBuilder(table) };
}
