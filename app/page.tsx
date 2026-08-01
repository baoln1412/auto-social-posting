'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ContentPage, PostDraft, Article, PostStatus, KeywordConfig } from './types';
import { TOPICS } from './lib/topics';
import AppLayout from './components/layout/AppLayout';
import PostCard from './components/PostCard';
import Pagination from './components/Pagination';
import ContentCalendar from './components/calendar/ContentCalendar';
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import AuditView from './components/analytics/AuditView';
import UsageView from './components/analytics/UsageView';
import SettingsView from './components/settings/SettingsView';
import PageTabs from './components/PageTabs';
import PipelineStatusBar from './components/PipelineStatusBar';
import { MarketContext } from './components/MarketContextConfig';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AIChatWindow, { DashboardFilters, AIChatHandle } from './components/chat/AIChatWindow';

export default function Home() {
  const chatRef = useRef<AIChatHandle>(null);
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
  const [filterTopic, setFilterTopic] = useState('All');

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [fullRunning, setFullRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

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
      if (filterTopic !== 'All') params.set('topic', filterTopic);

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
  }, [activePageId, offset, filterSource, filterFrom, filterTo, filterDone, filterKeyword, filterTopic]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { setOffset(0); }, [filterSource, filterFrom, filterTo, filterDone, filterKeyword, filterTopic, activePageId]);
  // Reset topic filter when switching markets (a topic may not be enabled in the new market).
  useEffect(() => { setFilterTopic('All'); }, [activePageId]);

  const activePage = pages.find((p) => p.id === activePageId);

  // ── Market actions ──
  // New-page modal (replaces window.prompt, which is blocked in embedded browsers).
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [npName, setNpName] = useState('');
  const [npCode, setNpCode] = useState('');
  const [npCountry, setNpCountry] = useState('');
  const [npSaving, setNpSaving] = useState(false);

  const handleAddPage = () => {
    setNpName(''); setNpCode(''); setNpCountry('');
    setNewPageOpen(true);
  };

  const submitNewPage = async () => {
    if (!npName.trim()) return;
    setNpSaving(true);
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: npName.trim(),
          countryCode: npCode.trim().toUpperCase(),
          countryName: npCountry.trim(),
        }),
      });
      const data = await res.json();
      if (data.page) {
        setPages((prev) => [...prev, data.page]);
        setActivePageId(data.page.id);
        setActiveView('settings');
        setNewPageOpen(false);
      } else {
        alert(data.error ?? 'Failed to create page');
      }
    } catch (err) {
      console.error('Failed to create market:', err);
      alert('Failed to create page');
    } finally {
      setNpSaving(false);
    }
  };

  const handleSaveContext = async (ctx: MarketContext) => {
    if (!activePageId) return;
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activePageId,
        language: ctx.language,
        glossary: ctx.glossary,
        wordingRules: ctx.wordingRules,
        writingStyle: ctx.writingStyle,
      }),
    });
    setPages((prev) =>
      prev.map((p) =>
        p.id === activePageId
          ? { ...p, language: ctx.language, glossary: ctx.glossary, wordingRules: ctx.wordingRules, writingStyle: ctx.writingStyle }
          : p,
      ),
    );
  };

  const handleSaveTopics = async (topics: string[]) => {
    if (!activePageId) return;
    await fetch('/api/pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activePageId, enabledTopics: topics }),
    });
    setPages((prev) => prev.map((p) => (p.id === activePageId ? { ...p, enabledTopics: topics } : p)));
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

  // ── Crawl (bronze) ──
  // Manual trigger pulls fresh news into the bronze layer. Immigration
  // classification (silver) and Vietnamese content generation (gold) run via the
  // scheduled Claude Code task / the `/immigration-pipeline` skill — not in-app.
  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    setProgress('Crawling latest news into bronze…');
    try {
      const res = await fetch('/api/pipeline/crawl', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Crawl failed');
      const mine = (data.markets ?? []).find((m: { marketId: string }) => m.marketId === activePageId);
      const inserted = mine?.inserted ?? 0;
      setProgress(
        `Crawled ${mine?.crawled ?? 0}, added ${inserted} new to bronze. ` +
        `Run the immigration-pipeline skill (or wait for the schedule) to filter & generate.`,
      );
    } catch (err) {
      setProgress(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally { setPipelineRunning(false); setStatusRefreshKey((k) => k + 1); }
  };

  // ── Run FULL pipeline (crawl → silver → gold) on demand, to test config ──
  // Triggers the same Claude Code skill the 4h schedule uses, then polls until
  // the run finishes and reloads the generated posts.
  const handleRunFullPipeline = async () => {
    if (!confirm('Run the full pipeline now (crawl → filter → generate)?\nThis uses Claude Code and can take a few minutes.')) return;
    setFullRunning(true);
    setProgress('Starting full pipeline (crawl → silver → gold)…');
    try {
      const res = await fetch('/api/pipeline/run', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setProgress(data.running ? 'A pipeline run is already in progress.' : `Error: ${data.error ?? 'Failed to start'}`);
        setFullRunning(false);
        return;
      }
      setProgress('Pipeline running… generating Vietnamese content (this can take a few minutes).');
      const poll = setInterval(async () => {
        try {
          const r = await fetch('/api/pipeline/run');
          const d = await r.json();
          if (!d.running) {
            clearInterval(poll);
            setFullRunning(false);
            setProgress('Full pipeline finished — refreshing posts.');
            loadPosts();
            setStatusRefreshKey((k) => k + 1);
          }
        } catch { /* transient — keep polling */ }
      }, 5000);
    } catch (err) {
      setProgress(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      setFullRunning(false);
    }
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
      <div className="flex flex-col gap-5 max-w-[1600px]">
        {/* Market sub-tabs */}
        <PageTabs
          pages={pages}
          activePageId={activePageId}
          onSelect={setActivePageId}
          onAddPage={handleAddPage}
        />

        <PipelineStatusBar pageId={activePage.id} refreshKey={statusRefreshKey} />

        {/* Pipeline controls */}
        <div className="flex items-center gap-3">
          <Button onClick={handleRunPipeline} disabled={pipelineRunning || fullRunning} size="default"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
            {pipelineRunning ? '⏳ Crawling...' : '🚀 Crawl News (bronze)'}
          </Button>
          <Button onClick={handleRunFullPipeline} disabled={fullRunning || pipelineRunning} size="default"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            {fullRunning ? '⏳ Running full pipeline…' : '⚡ Run Full Pipeline'}
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
          <select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground">
            <option value="All">All Topics</option>
            {TOPICS.filter((t) => (activePage?.enabledTopics ?? TOPICS.map((x) => x.id)).includes(t.id))
              .map((t) => <option key={t.id} value={t.id}>{t.vi}</option>)}
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
            <p className="text-lg mb-2 font-medium">No content yet</p>
            <p className="text-sm">Crawl news into bronze, then run the immigration-pipeline skill (or wait for the schedule) to filter &amp; generate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {posts.map((post) => (
              <PostCard
                key={post.article.url}
                post={post}
                pageId={activePage.id}
                pageName={activePage.name}
                onToggleDone={() => handleToggleDone(post.article.url, post.isDone ?? false)}
                onStatusChange={handleStatusChange}
                onShowChecklistInChat={(text) => chatRef.current?.openWithMessage(text)}
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
      case 'usage': return <UsageView pageId={activePage.id} />;
      case 'analytics': return (
        <div className="flex flex-col gap-8">
          <AnalyticsDashboard pageId={activePage.id} />
          <AuditView pageId={activePage.id} />
        </div>
      );
      case 'settings': return (
        <SettingsView
          pageId={activePage.id}
          pageName={activePage.name}
          countryCode={activePage.countryCode ?? ''}
          countryName={activePage.countryName ?? ''}
          systemPrompt={activePage.systemPrompt}
          userPrompt={activePage.userPrompt ?? ''}
          platformPrompts={activePage.platformPrompts ?? {}}
          marketContext={{
            language: activePage.language ?? 'vi',
            glossary: activePage.glossary ?? {},
            wordingRules: activePage.wordingRules ?? '',
            writingStyle: activePage.writingStyle ?? '',
          }}
          enabledTopics={activePage.enabledTopics ?? TOPICS.map((t) => t.id)}
          onSavePrompt={handleSavePrompt}
          onSaveContext={handleSaveContext}
          onSaveTopics={handleSaveTopics}
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
          ref={chatRef}
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

      <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New page / market</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label className="text-sm font-medium">
              Name<span className="text-red-500">*</span>
              <Input className="mt-1" autoFocus placeholder='e.g. "Czech Republic / Người Việt"'
                value={npName} onChange={(e) => setNpName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNewPage(); }} />
            </label>
            <div className="flex gap-3">
              <label className="text-sm font-medium flex-1">
                Country code
                <Input className="mt-1" placeholder="CZ" maxLength={2}
                  value={npCode} onChange={(e) => setNpCode(e.target.value)} />
              </label>
              <label className="text-sm font-medium flex-[2]">
                Country name
                <Input className="mt-1" placeholder="Czech Republic"
                  value={npCountry} onChange={(e) => setNpCountry(e.target.value)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageOpen(false)}>Cancel</Button>
            <Button onClick={submitNewPage} disabled={!npName.trim() || npSaving}>
              {npSaving ? 'Creating…' : 'Create page'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
