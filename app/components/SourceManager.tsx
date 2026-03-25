'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface Feed {
  id: string;
  name: string;
  url: string;
  feedType: string;
  enabled: boolean;
}

interface DiscoveredFeed {
  url: string;
  title?: string;
  type: string;
}

interface SourceManagerProps {
  pageId: string;
}

const FEED_BADGE: Record<string, { label: string; className: string }> = {
  rss: { label: 'RSS', className: 'bg-blue-50 text-blue-600' },
  atom: { label: 'ATOM', className: 'bg-emerald-50 text-emerald-600' },
  web_scrape: { label: 'SCRAPE', className: 'bg-amber-50 text-amber-700' },
};

export default function SourceManager({ pageId }: SourceManagerProps) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inputUrl, setInputUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedType, setNewFeedType] = useState('rss');
  const [detecting, setDetecting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredFeed[]>([]);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/feeds?pageId=${pageId}`);
      const data = await res.json();
      setFeeds(data.feeds ?? []);
    } catch {
      setError('Failed to load feeds');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  function guessName(url: string): string {
    try {
      const host = new URL(url).hostname.replace('www.', '');
      return host.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } catch { return ''; }
  }

  const handleDetect = async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setDetecting(true);
    setError(null);
    setDiscovered([]);
    setDetectStatus('🔍 Scanning for RSS feeds...');
    try {
      const res = await fetch('/api/feeds/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      const foundFeeds: DiscoveredFeed[] = data.feeds ?? [];
      if (foundFeeds.length === 0) {
        setDetectStatus('⚠️ No RSS found. Enter URL manually with "Web Scrape" type.');
        setNewName(guessName(url));
        setNewFeedUrl(url);
        setNewFeedType('web_scrape');
      } else if (foundFeeds.length === 1) {
        setNewFeedUrl(foundFeeds[0].url);
        setNewName(foundFeeds[0].title || guessName(url));
        setDetectStatus(`✅ Found: ${foundFeeds[0].url}`);
        setNewFeedType('rss');
      } else {
        setDiscovered(foundFeeds);
        setDetectStatus(`Found ${foundFeeds.length} feeds — pick one:`);
      }
    } catch {
      setDetectStatus('❌ Detection failed.');
      setNewName(guessName(url));
    } finally {
      setDetecting(false);
    }
  };

  const handleSelectDiscovered = (df: DiscoveredFeed) => {
    setNewFeedUrl(df.url);
    setNewName(df.title || guessName(inputUrl));
    setDiscovered([]);
    setDetectStatus(`✅ Selected: ${df.url}`);
    setNewFeedType('rss');
  };

  const handleAdd = async () => {
    const feedUrl = newFeedUrl.trim();
    const name = newName.trim();
    if (!name || !feedUrl) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, name, url: feedUrl, feedType: newFeedType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add');
      }
      setInputUrl('');
      setNewName('');
      setNewFeedUrl('');
      setNewFeedType('rss');
      setDiscovered([]);
      setDetectStatus(null);
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
    try {
      const res = await fetch('/api/feeds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }) });
      if (!res.ok) throw new Error('Toggle failed');
    } catch { setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !enabled } : f))); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"?`)) return;
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    try {
      const res = await fetch(`/api/feeds?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch { await loadFeeds(); }
  };

  const enabledCount = feeds.filter((f) => f.enabled).length;

  return (
    <Card className="card-warm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors rounded-t-xl"
      >
        <span>
          📡 Feed Sources
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {enabledCount} active / {feeds.length} total
          </span>
        </span>
        <span className="text-muted-foreground text-xs">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <CardContent className="pt-0 space-y-3">
          {loading && <p className="text-sm text-primary">Loading feeds...</p>}
          {error && <p className="text-sm text-destructive">⚠️ {error}</p>}

          <div className="flex flex-col gap-2">
            {feeds.map((feed) => {
              const badge = FEED_BADGE[feed.feedType] ?? FEED_BADGE.rss;
              return (
                <div
                  key={feed.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${feed.enabled ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-50'}`}
                >
                  {/* Toggle switch */}
                  <button
                    onClick={() => handleToggle(feed.id, !feed.enabled)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${feed.enabled ? 'bg-emerald-500' : 'bg-stone-300'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${feed.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{feed.name}</span>
                      <Badge variant="secondary" className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{feed.url}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(feed.id, feed.name)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Add new feed */}
          <div className="rounded-lg p-4 bg-muted/30 border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              ➕ Add New Source
            </p>

            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="Paste any website or RSS URL..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
                className="flex-1 text-sm"
              />
              <Button
                onClick={handleDetect}
                disabled={detecting || !inputUrl.trim()}
                size="sm"
                variant="default"
              >
                {detecting ? '🔍...' : '🔍 Detect'}
              </Button>
            </div>

            {detectStatus && (
              <p className={`text-xs ${detectStatus.startsWith('✅') ? 'text-emerald-600' : detectStatus.startsWith('⚠️') || detectStatus.startsWith('❌') ? 'text-destructive' : 'text-primary'}`}>
                {detectStatus}
              </p>
            )}

            {discovered.length > 0 && (
              <div className="flex flex-col gap-1">
                {discovered.map((df, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectDiscovered(df)}
                    className="justify-start text-xs truncate"
                  >
                    <span className="text-primary mr-1">⟶</span>
                    {df.title ? `${df.title} — ` : ''}{df.url}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Input
                type="text"
                placeholder="Feed name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-[120px] text-sm"
              />
              <Input
                type="url"
                placeholder="Feed URL"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                className="flex-[2] min-w-[200px] text-sm"
              />
              <select
                value={newFeedType}
                onChange={(e) => setNewFeedType(e.target.value)}
                className="px-2 py-1.5 rounded-md text-sm border border-border bg-background text-foreground"
              >
                <option value="rss">RSS</option>
                <option value="atom">Atom</option>
                <option value="web_scrape">Web Scrape</option>
              </select>
              <Button
                onClick={handleAdd}
                disabled={adding || !newName.trim() || !newFeedUrl.trim()}
                size="sm"
              >
                {adding ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
