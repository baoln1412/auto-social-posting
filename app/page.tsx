'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ContentPage, PostDraft, Article, PostStatus, KeywordConfig } from './types';
import AppLayout from './components/layout/AppLayout';
import PostCard from './components/PostCard';
import Pagination from './components/Pagination';
import ContentCalendar from './components/calendar/ContentCalendar';
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import SettingsView from './components/settings/SettingsView';
import { Button } from '@/components/ui/button';
import AIChatWindow, { DashboardFilters } from './components/chat/AIChatWindow';

export default function Home() {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('content');
  const [pagesLoading, setPagesLoading] = useState(true);

  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 30;
  const [postsLoading, setPostsLoading] = useState(false);
  const [sources, setSources] = useState<string[]>([]);

  const [filterSource, setFilterSource] = useState('All');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterDone, setFilterDone] = useState('all');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [progress, setProgress] = useState('');

  // ── Load pages ──
  const loadPages = useCallback(async () => {
    try {
      const res = await fetch('/api/pages');
      const data = await res.json();
      const loaded: ContentPage[] = data.pages ?? [];
      setPages(loaded);
      if (loaded.length > 0 && !activePageId) setActivePageId(loaded[0].id);
    } catch (err) {
      console.error('Failed to load pages:', err);
    } finally {
      setPagesLoading(false);
    }
  }, [activePageId]);

  useEffect(() => { loadPages(); }, [loadPages]);

  // ── Load posts ──
  const loadPosts = useCallback(async () => {
    if (!activePageId) return;
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({ pageId: activePageId, limit: String(limit), offset: String(offset) });
      if (filterSource !== 'All') params.set('source', filterSource);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterDone !== 'all') params.set('done', filterDone);
      if (filterKeyword.trim()) params.set('keyword', filterKeyword.trim());

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
  }, [activePageId, offset, filterSource, filterFrom, filterTo, filterDone, filterKeyword]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { setOffset(0); }, [filterSource, filterFrom, filterTo, filterDone, filterKeyword, activePageId]);

  const activePage = pages.find((p) => p.id === activePageId);

  // ── Page actions ──
  const handleAddPage = async () => {
    const name = prompt('Enter a name for the new content page:');
    if (!name?.trim()) return;

    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.page) {
        setPages((prev) => [...prev, data.page]);
        setActivePageId(data.page.id);
        setActiveView('settings');
      }
    } catch (err) {
      console.error('Failed to create page:', err);
    }
  };

  const handleSavePrompt = async (newPrompt: string, newUserPrompt: string, platformPrompts: Record<string, string>) => {
    if (!activePageId) return;
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activePageId, systemPrompt: newPrompt, userPrompt: newUserPrompt, platformPrompts }),
    });
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePageId ? { ...p, systemPrompt: newPrompt, userPrompt: newUserPrompt, platformPrompts } : p
      )
    );
  };

  const handleSaveKeywordConfig = async (config: KeywordConfig) => {
    if (!activePageId) return;
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activePageId, keywordConfig: config }),
    });
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePageId ? { ...p, keywordConfig: config } : p
      )
    );
  };

  const handleRenamePage = async () => {
    if (!activePage) return;
    const name = prompt('Enter new page name:', activePage.name);
    if (!name?.trim() || name.trim() === activePage.name) return;
    await fetch('/api/pages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activePageId, name: name.trim() }) });
    setPages((prev) => prev.map((p) => (p.id === activePageId ? { ...p, name: name.trim() } : p)));
  };

  const handleDeletePage = async () => {
    if (!activePage || !confirm(`Delete "${activePage.name}"? This cannot be undone.`)) return;
    await fetch(`/api/pages?id=${activePageId}`, { method: 'DELETE' });
    setPages((prev) => prev.filter((p) => p.id !== activePageId));
    setActivePageId(pages.find((p) => p.id !== activePageId)?.id ?? null);
  };

  // ── Status change ──
  const handleStatusChange = async (articleUrl: string, status: PostStatus, scheduledAt?: string) => {
    setPosts((prev) => prev.map((p) => (p.article.url === articleUrl ? { ...p, status } : p)));
    try {
      await fetch('/api/posts/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleUrl, status, scheduledAt }) });
    } catch { loadPosts(); }
  };

  const handleToggleDone = async (articleUrl: string, currentDone: boolean) => {
    const newStatus: PostStatus = currentDone ? 'draft' : 'published';
    handleStatusChange(articleUrl, newStatus);
  };

  // ── Pipeline ──
  const handleRunPipeline = async () => {
    if (!activePageId || !activePage) return;
    setPipelineRunning(true);
    setProgress('Fetching articles...');
    try {
      const fetchRes = await fetch(`/api/fetch-news?pageId=${activePageId}`);
      const fetchData = await fetchRes.json();
      const articles: Article[] = fetchData.articles ?? [];
      if (articles.length === 0) { setProgress('No new articles found.'); setPipelineRunning(false); return; }
      setProgress(`${articles.length} articles fetched. Filtering & processing with AI...`);

      const pipelineRes = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles,
          pageId: activePageId,
          systemPrompt: activePage.systemPrompt,
          userPrompt: activePage.userPrompt ?? '',
          platformPrompts: activePage.platformPrompts ?? {},
          keywordConfig: activePage.keywordConfig ?? { tier1: [], tier2: [], minScore: 1 },
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
            if (event.type === 'progress') setProgress(`${event.current}/${event.total}: ${event.title}`);
            else if (event.type === 'post') {
              setPosts((prev) => {
                if (prev.some((p) => p.article.url === event.post.article.url)) return prev;
                return [event.post, ...prev];
              });
            } else if (event.type === 'done') setProgress(`Done! ${event.total} posts generated.`);
          } catch {}
        }
      }
      await loadPosts();
    } catch (err) {
      setProgress(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally { setPipelineRunning(false); }
  };

  if (pagesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-primary font-semibold">
        Loading...
      </div>
    );
  }

  // ── Content View ──
  const renderContentView = () => {
    if (!activePage) return null;
    return (
      <div className="flex flex-col gap-5 max-w-3xl">
        {/* Pipeline controls */}
        <div className="flex items-center gap-3">
          <Button onClick={handleRunPipeline} disabled={pipelineRunning} size="default"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
            {pipelineRunning ? '⏳ Running...' : '🚀 Fetch & Generate Posts'}
          </Button>
          <Button onClick={loadPosts} disabled={postsLoading} variant="outline" size="default">
            🔄 Refresh
          </Button>
          {progress && <span className="text-xs text-primary font-medium">{progress}</span>}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            value={filterKeyword}
            onChange={(e) => setFilterKeyword(e.target.value)}
            placeholder="🔍 Search keywords..."
            className="text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground w-44"
          />
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground">
            <option value="All">All Sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground" />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground" />
          <select value={filterDone} onChange={(e) => setFilterDone(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground">
            <option value="all">All Status</option>
            <option value="not_done">Drafts</option>
            <option value="done">Published</option>
          </select>
          {filterKeyword && (
            <button onClick={() => setFilterKeyword('')} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
          )}
          <span className="text-xs ml-auto text-muted-foreground">{totalCount} posts</span>
        </div>

        {/* Posts */}
        {postsLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-border bg-card text-muted-foreground">
            <p className="text-lg mb-2 font-medium">No posts yet</p>
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
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}

        <Pagination totalCount={totalCount} limit={limit} offset={offset} onPageChange={setOffset} />
      </div>
    );
  };

  // ── Render view ──
  const renderView = () => {
    if (!activePage) return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-lg mb-2">No pages yet</p>
        <Button onClick={handleAddPage}>Create your first page</Button>
      </div>
    );

    switch (activeView) {
      case 'calendar': return <ContentCalendar pageId={activePage.id} />;
      case 'analytics': return <AnalyticsDashboard pageId={activePage.id} />;
      case 'settings': return (
        <SettingsView
          pageId={activePage.id}
          pageName={activePage.name}
          systemPrompt={activePage.systemPrompt}
          userPrompt={activePage.userPrompt ?? ''}
          platformPrompts={activePage.platformPrompts ?? {}}
          keywordConfig={activePage.keywordConfig ?? { tier1: [], tier2: [], minScore: 1 }}
          onSavePrompt={handleSavePrompt}
          onSaveKeywordConfig={handleSaveKeywordConfig}
          onDeletePage={handleDeletePage}
          onRenamePage={handleRenamePage}
        />
      );
      default: return renderContentView();
    }
  };

  return (
    <AppLayout
      pages={pages}
      activePageId={activePageId}
      activeView={activeView}
      activePageName={activePage?.name ?? ''}
      onViewChange={setActiveView}
      onPageChange={setActivePageId}
      onAddPage={handleAddPage}
    >
      {renderView()}

      {/* AI Chat Copilot — always visible on content view */}
      {activePageId && (
        <AIChatWindow
          pageId={activePageId}
          currentFilters={{ source: filterSource, from: filterFrom, to: filterTo, done: filterDone as DashboardFilters['done'], keyword: filterKeyword }}
          onFiltersChange={(filters) => {
            if (filters.source !== undefined) setFilterSource(filters.source);
            if (filters.from !== undefined) setFilterFrom(filters.from);
            if (filters.to !== undefined) setFilterTo(filters.to);
            if (filters.done !== undefined) setFilterDone(filters.done);
            if (filters.keyword !== undefined) setFilterKeyword(filters.keyword);
          }}
          onPostsRefresh={loadPosts}
        />
      )}
    </AppLayout>
  );
}
