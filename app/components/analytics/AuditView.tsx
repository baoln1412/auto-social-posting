'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AuditData {
  counts: { bronze: number; bronzeUnclassified: number; silver: number; silverUngenerated: number; gold: number };
  perSource: { source: string; bronze: number }[];
  silverPerSource: { source: string; silver: number }[];
  recentRuns: { runAt: string; source: string; bronzeIn: number; bronzeKept: number; silver: number; gold: number; errors: string | null }[];
  feedHealth?: { source: string; lastArticle: string | null; quietDays: number | null; errorRuns: number; stale: boolean }[];
}

export default function AuditView({ pageId }: { pageId: string }) {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit?marketId=${pageId}`);
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading audit…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">No audit data.</div>;

  const { counts } = data;
  // Merge bronze + silver counts per source for the table.
  const silverBySource = new Map(data.silverPerSource.map((s) => [s.source, s.silver]));
  const sources = data.perSource.map((s) => ({
    source: s.source,
    bronze: s.bronze,
    silver: silverBySource.get(s.source) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <h2 className="text-xl font-bold text-foreground">🔎 Pipeline Audit</h2>

      {/* Layer counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Bronze (raw)', value: counts.bronze, sub: `${counts.bronzeUnclassified} unclassified` },
          { label: 'Silver (immigration)', value: counts.silver, sub: `${counts.silverUngenerated} ungenerated` },
          { label: 'Gold (content)', value: counts.gold, sub: 'generated' },
          { label: 'Filter rate', value: counts.bronze ? `${Math.round((counts.silver / counts.bronze) * 100)}%` : '—', sub: 'silver / bronze' },
          { label: 'Yield', value: counts.silver ? `${Math.round((counts.gold / counts.silver) * 100)}%` : '—', sub: 'gold / silver' },
        ].map((c) => (
          <Card key={c.label} className="card-warm">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-foreground">{c.value}</p>
              <p className="text-xs font-medium text-foreground mt-1">{c.label}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-source */}
      <Card className="card-warm">
        <CardHeader><CardTitle className="text-base">Per source</CardTitle></CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No articles yet. Run the pipeline.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2">Source</th>
                  <th className="py-2 text-right">Bronze (news)</th>
                  <th className="py-2 text-right">Silver (immigration)</th>
                  <th className="py-2 text-right">Kept %</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source} className="border-b border-border/50">
                    <td className="py-2 font-medium text-foreground">{s.source}</td>
                    <td className="py-2 text-right">{s.bronze}</td>
                    <td className="py-2 text-right">{s.silver}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {s.bronze ? `${Math.round((s.silver / s.bronze) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Feed health — only the ones needing attention. The Per-source table above
          reads from bronze, which keeps 7 days, so a feed that stopped contributing
          vanishes from it entirely; these come from audit_runs, which is permanent. */}
      {(data.feedHealth ?? []).some((f) => f.stale) && (
        <Card className="card-warm">
          <CardHeader><CardTitle className="text-base">⚠️ Feeds needing attention</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2">Source</th>
                  <th className="py-2 text-right">Last article</th>
                  <th className="py-2 text-right">Failed runs</th>
                </tr>
              </thead>
              <tbody>
                {(data.feedHealth ?? []).filter((f) => f.stale).map((f) => (
                  <tr key={f.source} className="border-b border-border/50">
                    <td className="py-2 font-medium text-foreground">{f.source}</td>
                    <td className="py-2 text-right">
                      {f.quietDays === null ? 'never' : `${f.quietDays}d ago`}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{f.errorRuns || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-2">
              Quiet for 14+ days, or never produced an article. A low-volume feed can be
              healthy — check the URL before removing it.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent runs */}
      <Card className="card-warm">
        <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
        <CardContent>
          {data.recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5 text-xs">
              {data.recentRuns.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="shrink-0">{new Date(r.runAt).toLocaleString('en-GB')}</span>
                  <span className="truncate flex-1">{r.source}</span>
                  <span className="shrink-0">in {r.bronzeIn} · kept {r.bronzeKept}</span>
                  {r.errors && <span className="text-red-600 shrink-0">⚠</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
