'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageChannel } from '../types';

interface ChannelManagerProps {
  pageId: string;
}

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  facebook: { label: 'Facebook', icon: '📘', color: 'text-blue-600', bg: 'bg-blue-50' },
  instagram: { label: 'Instagram', icon: '📸', color: 'text-pink-600', bg: 'bg-pink-50' },
  threads: { label: 'Threads', icon: '🧵', color: 'text-stone-700', bg: 'bg-stone-100' },
  tiktok: { label: 'TikTok', icon: '🎵', color: 'text-stone-700', bg: 'bg-stone-100' },
};

const COMING_SOON = ['instagram', 'threads', 'tiktok'];

export default function ChannelManager({ pageId }: ChannelManagerProps) {
  const [channels, setChannels] = useState<PageChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/facebook/status?pageId=${pageId}`);
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch {
      console.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const handleConnect = () => {
    window.location.href = `/api/auth/facebook?pageId=${pageId}`;
  };

  const handleDisconnect = async (channelId: string) => {
    if (!confirm('Disconnect this channel?')) return;
    try {
      const res = await fetch(`/api/facebook/status?channelId=${channelId}`, { method: 'DELETE' });
      if (res.ok) setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch {
      alert('Failed to disconnect');
    }
  };

  return (
    <Card className="card-warm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">📡 Connected Channels</CardTitle>
        <Button size="sm" variant="outline" onClick={handleConnect} className="border-primary text-primary hover:bg-primary/5">
          + Add Channel
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading channels...</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No channels connected. Click &quot;+ Add Channel&quot; to connect a Facebook page.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {channels.map((ch) => {
              const cfg = PLATFORM_CONFIG[ch.platform] ?? PLATFORM_CONFIG.facebook;
              return (
                <div
                  key={ch.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${cfg.bg}`}>
                      {cfg.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{ch.platformPageName}</p>
                      <p className="text-xs text-muted-foreground">{cfg.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[10px]">
                      Connected
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(ch.id)}
                      className="text-muted-foreground hover:text-destructive text-xs"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Coming soon badges */}
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
          {COMING_SOON.map((platform) => {
            const cfg = PLATFORM_CONFIG[platform];
            return (
              <Badge key={platform} variant="outline" className="text-xs text-muted-foreground gap-1.5 py-1">
                {cfg.icon} {cfg.label}
                <span className="text-[9px] opacity-60">Soon</span>
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
