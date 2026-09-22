import { studioDb } from '@/lib/studio/db';
import { tier, can } from '@/lib/studio/tier';
import { NewRunBox, type ChannelRow } from './components/NewRunBox';

export const dynamic = 'force-dynamic';

export default function StudioNewPage() {
  const t = tier();
  const channels = studioDb()
    .prepare('SELECT id, name, kit_id, tier_min FROM studio_channels ORDER BY created_at')
    .all() as ChannelRow[];
  const kits = studioDb().prepare('SELECT id, name FROM studio_kits ORDER BY name').all() as {
    id: string;
    name: string;
  }[];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Tạo mới</h1>
        <p className="text-sm text-muted-foreground">
          Dán một đường dẫn, chọn nguồn, hoặc tự viết. Mỗi bước hiện kết quả và chi phí trước
          khi chạy bước sau.
        </p>
      </header>

      <NewRunBox channels={channels} kits={kits} canSpend={can(t, 'spend')} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Kênh
        </h2>
        <ul className="flex flex-col gap-2">
          {channels.map((c) => (
            <li
              key={c.id}
              data-testid="channel-row"
              className="card-warm flex items-center justify-between px-4 py-3"
            >
              <span className="font-medium">{c.name}</span>
              <span className="pen-line-sm rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                {c.tier_min}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Gợi ý
          </h2>
          <p className="text-sm text-muted-foreground/70">Chưa có bài nào chờ dựng.</p>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Gần đây
          </h2>
          <p className="text-sm text-muted-foreground/70">Chưa có lượt chạy nào.</p>
        </div>
      </section>
    </div>
  );
}
