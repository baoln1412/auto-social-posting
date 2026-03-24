'use client';

import { useState, useEffect, useCallback } from 'react';

interface PageInfo {
  pageId: string;
  pageName: string;
  userName: string;
  connectedAt: string;
}

interface StatusResponse {
  connected: boolean;
  source?: 'oauth' | 'env';
  pages?: PageInfo[];
  pageId?: string;
  pageName?: string;
  tokenValid?: boolean;
  error?: string;
  hint?: string;
}

export default function FacebookConnect() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/facebook/status');
      const data: StatusResponse = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false, error: 'Failed to check status' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();

    // Check URL params for OAuth result
    const params = new URLSearchParams(window.location.search);
    const fbSuccess = params.get('fb_success');
    const fbError = params.get('fb_error');

    if (fbSuccess) {
      // Clean URL and refresh status
      window.history.replaceState({}, '', window.location.pathname);
      checkStatus();
    }
    if (fbError) {
      setStatus({ connected: false, error: fbError });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [checkStatus]);

  const handleConnect = () => {
    window.location.href = '/api/auth/facebook';
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Facebook page? You can reconnect anytime.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/facebook/status', { method: 'DELETE' });
      setStatus({ connected: false });
    } catch {
      alert('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
        style={{ backgroundColor: '#111', border: '1px solid #222' }}
      >
        <div
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ backgroundColor: '#666' }}
        />
        <span style={{ color: '#666' }}>Checking Facebook connection...</span>
      </div>
    );
  }

  // ── Connected via OAuth ────────────────────────────────────────────
  if (status?.connected && status.source === 'oauth' && status.pages?.length) {
    const primaryPage = status.pages[0];
    return (
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm"
        style={{ backgroundColor: '#0a1a0a', border: '1px solid #163316' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' }}
          />
          <span style={{ color: '#86efac' }}>
            <strong>📘 {primaryPage.pageName}</strong>
            {status.pages.length > 1 && (
              <span style={{ color: '#4ade80' }}>
                {' '}+{status.pages.length - 1} more
              </span>
            )}
          </span>
          <span style={{ color: '#4a7a4a' }}>•</span>
          <span style={{ color: '#4a7a4a' }}>
            Connected by {primaryPage.userName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleConnect}
            className="text-xs px-2 py-1 rounded transition-colors duration-150"
            style={{
              color: '#60a5fa',
              backgroundColor: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.2)',
            }}
          >
            🔄 Reconnect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs px-2 py-1 rounded transition-colors duration-150"
            style={{
              color: '#f87171',
              backgroundColor: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.2)',
              opacity: disconnecting ? 0.5 : 1,
            }}
          >
            {disconnecting ? '...' : '✕ Disconnect'}
          </button>
        </div>
      </div>
    );
  }

  // ── Connected via env var (legacy) ─────────────────────────────────
  if (status?.connected && status.source === 'env') {
    return (
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm"
        style={{ backgroundColor: '#1a1a00', border: '1px solid #333300' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: '#eab308' }}
          />
          <span style={{ color: '#fde047' }}>
            Using env token (legacy)
          </span>
          <span style={{ color: '#4a4a00' }}>•</span>
          <span style={{ color: '#a3a300', fontSize: '0.75rem' }}>
            {status.hint}
          </span>
        </div>
        <button
          onClick={handleConnect}
          className="text-xs px-3 py-1.5 rounded font-semibold transition-colors duration-150"
          style={{
            backgroundColor: '#1877F2',
            color: '#fff',
            border: '1px solid #166FE5',
          }}
        >
          📘 Connect via OAuth
        </button>
      </div>
    );
  }

  // ── Not connected ──────────────────────────────────────────────────
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm"
      style={{ backgroundColor: '#1a0a0a', border: '1px solid #331616' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: '#ef4444' }}
        />
        <span style={{ color: '#fca5a5' }}>
          {status?.error || 'Facebook page not connected'}
        </span>
      </div>
      <button
        onClick={handleConnect}
        className="text-xs px-3 py-1.5 rounded font-semibold transition-colors duration-150"
        style={{
          backgroundColor: '#1877F2',
          color: '#fff',
          border: '1px solid #166FE5',
          cursor: 'pointer',
        }}
      >
        📘 Connect Facebook Page
      </button>
    </div>
  );
}
