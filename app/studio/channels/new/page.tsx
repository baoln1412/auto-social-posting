import { query } from '@/app/lib/db';
import { studioDb } from '@/lib/studio/db';
import { SOURCES } from '@/lib/studio/sources';
import { ChannelWizard } from '../../components/ChannelWizard';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function NewChannelPage() {
  const sources = Object.values(SOURCES)
    .filter((s) => s.kind !== 'demo')
    .map((s) => ({ kind: s.kind, label: s.label, hint: s.hint, needs: s.needs, blocked: s.blocked() }));

  const { data } = await query('content_pages').select('id,name,country_code').order('name');
  const kits = studioDb().prepare('SELECT id, name FROM studio_kits ORDER BY name').all() as {
    id: string;
    name: string;
  }[];

  return (
    <>
      <PageHeader title="Kênh mới" sub="Năm bước. Bước hai phải lấy được bài thật — kênh hỏng chỉ lộ ra lúc 4 giờ sáng." />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <ChannelWizard sources={sources} markets={(data ?? []) as any} kits={kits} />
      </div>
      </div>
    </>
  );
}
