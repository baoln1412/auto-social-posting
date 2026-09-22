import Link from 'next/link';
import { studioDb } from '@/lib/studio/db';
import { cardParams, cardPath } from '@/lib/studio/kits/load';
import type { Kit } from '@/lib/studio/steps/types';

export const dynamic = 'force-dynamic';

/** One headline, every kit — the only way to see what a kit actually changes. */
const SAMPLE = {
  title: 'MỸ: CỤ BÀ 82 TUỔI Ở POMONA BỊ LỪA MẤT 2.500 ĐÔ VÌ CHIÊU VÉ SỐ TRÚNG THƯỞNG',
};

export default function KitsPage() {
  const rows = studioDb().prepare('SELECT id, name, json FROM studio_kits ORDER BY id').all() as {
    id: string;
    name: string;
    json: string;
  }[];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Bộ nhận diện</h1>
        <p className="text-sm text-muted-foreground">
          Cùng một tiêu đề, mỗi bộ một kiểu. Đây là cách duy nhất thấy được bộ nào đổi cái gì.
        </p>
      </header>

      <ul data-testid="kit-grid" className="grid gap-6 sm:grid-cols-2">
        {rows.map((r) => {
          let kit: Kit;
          try {
            kit = JSON.parse(r.json);
          } catch {
            kit = { id: r.id, name: r.name };
          }
          const card = (kit.card ?? {}) as Record<string, string>;
          return (
            <li key={r.id} data-testid={`kit-${r.id}`} className="flex flex-col gap-2">
              <Link href={`/studio/kits/${r.id}`} className="card-warm block overflow-hidden p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid={`kit-card-${r.id}`}
                  src={`${cardPath(kit)}?${cardParams(kit, SAMPLE)}`}
                  alt={r.name}
                  className="w-full rounded-md"
                />
              </Link>
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.name}</span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {card.ratio} · {card.highlight}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
