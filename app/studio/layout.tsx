import { notFound } from 'next/navigation';
import Link from 'next/link';
import { tier } from '@/lib/studio/tier';
import { seedDemo } from '@/lib/studio/demo/seed';

// Studio is off unless the server says otherwise, so :3000's production build never
// exposes a half-built route tree. `npm run dev:studio` sets it.
export const dynamic = 'force-dynamic';

// `soon` items are drawn but not linked — the shell shows its whole shape from slice 0,
// and each slice flips one flag as it lands.
const NAV: { href: string; label: string; soon?: boolean }[] = [
  { href: '/studio', label: 'Tạo mới' },
  { href: '/studio/channels', label: 'Kênh' },
  { href: '/studio/kits', label: 'Bộ nhận diện' },
  { href: '/studio/library', label: 'Thư viện' },
  { href: '/studio/assets', label: 'Kho tài nguyên' },
  { href: '/studio/guide', label: 'Hướng dẫn' },
  { href: '/studio/settings', label: 'Cài đặt' },
];

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.STUDIO_ENABLED) notFound();
  const t = tier();
  seedDemo();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r-2 border-foreground/15 p-5">
        <Link href="/studio" className="block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Desoul
          </div>
          <div className="text-xl font-bold leading-tight">Studio</div>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((n) =>
            n.soon ? (
              <span
                key={n.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                {n.label}
                <span className="font-mono text-[10px] uppercase tracking-wider">sắp có</span>
              </span>
            ) : (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>

        <div className="mt-auto">
          <span
            data-testid="tier-badge"
            className="pen-line-sm inline-block rounded-md bg-card px-2 py-1 font-mono text-[11px] uppercase tracking-wider"
          >
            {t}
          </span>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
