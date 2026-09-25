'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, BookOpen, CalendarDays, Folder, Library, Palette, Plus, Rss, Settings, Tv } from 'lucide-react';

/**
 * The sidebar's nav — the reference's: an icon on every row, the current page filled with the
 * accent wash. Client-side only for `usePathname`; the shell around it is a server component.
 */
const NAV = [
  { href: '/studio', label: 'Tạo video', Icon: Plus },
  { href: '/studio/pipeline', label: 'Nguồn tự động', Icon: Rss },
  { href: '/studio/channels', label: 'Kênh', Icon: Tv },
  { href: '/studio/kits', label: 'Bộ nhận diện', Icon: Palette },
  { href: '/studio/library', label: 'Thư viện', Icon: Library },
  { href: '/studio/calendar', label: 'Lịch đăng', Icon: CalendarDays },
  { href: '/studio/analytics', label: 'Số liệu', Icon: BarChart3 },
  { href: '/studio/assets', label: 'Kho tài nguyên', Icon: Folder },
  { href: '/studio/guide', label: 'Hướng dẫn', Icon: BookOpen },
  { href: '/studio/settings', label: 'Cài đặt', Icon: Settings },
] as const;

export function StudioNav({ counts }: { counts: Partial<Record<string, number>> }) {
  const path = usePathname();
  const current = (href: string) =>
    href === '/studio' ? path === '/studio' || path.startsWith('/studio/runs') : path.startsWith(href);
  return (
    <nav className="st-nav">
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={current(href) ? 'page' : undefined}>
          <Icon strokeWidth={2.25} />
          {label}
          {counts[href] ? <span className="st-count st-num">{counts[href]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
