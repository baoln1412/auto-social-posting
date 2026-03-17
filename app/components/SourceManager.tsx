'use client';

import { useState, useEffect, useCallback } from 'react';

interface Feed {
  id: string;
  name: string;
  url: string;
  crime_specific: boolean;
  enabled: boolean;
  created_at: string;
}

export default function SourceManager() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New feed form
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCrimeSpecific, setNewCrimeSpecific] = useState(false);
  const [adding, setAdding] = useState(false);

  const loadFeeds = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/feeds');
      const data = await res.json();
      setFeeds(data.feeds ?? []);
    } catch {
      setError('Failed to load feeds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), url: newUrl.trim(), crimeSpecific: newCrimeSpecific }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add');
      }
      setNewName('');
      setNewUrl('');
      setNewCrimeSpecific(false);
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    // Optimistic update
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
    try {
      const res = await fetch('/api/feeds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
    } catch {
      // Revert on failure
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
      await loadFeeds(); // Revert
    }
  };

  const enabledCount = feeds.filter((f) => f.enabled).length;

  return (
    <div
      style={{
        backgroundColor: '#0d1117',
        border: '1px solid #1e293b',
        borderRadius: '0.75rem',
        overflow: 'hidden',
      }}
    >
      {/* Header / toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e2e8f0',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.05em' }}>
          📡 RSS FEED SOURCES
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.75rem',
              color: '#64748b',
              fontWeight: 400,
            }}
          >
            {enabledCount} active / {feeds.length} total
          </span>
        </span>
        <span style={{ color: '#64748b', fontSize: '1.25rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #1e293b' }}>
          {loading && (
            <p style={{ color: '#f0e523', fontSize: '0.8rem', padding: '0.75rem 0' }}>Loading feeds...</p>
          )}

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: '0.8rem', padding: '0.5rem 0' }}>⚠️ {error}</p>
          )}

          {/* Feed list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {feeds.map((feed) => (
              <div
                key={feed.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  backgroundColor: feed.enabled ? '#111827' : '#0a0a0a',
                  border: `1px solid ${feed.enabled ? '#1e293b' : '#1a1a1a'}`,
                  opacity: feed.enabled ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
              >
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(feed.id, !feed.enabled)}
                  title={feed.enabled ? 'Disable this feed' : 'Enable this feed'}
                  style={{
                    width: '2.5rem',
                    height: '1.4rem',
                    borderRadius: '0.7rem',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                    backgroundColor: feed.enabled ? '#22c55e' : '#374151',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: feed.enabled ? '1.2rem' : '2px',
                      width: '1rem',
                      height: '1rem',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>
                      {feed.name}
                    </span>
                    {feed.crime_specific && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#7f1d1d',
                          color: '#fca5a5',
                          fontWeight: 600,
                        }}
                      >
                        CRIME
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: '#64748b',
                      fontSize: '0.7rem',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {feed.url}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(feed.id, feed.name)}
                  title="Remove this feed"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: '0.25rem',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  onMouseOver={(e) => ((e.target as HTMLElement).style.color = '#ff6b6b')}
                  onMouseOut={(e) => ((e.target as HTMLElement).style.color = '#64748b')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add new feed form */}
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              backgroundColor: '#111827',
              border: '1px solid #1e293b',
            }}
          >
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
              ➕ ADD NEW SOURCE
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Feed name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{
                  flex: '1 1 120px',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #374151',
                  backgroundColor: '#0d1117',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
              <input
                type="url"
                placeholder="RSS feed URL"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                style={{
                  flex: '2 1 200px',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #374151',
                  backgroundColor: '#0d1117',
                  color: '#e2e8f0',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={newCrimeSpecific}
                  onChange={(e) => setNewCrimeSpecific(e.target.checked)}
                  style={{ accentColor: '#f0e523' }}
                />
                Crime-specific
              </label>
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim() || !newUrl.trim()}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  backgroundColor: '#f0e523',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: adding ? 'not-allowed' : 'pointer',
                  opacity: adding || !newName.trim() || !newUrl.trim() ? 0.5 : 1,
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
