import { query } from '@/app/lib/db';
import { studioDb } from '@/lib/studio/db';
import { SOURCES } from '@/lib/studio/sources';
import { ChannelWizard } from '../../components/ChannelWizard';

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Kênh mới</h1>
        <p className="text-sm text-muted-foreground">
          Năm bước. Bước hai phải lấy được bài thật — kênh hỏng chỉ lộ ra lúc 4 giờ sáng.
        </p>
      </header>
      <ChannelWizard sources={sources} markets={(data ?? []) as any} kits={kits} />
    </div>
  );
}
