import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { query } from '@/app/lib/db';
import { studioDb } from '@/lib/studio/db';
import { loadPipeline } from '@/lib/studio/pipeline/config';
import { can, tier } from '@/lib/studio/tier';
import { PipelineSetup, type MarketRow } from '../../components/PipelineSetup';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

/**
 * When the crawler runs by itself, read off the launchd plist that actually schedules it.
 * Printing a remembered cadence would be a second source of truth for the one fact this
 * screen exists to state.
 */
function scheduleText(): string {
  try {
    const xml = fs.readFileSync(
      path.join(process.cwd(), 'deploy', 'com.immigration.pipeline.plist'),
      'utf8',
    );
    const times = [...xml.matchAll(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/g)]
      .map((m) => `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`);
    if (times.length) return `Tự chạy ${times.length} lần mỗi ngày — ${times.join(' · ')}.`;
    const every = /<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/.exec(xml);
    if (every) return `Tự chạy mỗi ${Math.round(Number(every[1]) / 3600)} giờ.`;
  } catch {
    /* no plist on this machine is a fact worth saying, not a crash */
  }
  return 'Chưa tìm thấy lịch tự chạy trên máy này.';
}

export default async function PipelinePage({ params }: { params: { market: string } }) {
  if (!can(tier(), 'run')) notFound();

  const { data } = await query('content_pages')
    .select('id,name,language,writing_style,wording_rules,user_prompt')
    .eq('id', params.market)
    .single();
  if (!data) notFound();
  const row = data as Record<string, string>;
  const market: MarketRow = {
    id: row.id,
    name: row.name,
    language: row.language ?? 'vi',
    writingStyle: row.writing_style ?? '',
    wordingRules: row.wording_rules ?? '',
    userPrompt: row.user_prompt ?? '',
  };

  const kits = studioDb().prepare('SELECT id, name FROM studio_kits ORDER BY name').all() as {
    id: string;
    name: string;
  }[];

  return (
    <>
      <PageHeader
        title={market.name}
        sub={<>Nguồn tự động · bản <span className="st-num">{loadPipeline(market.id).revision}</span></>}
        right={
          <Link href="/studio/pipeline" className="st-btn st-ghost st-sm">
            ← Tất cả thị trường
          </Link>
        }
      />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">

      <PipelineSetup
        market={market}
        kits={kits}
        initial={loadPipeline(market.id).config}
        schedule={scheduleText()}
      />
    </div>
      </div>
    </>
  );
}
