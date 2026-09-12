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
      comment_3       TEXT,
      series_id       TEXT,
      part_no         INTEGER,
      series_title    TEXT,
      victim_name     TEXT,
      suspect_name    TEXT,
      state_name      TEXT,
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
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS comment_3 TEXT;
    -- Serialised long-form (crime series): parts of one case share series_id and
    -- order by part_no, so a set can be shown, chained and published per instalment.
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS series_id TEXT;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS part_no INTEGER;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS series_title TEXT;
    -- Who the case is about, above the headline. A shelf of "🩸 XẢ SÚNG QUÁN CÀ PHÊ…"
    -- titles is hard to tell apart at a glance; the names and the state are what an
    -- editor actually scans for. Series-level, so every part of a set carries the same one.
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS victim_name TEXT;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS suspect_name TEXT;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS state_name TEXT;

    -- Case queue for the crime vertical. Crime series are case-led, not feed-led:
    -- nothing crawls them, so the scheduled run needs a list to draw down.
    CREATE TABLE IF NOT EXISTS crime_cases (
      id          TEXT PRIMARY KEY,
      market_id   TEXT,
      title       TEXT,
      source_url  TEXT,
      notes       TEXT,
      status      TEXT DEFAULT 'queued',
      series_id   TEXT,
      -- Opinion-sourcing attempts spent on THIS case, enforced server-side rather than
      -- left to the writer's own judgement. Measured cause: an unsupervised research pass
      -- that ran out of real mirrors (CourtListener/Justia/FindLaw/Leagle/Casetext) did not
      -- stop - it invented 35 further fetches against Reddit, Medium, SSRN, a law-school
      -- library homepage and a guessed REST endpoint, for 2.17M tokens and no result on a
      -- case later confirmed genuinely inaccessible. A prompt asking a model to count its
      -- own attempts and stop is exactly the kind of self-policing this project has already
      -- had to backstop with code once (check-series.py, for the SOP's own word-count and
      -- wording rules) - so this is a hard counter the API itself enforces.
      research_attempts INTEGER DEFAULT 0,
      -- Soft ordering signal, not a filter: 1 (default) means either press coverage was
      -- found for this name at discovery time, or it was never checked (DA-sourced cases
      -- already carry the DA's own release as a source, so they're never checked). 0 means
      -- a discovery-time search came back completely empty. Measured cause: three cases in
      -- one batch (Dang Duy Truong, Ex Parte Hiep Duc Ngo, Thanh Kim Hoang) got claimed,
      -- researched and rejected specifically because no coverage existed anywhere - each
      -- cost real research-budget attempts and minutes to discover that by hand. A single
      -- discovery-time query can still miss coverage indexed under a different name, so
      -- this only reorders the queue (claim press_hint=1 first) rather than dropping
      -- press_hint=0 cases - the immigration pipeline's own keyword relevance pre-filter
      -- was tried as a hard filter and measured a NO-GO, so this is deliberately softer.
      press_hint  INTEGER DEFAULT 1,
      created_at  TEXT,
      updated_at  TEXT
    );
    ALTER TABLE crime_cases ADD COLUMN IF NOT EXISTS research_attempts INTEGER DEFAULT 0;
    ALTER TABLE crime_cases ADD COLUMN IF NOT EXISTS press_hint INTEGER DEFAULT 1;
    ALTER TABLE bronze_news        ADD COLUMN IF NOT EXISTS image_urls TEXT;
    ALTER TABLE silver_immigration ADD COLUMN IF NOT EXISTS image_urls TEXT;
    ALTER TABLE gold_content       ADD COLUMN IF NOT EXISTS image_urls TEXT;
    -- 12-topic taxonomy: multi-label topics stored as a JSON array. One silver/gold
    -- row per article (bronze is UNIQUE by article_url), so an article is generated once
    -- regardless of how many topics it carries. category stays = topics[0] for back-compat.
    ALTER TABLE silver_immigration ADD COLUMN IF NOT EXISTS topics TEXT;
    ALTER TABLE gold_content       ADD COLUMN IF NOT EXISTS topics TEXT;
    -- Video Gen + the Facebook-draft editor both used to live in React state only —
    -- a refresh (or the server restarting mid-render) silently threw away a finished
    -- reel and any manual text edit. video_url/narration are written when a render
    -- job completes (see videoJobs.ts); fb_draft when the draft box is saved.
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS video_url TEXT;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS narration TEXT;
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS fb_draft TEXT;
    -- Caption style for the reel renderer, stored as a JSON string (preset + overrides).
    -- Per post rather than per market: two posts in one market legitimately want
    -- different treatments (a quiet policy explainer vs a breaking-news clip).
    ALTER TABLE gold_content ADD COLUMN IF NOT EXISTS caption_style TEXT;

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
  if (status === 'all') {
    return all(
      `SELECT id, market_id, source_name, article_url, title, description, location, pub_date
         FROM bronze_news WHERE market_id = ?
         ORDER BY fetched_at DESC LIMIT ?`,
      [marketId, limit],
    );
  }
  // Source-level trust weighting for the classify queue specifically (not the 'all'
  // display path - a human browsing bronze expects recency order, not this).
  //
  // Keyword-based relevance filtering was measured and killed for this pipeline
  // (see keyword-prefilter-learning-plan.md): the taxonomy is too broad for a literal
  // vocabulary. What that same research found DID predict relevance was the SOURCE -
  // e.g. CIC News is ~100% immigration-relevant, others are far noisier - but source
  // weighting was never built. This is that: within the per-cycle classify LIMIT, a
  // source with a strong recent silver-conversion rate gets classified ahead of one
  // that rarely converts, so classify tokens go where they're likelier to land. Not a
  // filter - every source still gets classified eventually, just not always first.
  //
  // Laplace-smoothed ((+1)/(+2)) so a source with only 1-2 observations doesn't read
  // as a confident 0% or 100% - same reasoning as press_hint's soft, not hard, signal.
  // Sources with zero bronze history in the window default to 1.0 (unproven, not
  // penalized) rather than being buried behind established ones on day one.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return all(
    `WITH bronze_counts AS (
       SELECT source_name, COUNT(*) AS n
       FROM bronze_news WHERE market_id = ? AND classified = true AND fetched_at >= ?
       GROUP BY source_name
     ), silver_counts AS (
       SELECT source_name, COUNT(*) AS n
       FROM silver_immigration WHERE market_id = ? AND classified_at >= ?
       GROUP BY source_name
     ), rates AS (
       SELECT bc.source_name, (COALESCE(sc.n, 0) + 1.0) / (bc.n + 2.0) AS rate
       FROM bronze_counts bc LEFT JOIN silver_counts sc ON sc.source_name = bc.source_name
     )
     SELECT b.id, b.market_id, b.source_name, b.article_url, b.title, b.description, b.location, b.pub_date
     FROM bronze_news b LEFT JOIN rates r ON r.source_name = b.source_name
     WHERE b.market_id = ? AND b.classified = false
     ORDER BY COALESCE(r.rate, 1.0) DESC, b.fetched_at DESC
     LIMIT ?`,
    [marketId, cutoff, marketId, cutoff, marketId, limit],
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
  marketId: string,
): Promise<{ goldCleared: number; silverReset: number }> {
  // Scope is mandatory. With marketId absent the WHERE clause used to come out empty, so
  // this ran a bare `DELETE FROM gold_content` against every market. On 2026-09-12 an agent
  // called it with `silverIds` — a key this path has never read — and that empty clause
  // deleted 9,029 gold rows across all 8 markets, three times over. There is no legitimate
  // caller for "regenerate everything", so refuse rather than infer one.
  if (!marketId) {
    throw new Error('resetForRegeneration requires a marketId - refusing an unscoped reset');
  }
  const args = [marketId];

  const goldBefore = await all('SELECT COUNT(*) AS c FROM gold_content WHERE market_id = ?', args);
  const silverBefore = await all(
    'SELECT COUNT(*) AS c FROM silver_immigration WHERE market_id = ? AND generated = true',
    args,
  );

  await run('DELETE FROM gold_content WHERE market_id = ?', args);
  await run('UPDATE silver_immigration SET generated = false WHERE market_id = ?', args);

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
  comment_3?: string;
  series_id?: string;
  part_no?: number;
  series_title?: string;
  victim_name?: string;
  suspect_name?: string;
  state_name?: string;
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
        (id, silver_id, market_id, article_url, article_title, source_name, location, image_url, image_urls, emoji_title, body_text, summary, hook, hashtags, comment_1, comment_2, comment_3, series_id, part_no, series_title, victim_name, suspect_name, state_name, image_prompt, platform_drafts, language, topics, status, is_done, pub_date, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', false, ?, ?)`,
      [
        randomUUID(), r.silver_id, r.market_id, r.article_url ?? null, r.article_title ?? null,
        r.source_name ?? '', r.location ?? null, r.image_url ?? null,
        JSON.stringify(r.image_urls ?? []),
        r.emoji_title, r.body_text,
        r.summary ?? '', r.hook ?? '', r.hashtags ?? '', r.comment_1 ?? '', r.comment_2 ?? '', r.comment_3 ?? '',
        r.series_id ?? null, r.part_no ?? null, r.series_title ?? null,
        r.victim_name ?? null, r.suspect_name ?? null, r.state_name ?? null,
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

/**
 * Persist a finished reel onto its post — called once by videoJobs.ts when the
 * ffmpeg child process exits 0, so the render survives a page refresh (or the
 * server restarting mid-job) instead of only living in React state.
 */
export async function setGoldVideo(id: string, videoUrl: string, narration: string): Promise<boolean> {
  await run(
    'UPDATE gold_content SET video_url = ?, narration = ? WHERE id = ?',
    [videoUrl, narration, id],
  );
  return true;
}

/** Text fields of a published post that may be corrected in place. */
const EDITABLE_GOLD_FIELDS = [
  'emoji_title', 'body_text', 'summary', 'hook', 'hashtags',
  'comment_1', 'comment_2', 'comment_3', 'series_title', 'image_prompt',
  'victim_name', 'suspect_name', 'state_name', 'fb_draft', 'caption_style',
] as const;
export type EditableGoldField = (typeof EDITABLE_GOLD_FIELDS)[number];

/**
 * Correct a published post's text. There was no way to fix a post short of deleting
 * it — and deleting the gold row alone loses it for good, because its silver row
 * stays `generated = true` and never comes back round. Column names come from the
 * whitelist above, never from the caller.
 */
export async function updateGoldText(
  id: string,
  fields: Partial<Record<EditableGoldField, string>>,
): Promise<number> {
  const cols = (Object.keys(fields) as EditableGoldField[])
    .filter((f) => EDITABLE_GOLD_FIELDS.includes(f) && typeof fields[f] === 'string');
  if (cols.length === 0) return 0;
  await run(
    `UPDATE gold_content SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => fields[c] as string), id],
  );
  const check = await all('SELECT COUNT(*) AS c FROM gold_content WHERE id = ?', [id]);
  return num(check[0]?.c);
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

export interface CrimeSeriesFilter {
  marketId: string;
  /**
   * Inclusive bounds on generated_at, as full ISO instants — NOT calendar dates.
   *
   * generated_at is stored in UTC, and a calendar day here is not a calendar day there: the
   * 06:00 Vietnam batch writes at 23:00 UTC the day before, so treating a picked date as a
   * UTC day filed every morning's eight series under the previous date. The caller converts
   * its own local midnight to an instant, so the boundary follows the viewer's timezone
   * instead of the server's.
   */
  from?: string;
  to?: string;
  state?: string;
  limit?: number;
  offset?: number;
}

/**
 * One page of crime series, filtered and counted in SQL.
 *
 * Not getGold + group-in-the-route, which is how this started: getGold paginates ROWS, so a
 * page boundary would cut a three-part set in half, and every series carries three bodies of
 * 3,000+ words. At eight series a day the whole-market fetch reaches tens of megabytes within
 * a month, and the client was downloading all of it to show the newest few.
 *
 * So: pick the page's series ids from grouped metadata first, then read the bodies for only
 * those ids.
 */
export async function getCrimeSeriesPage(
  f: CrimeSeriesFilter,
): Promise<{ series: Record<string, any>[][]; total: number; states: string[] }> {
  const clauses = ['market_id = ?', "series_id IS NOT NULL", "series_id <> ''"];
  const params: any[] = [f.marketId];
  if (f.from) { clauses.push('generated_at >= ?'); params.push(f.from); }
  if (f.to) { clauses.push('generated_at <= ?'); params.push(f.to); }
  if (f.state && f.state !== 'All') { clauses.push('state_name = ?'); params.push(f.state); }
  const where = `WHERE ${clauses.join(' AND ')}`;

  // A set shares one generated_at, so MAX collapses the group without changing the ordering.
  const groups = await all(
    `SELECT series_id, MAX(generated_at) AS generated_at
       FROM gold_content ${where}
      GROUP BY series_id
      ORDER BY generated_at DESC
      LIMIT ? OFFSET ?`,
    [...params, f.limit ?? 8, f.offset ?? 0],
  );
  const totalRows = await all(
    `SELECT COUNT(DISTINCT series_id) AS c FROM gold_content ${where}`,
    params,
  );

  // The state list is for the filter control, so it must span the whole market rather than
  // the current page - otherwise filtering to one state hides every other option.
  const stateRows = await all(
    `SELECT DISTINCT state_name FROM gold_content
      WHERE market_id = ? AND state_name IS NOT NULL AND state_name <> ''
      ORDER BY state_name`,
    [f.marketId],
  );

  const ids = groups.map((g) => g.series_id as string);
  let series: Record<string, any>[][] = [];
  if (ids.length > 0) {
    const rows = await all(
      `SELECT * FROM gold_content WHERE series_id IN (${ids.map(() => '?').join(',')})
        ORDER BY part_no`,
      ids,
    );
    const by = new Map<string, Record<string, any>[]>();
    for (const r of rows) {
      if (!by.has(r.series_id)) by.set(r.series_id, []);
      by.get(r.series_id)!.push(r);
    }
    // Keep the page in the order the group query established, not the row order.
    series = ids.map((id) => by.get(id) ?? []).filter((p) => p.length > 0);
  }

  return {
    series,
    total: num(totalRows[0]?.c),
    states: stateRows.map((r) => r.state_name as string).filter(Boolean),
  };
}

/**
 * Attach censored source images to every part of a crime series.
 *
 * Series-level, like the victim/suspect/state fields: the images belong to the case, not to
 * one instalment, and writing them onto each row keeps a part self-describing.
 */
/** What a series already carries, so a later attach adds rather than replaces. */
export async function getCrimeSeriesImages(seriesId: string): Promise<{ source: string }[]> {
  const rows = await all(
    "SELECT image_urls FROM gold_content WHERE series_id = ? AND image_urls IS NOT NULL AND image_urls <> '' LIMIT 1",
    [seriesId],
  );
  try {
    const v = JSON.parse(rows[0]?.image_urls || '[]');
    return Array.isArray(v) ? v.filter((i) => i && typeof i === 'object' && typeof i.url === 'string') : [];
  } catch {
    return [];
  }
}

export async function setCrimeSeriesImages(seriesId: string, images: unknown[]): Promise<number> {
  await run('UPDATE gold_content SET image_urls = ? WHERE series_id = ?', [JSON.stringify(images), seriesId]);
  const rows = await all('SELECT COUNT(*) AS c FROM gold_content WHERE series_id = ?', [seriesId]);
  return num(rows[0]?.c);
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

// ── Crime case queue ──────────────────────────────────────────────────────
export interface CrimeCase {
  id: string; market_id: string; title: string; source_url?: string;
  notes?: string; status: string; series_id?: string; research_attempts?: number;
  press_hint?: number; created_at?: string; updated_at?: string;
}

/**
 * Spend one opinion-sourcing attempt against the case's hard budget. Returns the count
 * AFTER this attempt and whether another is still allowed - the caller (the crime-series
 * writer) must stop trying alternate sources once `allowed` is false, not negotiate with it.
 */
export async function spendResearchAttempt(id: string, max: number): Promise<{ attempts: number; allowed: boolean }> {
  await run('UPDATE crime_cases SET research_attempts = research_attempts + 1 WHERE id = ?', [id]);
  const rows = await all('SELECT research_attempts AS n FROM crime_cases WHERE id = ?', [id]);
  const attempts = num(rows[0]?.n);
  return { attempts, allowed: attempts <= max };
}

export async function addCrimeCase(r: { market_id: string; title: string; source_url?: string; notes?: string; press_hint?: number }): Promise<string> {
  const id = randomUUID(); const ts = nowIso();
  await run(
    `INSERT INTO crime_cases (id, market_id, title, source_url, notes, press_hint, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [id, r.market_id, r.title, r.source_url ?? '', r.notes ?? '', r.press_hint ?? 1, ts, ts],
  );
  return id;
}

export async function listCrimeCases(marketId: string, status?: string): Promise<CrimeCase[]> {
  const where = status ? 'WHERE market_id = ? AND status = ?' : 'WHERE market_id = ?';
  const args = status ? [marketId, status] : [marketId];
  return (await all(
    `SELECT * FROM crime_cases ${where} ORDER BY created_at DESC`, args,
  )) as unknown as CrimeCase[];
}

export async function setCrimeCaseStatus(id: string, status: string, seriesId?: string): Promise<void> {
  await run(
    `UPDATE crime_cases SET status = ?, series_id = COALESCE(?, series_id), updated_at = ? WHERE id = ?`,
    [status, seriesId ?? null, nowIso(), id],
  );
}

export async function deleteCrimeCase(id: string): Promise<void> {
  await run(`DELETE FROM crime_cases WHERE id = ?`, [id]);
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

/**
 * How many of a feed's most recent runs failed, counting back from the latest until
 * the first success. Lets the crawl tell a blip apart from a genuinely dead feed
 * before it rewrites the feed's URL — Euronews logged 4 intermittent 406s while
 * serving 50 items perfectly well to a direct fetch.
 *
 * Counts PRIOR runs only: the caller's own failure isn't written to audit_runs until
 * after the self-heal step, so add it in at the call site.
 */
export async function countConsecutiveFailures(
  marketId: string,
  sourceName: string,
  lookback = 10,
): Promise<number> {
  const rows = await all(
    `SELECT errors FROM audit_runs
      WHERE market_id = ? AND source_name = ?
      ORDER BY run_at DESC LIMIT ?`,
    [marketId, sourceName, lookback],
  );
  let n = 0;
  for (const r of rows) {
    if (r.errors == null) break;
    n++;
  }
  return n;
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
