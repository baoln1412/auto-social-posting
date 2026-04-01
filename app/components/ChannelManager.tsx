'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PageChannel, KeywordConfig } from '../types';

interface ChannelManagerProps {
  pageId: string;
  defaultSystemPrompt?: string;
  defaultUserPrompt?: string;
  defaultKeywordConfig?: KeywordConfig;
}

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  facebook: { label: 'Facebook', icon: '📘', color: 'text-blue-600', bg: 'bg-blue-50' },
  instagram: { label: 'Instagram', icon: '📸', color: 'text-pink-600', bg: 'bg-pink-50' },
  threads: { label: 'Threads', icon: '🧵', color: 'text-stone-700', bg: 'bg-stone-100' },
  tiktok: { label: 'TikTok', icon: '🎵', color: 'text-stone-700', bg: 'bg-stone-100' },
};

const COMING_SOON = ['instagram', 'threads', 'tiktok'];

function parseKeywords(text: string): string[] {
  return text.split(',').map((k) => k.trim()).filter(Boolean);
}

function formatKeywords(kws: string[]): string {
  return kws.join(', ');
}

// ── Per-channel settings modal ────────────────────────────────────────────────
interface ChannelSettingsModalProps {
  channel: PageChannel;
  defaultSystemPrompt: string;
  defaultUserPrompt: string;
  defaultKeywordConfig: KeywordConfig;
  onClose: () => void;
  onSaved: (updated: PageChannel) => void;
}

function ChannelSettingsModal({
  channel,
  defaultSystemPrompt,
  defaultUserPrompt,
  defaultKeywordConfig,
  onClose,
  onSaved,
}: ChannelSettingsModalProps) {
  const [useCustom, setUseCustom] = useState(!!(channel.systemPrompt || channel.keywordConfig));
  const [sysPrompt, setSysPrompt] = useState(channel.systemPrompt ?? defaultSystemPrompt);
  const [usrPrompt, setUsrPrompt] = useState(channel.userPrompt ?? defaultUserPrompt);
  const [tier1Text, setTier1Text] = useState(
    channel.keywordConfig ? formatKeywords(channel.keywordConfig.tier1) : formatKeywords(defaultKeywordConfig.tier1),
  );
  const [tier2Text, setTier2Text] = useState(
    channel.keywordConfig ? formatKeywords(channel.keywordConfig.tier2) : formatKeywords(defaultKeywordConfig.tier2),
  );
  const [minScore, setMinScore] = useState(channel.keywordConfig?.minScore ?? defaultKeywordConfig.minScore);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'prompts' | 'keywords'>('prompts');

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = useCustom
        ? {
            id: channel.id,
            systemPrompt: sysPrompt.trim() || null,
            userPrompt: usrPrompt.trim() || null,
            keywordConfig: {
              tier1: parseKeywords(tier1Text),
              tier2: parseKeywords(tier2Text),
              minScore,
            },
          }
        : {
            id: channel.id,
            systemPrompt: null,
            userPrompt: null,
            keywordConfig: null,
          };

      const res = await fetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      onSaved({
        ...channel,
        systemPrompt: data.channel.systemPrompt,
        userPrompt: data.channel.userPrompt,
        keywordConfig: data.channel.keywordConfig,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1200);
    } catch (err) {
      console.error('Failed to save channel settings:', err);
      alert('Failed to save. Check console.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#0d1117', border: '1px solid #1e293b', borderRadius: '16px',
        width: '100%', maxWidth: '680px', maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
              📘 {channel.platformPageName}
            </p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Channel-specific AI configuration
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#64748b', fontSize: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
            backgroundColor: '#1a1f2e', borderRadius: '10px', border: '1px solid #1e293b',
            marginBottom: '16px',
          }}>
            <button
              onClick={() => setUseCustom(!useCustom)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                backgroundColor: useCustom ? '#10b981' : '#334155',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '3px', left: useCustom ? '23px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                {useCustom ? '✅ Custom configuration active' : '⚙️ Using page default configuration'}
              </p>
              <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                {useCustom
                  ? 'This channel uses its own prompts and keywords instead of the page defaults.'
                  : 'Toggle on to override prompts and keywords specifically for this Facebook page.'}
              </p>
            </div>
          </div>

          {useCustom && (
            <>
              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', backgroundColor: '#1a1f2e', padding: '4px', borderRadius: '8px' }}>
                {(['prompts', 'keywords'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600,
                      backgroundColor: activeTab === tab ? '#0d1117' : 'transparent',
                      color: activeTab === tab ? '#f1f5f9' : '#64748b',
                      boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    {tab === 'prompts' ? '🧠 AI Prompts' : '🔑 Keywords'}
                  </button>
                ))}
              </div>

              {activeTab === 'prompts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      System Prompt
                    </label>
                    <Textarea
                      value={sysPrompt}
                      onChange={(e) => setSysPrompt(e.target.value)}
                      className="min-h-[160px] font-mono text-xs resize-y bg-muted/30 border-border"
                      placeholder="Enter system prompt for this specific Facebook page..."
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      User Prompt (use {'{articles}'} placeholder)
                    </label>
                    <Textarea
                      value={usrPrompt}
                      onChange={(e) => setUsrPrompt(e.target.value)}
                      className="min-h-[120px] font-mono text-xs resize-y bg-muted/30 border-border"
                      placeholder="Enter output format prompt... use {articles} placeholder"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'keywords' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      🏆 Tier 1 — High Weight (+3 pts)
                    </label>
                    <Textarea
                      value={tier1Text}
                      onChange={(e) => setTier1Text(e.target.value)}
                      className="min-h-[80px] font-mono text-xs resize-y bg-muted/30 border-border"
                      placeholder="Premier League, Champions League, ..."
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      📌 Tier 2 — Broad Terms (+1 pt)
                    </label>
                    <Textarea
                      value={tier2Text}
                      onChange={(e) => setTier2Text(e.target.value)}
                      className="min-h-[80px] font-mono text-xs resize-y bg-muted/30 border-border"
                      placeholder="Stadium, VAR, Offside, ..."
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                      Min Score to Pass:
                    </label>
                    <input
                      type="range" min={1} max={10}
                      value={minScore}
                      onChange={(e) => setMinScore(parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: '#10b981' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', width: '24px', textAlign: 'center' }}>{minScore}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Save */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: saved ? '#10b981' : '#3b82f6', color: '#fff' }}
              size="sm"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Channel Config'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} style={{ color: '#64748b' }}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ChannelManager ───────────────────────────────────────────────────────
export default function ChannelManager({
  pageId,
  defaultSystemPrompt = '',
  defaultUserPrompt = '',
  defaultKeywordConfig = { tier1: [], tier2: [], minScore: 1 },
}: ChannelManagerProps) {
  const [channels, setChannels] = useState<PageChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChannel, setEditingChannel] = useState<PageChannel | null>(null);

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

  const handleChannelSaved = (updated: PageChannel) => {
    setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditingChannel(null);
  };

  return (
    <>
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
                const hasCustomConfig = !!(ch.systemPrompt || ch.keywordConfig);
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
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground">{cfg.label}</p>
                          {hasCustomConfig && (
                            <span style={{
                              fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
                              backgroundColor: '#1d4ed8', color: '#bfdbfe', fontWeight: 600,
                            }}>
                              CUSTOM CONFIG
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[10px]">
                        Connected
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingChannel(ch)}
                        className="text-xs"
                      >
                        ⚙️ Settings
                      </Button>
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

      {/* Channel Settings Modal */}
      {editingChannel && (
        <ChannelSettingsModal
          channel={editingChannel}
          defaultSystemPrompt={defaultSystemPrompt}
          defaultUserPrompt={defaultUserPrompt}
          defaultKeywordConfig={defaultKeywordConfig}
          onClose={() => setEditingChannel(null)}
          onSaved={handleChannelSaved}
        />
      )}
    </>
  );
}
