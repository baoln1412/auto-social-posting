/**
 * DuckDB medallion data lake (bronze → silver → gold) + audit.
 *
 * - bronze_news        : raw crawled articles (deduped by URL), 7-day retention
 * - silver_immigration : articles the LLM classified as immigration-relevant
 * - gold_content       : LLM-generated content per market (what the site shows)
 * - audit_runs         : per-run / per-feed counts for the audit view
 *
 * This is the SOLE owner of the DuckDB file. Because DuckDB is single-writer
 * across processes, only the Next.js server touches it; the scheduled Claude
 * Code task interacts via HTTP. Timestamps are stored as ISO-8601 TEXT (UTC) so
 * they round-trip as plain strings and sort/compare lexicographically.
 */

import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const LAKE_PATH =
  process.env.DUCKDB_PATH ?? path.join(process.cwd(), 'data', 'lake.duckdb');

let connPromise: Promise<DuckDBConnection> | null = null;

async function getConn(): Promise<DuckDBConnection> {
  if (connPromise) return connPromise;
  connPromise = (async () => {
    fs.mkdirSync(path.dirname(LAKE_PATH), { recursive: true });
    const instance = await DuckDBInstance.create(LAKE_PATH);
    const conn = await instance.connect();
    await initSchema(conn);
    return conn;
  })();
  return connPromise;
}

async function initSchema(conn: DuckDBConnection): Promise<void> {
  await conn.run(`
    CREATE TABLE IF NOT EXISTS bronze_news (
      id           TEXT PRIMARY KEY,
      market_id    TEXT,
      source_name  TEXT,
      article_url  TEXT UNIQUE,
      title        TEXT,
      description  TEXT,
      content      TEXT,
      image_url    TEXT,
      image_urls   TEXT,
      pub_date     TEXT,
      location     TEXT,
      classified   BOOLEAN DEFAULT false,
      fetched_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS silver_immigration (
      id              TEXT PRIMARY KEY,
      bronze_id       TEXT,
      market_id       TEXT,
      article_url     TEXT,
      title           TEXT,
      description     TEXT,
      source_name     TEXT,
      location        TEXT,
      image_url       TEXT,
      image_urls      TEXT,
      category        TEXT,
      relevance_score DOUBLE,
      generated       BOOLEAN DEFAULT false,
      classified_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS gold_content (
      id              TEXT PRIMARY KEY,
      silver_id       TEXT,
      market_id       TEXT,
      article_url     TEXT,
      article_title   TEXT,
      source_name     TEXT,
      location        TEXT,
      image_url       TEXT,
      image_urls      TEXT,
      emoji_title     TEXT,
      body_text       TEXT,
      summary         TEXT,
      hook            TEXT,
      hashtags        TEXT,
      comment_1       TEXT,
      comment_2       TEXT,
      image_prompt    TEXT,
      platform_drafts TEXT,
      language        TEXT,
      status          TEXT DEFAULT 'draft',
      is_done         BOOLEAN DEFAULT false,
      pub_date        TEXT,
      generated_at    TEXT
    );

    -- Migrations for tables created before these columns existed.
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS comment_1 TEXT;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS comment_2 TEXT;
    ALTER TABLE bronze_news        ADD COLUMN IF NOT EXISTS image_urls TEXT;
    ALTER TABLE silver_immigration ADD COLUMN IF NOT EXISTS image_urls TEXT;
    ALTER TABLE gold_content       ADD COLUMN IF NOT EXISTS image_urls TEXT;
    -- 12-topic taxonomy: multi-label topics stored as a JSON array. One silver/gold
    -- row per article (bronze is UNIQUE by article_url), so an article is generated once
    -- regardless of how many topics it carries. category stays = topics[0] for back-compat.
    ALTER TABLE silver_immigration ADD COLUMN IF NOT EXISTS topics TEXT;
    ALTER TABLE gold_content       ADD COLUMN IF NOT EXISTS topics TEXT;

    CREATE TABLE IF NOT EXISTS audit_runs (
      id           TEXT PRIMARY KEY,
      run_at       TEXT,
      market_id    TEXT,
      source_name  TEXT,
      bronze_in    INTEGER,
      bronze_kept  INTEGER,
      silver_count INTEGER,
      gold_count   INTEGER,
      errors       TEXT
    );
  `);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function all(sql: string, params: any[] = []): Promise<Record<string, any>[]> {
  const conn = await getConn();
  const reader = await conn.runAndReadAll(sql, params);
  return reader.getRowObjects() as Record<string, any>[];
}

async function run(sql: string, params: any[] = []): Promise<void> {
  const conn = await getConn();
  await conn.run(sql, params);
}

/** Coerce a possible BigInt (DuckDB COUNT/BIGINT) to a JS number. */
function num(v: any): number {
  return typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
}

// ── Bronze ───────────────────────────────────────────────────────────────────

export interface BronzeInput {
  market_id: string;
  source_name: string;
  article_url: string;
  title: string;
  description?: string;
  content?: string;
  image_url?: string;
  image_urls?: string[];
  pub_date?: string;
  location?: string;
}

/**
 * Canonicalize a URL for dedup: strip tracking query params (utm_*, fbclid, gclid…),
 * the fragment, and a trailing slash so the same story at variant URLs collapses to
 * one bronze row (which is UNIQUE(article_url)). Falls back to the raw string on parse error.
 */
export function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_|igshid$|_hsenc$|_hsmi$|spm$|cmpid$)/i.test(k)) {
        url.searchParams.delete(k);
      }
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

/** Insert raw articles, skipping URLs already present. Returns count inserted. */
export async function insertBronze(rows: BronzeInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const fetched = nowIso();
  let inserted = 0;
  for (const r of rows) {
    const url = canonicalUrl(r.article_url);
    const before = await all('SELECT COUNT(*) AS c FROM bronze_news WHERE article_url = ?', [url]);
    if (num(before[0]?.c) > 0) continue;
    await run(
      `INSERT INTO bronze_news
        (id, market_id, source_name, article_url, title, description, content, image_url, image_urls, pub_date, location, classified, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?)
       ON CONFLICT (article_url) DO NOTHING`,
      [
        randomUUID(), r.market_id, r.source_name, url, r.title,
        r.description ?? '', r.content ?? '', r.image_url ?? null,
        JSON.stringify(r.image_urls ?? []),
        r.pub_date ?? null, r.location ?? null, fetched,
      ],
    );
    inserted++;
  }
  return inserted;
}

/** Delete bronze rows older than N days. Returns count deleted. */
export async function deleteOldBronze(days = 7): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const before = await all('SELECT COUNT(*) AS c FROM bronze_news WHERE fetched_at < ?', [cutoff]);
  await run('DELETE FROM bronze_news WHERE fetched_at < ?', [cutoff]);
  return num(before[0]?.c);
}

export async function getBronze(
  marketId: string,
  status: 'unclassified' | 'all' = 'unclassified',
  limit = 100,
): Promise<Record<string, any>[]> {
  const where = status === 'unclassified' ? 'AND classified = false' : '';
  return all(
    `SELECT id, market_id, source_name, article_url, title, description, location, pub_date
       FROM bronze_news WHERE market_id = ? ${where}
       ORDER BY fetched_at DESC LIMIT ?`,
    [marketId, limit],
  );
}

/**
 * True backlog for a pipeline queue. The GET routes return a *capped page*, so
 * `items.length` hitting the limit reads as "the queue is that big" when it is
 * only "the page is full" — that misread cost a pipeline run a false alarm.
 */
export async function countPending(
  layer: 'bronze' | 'silver',
  marketId: string,
): Promise<number> {
  const [table, col] = layer === 'bronze'
    ? ['bronze_news', 'classified']
    : ['silver_immigration', 'generated'];
  const rows = await all(
    `SELECT COUNT(*) AS c FROM ${table} WHERE market_id = ? AND ${col} = false`,
    [marketId],
  );
  return num(rows[0]?.c);
}

export async function markBronzeClassified(ids: string[]): Promise<void> {
  for (const id of ids) {
    await run('UPDATE bronze_news SET classified = true WHERE id = ?', [id]);
  }
}

/**
 * Cached article bodies keyed by bronze id ('' where never fetched). Feed blurbs run a
 * median 141 chars, so the generation step needs the real article to stay grounded —
 * but only for the handful of rows it actually writes up, hence fetch-on-demand + cache
 * here rather than fetching every crawled article.
 */
export async function getBronzeContent(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(`SELECT id, content FROM bronze_news WHERE id IN (${placeholders})`, ids);
  return new Map(rows.map((r) => [String(r.id), String(r.content ?? '')]));
}

export async function setBronzeContent(id: string, content: string): Promise<void> {
  await run('UPDATE bronze_news SET content = ? WHERE id = ?', [content, id]);
}

export async function getBronzeByIds(ids: string[]): Promise<Record<string, any>[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all(`SELECT * FROM bronze_news WHERE id IN (${placeholders})`, ids);
}

// ── Silver ───────────────────────────────────────────────────────────────────

export interface SilverInput {
  bronze_id: string;
  market_id: string;
  article_url: string;
  title: string;
  description?: string;
  source_name?: string;
  location?: string;
  image_url?: string;
  image_urls?: string[];
  category: string;
  /** Multi-label topics (subset of TOPIC_IDS). category stays = topics[0] for back-compat. */
  topics?: string[];
  relevance_score?: number;
}

export async function insertSilver(rows: SilverInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const ts = nowIso();
  let inserted = 0;
  for (const r of rows) {
    // Idempotency: one silver row per bronze article (guards against re-classify /
    // overlapping batches re-POSTing the same bronze_id).
    const dup = await all('SELECT COUNT(*) AS c FROM silver_immigration WHERE bronze_id = ?', [r.bronze_id]);
    if (num(dup[0]?.c) > 0) continue;
    await run(
      `INSERT INTO silver_immigration
        (id, bronze_id, market_id, article_url, title, description, source_name, location, image_url, image_urls, category, topics, relevance_score, generated, classified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?)`,
      [
        randomUUID(), r.bronze_id, r.market_id, r.article_url, r.title,
        r.description ?? '', r.source_name ?? '', r.location ?? null, r.image_url ?? null,
        JSON.stringify(r.image_urls ?? []),
        r.category, JSON.stringify(r.topics ?? []), r.relevance_score ?? null, ts,
      ],
    );
    inserted++;
  }
  return inserted;
}

export async function getSilver(
  marketId: string,
  status: 'ungenerated' | 'all' = 'ungenerated',
  limit = 100,
): Promise<Record<string, any>[]> {
  const where = status === 'ungenerated' ? 'AND generated = false' : '';
  return all(
    `SELECT id, bronze_id, market_id, article_url, title, description, source_name, location, category, topics, relevance_score
       FROM silver_immigration WHERE market_id = ? ${where}
       ORDER BY classified_at DESC LIMIT ?`,
    [marketId, limit],
  );
}

export async function markSilverGenerated(ids: string[]): Promise<void> {
  for (const id of ids) {
    await run('UPDATE silver_immigration SET generated = true WHERE id = ?', [id]);
  }
}

/**
 * Reset silver rows back to ungenerated and clear their existing gold, so the
 * next pipeline run regenerates content (e.g. after a voice/SOP change). Clearing
 * gold first avoids duplicates (insertGold does not upsert). Scoped to a market
 * when `marketId` is given, otherwise all markets.
 */
export async function resetForRegeneration(
  marketId?: string,
): Promise<{ goldCleared: number; silverReset: number }> {
  const goldWhere = marketId ? 'WHERE market_id = ?' : '';
  const silverWhere = marketId ? 'WHERE market_id = ?' : '';
  const args = marketId ? [marketId] : [];

  const goldBefore = await all(`SELECT COUNT(*) AS c FROM gold_content ${goldWhere}`, args);
  const silverBefore = await all(
    `SELECT COUNT(*) AS c FROM silver_immigration ${silverWhere ? silverWhere + ' AND' : 'WHERE'} generated = true`,
    args,
  );

  await run(`DELETE FROM gold_content ${goldWhere}`, args);
  await run(`UPDATE silver_immigration SET generated = false ${silverWhere}`, args);

  return {
    goldCleared: Number(goldBefore[0]?.c ?? 0),
    silverReset: Number(silverBefore[0]?.c ?? 0),
  };
}

export async function getSilverByIds(ids: string[]): Promise<Record<string, any>[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all(`SELECT * FROM silver_immigration WHERE id IN (${placeholders})`, ids);
}

/** Recent gold text fields for a market — used to learn which vocabulary is generic
 * boilerplate (appears in nearly every post) vs. topic-distinctive, for the
 * body/title mismatch check in the gold insert route. */
export async function getRecentGoldTexts(
  marketId: string,
  limit = 300,
): Promise<Record<string, any>[]> {
  return all(
    `SELECT emoji_title, summary, body_text FROM gold_content WHERE market_id = ? ORDER BY generated_at DESC LIMIT ?`,
    [marketId, limit],
  );
}

// ── Gold ─────────────────────────────────────────────────────────────────────

export interface GoldInput {
  silver_id: string;
  market_id: string;
  article_url?: string;
  article_title?: string;
  source_name?: string;
  location?: string;
  image_url?: string;
  image_urls?: string[];
  emoji_title: string;
  body_text: string;
  summary?: string;
  hook?: string;
  hashtags?: string;
  comment_1?: string;
  comment_2?: string;
  image_prompt?: string;
  platform_drafts?: Record<string, string>;
  language?: string;
  topics?: string[];
  pub_date?: string;
}

export async function insertGold(rows: GoldInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const ts = nowIso();
  let inserted = 0;
  for (const r of rows) {
    // Idempotency: never create a second post for the same silver row, the same
    // article URL in a market, or the same generated title in a market. Guards against
    // pipeline retries / overlapping batches and same-story-different-feed-URL dupes.
    const dup = await all(
      `SELECT COUNT(*) AS c FROM gold_content
        WHERE silver_id = ?
           OR (market_id = ? AND article_url IS NOT NULL AND article_url <> '' AND article_url = ?)
           OR (market_id = ? AND emoji_title = ?)`,
      [r.silver_id, r.market_id, r.article_url ?? '', r.market_id, r.emoji_title],
    );
    if (num(dup[0]?.c) > 0) continue;
    await run(
      `INSERT INTO gold_content
        (id, silver_id, market_id, article_url, article_title, source_name, location, image_url, image_urls, emoji_title, body_text, summary, hook, hashtags, comment_1, comment_2, image_prompt, platform_drafts, language, topics, status, is_done, pub_date, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', false, ?, ?)`,
      [
        randomUUID(), r.silver_id, r.market_id, r.article_url ?? null, r.article_title ?? null,
        r.source_name ?? '', r.location ?? null, r.image_url ?? null,
        JSON.stringify(r.image_urls ?? []),
        r.emoji_title, r.body_text,
        r.summary ?? '', r.hook ?? '', r.hashtags ?? '', r.comment_1 ?? '', r.comment_2 ?? '',
        r.image_prompt ?? '',
        JSON.stringify(r.platform_drafts ?? {}), r.language ?? 'vi',
        JSON.stringify(r.topics ?? []),
        r.pub_date ?? ts, ts,
      ],
    );
    inserted++;
  }
  return inserted;
}

/**
 * Remove duplicate gold posts already in the lake. Keeps the earliest row for each
 * (market_id, article_url) group, then the earliest for each (market_id, emoji_title)
 * group. Returns the number of rows deleted.
 */
export async function dedupeGold(marketId?: string): Promise<number> {
  const mFilter = marketId ? 'WHERE market_id = ?' : '';
  const p = marketId ? [marketId] : [];
  const before = await all(`SELECT COUNT(*) AS c FROM gold_content ${mFilter}`, p);
  // Duplicates sharing an article URL within a market.
  await run(
    `DELETE FROM gold_content WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY market_id, article_url ORDER BY generated_at ASC, id ASC
         ) AS rn
         FROM gold_content ${mFilter}
       ) WHERE rn > 1 AND article_url IS NOT NULL AND article_url <> ''
     )`,
    p,
  );
  // Duplicates sharing a generated title within a market (catches same-story-different-URL).
  await run(
    `DELETE FROM gold_content WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY market_id, emoji_title ORDER BY generated_at ASC, id ASC
         ) AS rn
         FROM gold_content ${mFilter}
       ) WHERE rn > 1
     )`,
    p,
  );
  const after = await all(`SELECT COUNT(*) AS c FROM gold_content ${mFilter}`, p);
  return num(before[0]?.c) - num(after[0]?.c);
}

/**
 * Backfill topics on already-generated gold rows that predate the 12-topic taxonomy.
 * The entire existing corpus was immigration-filtered, so untagged gold → ['immigration'].
 * Only touches gold_content (generated posts); leaves silver/ungenerated rows alone.
 * Returns the number of rows updated.
 */
export async function backfillGoldTopics(marketId?: string): Promise<number> {
  const val = JSON.stringify(['immigration']);
  const empty = "(topics IS NULL OR topics = '' OR topics = '[]')";
  const where = marketId ? `${empty} AND market_id = ?` : empty;
  const before = await all(
    `SELECT COUNT(*) AS c FROM gold_content WHERE ${where}`,
    marketId ? [marketId] : [],
  );
  await run(
    `UPDATE gold_content SET topics = ? WHERE ${where}`,
    marketId ? [val, marketId] : [val],
  );
  return num(before[0]?.c);
}

/**
 * Persist hand-picked card images onto a gold post. `imageUrl` = main background,
 * `insetUrl` = circle inset. Stored so the card (and any later use) keeps them across
 * reloads. image_urls[1] is the inset the card reads; [0] mirrors the main image.
 */
export async function setGoldImages(id: string, imageUrl: string, insetUrl: string): Promise<boolean> {
  const urls = [imageUrl, insetUrl].filter(Boolean);
  await run(
    'UPDATE gold_content SET image_url = ?, image_urls = ? WHERE id = ?',
    [imageUrl || null, JSON.stringify(urls), id],
  );
  return true;
}

export interface GoldFilter {
  marketId: string;
  source?: string;
  from?: string;
  to?: string;
  keyword?: string;
  /** Filter to a single topic id (matches within the JSON topics array). */
  topic?: string;
  done?: 'done' | 'not_done';
  limit?: number;
  offset?: number;
}

/** Fetch gold content for the site, with the same filters the old /api/posts used. */
export async function getGold(f: GoldFilter): Promise<{ rows: Record<string, any>[]; total: number; sources: string[] }> {
  const clauses = ['market_id = ?'];
  const params: any[] = [f.marketId];
  if (f.source && f.source !== 'All') { clauses.push('source_name = ?'); params.push(f.source); }
  if (f.from) { clauses.push('generated_at >= ?'); params.push(`${f.from}T00:00:00.000Z`); }
  if (f.to) { clauses.push('generated_at <= ?'); params.push(`${f.to}T23:59:59.999Z`); }
  if (f.done === 'done') clauses.push('is_done = true');
  else if (f.done === 'not_done') clauses.push('is_done = false');
  if (f.topic && f.topic !== 'All') { clauses.push('topics LIKE ?'); params.push(`%"${f.topic}"%`); }
  if (f.keyword && f.keyword.trim()) {
    const kw = `%${f.keyword.trim()}%`;
    clauses.push('(emoji_title ILIKE ? OR body_text ILIKE ? OR summary ILIKE ?)');
    params.push(kw, kw, kw);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  const countRows = await all(`SELECT COUNT(*) AS c FROM gold_content ${where}`, params);
  const total = num(countRows[0]?.c);

  const limit = f.limit ?? 30;
  const offset = f.offset ?? 0;
  const rows = await all(
    `SELECT * FROM gold_content ${where} ORDER BY generated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const srcRows = await all(
    'SELECT DISTINCT source_name FROM gold_content WHERE market_id = ? ORDER BY source_name',
    [f.marketId],
  );
  const sources = srcRows.map((r) => r.source_name).filter(Boolean);

  return { rows, total, sources };
}

/** Toggle / set the status of a gold item by article_url (used by the site). */
export async function setGoldStatus(articleUrl: string, status: string, isDone: boolean): Promise<void> {
  await run('UPDATE gold_content SET status = ?, is_done = ? WHERE article_url = ?', [status, isDone, articleUrl]);
}

/**
 * Move gold rows (and their linked silver rows) to a different market. Used to
 * re-home posts that were generated under the wrong market (e.g. a US story that
 * arrived via a mis-scoped feed). Returns the count moved.
 */
export async function moveGold(ids: string[], marketId: string): Promise<number> {
  const clean = ids.filter(Boolean);
  if (clean.length === 0 || !marketId) return 0;
  const ph = clean.map(() => '?').join(',');
  // Re-home the linked silver rows too, so a future regeneration stays consistent.
  await run(
    `UPDATE silver_immigration SET market_id = ?
       WHERE id IN (SELECT silver_id FROM gold_content WHERE id IN (${ph}))`,
    [marketId, ...clean],
  );
  await run(`UPDATE gold_content SET market_id = ? WHERE id IN (${ph})`, [marketId, ...clean]);
  return clean.length;
}

/** Delete gold rows by id. Returns the number requested (DuckDB run is fire-and-forget). */
export async function deleteGold(ids: string[]): Promise<number> {
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return 0;
  const placeholders = clean.map(() => '?').join(',');
  await run(`DELETE FROM gold_content WHERE id IN (${placeholders})`, clean);
  return clean.length;
}

/** Status breakdown for the analytics view. */
export async function getGoldStats(marketId: string): Promise<{
  total: number; draft: number; scheduled: number; published: number; failed: number; thisWeek: number;
}> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await all(
    `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
        COUNT(*) FILTER (WHERE status = 'published') AS published,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE generated_at >= ?) AS this_week
       FROM gold_content WHERE market_id = ?`,
    [weekAgo, marketId],
  );
  const r = rows[0] ?? {};
  return {
    total: num(r.total), draft: num(r.draft), scheduled: num(r.scheduled),
    published: num(r.published), failed: num(r.failed), thisWeek: num(r.this_week),
  };
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditInput {
  market_id: string;
  source_name: string;
  bronze_in: number;
  bronze_kept: number;
  silver_count?: number;
  gold_count?: number;
  errors?: string | null;
}

export async function insertAudit(rows: AuditInput[]): Promise<void> {
  const ts = nowIso();
  for (const r of rows) {
    await run(
      `INSERT INTO audit_runs (id, run_at, market_id, source_name, bronze_in, bronze_kept, silver_count, gold_count, errors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), ts, r.market_id, r.source_name, r.bronze_in, r.bronze_kept, r.silver_count ?? 0, r.gold_count ?? 0, r.errors ?? null],
    );
  }
}

/** Audit summary for a market: live layer counts + recent run rows. */
export async function getAuditSummary(marketId: string): Promise<any> {
  const counts = await all(
    `SELECT
        (SELECT COUNT(*) FROM bronze_news WHERE market_id = ?) AS bronze,
        (SELECT COUNT(*) FROM bronze_news WHERE market_id = ? AND classified = false) AS bronze_unclassified,
        (SELECT COUNT(*) FROM silver_immigration WHERE market_id = ?) AS silver,
        (SELECT COUNT(*) FROM silver_immigration WHERE market_id = ? AND generated = false) AS silver_ungenerated,
        (SELECT COUNT(*) FROM gold_content WHERE market_id = ?) AS gold`,
    [marketId, marketId, marketId, marketId, marketId],
  );
  const perSource = await all(
    `SELECT source_name,
            COUNT(*) AS bronze_count
       FROM bronze_news WHERE market_id = ?
       GROUP BY source_name ORDER BY bronze_count DESC`,
    [marketId],
  );
  const silverPerSource = await all(
    `SELECT source_name, COUNT(*) AS silver_count
       FROM silver_immigration WHERE market_id = ?
       GROUP BY source_name ORDER BY silver_count DESC`,
    [marketId],
  );
  const goldPerSource = await all(
    `SELECT source_name, COUNT(*) AS gold_count
       FROM gold_content WHERE market_id = ?
       GROUP BY source_name ORDER BY gold_count DESC`,
    [marketId],
  );
  // Feed health. A feed that dies is otherwise invisible: it just stops contributing,
  // and nothing distinguishes that from a quiet week. Two separate signals, because
  // conflating them is how UK (one live feed, 0.25 articles/cycle) reads as broken:
  //   failing → the crawl recorded a hard fetch/parse failure on its last run
  //   quiet   → fetches fine, but has produced no article in `staleDays`
  const feedHealth = await all(
    `SELECT source_name,
            MAX(run_at) AS last_run,
            MAX(CASE WHEN bronze_in > 0 THEN run_at END) AS last_article,
            SUM(CASE WHEN errors IS NOT NULL THEN 1 ELSE 0 END) AS error_runs
       FROM audit_runs
      WHERE market_id = ? AND source_name <> '(market total)'
      GROUP BY source_name`,
    [marketId],
  );
  // audit_runs.silver_count / gold_count are always 0: the crawl step is the only
  // thing that ever inserts an audit row, so steps 3+4 never get recorded and every
  // run reads as "stopped after crawl". Derive them instead — count the silver/gold
  // rows whose own timestamp lands in this run's window [run_at, next run_at).
  // ponytail: read-time derivation, so it also retro-fixes every historical row.
  // The alternative — writing audit rows from the gold step — fires once per post
  // and would bury the 20-row view under one row per generated post.
  const recentRuns = await all(
    `WITH runs AS (
       SELECT run_at, source_name, bronze_in, bronze_kept, errors,
              LEAD(run_at) OVER (PARTITION BY source_name ORDER BY run_at) AS next_run_at
         FROM audit_runs WHERE market_id = ?
     )
     SELECT r.run_at, r.source_name, r.bronze_in, r.bronze_kept, r.errors,
            (SELECT COUNT(*) FROM silver_immigration s
              WHERE s.market_id = ?
                AND (r.source_name = '(market total)' OR s.source_name = r.source_name)
                AND s.classified_at >= r.run_at
                AND (r.next_run_at IS NULL OR s.classified_at < r.next_run_at)) AS silver_count,
            (SELECT COUNT(*) FROM gold_content g
              WHERE g.market_id = ?
                AND (r.source_name = '(market total)' OR g.source_name = r.source_name)
                AND g.generated_at >= r.run_at
                AND (r.next_run_at IS NULL OR g.generated_at < r.next_run_at)) AS gold_count
       FROM runs r
      ORDER BY r.run_at DESC LIMIT 20`,
    [marketId, marketId, marketId],
  );
  // Last pipeline execution (crawl always runs, even on a 0-yield cycle, so this
  // is a truer "last run" signal than gold's own generated_at) + how many posts
  // that most recent cycle actually produced.
  const lastRunRows = await all(`SELECT MAX(run_at) AS last_run FROM audit_runs WHERE market_id = ?`, [marketId]);
  const lastRunAt: string | null = lastRunRows[0]?.last_run ?? null;
  const sinceRows = lastRunAt
    ? await all(`SELECT COUNT(*) AS c FROM gold_content WHERE market_id = ? AND generated_at >= ?`, [marketId, lastRunAt])
    : [];
  const postsSinceLastRun = num(sinceRows[0]?.c);

  const c = counts[0] ?? {};
  return {
    counts: {
      bronze: num(c.bronze),
      bronzeUnclassified: num(c.bronze_unclassified),
      silver: num(c.silver),
      silverUngenerated: num(c.silver_ungenerated),
      gold: num(c.gold),
    },
    lastRunAt,
    postsSinceLastRun,
    perSource: perSource.map((r) => ({ source: r.source_name, bronze: num(r.bronze_count) })),
    silverPerSource: silverPerSource.map((r) => ({ source: r.source_name, silver: num(r.silver_count) })),
    goldPerSource: goldPerSource.map((r) => ({ source: r.source_name, gold: num(r.gold_count) })),
    recentRuns: recentRuns.map((r) => ({
      runAt: r.run_at, source: r.source_name,
      bronzeIn: num(r.bronze_in), bronzeKept: num(r.bronze_kept),
      silver: num(r.silver_count), gold: num(r.gold_count), errors: r.errors,
    })),
    feedHealth: feedHealth
      .map((r) => {
        const lastArticle: string | null = r.last_article ?? null;
        const quietDays = lastArticle
          ? Math.floor((Date.now() - new Date(lastArticle).getTime()) / 86_400_000)
          : null; // null = never produced an article at all
        return {
          source: r.source_name as string,
          lastArticle,
          quietDays,
          errorRuns: num(r.error_runs),
          // Threshold is generous on purpose: a market can legitimately run a
          // low-volume feed (UK's Guardian publishes ~1.5 articles/day, so a bad
          // week is normal). Silence for a fortnight is not.
          stale: quietDays === null || quietDays >= 14,
        };
      })
      .sort((a, b) => (b.quietDays ?? 1e6) - (a.quietDays ?? 1e6)),
  };
}
