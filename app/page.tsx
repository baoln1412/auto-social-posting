'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ContentPage, PostDraft, Article } from './types';
import PostCard from './components/PostCard';
import SourceManager from './components/SourceManager';
import PageTabs from './components/PageTabs';
import SystemPromptConfig from './components/SystemPromptConfig';
import ChannelManager from './components/ChannelManager';
import Pagination from './components/Pagination';

export default function Home() {
  // ── Pages ──────────────────────────────────────────────────────────
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [pagesLoading, setPagesLoading] = useState(true);

  // ── Posts + pagination ─────────────────────────────────────────────
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 30;
  const [postsLoading, setPostsLoading] = useState(false);
  const [sources, setSources] = useState<string[]>([]);

  // ── Filters ────────────────────────────────────────────────────────
  const [filterSource, setFilterSource] = useState('All');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterDone, setFilterDone] = useState('all');

  // ── Pipeline ───────────────────────────────────────────────────────
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const progressRef = useRef<HTMLDivElement>(null);

  // ── Load pages ─────────────────────────────────────────────────────
  const loadPages = useCallback(async () => {
    try {
      const res = await fetch('/api/pages');
      const data = await res.json();
      const loaded: ContentPage[] = data.pages ?? [];
      setPages(loaded);
      if (loaded.length > 0 && !activePageId) {
        setActivePageId(loaded[0].id);
      }
    } catch (err) {
      console.error('Failed to load pages:', err);
    } finally {
      setPagesLoading(false);
    }
  }, [activePageId]);

  useEffect(() => { loadPages(); }, [loadPages]);

  // ── Load posts ─────────────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    if (!activePageId) return;
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({
        pageId: activePageId,
        limit: String(limit),
        offset: String(offset),
      });
      if (filterSource !== 'All') params.set('source', filterSource);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterDone !== 'all') params.set('done', filterDone);

      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
      setTotalCount(data.totalCount ?? 0);
      setSources(data.filters?.sources ?? []);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setPostsLoading(false);
    }
  }, [activePageId, offset, filterSource, filterFrom, filterTo, filterDone]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Reset offset when filters change
  useEffect(() => { setOffset(0); }, [filterSource, filterFrom, filterTo, filterDone, activePageId]);

  // ── Active page ────────────────────────────────────────────────────
  const activePage = pages.find((p) => p.id === activePageId);

  // ── Add new page ───────────────────────────────────────────────────
  const handleAddPage = async () => {
    const name = prompt('Enter a name for the new content page:');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), systemPrompt: '' }),
      });
      const data = await res.json();
      if (data.page) {
        setPages((prev) => [...prev, data.page]);
        setActivePageId(data.page.id);
      }
    } catch (err) {
      console.error('Failed to create page:', err);
    }
  };

  // ── Save system prompt ─────────────────────────────────────────────
  const handleSavePrompt = async (prompt: string) => {
    if (!activePageId) return;
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activePageId, systemPrompt: prompt }),
    });
    setPages((prev) =>
      prev.map((p) => (p.id === activePageId ? { ...p, systemPrompt: prompt } : p))
    );
  };

  // ── Toggle done ────────────────────────────────────────────────────
  const handleToggleDone = async (articleUrl: string, currentDone: boolean) => {
    setPosts((prev) =>
      prev.map((p) => (p.article.url === articleUrl ? { ...p, isDone: !currentDone } : p))
    );
    try {
      await fetch('/api/posts/toggle-done', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl, isDone: !currentDone }),
      });
    } catch {
      setPosts((prev) =>
        prev.map((p) => (p.article.url === articleUrl ? { ...p, isDone: currentDone } : p))
      );
    }
  };

  // ── Run pipeline ───────────────────────────────────────────────────
  const handleRunPipeline = async () => {
    if (!activePageId || !activePage) return;
    setPipelineRunning(true);
    setProgress('Fetching articles...');

    try {
      // Step 1: Fetch articles
      const fetchRes = await fetch(`/api/fetch-news?pageId=${activePageId}`);
      const fetchData = await fetchRes.json();
      const articles: Article[] = fetchData.articles ?? [];

      if (articles.length === 0) {
        setProgress('No new articles found.');
        setPipelineRunning(false);
        return;
      }

      setProgress(`${articles.length} articles fetched. Processing with AI...`);

      // Step 2: Run pipeline
      const pipelineRes = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles,
          pageId: activePageId,
          systemPrompt: activePage.systemPrompt,
        }),
      });

      const reader = pipelineRes.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setProgress(`${event.current}/${event.total}: ${event.title}`);
            } else if (event.type === 'post') {
              setPosts((prev) => {
                const exists = prev.some((p) => p.article.url === event.post.article.url);
                if (exists) return prev;
                return [event.post, ...prev];
              });
            } else if (event.type === 'done') {
              setProgress(`Done! ${event.total} posts generated.`);
            }
          } catch {}
        }
      }

      // Reload posts
      await loadPosts();
    } catch (err) {
      console.error('Pipeline error:', err);
      setProgress(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setPipelineRunning(false);
    }
  };

  if (pagesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0d1117', color: '#f0e523' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#e2e8f0', minHeight: '100vh' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0e523' }}>
          ⚡ Auto Social Posting
        </h1>

        {/* Page Tabs */}
        <PageTabs
          pages={pages}
          activePageId={activePageId}
          onSelect={(id) => setActivePageId(id)}
          onAddPage={handleAddPage}
        />

        {activePage && (
          <div className="flex flex-col gap-4 mt-4">
            {/* System Prompt Config */}
            <SystemPromptConfig
              key={activePage.id}
              prompt={activePage.systemPrompt}
              onSave={handleSavePrompt}
            />

            {/* Channel Manager */}
            <ChannelManager pageId={activePage.id} />

            {/* Source Manager */}
            <SourceManager pageId={activePage.id} />

            {/* Pipeline controls */}
            <div
              className="rounded-lg p-4 flex flex-col gap-3"
              style={{ backgroundColor: '#0d1117', border: '1px solid #1e293b' }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRunPipeline}
                  disabled={pipelineRunning}
                  className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
                  style={{
                    backgroundColor: pipelineRunning ? '#21262d' : '#f0e523',
                    color: pipelineRunning ? '#8b949e' : '#000',
                    cursor: pipelineRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {pipelineRunning ? '⏳ Running...' : '🚀 Fetch & Generate Posts'}
                </button>
                <button
                  onClick={loadPosts}
                  disabled={postsLoading}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d' }}
                >
                  🔄 Refresh
                </button>
              </div>
              {progress && (
                <div ref={progressRef} className="text-xs" style={{ color: '#f0e523' }}>
                  {progress}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#161b22', color: '#e2e8f0', border: '1px solid #30363d' }}
              >
                <option value="All">All Sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#161b22', color: '#e2e8f0', border: '1px solid #30363d', colorScheme: 'dark' }}
              />
              <span className="text-xs" style={{ color: '#8b949e' }}>to</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#161b22', color: '#e2e8f0', border: '1px solid #30363d', colorScheme: 'dark' }}
              />

              <select
                value={filterDone}
                onChange={(e) => setFilterDone(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#161b22', color: '#e2e8f0', border: '1px solid #30363d' }}
              >
                <option value="all">All Status</option>
                <option value="not_done">Not Done</option>
                <option value="done">Done</option>
              </select>

              <span className="text-xs ml-auto" style={{ color: '#8b949e' }}>
                {totalCount} posts
              </span>
            </div>

            {/* Posts list */}
            {postsLoading ? (
              <div className="text-center py-12" style={{ color: '#8b949e' }}>Loading posts...</div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12 rounded-lg" style={{ backgroundColor: '#161b22', color: '#8b949e', border: '1px solid #1e293b' }}>
                <p className="text-lg mb-2">No posts yet</p>
                <p className="text-sm">Click &quot;Fetch &amp; Generate Posts&quot; to get started.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {posts.map((post) => (
                  <PostCard
                    key={post.article.url}
                    post={post}
                    pageId={activePage.id}
                    onToggleDone={() => handleToggleDone(post.article.url, post.isDone ?? false)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            <Pagination
              totalCount={totalCount}
              limit={limit}
              offset={offset}
              onPageChange={setOffset}
            />
          </div>
        )}
      </div>
    </div>
  );
}
