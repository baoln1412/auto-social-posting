import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Plus, Send } from 'lucide-react';
import { tier } from '@/lib/studio/tier';
import { seedDemo } from '@/lib/studio/demo/seed';
import { studioDb } from '@/lib/studio/db';
import { startMetricsLoop, startPublishLoop } from '@/lib/studio/publish/loop';
import { StudioNav } from './components/StudioNav';
import './studio.css';

// Studio is off unless the server says otherwise, so :3000's production build never
// exposes a half-built route tree. `npm run dev:studio` sets it.
export const dynamic = 'force-dynamic';

/** Runs started in the last seven days — the small count beside Thư viện. */
function weekRuns(): number {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return (studioDb().prepare('SELECT COUNT(*) AS n FROM studio_runs WHERE created_at >= ?').get(since) as { n: number }).n;
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.STUDIO_ENABLED) notFound();
  tier();
  seedDemo();
  // Idempotent: the second call sees the timer and returns.
  startPublishLoop();
  startMetricsLoop();

  return (
    <div className="st-app bg-background">
      <aside data-testid="studio-side" className="st-side">
        <Link href="/studio" className="st-lockup">
          {/* The head is INSIDE the word — DESOUL is an image, never typed (brand rule 3).
              The sub-word is set in type at the size AppSidebar measured for a 140px wordmark. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wordmark.png" alt="DESOUL" className="w-full max-w-[140px] h-auto" />
          <span className="desoul-subword uppercase" style={{ fontSize: '29.2px', marginTop: '-6px' }}>
            Studio
          </span>
        </Link>

        <Link href="/studio" data-testid="studio-cta" className="st-cta pen-line">
          <Plus strokeWidth={2.5} />
          Tạo video mới
        </Link>

        <StudioNav counts={{ '/studio/library': weekRuns() }} />

        <div data-testid="studio-tip" className="st-tip pen-line-static">
          <b>
            <Send strokeWidth={2.25} />
            Nhận video qua Telegram
          </b>
          <p>Video render xong tự về chat của bạn, kèm cảnh báo khi lỗi.</p>
          <Link href="/studio/settings" className="st-btn st-primary st-sm w-full">
            Kết nối ngay
          </Link>
        </div>
      </aside>

      <div className="st-main">{children}</div>
    </div>
  );
}
