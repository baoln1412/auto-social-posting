'use client';

import { useState, useEffect } from 'react';

function relativeTime(iso: string | null): string {
  if (!iso) return 'never run';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Compact "last run + posts generated" line shown at the top of a market's content view. */
export default function PipelineStatusBar({ pageId, refreshKey }: { pageId: string; refreshKey?: number }) {
  const [status, setStatus] = useState<{ lastRunAt: string | null; postsSinceLastRun: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    fetch(`/api/audit?marketId=${pageId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setStatus({ lastRunAt: d.lastRunAt ?? null, postsSinceLastRun: d.postsSinceLastRun ?? 0 }); })
      .catch(() => { if (!cancelled) setStatus({ lastRunAt: null, postsSinceLastRun: 0 }); });
    return () => { cancelled = true; };
  }, [pageId, refreshKey]);

  if (!status) return null;

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-2">
      <span>🕐 Last run: {relativeTime(status.lastRunAt)}</span>
      <span className="opacity-50">·</span>
      <span>✨ {status.postsSinceLastRun} post{status.postsSinceLastRun === 1 ? '' : 's'} generated</span>
    </div>
  );
}
