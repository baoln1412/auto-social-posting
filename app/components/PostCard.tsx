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
import { toast, confirmDialog } from './feedback';
import {
  Check, ChevronDown, ChevronRight, ChevronUp, Circle, Loader2, Video,
} from 'lucide-react';

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
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Scheduled', className: 'bg-warning/10 text-warning' },
  published: { label: 'Published', className: 'bg-success/10 text-success' },
  failed: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
};

// No `icon` field: the label already says "Facebook". Lucide dropped brand
// glyphs, and hand-rolling four brand SVGs for a publisher that ships behind
// ENABLE_PUBLISHING=false is work with no reader.
const PLATFORM_CONFIG: Record<string, { label: string; color: string; btnClass: string }> = {
  facebook: { label: 'Facebook', color: 'text-brand-facebook', btnClass: 'bg-brand-facebook hover:bg-brand-facebook/90 text-white' },
  instagram: { label: 'Instagram', color: 'text-brand-instagram', btnClass: 'bg-brand-instagram hover:bg-brand-instagram/90 text-white' },
  threads: { label: 'Threads', color: 'text-foreground', btnClass: 'bg-foreground hover:bg-foreground/90 text-background' },
  tiktok: { label: 'TikTok', color: 'text-foreground', btnClass: 'bg-foreground hover:bg-foreground/90 text-background' },
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
      {copied ? 'Copied' : 'Copy'}
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
    if (selected.length === 0) { toast(`No ${cfg.label} channels selected.`); return; }
    const channelNames = selected.map((c) => c.platformPageName).join(', ');
    const ok = await confirmDialog({
      title: scheduledTime ? `Schedule to ${cfg.label}?` : `Post to ${cfg.label} now?`,
      body: channelNames,
      confirmLabel: scheduledTime ? 'Schedule' : 'Post now',
    });
    if (!ok) return;

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
        results.push(data.success ? `${ch.platformPageName}: ${data.scheduled ? 'Scheduled' : 'Posted'}` : `${ch.platformPageName}: ${data.error}`);
      } catch (err) { results.push(`Error: ${err}`); }
    }
    toast(results.join('\n'));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
            {cfg.label} Draft {isEditing && <span className="text-success normal-case tracking-normal">(edited)</span>}
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal transition-colors border
                  ${isSelected ? 'bg-info/10 text-info border-info/25' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                {isSelected ? <Check size={13} /> : <Circle size={13} />}
                <span>{ch.platformPageName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Post/Schedule actions */}
      {platformChannels.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Schedule:</label>
            <input type="datetime-local" id={`schedule-${platform}-${encodeURIComponent(emojiTitle)}`}
              className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => postToChannels()}
              disabled={platformChannels.filter(c => selectedChannels.has(c.id)).length === 0}
              size="sm" className={`flex-1 ${cfg.btnClass}`}>
              Post Now
            </Button>
            <Button onClick={() => {
              const input = document.getElementById(`schedule-${platform}-${encodeURIComponent(emojiTitle)}`) as HTMLInputElement;
              if (!input?.value) { toast('Pick a date and time first.'); return; }
              postToChannels(new Date(input.value).toISOString());
            }} disabled={platformChannels.filter(c => selectedChannels.has(c.id)).length === 0}
              variant="outline" size="sm" className="flex-1 text-warning border-warning/25 hover:bg-warning/10">
              Schedule
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PostCard({ post, isNew, onToggleDone, onStatusChange, pageId, pageName, onShowChecklistInChat }: PostCardProps) {
  const { article, facebookText, emojiTitle, hashtags, comment1, comment2, comment3, generatedImageUrl, platformDrafts } = post;
  const { title, pubDate, source, imageUrl, imageUrls, url } = article;
  const status = post.status ?? (post.isDone ? 'published' : 'draft');

  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  // Owned here (not inside the drawer) so a render job keeps polling — and the
  // script/media survive — even while the drawer is closed. videoOpen is passed
  // through so the hook's preview effect only fires while the drawer is open.
  const vg = useVideoGen(post, pageName, videoOpen);

  // AI Fix
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  // The Facebook draft is one self-contained block: TITLE at the top, body, then
  // hashtags at the end. (The title also stays as a separate heading above.)
  // post.fbDraft is a prior saved edit (see EDITABLE_GOLD_FIELDS::fb_draft) — without
  // it, a refresh silently reverted every edit back to the original generated text.
  const [editedFbDraft, setEditedFbDraft] = useState(() =>
    post.fbDraft ?? [emojiTitle?.trim(), facebookText?.trim(), hashtags?.trim()].filter(Boolean).join('\n\n'),
  );
  const [isFbEditing, setIsFbEditing] = useState(Boolean(post.fbDraft));
  const [fbSaveState, setFbSaveState] = useState<'' | 'saving' | 'saved'>('');

  const saveFbDraft = useCallback(async () => {
    if (!post.id) return;
    setFbSaveState('saving');
    try {
      const res = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, fields: { fb_draft: editedFbDraft } }),
      });
      setFbSaveState(res.ok ? 'saved' : '');
      if (!res.ok) toast('Save failed');
    } catch {
      setFbSaveState('');
      toast('Save failed');
    }
  }, [post.id, editedFbDraft]);

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
      if (!res.ok) toast('Save failed');
    } catch {
      setSaveState('');
      toast('Save failed');
    }
  }, [post.id, ovBg, ovInset, imageUrl, imageUrls]);

  const uploadLocal = useCallback(async (file: File, which: 'bg' | 'inset') => {
    setUploading(which);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/image/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) { toast(data.error ?? 'Upload failed'); return; }
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
      else toast(`AI Error: ${data.error}`);
    } catch (err) { toast(`Network error: ${err}`); }
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
    if (selected.length === 0) { toast('Select at least one Facebook channel.'); return; }
    const channelNames = selected.map((c) => c.platformPageName).join(', ');
    const ok = await confirmDialog({
      title: scheduledTime ? 'Schedule to Facebook?' : 'Post to Facebook now?',
      body: channelNames,
      confirmLabel: scheduledTime ? 'Schedule' : 'Post now',
    });
    if (!ok) return;

    const results: string[] = [];
    for (const ch of selected) {
      try {
        const res = await fetch('/api/facebook/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: ch.id, emojiTitle: '', facebookText: editedFbDraft, imageUrl: generatedImageUrl || imageUrl, ...(scheduledTime && { scheduledTime }) }) });
        const data = await res.json();
        results.push(data.success ? `${ch.platformPageName}: ${data.scheduled ? 'Scheduled' : 'Posted'}` : `${ch.platformPageName}: ${data.error}`);
      } catch (err) { results.push(`Error: ${err}`); }
    }
    toast(results.join('\n'));
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
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/90 text-destructive-foreground font-bold text-[11px] shrink-0 backdrop-blur-sm">
              {article.location}
            </span>
          </>
        )}
        {(post.topics ?? []).map((t) => (
          <span key={t} className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-[11px] shrink-0 backdrop-blur-sm ${hasImage ? 'bg-white/20 text-white' : 'bg-muted text-foreground'}`}>
            {topicLabel(t)}
          </span>
        ))}
        <span className="opacity-50">·</span>
        <span className="font-mono opacity-80 shrink-0">{formattedDate}</span>
        {post.fetchTime && (
          <>
            <span className="opacity-50">·</span>
            <span className="font-mono opacity-60 shrink-0 hidden sm:inline">
              Fetched: {new Date(post.fetchTime).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(post.fetchTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </>
        )}
        {isNew && <Badge className="bg-primary text-primary-foreground text-[10px] animate-pulse">🆕 NEW</Badge>}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="shrink-0 px-2.5 py-1 rounded-md bg-warning/90 hover:bg-warning transition-colors backdrop-blur-sm text-xs font-semibold text-foreground">
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
                AI Generated
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
            <span className="opacity-60">copy for AI</span>
          </button>
        )}

        {/* Open this post in Studio. Additive: the Tạo Video drawer below is untouched, and
            this renders only where NEXT_PUBLIC_STUDIO_ENABLED is set — production never sees
            a link into a route tree it does not serve. */}
        {process.env.NEXT_PUBLIC_STUDIO_ENABLED && post.id && (
          <a
            href={`/studio/runs/new?item=gold:${post.id}&market=${pageId}`}
            data-testid="open-in-studio"
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"
          >
            Mở trong Studio
          </a>
        )}

        {/* Video Generation */}
        <Button onClick={() => setVideoOpen(true)}
          className="w-full bg-gradient-to-r from-primary to-primary hover:from-primary hover:to-primary text-white font-semibold">
          Tạo Video
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
          <div className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 text-sm text-success font-normal">
              <Video size={14} /><span>Video đã sẵn sàng</span>
            </div>
            <div className="flex gap-2">
              <a href={`/api/video/file?f=${vg.jobFile}`} download="reel.mp4"
                className="flex-1 text-center py-1.5 rounded-md text-xs font-semibold bg-success text-white hover:bg-success/90 transition-colors">
                Tải về
              </a>
              <button onClick={() => setVideoPreviewOpen((v) => !v)}
                className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-white text-success border border-success/25 hover:bg-success/50 transition-colors">
                {videoPreviewOpen ? <><ChevronUp size={13} />Ẩn</> : <><ChevronRight size={13} />Xem trước</>}
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
            className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors bg-info/10 text-info border border-info/25 hover:bg-info/15">
            Download FB Image (1200×630)
          </a>
        )}

        {/* ═══════ NEWS CARD (branded FB/IG image, rendered on demand) ═══════ */}
        <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
          <button
            onClick={() => { if (!showCard) setCardLoading(true); setShowCard((v) => !v); }}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-primary uppercase tracking-wider hover:bg-primary/50 transition-colors"
          >
            <span>News Card {cardRatio === '4:5' ? '(4:5)' : '(1:1)'}</span>
            <span className="text-muted-foreground normal-case tracking-normal">{showCard ? <><ChevronUp size={13} />Hide</> : <><ChevronDown size={13} />Generate & view</>}</span>
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
                      cardRatio === r ? 'bg-primary text-white border-primary' : 'bg-white text-foreground border-border hover:bg-accent'
                    }`}
                  >
                    {r === '4:5' ? '4:5 Portrait' : '1:1 Square'}
                  </button>
                ))}
              </div>

              {/* Import local images — main bg + circle inset (for articles with no photo) */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-primary font-semibold">
                  <span className="inline-flex items-center gap-1">Main image{ovBg && <Check size={12} />}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLocal(f, 'bg'); e.target.value = ''; }} />
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-primary font-semibold">
                  <span className="inline-flex items-center gap-1">Circle image{ovInset && <Check size={12} />}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLocal(f, 'inset'); e.target.value = ''; }} />
                </label>
                {uploading && <span className="text-muted-foreground animate-pulse">Uploading {uploading === 'bg' ? 'main' : 'circle'}…</span>}
                {(ovBg || ovInset) && (
                  <>
                    <button type="button" disabled={saveState === 'saving'} onClick={saveCardImages}
                      className="px-2.5 py-1 rounded-md bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50">
                      {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save to post'}
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
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-white text-primary border border-primary/25 hover:bg-primary/10 transition-colors">
                  Open full
                </a>
                <a href={cardUrl} download={`news-card-${cardRatio.replace(':', 'x')}.png`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors">
                  Download PNG
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ═══════ FACEBOOK DRAFT (Default, always shown) ═══════ */}
        <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-xs font-semibold text-info uppercase tracking-wider">
              Facebook Draft {isFbEditing && <span className="text-success normal-case tracking-normal">(edited)</span>}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAiPanel(!showAiPanel)}
                className={`text-xs h-7 ${showAiPanel ? 'bg-primary/10 text-primary border-primary/25' : ''}`}>
                AI Fix
              </Button>
              <CopyButton text={editedFbDraft} />
              <Button
                variant="outline"
                size="sm"
                disabled={fbSaveState === 'saving'}
                onClick={saveFbDraft}
                className="text-xs h-7"
              >
                {fbSaveState === 'saving' ? 'Saving…' : fbSaveState === 'saved' ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>
          <Textarea
            value={editedFbDraft}
            onChange={(e) => { setEditedFbDraft(e.target.value); setIsFbEditing(true); setFbSaveState(''); }}
            className="border-0 rounded-none min-h-[160px] resize-y text-sm bg-transparent focus-visible:ring-0"
          />
        </div>

        {/* ═══════ SEED COMMENTS (post as the first comments to spark engagement) ═══════ */}
        {(comment1?.trim() || comment2?.trim() || comment3?.trim()) && (
          <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
            <div className="px-4 py-2 border-b border-border">
              <span className="text-xs font-semibold text-warning uppercase tracking-wider">Seed Comments</span>
            </div>
            {[comment1, comment2, comment3].map((c, i) =>
              c?.trim() ? (
                <div key={i} className="flex items-start gap-2 px-4 py-2.5 border-b border-border last:border-b-0">
                  <span className="font-mono text-xs font-semibold text-muted-foreground mt-1 shrink-0">#{i + 1}</span>
                  <p className="text-sm text-foreground whitespace-pre-wrap flex-1" style={{ lineHeight: 1.6 }}>{c}</p>
                  <CopyButton text={c} />
                </div>
              ) : null,
            )}
          </div>
        )}

        {/* AI Panel */}
        {showAiPanel && (
          <div className="rounded-lg p-4 space-y-3 bg-primary/50 border border-primary/25">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI Draft Editor</span>
            <div className="flex gap-2">
              <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading) handleAiRefine(); }}
                placeholder="e.g. Rewrite intro, add more detail…"
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-white outline-none text-foreground" disabled={aiLoading} />
              <Button onClick={handleAiRefine} disabled={aiLoading || !aiPrompt.trim()} size="sm" className="bg-primary hover:bg-primary/90 text-white">
                {aiLoading ? <><Loader2 size={13} className="animate-spin" />Refining…</> : 'Refine'}
              </Button>
            </div>
            {aiSuggestion && (
              <div className="space-y-2">
                <p className="text-xs text-success font-semibold">AI Suggestion:</p>
                <div className="text-sm text-foreground whitespace-pre-wrap rounded-lg p-3 bg-white border border-primary/25 max-h-[200px] overflow-y-auto" style={{ lineHeight: 1.6 }}>
                  {aiSuggestion}
                </div>
                <div className="flex gap-2">
                  <Button onClick={applyAiSuggestion} size="sm" className="flex-1 bg-success hover:bg-success/90 text-white">Apply</Button>
                  <Button onClick={() => setAiSuggestion('')} variant="outline" size="sm" className="text-destructive border-destructive/25">Discard</Button>
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal transition-colors border
                      ${isSelected ? 'bg-info/10 text-info border-info/25' : 'bg-muted/50 text-muted-foreground border-border'}`}>
                    {isSelected ? <Check size={13} /> : <Circle size={13} />}
                    <span>{ch.platformPageName}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Schedule:</label>
                <input type="datetime-local" id={`schedule-fb-${encodeURIComponent(url)}`}
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground" />
              </div>
              <div className="flex gap-2">
                {status === 'draft' && onStatusChange && (
                  <Button variant="outline" size="sm" onClick={() => onStatusChange(url, 'scheduled')}
                    className="text-warning border-warning/25 hover:bg-warning/10">
                    Approve
                  </Button>
                )}
                <Button onClick={() => postToFbChannels()}
                  disabled={facebookChannels.filter(c => selectedChannels.has(c.id)).length === 0}
                  size="sm" className="flex-1 bg-info hover:bg-info/90 text-white">
                  Post Now {facebookChannels.filter(c => selectedChannels.has(c.id)).length > 0 && `(${facebookChannels.filter(c => selectedChannels.has(c.id)).length})`}
                </Button>
                <Button onClick={() => {
                  const input = document.getElementById(`schedule-fb-${encodeURIComponent(url)}`) as HTMLInputElement;
                  if (!input?.value) { toast('Pick a date and time first.'); return; }
                  postToFbChannels(new Date(input.value).toISOString());
                }} disabled={facebookChannels.filter(c => selectedChannels.has(c.id)).length === 0}
                  variant="outline" size="sm" className="flex-1 text-warning border-warning/25 hover:bg-warning/10">
                  Schedule
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
              {showOtherPlatforms ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>{otherPlatforms.length} Other Platform Draft{otherPlatforms.length > 1 ? 's' : ''}</span>
              <div className="flex gap-1">
                {otherPlatforms.map(([platform]) => {
                  const cfg = PLATFORM_CONFIG[platform];
                  return <span key={platform} className="text-xs text-muted-foreground">{cfg?.label ?? platform}</span>;
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
