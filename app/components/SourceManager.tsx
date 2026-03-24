'use client';

import { useState, useEffect, useCallback } from 'react';

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

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  function guessName(url: string): string {
    try {
      const host = new URL(url).hostname.replace('www.', '');
      return host.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return '';
    }
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
        setDetectStatus('⚠️ No RSS feed found. You can enter the URL manually and use "Web Scrape" type.');
        setNewName(guessName(url));
        setNewFeedUrl(url);
        setNewFeedType('web_scrape');
      } else if (foundFeeds.length === 1) {
        setNewFeedUrl(foundFeeds[0].url);
        setNewName(foundFeeds[0].title || guessName(url));
        setDetectStatus(`✅ Found feed: ${foundFeeds[0].url}`);
        setNewFeedType('rss');
      } else {
        setDiscovered(foundFeeds);
        setDetectStatus(`Found ${foundFeeds.length} feeds — pick one:`);
      }
    } catch {
      setDetectStatus('❌ Detection failed. Enter the URL manually.');
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
      const res = await fetch('/api/feeds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
    } catch {
      setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !enabled } : f)));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from your feed sources?`)) return;
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    try {
      const res = await fetch(`/api/feeds?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      await loadFeeds();
    }
  };

  const enabledCount = feeds.filter((f) => f.enabled).length;

  const FEED_TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    rss: { label: 'RSS', color: '#60a5fa', bg: '#1e3a5f' },
    atom: { label: 'ATOM', color: '#34d399', bg: '#064e3b' },
    web_scrape: { label: 'SCRAPE', color: '#f59e0b', bg: '#78350f' },
  };

  const inputStyle = {
    padding: '0.4rem 0.6rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    backgroundColor: '#0d1117',
    color: '#e2e8f0',
    fontSize: '0.8rem',
    outline: 'none',
  };

  return (
    <div style={{ backgroundColor: '#0d1117', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0' }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.05em' }}>
          📡 FEED SOURCES
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>
            {enabledCount} active / {feeds.length} total
          </span>
        </span>
        <span style={{ color: '#64748b', fontSize: '1.25rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>

      {isOpen && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #1e293b' }}>
          {loading && <p style={{ color: '#f0e523', fontSize: '0.8rem', padding: '0.75rem 0' }}>Loading feeds...</p>}
          {error && <p style={{ color: '#ff6b6b', fontSize: '0.8rem', padding: '0.5rem 0' }}>⚠️ {error}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {feeds.map((feed) => {
              const badge = FEED_TYPE_BADGE[feed.feedType] ?? FEED_TYPE_BADGE.rss;
              return (
                <div
                  key={feed.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                    backgroundColor: feed.enabled ? '#111827' : '#0a0a0a',
                    border: `1px solid ${feed.enabled ? '#1e293b' : '#1a1a1a'}`,
                    opacity: feed.enabled ? 1 : 0.5, transition: 'all 0.15s',
                  }}
                >
                  <button
                    onClick={() => handleToggle(feed.id, !feed.enabled)}
                    title={feed.enabled ? 'Disable' : 'Enable'}
                    style={{
                      width: '2.5rem', height: '1.4rem', borderRadius: '0.7rem',
                      border: 'none', cursor: 'pointer', position: 'relative',
                      backgroundColor: feed.enabled ? '#22c55e' : '#374151',
                      transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px',
                      left: feed.enabled ? '1.2rem' : '2px',
                      width: '1rem', height: '1rem', borderRadius: '50%',
                      backgroundColor: '#fff', transition: 'left 0.2s',
                    }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>{feed.name}</span>
                      <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: badge.bg, color: badge.color, fontWeight: 600 }}>
                        {badge.label}
                      </span>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.7rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.url}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(feed.id, feed.name)}
                    title="Remove"
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', lineHeight: 1, flexShrink: 0 }}
                    onMouseOver={(e) => ((e.target as HTMLElement).style.color = '#ff6b6b')}
                    onMouseOut={(e) => ((e.target as HTMLElement).style.color = '#64748b')}
                  >✕</button>
                </div>
              );
            })}
          </div>

          {/* Add new feed */}
          <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: '#111827', border: '1px solid #1e293b' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
              ➕ ADD NEW SOURCE
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="url"
                placeholder="Paste any website or RSS URL..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={handleDetect}
                disabled={detecting || !inputUrl.trim()}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: 'none',
                  backgroundColor: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                  cursor: detecting || !inputUrl.trim() ? 'not-allowed' : 'pointer',
                  opacity: detecting || !inputUrl.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                {detecting ? '🔍 Detecting...' : '🔍 Detect Feed'}
              </button>
            </div>

            {detectStatus && (
              <p style={{ color: detectStatus.startsWith('✅') ? '#6bffaa' : detectStatus.startsWith('⚠️') || detectStatus.startsWith('❌') ? '#ff6b6b' : '#f0e523', fontSize: '0.75rem', margin: '0.25rem 0 0.5rem' }}>
                {detectStatus}
              </p>
            )}

            {discovered.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
                {discovered.map((df, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectDiscovered(df)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.35rem 0.6rem', borderRadius: '0.375rem',
                      border: '1px solid #374151', backgroundColor: '#0d1117',
                      color: '#e2e8f0', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ color: '#3b82f6' }}>⟶</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {df.title ? `${df.title} — ` : ''}{df.url}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Feed name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ ...inputStyle, flex: '1 1 120px' }}
              />
              <input
                type="url"
                placeholder="Feed URL"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                style={{ ...inputStyle, flex: '2 1 200px' }}
              />
              <select
                value={newFeedType}
                onChange={(e) => setNewFeedType(e.target.value)}
                style={{ ...inputStyle, width: 'auto' }}
              >
                <option value="rss">RSS</option>
                <option value="atom">Atom</option>
                <option value="web_scrape">Web Scrape</option>
              </select>
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim() || !newFeedUrl.trim()}
                style={{
                  padding: '0.4rem 1rem', borderRadius: '0.375rem', border: 'none',
                  backgroundColor: '#f0e523', color: '#000', fontWeight: 700, fontSize: '0.8rem',
                  cursor: adding ? 'not-allowed' : 'pointer',
                  opacity: adding || !newName.trim() || !newFeedUrl.trim() ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
