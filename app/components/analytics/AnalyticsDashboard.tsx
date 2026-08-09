'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, CheckCircle2, FileEdit, FileText, TrendingUp, type LucideIcon } from 'lucide-react';

interface Stats {
  total: number;
  draft: number;
  scheduled: number;
  published: number;
  failed: number;
  thisWeek: number;
  engagement: { likes: number; comments: number; shares: number };
}

interface AnalyticsDashboardProps {
  pageId: string;
}

function StatCard({ label, value, Icon, color }: { label: string; value: number | string; Icon: LucideIcon; color: string }) {
  return (
    <Card className="card-warm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-normal">{label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
          </div>
          <Icon size={28} className={`opacity-40 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard({ pageId }: AnalyticsDashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics?pageId=${pageId}`);
      const data = await res.json();
      setStats(data.stats ?? null);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading analytics…</div>;
  }

  if (!stats) {
    return <div className="text-center py-20 text-muted-foreground">No data available.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-display text-foreground">Analytics Overview</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Posts" value={stats.total} Icon={FileText} color="text-foreground" />
        <StatCard label="Published" value={stats.published} Icon={CheckCircle2} color="text-success" />
        <StatCard label="Scheduled" value={stats.scheduled} Icon={CalendarClock} color="text-warning" />
        <StatCard label="Drafts" value={stats.draft} Icon={FileEdit} color="text-muted-foreground" />
      </div>

      {/* Engagement row */}
      <Card className="card-warm">
        <CardHeader>
          <CardTitle className="text-base">Engagement Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats.engagement.likes}</p>
              <p className="text-sm text-muted-foreground mt-1">Likes</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats.engagement.comments}</p>
              <p className="text-sm text-muted-foreground mt-1">Comments</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats.engagement.shares}</p>
              <p className="text-sm text-muted-foreground mt-1">Shares</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* This week */}
      <Card className="card-warm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-normal">Posts This Week</p>
              <p className="text-2xl font-bold text-foreground mt-1">{stats.thisWeek}</p>
            </div>
            <TrendingUp size={26} className="text-muted-foreground/50" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
