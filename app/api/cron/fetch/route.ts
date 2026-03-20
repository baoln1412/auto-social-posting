import { NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Cron endpoint: triggered daily at 8AM GMT+7 (1AM UTC) by Vercel.
 * Also callable manually. Validates CRON_SECRET if set.
 */
export async function GET(request: Request) {
  // Validate cron secret if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    // Step 1: Fetch news articles
    console.log('[cron] Starting scheduled fetch at', new Date().toISOString());
    const fetchRes = await fetch(`${baseUrl}/api/fetch-news`, { cache: 'no-store' });
    if (!fetchRes.ok) throw new Error(`Fetch news failed: ${fetchRes.status}`);
    const { articles } = await fetchRes.json();

    if (!articles || articles.length === 0) {
      console.log('[cron] No articles found');
      return NextResponse.json({ success: true, message: 'No articles found', count: 0 });
    }

    console.log(`[cron] Found ${articles.length} articles, starting pipeline...`);

    // Step 2: Trigger pipeline
    const pipelineRes = await fetch(`${baseUrl}/api/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });

    if (!pipelineRes.ok) throw new Error(`Pipeline failed: ${pipelineRes.status}`);

    // Read and discard the SSE stream to let it complete
    const reader = pipelineRes.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    console.log(`[cron] Pipeline completed for ${articles.length} articles`);
    return NextResponse.json({
      success: true,
      message: `Processed ${articles.length} articles`,
      count: articles.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron] Scheduled fetch failed:', err);
    return NextResponse.json(
      { error: 'Cron fetch failed', details: String(err) },
      { status: 500 },
    );
  }
}
