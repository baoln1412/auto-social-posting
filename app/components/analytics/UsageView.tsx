'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Usage view — per-source spend vs. yield, so you can decide which sources to drop.
 *
 * Token spend is NOT metered per source (the LLM work runs in the scheduled
 * Claude Code task, not the API), so it is ESTIMATED from the funnel counts:
 *   est = bronze × classify-cost  +  gold × generate-cost
 * The estimate is meant for RELATIVE comparison between sources (who burns the
 * most screening effort for the least output), not billing — you're on a
 * subscription, not per-token.
 */

// Rough per-unit token estimates (input + output). Tunable — used only for
// relative comparison across sources.
const TOK_CLASSIFY = 250; // per bronze article screened in the silver step
const TOK_GOLD = 9000; // per generated gold post (article in + VN editorial + comments out)

interface AuditData {
  perSource: { source: string; bronze: number }[];
  silverPerSource: { source: string; silver: number }[];
  goldPerSource: { source: string; gold: number }[];
}

interface Row {
  source: string;
  bronze: number;
  silver: number;
  gold: number;
  keptPct: number | null; // silver / bronze
  yieldPct: number | null; // gold / bronze
  tokens: number;
  verdict: { icon: string; label: string; tone: string };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function judge(bronze: number, gold: number, yieldPct: number | null): Row['verdict'] {
  if (bronze >= 10 && gold === 0)
    return { icon: '🔴', label: 'Drop', tone: 'text-red-600' };
  if (bronze >= 20 && (yieldPct ?? 100) < 5)
    return { icon: '🟡', label: 'Low yield', tone: 'text-amber-600' };
  return { icon: '🟢', label: 'Keep', tone: 'text-emerald-600' };
}

export default function UsageView({ pageId }: { pageId: string }) {
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

  if (loading) return <div className="text-sm text-muted-foreground">Loading usage…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">No usage data.</div>;

  const silverBy = new Map(data.silverPerSource.map((s) => [s.source, s.silver]));
  const goldBy = new Map(data.goldPerSource.map((s) => [s.source, s.gold]));

  const rows: Row[] = data.perSource.map((s) => {
    const bronze = s.bronze;
    const silver = silverBy.get(s.source) ?? 0;
    const gold = goldBy.get(s.source) ?? 0;
    const keptPct = bronze ? (silver / bronze) * 100 : null;
    const yieldPct = bronze ? (gold / bronze) * 100 : null;
    const tokens = bronze * TOK_CLASSIFY + gold * TOK_GOLD;
    return { source: s.source, bronze, silver, gold, keptPct, yieldPct, tokens, verdict: judge(bronze, gold, yieldPct) };
  }).sort((a, b) => b.tokens - a.tokens);

  const totals = rows.reduce(
    (a, r) => ({ bronze: a.bronze + r.bronze, silver: a.silver + r.silver, gold: a.gold + r.gold, tokens: a.tokens + r.tokens }),
    { bronze: 0, silver: 0, gold: 0, tokens: 0 },
  );
  const dropCount = rows.filter((r) => r.verdict.label === 'Drop').length;

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-foreground">📈 Source Usage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estimated token spend vs. content yield per source. Sources that crawl a lot
          but produce no posts are burning screening effort — candidates to drop.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Est. tokens', value: fmt(totals.tokens), sub: 'all sources' },
          { label: 'Bronze → Gold', value: totals.bronze ? `${Math.round((totals.gold / totals.bronze) * 100)}%` : '—', sub: 'overall yield' },
          { label: 'Gold posts', value: `${totals.gold}`, sub: `${totals.bronze} crawled (7d)` },
          { label: 'Drop candidates', value: `${dropCount}`, sub: 'high crawl · 0 posts' },
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

      {/* Per-source usage table */}
      <Card className="card-warm">
        <CardHeader><CardTitle className="text-base">Per source — spend vs. yield</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No articles yet. Run the pipeline.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2">Source</th>
                    <th className="py-2 text-right">Bronze (7d)</th>
                    <th className="py-2 text-right">Silver</th>
                    <th className="py-2 text-right">Gold</th>
                    <th className="py-2 text-right">Yield %</th>
                    <th className="py-2 text-right">Est. tokens</th>
                    <th className="py-2 text-right">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.source} className="border-b border-border/50">
                      <td className="py-2 font-medium text-foreground">{r.source}</td>
                      <td className="py-2 text-right">{r.bronze}</td>
                      <td className="py-2 text-right">{r.silver}</td>
                      <td className="py-2 text-right">{r.gold}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {r.yieldPct === null ? '—' : `${Math.round(r.yieldPct)}%`}
                      </td>
                      <td className="py-2 text-right tabular-nums">{fmt(r.tokens)}</td>
                      <td className={`py-2 text-right font-medium ${r.verdict.tone}`}>
                        {r.verdict.icon} {r.verdict.label}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold text-foreground">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">{totals.bronze}</td>
                    <td className="py-2 text-right">{totals.silver}</td>
                    <td className="py-2 text-right">{totals.gold}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {totals.bronze ? `${Math.round((totals.gold / totals.bronze) * 100)}%` : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt(totals.tokens)}</td>
                    <td className="py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <strong>Bronze is a rolling 7-day count</strong> (raw articles are pruned after 7 days),
        while <strong>Silver / Gold are cumulative</strong> (never pruned) — so Yield % is
        indicative, not exact, and can exceed 100% for long-lived good sources. The reliable
        drop signal is <span className="text-red-600">🔴 Drop</span>: a source still crawling
        ≥10 articles/week but with 0 posts ever. <span className="text-amber-600">🟡 Low yield</span>
        = &lt;5% of its recent crawl became posts.
        <br />
        Token figures are <strong>estimates</strong> for relative comparison, not billing (the
        pipeline runs on a Claude subscription, not per-token): bronze × {TOK_CLASSIFY} (silver
        screening) + gold × {fmt(TOK_GOLD)} (content generation).
      </p>
    </div>
  );
}
