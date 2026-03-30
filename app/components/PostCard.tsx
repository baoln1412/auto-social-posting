'use client';

import { useState, useEffect, useCallback } from 'react';
import { PostDraft, PageChannel, PostStatus } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface PostCardProps {
  post: PostDraft;
  isNew?: boolean;
  onToggleDone?: () => void;
  onStatusChange?: (articleUrl: string, status: PostStatus, scheduledAt?: string) => void;
  pageId: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-stone-100 text-stone-600' },
  scheduled: { label: 'Scheduled', className: 'bg-amber-50 text-amber-700' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
};

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; color: string; btnClass: string }> = {
  facebook: { label: 'Facebook', icon: '📘', color: 'text-blue-600', btnClass: 'bg-blue-600 hover:bg-blue-700 text-white' },
  instagram: { label: 'Instagram', icon: '📸', color: 'text-pink-600', btnClass: 'bg-pink-600 hover:bg-pink-700 text-white' },
  threads: { label: 'Threads', icon: '🧵', color: 'text-stone-700', btnClass: 'bg-stone-700 hover:bg-stone-800 text-white' },
  tiktok: { label: 'TikTok', icon: '🎵', color: 'text-stone-700', btnClass: 'bg-stone-700 hover:bg-stone-800 text-white' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="text-xs h-7">
      {copied ? '✓ Copied' : '📋 Copy'}
    </Button>
  );
}

function PlatformDraftSection({
  platform,
  draft,
  channels,
  selectedChannels,
  onToggleChannel,
  imageUrl,
  emojiTitle,
}: {
  platform: string;
  draft: string;
  channels: PageChannel[];
  selectedChannels: Set<string>;
  onToggleChannel: (id: string) => void;
  imageUrl?: string;
  emojiTitle: string;
}) {
  const [editedDraft, setEditedDraft] = useState(draft);
  const [isEditing, setIsEditing] = useState(false);
  const cfg = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.facebook;

  const platformChannels = channels.filter((c) => c.platform === platform);

  const postToChannels = async (scheduledTime?: string) => {
    const selected = platformChannels.filter((c) => selectedChannels.has(c.id));
    if (selected.length === 0) { alert(`No ${cfg.label} channels selected.`); return; }
    const channelNames = selected.map((c) => c.platformPageName).join(', ');
    if (!confirm(`${scheduledTime ? '📅 Schedule' : `${cfg.icon} Post`} to ${cfg.label}: ${channelNames}?`)) return;

    const results: string[] = [];
    for (const ch of selected) {
      try {
        const res = await fetch('/api/facebook/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: ch.id,
            emojiTitle,
            facebookText: editedDraft,
            imageUrl,
            ...(scheduledTime && { scheduledTime }),
          }),
        });
        const data = await res.json();
        results.push(data.success ? `✅ ${ch.platformPageName}: ${data.scheduled ? 'Scheduled' : 'Posted'}` : `❌ ${ch.platformPageName}: ${data.error}`);
      } catch (err) { results.push(`❌ Error: ${err}`); }
    }
    alert(results.join('\n'));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
            {cfg.icon} {cfg.label} Draft {isEditing && <span className="text-emerald-600 normal-case tracking-normal">(edited)</span>}
          </span>
          <CopyButton text={editedDraft} />
        </div>
        <Textarea
          value={editedDraft}
          onChange={(e) => { setEditedDraft(e.target.value); setIsEditing(true); }}
          className="border-0 rounded-none min-h-[100px] resize-y text-sm bg-transparent focus-visible:ring-0"
        />
      </div>

      {/* Channel chips for this platform */}
      {platformChannels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {platformChannels.map((ch) => {
            const isSelected = selectedChannels.has(ch.id);
            return (
              <button key={ch.id} onClick={() => onToggleChannel(ch.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                  ${isSelected ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                <span>{isSelected ? '✓' : '○'}</span>
                <span>{cfg.icon} {ch.platformPageName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Post/Schedule actions */}
      {platformChannels.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">📅 Schedule:</label>
            <input type="datetime-local" id={`schedule-${platform}-${encodeURIComponent(emojiTitle)}`}
              className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => postToChannels()}
              disabled={platformChannels.filter(c => selectedChannels.has(c.id)).length === 0}
              size="sm" className={`flex-1 ${cfg.btnClass}`}>
              {cfg.icon} Post Now
            </Button>
            <Button onClick={() => {
              const input = document.getElementById(`schedule-${platform}-${encodeURIComponent(emojiTitle)}`) as HTMLInputElement;
              if (!input?.value) { alert('Pick a date and time first.'); return; }
              postToChannels(new Date(input.value).toISOString());
            }} disabled={platformChannels.filter(c => selectedChannels.has(c.id)).length === 0}
              variant="outline" size="sm" className="flex-1 text-amber-700 border-amber-200 hover:bg-amber-50">
              📅 Schedule
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PostCard({ post, isNew, onToggleDone, onStatusChange, pageId }: PostCardProps) {
  const { article, facebookText, emojiTitle, generatedImageUrl, platformDrafts } = post;
  const { title, pubDate, source, imageUrl, url } = article;
  const status = post.status ?? (post.isDone ? 'published' : 'draft');

  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);

  // AI Fix
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [editedFbDraft, setEditedFbDraft] = useState(facebookText);
  const [isFbEditing, setIsFbEditing] = useState(false);

  // Channel selector
  const [channels, setChannels] = useState<PageChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [channelsLoaded, setChannelsLoaded] = useState(false);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/facebook/status?pageId=${pageId}`);
      const data = await res.json();
      const chs: PageChannel[] = data.channels ?? [];
      setChannels(chs);
      setSelectedChannels(new Set(chs.map((c) => c.id)));
    } catch { setChannels([]); }
    finally { setChannelsLoaded(true); }
  }, [pageId]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  let formattedDate = '';
  try {
    if (pubDate) formattedDate = new Date(pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Bangkok' });
  } catch {}

  const handleAiRefine = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: editedFbDraft, instruction: aiPrompt }) });
      const data = await res.json();
      if (data.success) setAiSuggestion(data.refined);
      else alert(`AI Error: ${data.error}`);
    } catch (err) { alert(`Network error: ${err}`); }
    finally { setAiLoading(false); }
  };

  const applyAiSuggestion = () => {
    setEditedFbDraft(aiSuggestion);
    setAiSuggestion('');
    setAiPrompt('');
    setShowAiPanel(false);
    setIsFbEditing(true);
  };

  const facebookChannels = channels.filter((c) => c.platform === 'facebook');

  const postToFbChannels = async (scheduledTime?: string) => {
    const selected = facebookChannels.filter(c => selectedChannels.has(c.id));
    if (selected.length === 0) { alert('Select at least one Facebook channel.'); return; }
    const channelNames = selected.map((c) => c.platformPageName).join(', ');
    if (!confirm(`${scheduledTime ? '📅 Schedule' : '📘 Post'} to: ${channelNames}?`)) return;

    const results: string[] = [];
    for (const ch of selected) {
      try {
        const res = await fetch('/api/facebook/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: ch.id, emojiTitle, facebookText: editedFbDraft, imageUrl: generatedImageUrl || imageUrl, ...(scheduledTime && { scheduledTime }) }) });
        const data = await res.json();
        results.push(data.success ? `✅ ${ch.platformPageName}: ${data.scheduled ? 'Scheduled' : 'Posted'}` : `❌ ${ch.platformPageName}: ${data.error}`);
      } catch (err) { results.push(`❌ Error: ${err}`); }
    }
    alert(results.join('\n'));
  };

  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const otherPlatforms = Object.entries(platformDrafts ?? {}).filter(([_, draft]) => draft && draft.trim());

  return (
    <Card className="card-warm overflow-hidden">
      {/* Image header */}
      {(generatedImageUrl || imageUrl) && (
        <div className="relative h-52 bg-muted">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${generatedImageUrl || imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          {generatedImageUrl && (
            <div className="absolute top-3 left-4">
              <Badge className="bg-primary text-primary-foreground text-[10px]">
                ✨ AI Generated
              </Badge>
            </div>
          )}
          {/* ── Metadata bar (bottom of image) ── */}
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2 text-xs text-white">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-semibold shrink-0">{source}</span>
              {article.location && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600/90 text-yellow-300 font-bold text-[11px] shrink-0 backdrop-blur-sm">
                    📍 {article.location}
                  </span>
                </>
              )}
              <span className="opacity-50">·</span>
              <span className="opacity-80 shrink-0">{formattedDate}</span>
              {post.fetchTime && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="opacity-60 shrink-0 hidden sm:inline">
                    Fetched: {new Date(post.fetchTime).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(post.fetchTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </>
              )}
              {isNew && <Badge className="bg-primary text-primary-foreground text-[10px] animate-pulse">🆕 NEW</Badge>}
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="shrink-0 px-2.5 py-1 rounded-md bg-amber-500/90 hover:bg-amber-400 transition-colors backdrop-blur-sm text-xs font-semibold text-black">
              Source ↗
            </a>
          </div>
        </div>
      )}


      <CardContent className="p-5 space-y-4">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-foreground leading-snug flex-1">{emojiTitle}</h3>
          <Badge variant="secondary" className={`shrink-0 text-[10px] ${statusCfg.className}`}>
            {statusCfg.label}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground truncate" title={title}>
          Original: {title}
        </p>

        {/* Post ID chip — for AI chat referencing */}
        {post.id && (
          <button
            onClick={() => navigator.clipboard.writeText(post.id!)}
            title="Click to copy post ID for AI chat"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/70 hover:text-primary transition-colors"
          >
            <span className="px-1.5 py-0.5 rounded bg-muted border border-border">#{post.id.slice(0, 8)}</span>
            <span className="opacity-60">📋 copy for AI</span>
          </button>
        )}

        {/* Download */}
        {(generatedImageUrl || imageUrl) && (
          <a href={`/api/image/resize?url=${encodeURIComponent(generatedImageUrl || imageUrl || '')}`} download="fb-post-image.jpg"
            className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100">
            📥 Download FB Image (1200×630)
          </a>
        )}

        {/* ═══════ FACEBOOK DRAFT (Default, always shown) ═══════ */}
        <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              📘 Facebook Draft {isFbEditing && <span className="text-emerald-600 normal-case tracking-normal">(edited)</span>}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAiPanel(!showAiPanel)}
                className={`text-xs h-7 ${showAiPanel ? 'bg-purple-50 text-purple-700 border-purple-200' : ''}`}>
                🤖 AI Fix
              </Button>
              <CopyButton text={editedFbDraft} />
            </div>
          </div>
          <Textarea
            value={editedFbDraft}
            onChange={(e) => { setEditedFbDraft(e.target.value); setIsFbEditing(true); }}
            className="border-0 rounded-none min-h-[120px] resize-y text-sm bg-transparent focus-visible:ring-0"
          />
        </div>

        {/* AI Panel */}
        {showAiPanel && (
          <div className="rounded-lg p-4 space-y-3 bg-purple-50/50 border border-purple-200">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">🤖 AI Draft Editor</span>
            <div className="flex gap-2">
              <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading) handleAiRefine(); }}
                placeholder="e.g. Rewrite intro, add more detail..."
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-white outline-none text-foreground" disabled={aiLoading} />
              <Button onClick={handleAiRefine} disabled={aiLoading || !aiPrompt.trim()} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                {aiLoading ? '⏳...' : '✨ Refine'}
              </Button>
            </div>
            {aiSuggestion && (
              <div className="space-y-2">
                <p className="text-xs text-emerald-600 font-semibold">AI Suggestion:</p>
                <div className="text-sm text-foreground whitespace-pre-wrap rounded-lg p-3 bg-white border border-purple-100 max-h-[200px] overflow-y-auto" style={{ lineHeight: 1.6 }}>
                  {aiSuggestion}
                </div>
                <div className="flex gap-2">
                  <Button onClick={applyAiSuggestion} size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">✅ Apply</Button>
                  <Button onClick={() => setAiSuggestion('')} variant="outline" size="sm" className="text-destructive border-red-200">✕ Discard</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Facebook channel chips + post buttons */}
        {channelsLoaded && facebookChannels.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {facebookChannels.map((ch) => {
                const isSelected = selectedChannels.has(ch.id);
                return (
                  <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                      ${isSelected ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                    <span>{isSelected ? '✓' : '○'}</span>
                    <span>📘 {ch.platformPageName}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">📅 Schedule:</label>
                <input type="datetime-local" id={`schedule-fb-${encodeURIComponent(url)}`}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground" />
              </div>
              <div className="flex gap-2">
                {status === 'draft' && onStatusChange && (
                  <Button variant="outline" size="sm" onClick={() => onStatusChange(url, 'scheduled')}
                    className="text-amber-700 border-amber-200 hover:bg-amber-50">
                    ✅ Approve
                  </Button>
                )}
                <Button onClick={() => postToFbChannels()}
                  disabled={facebookChannels.filter(c => selectedChannels.has(c.id)).length === 0}
                  size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  📘 Post Now {facebookChannels.filter(c => selectedChannels.has(c.id)).length > 0 && `(${facebookChannels.filter(c => selectedChannels.has(c.id)).length})`}
                </Button>
                <Button onClick={() => {
                  const input = document.getElementById(`schedule-fb-${encodeURIComponent(url)}`) as HTMLInputElement;
                  if (!input?.value) { alert('Pick a date and time first.'); return; }
                  postToFbChannels(new Date(input.value).toISOString());
                }} disabled={facebookChannels.filter(c => selectedChannels.has(c.id)).length === 0}
                  variant="outline" size="sm" className="flex-1 text-amber-700 border-amber-200 hover:bg-amber-50">
                  📅 Schedule
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ OTHER PLATFORM DRAFTS (expanded on click) ═══════ */}
        {otherPlatforms.length > 0 && (
          <div className="pt-3 border-t border-border">
            <button
              onClick={() => setShowOtherPlatforms(!showOtherPlatforms)}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{showOtherPlatforms ? '▼' : '▶'}</span>
              <span>📱 {otherPlatforms.length} Other Platform Draft{otherPlatforms.length > 1 ? 's' : ''}</span>
              <div className="flex gap-1">
                {otherPlatforms.map(([platform]) => {
                  const cfg = PLATFORM_CONFIG[platform];
                  return <span key={platform}>{cfg?.icon ?? '📱'}</span>;
                })}
              </div>
            </button>

            {showOtherPlatforms && (
              <div className="mt-3 space-y-4">
                {otherPlatforms.map(([platform, draft]) => (
                  <PlatformDraftSection
                    key={platform}
                    platform={platform}
                    draft={draft}
                    channels={channels}
                    selectedChannels={selectedChannels}
                    onToggleChannel={toggleChannel}
                    imageUrl={generatedImageUrl || imageUrl}
                    emojiTitle={emojiTitle}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
