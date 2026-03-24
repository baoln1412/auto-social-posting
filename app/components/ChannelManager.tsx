'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageChannel } from '@/app/types';

interface ChannelManagerProps {
  pageId: string;
}

const PLATFORM_CONFIG: Record<string, { icon: string; label: string; available: boolean }> = {
  facebook: { icon: '📘', label: 'Facebook', available: true },
  threads: { icon: '🔗', label: 'Threads', available: false },
  tiktok: { icon: '🎵', label: 'TikTok', available: false },
  instagram: { icon: '📸', label: 'Instagram', available: false },
};

export default function ChannelManager({ pageId }: ChannelManagerProps) {
  const [channels, setChannels] = useState<PageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/facebook/status?pageId=${pageId}`);
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const handleConnect = (platform: string) => {
    if (platform === 'facebook') {
      window.location.href = `/api/auth/facebook?pageId=${pageId}`;
    }
    setShowAddMenu(false);
  };

  const handleDisconnect = async (channelId: string) => {
    if (!confirm('Disconnect this channel?')) return;
    await fetch(`/api/facebook/status?channelId=${channelId}`, { method: 'DELETE' });
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
  };

  if (loading) {
    return (
      <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: '#0d1117', border: '1px solid #1e293b', color: '#8b949e' }}>
        Loading channels...
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#0d1117', border: '1px solid #1e293b' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium" style={{ color: '#e2e8f0' }}>
          📡 Connected Channels
          {channels.length > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#238636', color: '#fff' }}>
              {channels.length}
            </span>
          )}
        </span>
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d' }}
          >
            + Add Channel
          </button>
          {showAddMenu && (
            <div
              className="absolute right-0 top-full mt-1 rounded-lg py-1 z-50 min-w-[180px]"
              style={{ backgroundColor: '#161b22', border: '1px solid #30363d' }}
            >
              {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => cfg.available ? handleConnect(key) : null}
                  disabled={!cfg.available}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                  style={{
                    color: cfg.available ? '#e2e8f0' : '#484f58',
                    cursor: cfg.available ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                  {!cfg.available && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#21262d', color: '#8b949e' }}>
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {channels.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {channels.map((ch) => {
            const cfg = PLATFORM_CONFIG[ch.platform] ?? { icon: '📌', label: ch.platform };
            return (
              <div
                key={ch.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#161b22', border: '1px solid #30363d' }}
              >
                <div className="flex items-center gap-2">
                  <span>{cfg.icon}</span>
                  <span className="text-sm" style={{ color: '#e2e8f0' }}>{ch.platformPageName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#0e4429', color: '#3fb950' }}>
                    Connected
                  </span>
                </div>
                <button
                  onClick={() => handleDisconnect(ch.id)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: '#f85149', backgroundColor: 'transparent' }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {channels.length === 0 && (
        <div className="px-4 pb-3 text-xs" style={{ color: '#8b949e' }}>
          No channels connected. Click &quot;+ Add Channel&quot; to connect a Facebook page.
        </div>
      )}
    </div>
  );
}
