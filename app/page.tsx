'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import PostCard from '@/app/components/PostCard';
import FilterBar from '@/app/components/FilterBar';
import SourceManager from '@/app/components/SourceManager';
import { PostDraft } from '@/app/types';

type Status = 'idle' | 'loading' | 'fetching' | 'processing' | 'done' | 'error';



function StatusBar({
  status,
  progress,
  error,
  postCount,
}: {
  status: Status;
  progress: { current: number; total: number; title?: string } | null;
  error: string | null;
  postCount: number;
}) {
  if (status === 'idle') return null;

  let message = '';
  if (status === 'loading') message = '📂 Loading saved posts...';
  else if (status === 'fetching') message = '📡 Fetching news feeds...';
  else if (status === 'processing') {
    message = progress?.title
      ? `⚙️ ${progress.title}`
      : progress
        ? `⚙️ Processing article ${progress.current} of ${progress.total}...`
        : '⚙️ Starting pipeline...';
  } else if (status === 'done') message = `✅ ${postCount} articles ready`;
  else if (status === 'error') message = `❌ ${error ?? 'An error occurred'}`;

  const isLoading = status === 'loading' || status === 'fetching' || status === 'processing';
  const isError = status === 'error';
  const isDone = status === 'done';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
      style={{
        backgroundColor: isError ? '#3b0000' : isDone ? '#003b1a' : '#1a1a00',
        border: `1px solid ${isError ? '#7f0000' : isDone ? '#006b30' : '#4a4a00'}`,
        color: isError ? '#ff6b6b' : isDone ? '#6bffaa' : '#f0e523',
      }}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<Status>('idle');
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; title?: string } | null>(null);
  const [newPostUrls, setNewPostUrls] = useState<Set<string>>(new Set());

  // Filter state
  const [selectedState, setSelectedState] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [doneFilter, setDoneFilter] = useState('All');

  const isLoading = status === 'loading' || status === 'fetching' || status === 'processing';

  // ── Derive filter options from loaded posts ────────────────────────────
  const availableStates = useMemo(() => {
    const set = new Set(posts.map((p) => p.state).filter((s) => s && s !== 'Unknown'));
    return [...set].sort();
  }, [posts]);

  const availableSources = useMemo(() => {
    const set = new Set(posts.map((p) => p.article.source).filter(Boolean));
    return [...set].sort();
  }, [posts]);

  // ── Load saved posts from Supabase ──────────────────────────────────────
  const loadSavedPosts = useCallback(async (state: string, source: string, from: string, to: string, done: string = 'All') => {
    try {
      setStatus('loading');
      setError(null);

      const params = new URLSearchParams();
      if (state !== 'All') params.set('state', state);
      if (source !== 'All') params.set('source', source);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (done === 'Done') params.set('done', 'done');
      else if (done === 'Not Done') params.set('done', 'not_done');

      const res = await fetch(`/api/posts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load posts');

      const data = await res.json();
      setPosts(data.posts ?? []);
      setStatus('done');
    } catch (err) {
      console.warn('Could not load saved posts:', err);
      setStatus('idle');
    }
  }, []);

  // Load saved posts on mount
  useEffect(() => {
    loadSavedPosts(selectedState, selectedSource, fromDate, toDate, doneFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter handlers
  const handleStateChange = (s: string) => {
    setSelectedState(s);
    loadSavedPosts(s, selectedSource, fromDate, toDate, doneFilter);
  };
  const handleSourceChange = (s: string) => {
    setSelectedSource(s);
    loadSavedPosts(selectedState, s, fromDate, toDate, doneFilter);
  };
  const handleDateRangeChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    loadSavedPosts(selectedState, selectedSource, from, to, doneFilter);
  };
  const handleDoneFilterChange = (d: string) => {
    setDoneFilter(d);
    loadSavedPosts(selectedState, selectedSource, fromDate, toDate, d);
  };

  // ── Toggle done status ─────────────────────────────────────────────────
  const handleToggleDone = async (articleUrl: string, currentDone: boolean) => {
    const newDone = !currentDone;
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.article.url === articleUrl ? { ...p, isDone: newDone } : p
      )
    );
    try {
      const res = await fetch('/api/posts/toggle-done', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl, isDone: newDone }),
      });
      if (!res.ok) throw new Error('Failed to toggle done');
    } catch (err) {
      console.error('Toggle done failed:', err);
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.article.url === articleUrl ? { ...p, isDone: currentDone } : p
        )
      );
    }
  };

  // ── Fetch NEW articles + pipeline ──────────────────────────────────────
  async function handleFetchNew() {
    setStatus('fetching');
    setError(null);
    setProgress(null);

    try {
      const newsRes = await fetch('/api/fetch-news');
      if (!newsRes.ok) throw new Error('Failed to fetch news');
      const { articles } = await newsRes.json();

      setStatus('processing');
      const pipelineRes = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      if (!pipelineRes.ok) throw new Error('Pipeline request failed');

      const reader = pipelineRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'post') {
              setPosts((prev) => [event.post, ...prev]);
              setNewPostUrls((prev) => new Set(prev).add(event.post.article.url));
              newCount++;
            } else if (event.type === 'progress') {
              setProgress({ current: event.current, total: event.total, title: event.title });
            } else if (event.type === 'done') {
              setStatus('done');
            }
          } catch {
            // malformed event — skip
          }
        }
      }

      // Reload from DB to get clean data + filters
      if (newCount > 0) {
        await loadSavedPosts(selectedState, selectedSource, fromDate, toDate, doneFilter);
      } else {
        setStatus('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStatus('error');
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-2" style={{ color: '#ffffff' }}>
          🔴 CRIME NEWS DRAFT TOOL
        </h1>
        <p className="text-base" style={{ color: '#9ca3af' }}>
          Generate Facebook post drafts from today&apos;s crime headlines
        </p>
      </div>

      {/* Source manager */}
      <div className="mb-4">
        <SourceManager />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handleFetchNew}
          disabled={isLoading}
          className="font-bold px-6 py-3 rounded-lg transition-opacity duration-150 text-sm"
          style={{
            backgroundColor: '#f0e523',
            color: '#000000',
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Processing...' : '🔄 Fetch New Articles'}
        </button>
        {posts.length > 0 && (
          <span className="text-sm" style={{ color: '#64748b' }}>
            Only new articles will be processed • Existing posts are loaded from database
          </span>
        )}
      </div>

      {/* Status bar */}
      <div className="mb-4">
        <StatusBar status={status} progress={progress} error={error} postCount={posts.length} />
      </div>

      {/* Filter bar — always show so user can change date range before first fetch */}
      <div className="mb-6">
        <FilterBar
          states={availableStates}
          sources={availableSources}
          selectedState={selectedState}
          selectedSource={selectedSource}
          fromDate={fromDate}
          toDate={toDate}
          doneFilter={doneFilter}
          onStateChange={handleStateChange}
          onSourceChange={handleSourceChange}
          onDateRangeChange={handleDateRangeChange}
          onDoneFilterChange={handleDoneFilterChange}
          totalCount={posts.length}
        />
      </div>

      {/* Post cards grid */}
      {posts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post, index) => (
            <PostCard
              key={`${post.article.url}-${index}`}
              post={post}
              isNew={newPostUrls.has(post.article.url)}
              onToggleDone={() => handleToggleDone(post.article.url, post.isDone ?? false)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {status === 'done' && posts.length === 0 && (
        <div
          className="text-center py-16 rounded-lg"
          style={{ backgroundColor: '#0d1117', border: '1px solid #1e293b' }}
        >
          <p className="text-lg mb-2" style={{ color: '#e2e8f0' }}>
            No posts found
          </p>
          <p className="text-sm" style={{ color: '#64748b' }}>
            Click &quot;Fetch New Articles&quot; to generate your first batch of crime news drafts.
          </p>
        </div>
      )}
    </main>
  );
}
