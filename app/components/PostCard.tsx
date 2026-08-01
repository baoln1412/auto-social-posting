'use client';

import { useState, useEffect, useCallback } from 'react';
import { PostDraft, PageChannel, PostStatus } from '../types';
import { topicLabel } from '../lib/topics';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import VideoGenModal from './VideoGenModal';
import { useVideoGen } from './useVideoGen';

interface PostCardProps {
  post: PostDraft;
  isNew?: boolean;
  onToggleDone?: () => void;
  onStatusChange?: (articleUrl: string, status: PostStatus, scheduledAt?: string) => void;
  pageId: string;
  pageName?: string;
  onShowChecklistInChat?: (text: string) => void;
}

/**
 * Publishing (Facebook/other-platform posting + scheduling) is hidden in the
 * immigration tool — the site is display-only. The code below is kept intact so
 * publishing can be re-enabled by flipping this flag. When false, channels are
 * never loaded, so every channel-gated posting control renders nothing.
 */
const ENABLE_PUBLISHING = false;

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

export default function PostCard({ post, isNew, onToggleDone, onStatusChange, pageId, pageName, onShowChecklistInChat }: PostCardProps) {
  const { article, facebookText, emojiTitle, hashtags, comment1, comment2, generatedImageUrl, platformDrafts } = post;
  const { title, pubDate, source, imageUrl, imageUrls, url } = article;
  const status = post.status ?? (post.isDone ? 'published' : 'draft');

  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  // Owned here (not inside the drawer) so a render job keeps polling — and the
  // script/media survive — even while the drawer is closed.
  const vg = useVideoGen(post, pageName);

  // AI Fix
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  // The Facebook draft is one self-contained block: TITLE at the top, body, then
  // hashtags at the end. (The title also stays as a separate heading above.)
  const [editedFbDraft, setEditedFbDraft] = useState(() =>
    [emojiTitle?.trim(), facebookText?.trim(), hashtags?.trim()].filter(Boolean).join('\n\n'),
  );
  const [isFbEditing, setIsFbEditing] = useState(false);

  // News-card image (rendered on demand by /api/image/card — no storage).
  const [showCard, setShowCard] = useState(false);
  const [cardRatio, setCardRatio] = useState<'4:5' | '1:1'>('4:5');
  const [cardLoading, setCardLoading] = useState(false);
  // Hand-picked local images (main bg + circle inset) — override the article's photos.
  const [ovBg, setOvBg] = useState<string | null>(null);
  const [ovInset, setOvInset] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'' | 'bg' | 'inset'>('');
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved'>('');

  const saveCardImages = useCallback(async () => {
    if (!post.id) return;
    setSaveState('saving');
    try {
      const res = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: post.id,
          imageUrl: ovBg ?? imageUrl ?? '',
          insetUrl: ovInset ?? (imageUrls && imageUrls[1]) ?? '',
        }),
      });
      setSaveState(res.ok ? 'saved' : '');
      if (!res.ok) alert('Save failed');
    } catch {
      setSaveState('');
      alert('Save failed');
    }
  }, [post.id, ovBg, ovInset, imageUrl, imageUrls]);

  const uploadLocal = useCallback(async (file: File, which: 'bg' | 'inset') => {
    setUploading(which);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/image/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) { alert(data.error ?? 'Upload failed'); return; }
      const abs = window.location.origin + data.url; // card route fetches bg/inset server-side → needs absolute
      if (which === 'bg') setOvBg(abs); else setOvInset(abs);
      setSaveState('');
      setCardLoading(true);
    } finally {
      setUploading('');
    }
  }, []);

  const buildCardUrl = useCallback(
    (ratio: '4:5' | '1:1') => {
      const p = new URLSearchParams();
      p.set('ratio', ratio);
      p.set('title', emojiTitle || title || '');
      // Highlight heuristic (until the SOP emits highlight_phrases): the clause
      // after the first comma of the headline.
      const clean = (emojiTitle || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu, '').trim();
      const ci = clean.indexOf(',');
      if (ci > 0 && ci < clean.length - 3) p.set('hl', clean.slice(ci + 1).trim());
      const bgFinal = ovBg ?? imageUrl;
      if (bgFinal) p.set('bg', bgFinal);
      const insetFinal = ovInset ?? (imageUrls && imageUrls[1]);
      if (insetFinal) p.set('inset', insetFinal); // 2nd image → circle inset
      if (url) p.set('article', url); // enables the og:image full-res fix
      if (post.imagePrompt) p.set('imagePrompt', post.imagePrompt); // Case 2 — AI-gen bg when no image
      return `/api/image/card?${p.toString()}`;
    },
    [emojiTitle, title, imageUrl, imageUrls, url, post.imagePrompt, ovBg, ovInset],
  );

  const cardUrl = buildCardUrl(cardRatio);

  // Channel selector
  const [channels, setChannels] = useState<PageChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [channelsLoaded, setChannelsLoaded] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!ENABLE_PUBLISHING) { setChannelsLoaded(true); return; }
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
        const res = await fetch('/api/facebook/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: ch.id, emojiTitle: '', facebookText: editedFbDraft, imageUrl: generatedImageUrl || imageUrl, ...(scheduledTime && { scheduledTime }) }) });
        const data = await res.json();
        results.push(data.success ? `✅ ${ch.platformPageName}: ${data.scheduled ? 'Scheduled' : 'Posted'}` : `❌ ${ch.platformPageName}: ${data.error}`);
      } catch (err) { results.push(`❌ Error: ${err}`); }
    }
    alert(results.join('\n'));
  };

  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const otherPlatforms = Object.entries(platformDrafts ?? {}).filter(([_, draft]) => draft && draft.trim());

  const hasImage = Boolean(generatedImageUrl || imageUrl);
  const metaBar = (
    <div className={`flex items-center justify-between gap-2 text-xs flex-wrap ${hasImage ? 'text-white absolute bottom-3 left-4 right-4' : 'text-muted-foreground px-5 pt-4 pb-3 border-b border-border'}`}>
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className={`font-semibold shrink-0 ${hasImage ? '' : 'text-foreground'}`}>{source}</span>
        {article.location && (
          <>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600/90 text-yellow-300 font-bold text-[11px] shrink-0 backdrop-blur-sm">
              📍 {article.location}
            </span>
          </>
        )}
        {(post.topics ?? []).map((t) => (
          <span key={t} className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-[11px] shrink-0 backdrop-blur-sm ${hasImage ? 'bg-white/20 text-white' : 'bg-muted text-foreground'}`}>
            {topicLabel(t)}
          </span>
        ))}
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
  );

  return (
    <Card className="card-warm overflow-hidden">
      {/* Image header */}
      {hasImage ? (
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
          {metaBar}
        </div>
      ) : (
        metaBar
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

        {/* Video Generation */}
        <Button onClick={() => setVideoOpen(true)}
          className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold">
          🎬 Tạo Video
        </Button>
        <VideoGenModal
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
          post={post}
          vg={vg}
          onShowChecklistInChat={onShowChecklistInChat ?? (() => {})}
        />

        {/* Render result — surfaces here even if the drawer was already closed */}
        {vg.jobStatus === 'done' && vg.jobFile && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
              <span>🎥</span><span>Video đã sẵn sàng</span>
            </div>
            <div className="flex gap-2">
              <a href={`/api/video/file?f=${vg.jobFile}`} download="reel.mp4"
                className="flex-1 text-center py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                📥 Tải về
              </a>
              <button onClick={() => setVideoPreviewOpen((v) => !v)}
                className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-100/50 transition-colors">
                {videoPreviewOpen ? '▲ Ẩn' : '▶ Xem trước'}
              </button>
            </div>
            {videoPreviewOpen && (
              <video controls src={`/api/video/file?f=${vg.jobFile}`} className="w-full max-h-[420px] rounded-md bg-black" />
            )}
          </div>
        )}

        {/* Download */}
        {(generatedImageUrl || imageUrl) && (
          <a href={`/api/image/resize?url=${encodeURIComponent(generatedImageUrl || imageUrl || '')}`} download="fb-post-image.jpg"
            className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100">
            📥 Download FB Image (1200×630)
          </a>
        )}

        {/* ═══════ NEWS CARD (branded FB/IG image, rendered on demand) ═══════ */}
        <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
          <button
            onClick={() => { if (!showCard) setCardLoading(true); setShowCard((v) => !v); }}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-rose-600 uppercase tracking-wider hover:bg-rose-50/50 transition-colors"
          >
            <span>🖼️ News Card {cardRatio === '4:5' ? '(4:5)' : '(1:1)'}</span>
            <span className="text-muted-foreground normal-case tracking-normal">{showCard ? '▲ Hide' : '▼ Generate & view'}</span>
          </button>

          {showCard && (
            <div className="px-4 pb-4 space-y-3">
              {/* Ratio toggle */}
              <div className="flex items-center gap-2">
                {(['4:5', '1:1'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => { if (r !== cardRatio) { setCardLoading(true); setCardRatio(r); } }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
                      cardRatio === r ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-foreground border-border hover:bg-accent'
                    }`}
                  >
                    {r === '4:5' ? '4:5 Portrait' : '1:1 Square'}
                  </button>
                ))}
              </div>

              {/* Import local images — main bg + circle inset (for articles with no photo) */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-rose-600 font-semibold">
                  <span>🖼️ Main image{ovBg ? ' ✓' : ''}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLocal(f, 'bg'); e.target.value = ''; }} />
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-rose-600 font-semibold">
                  <span>⭕ Circle image{ovInset ? ' ✓' : ''}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLocal(f, 'inset'); e.target.value = ''; }} />
                </label>
                {uploading && <span className="text-muted-foreground animate-pulse">Uploading {uploading === 'bg' ? 'main' : 'circle'}…</span>}
                {(ovBg || ovInset) && (
                  <>
                    <button type="button" disabled={saveState === 'saving'} onClick={saveCardImages}
                      className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50">
                      {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : '💾 Save to post'}
                    </button>
                    <button type="button" className="text-muted-foreground underline"
                      onClick={() => { setOvBg(null); setOvInset(null); setSaveState(''); setCardLoading(true); }}>
                      reset to article images
                    </button>
                  </>
                )}
              </div>

              {/* Preview */}
              <div className="relative rounded-lg overflow-hidden bg-muted flex items-center justify-center min-h-[200px]">
                {cardLoading && (
                  <span className="absolute text-xs text-muted-foreground animate-pulse">Rendering card…</span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={cardUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
                  <img
                    key={cardUrl}
                    src={cardUrl}
                    alt="News card preview"
                    onLoad={() => setCardLoading(false)}
                    onError={() => setCardLoading(false)}
                    className="w-full h-auto max-h-[480px] object-contain"
                  />
                </a>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <a href={cardUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors">
                  ↗ Open full
                </a>
                <a href={cardUrl} download={`news-card-${cardRatio.replace(':', 'x')}.png`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors">
                  📥 Download PNG
                </a>
              </div>
            </div>
          )}
        </div>

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
            className="border-0 rounded-none min-h-[160px] resize-y text-sm bg-transparent focus-visible:ring-0"
          />
        </div>

        {/* ═══════ SEED COMMENTS (post as the first comments to spark engagement) ═══════ */}
        {(comment1?.trim() || comment2?.trim()) && (
          <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
            <div className="px-4 py-2 border-b border-border">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">💬 Seed Comments</span>
            </div>
            {[comment1, comment2].map((c, i) =>
              c?.trim() ? (
                <div key={i} className="flex items-start gap-2 px-4 py-2.5 border-b border-border last:border-b-0">
                  <span className="text-xs font-semibold text-muted-foreground mt-1 shrink-0">#{i + 1}</span>
                  <p className="text-sm text-foreground whitespace-pre-wrap flex-1" style={{ lineHeight: 1.6 }}>{c}</p>
                  <CopyButton text={c} />
                </div>
              ) : null,
            )}
          </div>
        )}

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
