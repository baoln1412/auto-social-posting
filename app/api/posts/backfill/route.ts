/**
 * POST /api/posts/backfill
 *
 * Body: { pageId: string, tasks?: ('location')[] }
 *
 * Re-processes existing posts for the given page and fills in missing
 * enrichment fields without re-running the full AI pipeline.
 *
 * Currently supported tasks:
 *   • location — detect US state/city from article_title + description
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── US State / Location detector (mirror of fetch-news/route.ts) ──────────

const US_LOCATIONS: [RegExp, string][] = [
  [/\bAlabama\b/i, 'Alabama'],
  [/\bAlaska\b/i, 'Alaska'],
  [/\bArizona\b/i, 'Arizona'],
  [/\bArkansas\b/i, 'Arkansas'],
  [/\bCalifornia\b/i, 'California'],
  [/\bColorado\b/i, 'Colorado'],
  [/\bConnecticut\b/i, 'Connecticut'],
  [/\bDelaware\b/i, 'Delaware'],
  [/\bFlorida\b/i, 'Florida'],
  [/\bGeorgia\b/i, 'Georgia'],
  [/\bHawaii\b/i, 'Hawaii'],
  [/\bIdaho\b/i, 'Idaho'],
  [/\bIllinois\b/i, 'Illinois'],
  [/\bIndiana\b/i, 'Indiana'],
  [/\bIowa\b/i, 'Iowa'],
  [/\bKansas\b/i, 'Kansas'],
  [/\bKentucky\b/i, 'Kentucky'],
  [/\bLouisiana\b/i, 'Louisiana'],
  [/\bMaine\b/i, 'Maine'],
  [/\bMaryland\b/i, 'Maryland'],
  [/\bMassachusetts\b/i, 'Massachusetts'],
  [/\bMichigan\b/i, 'Michigan'],
  [/\bMinnesota\b/i, 'Minnesota'],
  [/\bMississippi\b/i, 'Mississippi'],
  [/\bMissouri\b/i, 'Missouri'],
  [/\bMontana\b/i, 'Montana'],
  [/\bNebraska\b/i, 'Nebraska'],
  [/\bNevada\b/i, 'Nevada'],
  [/\bNew\s+Hampshire\b/i, 'New Hampshire'],
  [/\bNew\s+Jersey\b/i, 'New Jersey'],
  [/\bNew\s+Mexico\b/i, 'New Mexico'],
  [/\bNew\s+York\b/i, 'New York'],
  [/\bNorth\s+Carolina\b/i, 'North Carolina'],
  [/\bNorth\s+Dakota\b/i, 'North Dakota'],
  [/\bOhio\b/i, 'Ohio'],
  [/\bOklahoma\b/i, 'Oklahoma'],
  [/\bOregon\b/i, 'Oregon'],
  [/\bPennsylvania\b/i, 'Pennsylvania'],
  [/\bRhode\s+Island\b/i, 'Rhode Island'],
  [/\bSouth\s+Carolina\b/i, 'South Carolina'],
  [/\bSouth\s+Dakota\b/i, 'South Dakota'],
  [/\bTennessee\b/i, 'Tennessee'],
  [/\bTexas\b/i, 'Texas'],
  [/\bUtah\b/i, 'Utah'],
  [/\bVermont\b/i, 'Vermont'],
  [/\bVirginia\b(?!\s+Beach)/i, 'Virginia'],
  [/\bVirginia\s+Beach\b/i, 'Virginia Beach'],
  [/\bWashington\s+(?:State|D\.?C\.?)\b/i, 'Washington'],
  [/\bWest\s+Virginia\b/i, 'West Virginia'],
  [/\bWisconsin\b/i, 'Wisconsin'],
  [/\bWyoming\b/i, 'Wyoming'],
  [/\bLos\s+Angeles\b/i, 'Los Angeles, CA'],
  [/\bChicago\b/i, 'Chicago, IL'],
  [/\bHouston\b/i, 'Houston, TX'],
  [/\bPhoenix\b/i, 'Phoenix, AZ'],
  [/\bPhiladelphia\b/i, 'Philadelphia, PA'],
  [/\bSan\s+Antonio\b/i, 'San Antonio, TX'],
  [/\bSan\s+Diego\b/i, 'San Diego, CA'],
  [/\bDallas\b/i, 'Dallas, TX'],
  [/\bSan\s+Jose\b/i, 'San Jose, CA'],
  [/\bAustin\b/i, 'Austin, TX'],
  [/\bJacksonville\b/i, 'Jacksonville, FL'],
  [/\bFort\s+Worth\b/i, 'Fort Worth, TX'],
  [/\bColumbus\b/i, 'Columbus, OH'],
  [/\bCharlotte\b/i, 'Charlotte, NC'],
  [/\bIndianapolis\b/i, 'Indianapolis, IN'],
  [/\bSan\s+Francisco\b/i, 'San Francisco, CA'],
  [/\bSeattle\b/i, 'Seattle, WA'],
  [/\bDenver\b/i, 'Denver, CO'],
  [/\bNashville\b/i, 'Nashville, TN'],
  [/\bOklahoma\s+City\b/i, 'Oklahoma City, OK'],
  [/\bEl\s+Paso\b/i, 'El Paso, TX'],
  [/\bWashington\s+DC\b|\bD\.C\.\b/i, 'Washington D.C.'],
  [/\bLas\s+Vegas\b/i, 'Las Vegas, NV'],
  [/\bMemphis\b/i, 'Memphis, TN'],
  [/\bAtlanta\b/i, 'Atlanta, GA'],
  [/\bBaltimore\b/i, 'Baltimore, MD'],
  [/\bMiami\b/i, 'Miami, FL'],
  [/\bMinneapolis\b/i, 'Minneapolis, MN'],
  [/\bNew\s+Orleans\b/i, 'New Orleans, LA'],
  [/\bDetroit\b/i, 'Detroit, MI'],
];

function detectUsLocation(title: string, description: string): string | null {
  const text = `${title} ${description}`;
  for (const [regex, name] of US_LOCATIONS) {
    if (regex.test(text)) return name;
  }
  return null;
}

// ── Backfill tasks ────────────────────────────────────────────────────────

interface BackfillResult {
  task: string;
  scanned: number;
  updated: number;
  errors: number;
}

async function backfillLocation(
  supabase: ReturnType<typeof getSupabaseServer>,
  pageId: string,
  force: boolean,
): Promise<BackfillResult> {
  // Fetch posts that need location detection
  let query = supabase
    .from('posts')
    .select('id, article_title, description')
    .eq('page_id', pageId);

  if (!force) {
    query = query.is('article_location', null);
  }

  const { data: rows, error } = await query;

  if (error) throw new Error(`DB fetch failed: ${error.message}`);

  const posts = rows ?? [];
  let updated = 0;
  let errors = 0;

  // Batch updates in groups of 20
  const BATCH = 20;
  for (let i = 0; i < posts.length; i += BATCH) {
    const chunk = posts.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (row) => {
        const loc = detectUsLocation(row.article_title ?? '', row.description ?? '');
        if (loc === null && !force) return; // nothing to set
        const { error: upErr } = await supabase
          .from('posts')
          .update({ article_location: loc })
          .eq('id', row.id);
        if (upErr) {
          errors++;
        } else {
          updated++;
        }
      }),
    );
  }

  return { task: 'location', scanned: posts.length, updated, errors };
}

// ── Handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const pageId: string = body.pageId;
    const tasks: string[] = body.tasks ?? ['location'];
    const force: boolean = body.force ?? false;

    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const results: BackfillResult[] = [];

    for (const task of tasks) {
      if (task === 'location') {
        const r = await backfillLocation(supabase, pageId, force);
        results.push(r);
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[backfill]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
