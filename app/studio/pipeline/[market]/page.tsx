import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query } from '@/app/lib/db';
import { studioDb } from '@/lib/studio/db';
import { loadPipeline } from '@/lib/studio/pipeline/config';
import { can, tier } from '@/lib/studio/tier';
import { PipelineSetup, type MarketRow } from '../../components/PipelineSetup';

import { PageHeader } from '@/app/studio/components/PageHeader';
import { scheduleText } from '@/lib/studio/pipeline/schedule';

export const dynamic = 'force-dynamic';


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
