'use client';

/**
 * Thư viện — the gold lake, one PostCard per post (mock-v3/02-library).
 *
 * The card is the old app's own `PostCard`, imported and never edited; the market tabs and
 * filters are the old app's /api/pages and /api/posts. What Studio adds is what the lake
 * cannot know — the post's latest run — drawn around the card: five progress dots, the reel
 * pinned on the hero, and `Tạo video · Sửa ảnh · Đăng`. Runs hang off posts, not the other
 * way round; runs without a post live under the Khác tab (v2's run library, untouched).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid2x2, Image as ImageIcon, List, RefreshCw, Search, Send, Sparkles, Video } from 'lucide-react';
import PostCard from '@/app/components/PostCard';
import type { PostDraft, PostStatus } from '@/app/types';
import { ALL_STEPS, STEP_LABELS, type StepName } from '@/lib/studio/steps/types';

export interface Market {
  id: string;
  name: string;
  countryCode: string;
  /** The Studio channel that reads this market's gold — where a run from a card is made. */
  channelId: string;
}

interface RunSummary {
  id: string;
  status: string;
  done: StepName[];
  reel: string | null;
  frame: string | null;
}

type VideoFilter = 'all' | 'none' | 'running' | 'done' | 'published';

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const dayLabel = (day: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (day === today) return 'Hôm nay';
  if (day === yday) return 'Hôm qua';
  if (!day) return 'Không rõ ngày';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
};

/** Which of the five states a post is in, from its run — the words the card and the filter share. */
export function stateOf(run: RunSummary | undefined): { key: VideoFilter; label: string } {
  if (!run) return { key: 'none', label: 'Chưa có video' };
  if (run.done.includes('publish')) return { key: 'published', label: 'Đã đăng' };
  if (run.done.includes('reel')) return { key: 'done', label: 'Video xong · chờ đăng' };
  const n = run.done.length;
  return { key: 'running', label: run.status === 'error' ? 'Lỗi ở một bước' : `Đang làm · bước ${Math.min(n + 1, 5)}` };
}

export function LakeView({
  markets,
  market,
  canRun,
}: {
  markets: Market[];
  market: Market;
  canRun: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [runs, setRuns] = useState<Record<string, RunSummary>>({});
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('All');
  const [done, setDone] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [video, setVideo] = useState<VideoFilter>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageId: market.id, limit: '30', offset: '0' });
      if (source !== 'All') params.set('source', source);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (done !== 'all') params.set('done', done);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/posts?${params}`);
      const data = (await res.json()) as { posts: PostDraft[]; totalCount: number; filters?: { sources?: string[] } };

      // Both fetches land before anything is shown. Setting the posts first renders the list
      // with an empty run map for a tick, and `Video: chưa có` then shows every post in the
      // market before quietly dropping most of them — the wrong set, visibly.
      const refs = (data.posts ?? []).filter((p) => p.id).map((p) => `gold:${p.id}`);
      let found: Record<string, RunSummary> = {};
      if (refs.length) {
        const r = await fetch(`/api/studio/runs?items=${encodeURIComponent(refs.join(','))}`);
        found = ((await r.json()) as { runs: Record<string, RunSummary> }).runs ?? {};
      }
      setPosts(data.posts ?? []);
      setTotal(data.totalCount ?? 0);
      setSources(data.filters?.sources ?? []);
      setRuns(found);
    } finally {
      setLoading(false);
    }
  }, [market.id, source, from, to, done, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const list = posts.filter((p) => video === 'all' || stateOf(runs[`gold:${p.id}`]).key === video);
    const t = (p: PostDraft) => new Date(p.article.pubDate).getTime() || 0;
    return [...list].sort((a, b) => (sort === 'newest' ? t(b) - t(a) : t(a) - t(b)));
  }, [posts, runs, video, sort]);

  const groups = useMemo(() => {
    const m = new Map<string, PostDraft[]>();
    for (const p of shown) {
      const k = dayOf(p.article.pubDate);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [shown]);

  const setStatus = async (articleUrl: string, status: PostStatus, scheduledAt?: string) => {
    setPosts((prev) => prev.map((p) => (p.article.url === articleUrl ? { ...p, status } : p)));
    await fetch('/api/posts/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleUrl, status, scheduledAt }),
    }).catch(() => load());
  };

  /** The run for a post — the one it has, or a new one — then the run page at `step`. */
  const open = async (post: PostDraft, step?: StepName) => {
    const ref = `gold:${post.id}`;
    const have = runs[ref];
    const suffix = step ? `?step=${step}` : '';
    if (have) return router.push(`/studio/runs/${have.id}${suffix}`);
    setBusy(ref);
    setErr(null);
    try {
      const res = await fetch('/api/studio/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: market.channelId, itemRef: ref }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setErr(body.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push(`/studio/runs/${body.id}${suffix}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div data-testid="lake-toolbar" className="flex flex-wrap items-center gap-2">
        <label className="st-card flex min-w-[240px] flex-1 items-center gap-2 px-3 py-2">
          <Search size={16} strokeWidth={2.25} className="text-muted-foreground" />
          <input
            data-testid="lake-search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo tiêu đề, link nguồn, kênh hoặc mã…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <select
          data-testid="lake-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
          className="st-btn"
        >
          <option value="newest">Mới nhất trước</option>
          <option value="oldest">Cũ nhất trước</option>
        </select>
        <span className="st-seg">
          <button type="button" data-testid="lake-view" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={view === 'grid' ? 'st-on' : ''} title="Lưới">
            <Grid2x2 strokeWidth={2.25} />
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className={view === 'list' ? 'st-on' : ''} title="Danh sách">
            <List strokeWidth={2.25} />
          </button>
        </span>
        <button type="button" data-testid="lake-refresh" onClick={load} className="st-btn st-icon" title="Làm mới">
          <RefreshCw strokeWidth={2.25} className={loading ? 'animate-spin' : ''} />
        </button>
        <Link href="/studio" data-testid="lake-create" className="st-btn st-primary">
          <Sparkles strokeWidth={2.25} />
          Tạo video
        </Link>
      </div>

      <nav data-testid="lake-tabs" className="flex flex-wrap gap-0.5 border-b-2 border-border">
        {markets.map((m) => (
          <Link
            key={m.id}
            href={`/studio/library?market=${m.id}`}
            aria-current={m.id === market.id ? 'page' : undefined}
            className={`-mb-[2px] border-b-[3px] px-3 py-2 text-sm font-semibold ${
              m.id === market.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {m.countryCode ? `${m.countryCode} · ` : ''}
            {m.name}
          </Link>
        ))}
        <Link
          href="/studio/library?market=other"
          data-testid="lake-tab-other"
          className="-mb-[2px] ml-auto border-b-[3px] border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Khác
        </Link>
      </nav>

      <div data-testid="lake-filters" className="flex flex-wrap items-center gap-2">
        <select data-testid="lake-source" value={source} onChange={(e) => setSource(e.target.value)} className="st-btn st-sm">
          <option value="All">Mọi nguồn</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="st-btn st-sm" aria-label="Từ ngày" />
        <span className="st-help">đến</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="st-btn st-sm" aria-label="Đến ngày" />
        <select data-testid="lake-status" value={done} onChange={(e) => setDone(e.target.value)} className="st-btn st-sm">
          <option value="all">Mọi trạng thái</option>
          <option value="not_done">Chưa đăng</option>
          <option value="done">Đã đăng</option>
        </select>
        <select data-testid="lake-video-filter" value={video} onChange={(e) => setVideo(e.target.value as VideoFilter)} className="st-btn st-sm">
          <option value="all">Video: tất cả</option>
          <option value="none">Video: chưa có</option>
          <option value="running">Video: đang làm</option>
          <option value="done">Video: xong</option>
          <option value="published">Video: đã đăng</option>
        </select>
        <span data-testid="lake-count" className="ml-auto text-sm text-muted-foreground">
          <span className="st-num">{shown.length}</span> bài trên trang này · <span className="st-num">{total}</span> tổng
        </span>
      </div>

      {err && <p className="text-sm text-[hsl(var(--destructive))]">{err}</p>}

      {!loading && shown.length === 0 && (
        <p data-testid="lake-empty" className="st-quiet px-4 py-6 text-center text-sm text-muted-foreground">
          Không có bài nào khớp bộ lọc.
        </p>
      )}

      {groups.map(([day, list]) => (
        <section key={day || 'none'}>
          <div data-testid="lake-day" className="mb-2 flex items-baseline gap-2">
            <h2 className="text-[15px] font-bold" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
              {dayLabel(day)}
            </h2>
            <span className="st-num text-xs text-muted-foreground">{list.length}</span>
          </div>
          <div className={view === 'grid' ? 'grid grid-cols-1 gap-4 xl:grid-cols-2' : 'flex flex-col gap-4'}>
            {list.map((post) => {
              const run = runs[`gold:${post.id}`];
              const state = stateOf(run);
              const ref = `gold:${post.id}`;
              return (
                <div key={post.article.url} data-testid="lake-card" className="relative">
                  <span data-testid="lake-title" className="sr-only">
                    {post.emojiTitle || post.article.title}
                  </span>
                  {run?.frame && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={run.frame}
                      alt=""
                      data-testid="lake-reel"
                      className="pointer-events-none absolute right-3 top-[60px] z-10 aspect-[9/16] w-12 rounded-md border-2 border-white object-cover shadow-md"
                    />
                  )}
                  <div className="st-card -mb-2 flex flex-wrap items-center gap-2 rounded-b-none border-b-0 px-4 py-2.5">
                    <span data-testid="lake-dots" className="flex items-center gap-1">
                      {ALL_STEPS.map((s, i) => (
                        <i
                          key={s}
                          title={STEP_LABELS[s]}
                          className={`grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-foreground text-[10px] not-italic ${
                            run?.done.includes(s) ? 'done bg-primary text-white' : 'bg-card'
                          }`}
                          style={{ fontFamily: "'Source Code Pro', monospace" }}
                        >
                          {i + 1}
                        </i>
                      ))}
                    </span>
                    <span data-testid="lake-state" className="text-xs text-muted-foreground">
                      {state.label}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <button type="button" data-testid="lake-video" disabled={busy === ref || !canRun} onClick={() => open(post)} className="st-btn st-sm st-primary">
                        <Video strokeWidth={2.25} />
                        {!run ? 'Tạo video' : run.done.includes('reel') ? 'Xem video' : 'Mở lượt chạy'}
                      </button>
                      <button type="button" data-testid="lake-image" disabled={busy === ref || !canRun} onClick={() => open(post, 'image')} className="st-btn st-sm">
                        <ImageIcon strokeWidth={2.25} />
                        Sửa ảnh
                      </button>
                      <button type="button" data-testid="lake-publish" disabled={busy === ref || !canRun} onClick={() => open(post, 'publish')} className="st-btn st-sm">
                        <Send strokeWidth={2.25} />
                        Đăng
                      </button>
                    </span>
                  </div>
                  <PostCard
                    post={post}
                    pageId={market.id}
                    pageName={market.name}
                    onToggleDone={() => setStatus(post.article.url, post.status === 'published' ? 'draft' : 'published')}
                    onStatusChange={setStatus}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
