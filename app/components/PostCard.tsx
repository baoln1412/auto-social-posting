'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PostDraft, PageChannel } from '../types';

interface PostCardProps {
  post: PostDraft;
  isNew?: boolean;
  onToggleDone?: () => void;
  pageId: string;
}

function CopyButton({ text, ariaLabel }: { text: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <button
      onClick={handleCopy}
      aria-label={ariaLabel}
      className="text-xs px-2 py-1 rounded border transition-colors duration-150"
      style={{
        borderColor: '#f0e523',
        color: copied ? '#1a1a1a' : '#f0e523',
        backgroundColor: copied ? '#f0e523' : 'transparent',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function renderBoldMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#f0e523' }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function PostCard({ post, isNew, onToggleDone, pageId }: PostCardProps) {
  const { article, facebookText, emojiTitle, generatedImageUrl } = post;
  const { title, pubDate, source, imageUrl, portraitUrl, url } = article;
  const isDone = post.isDone ?? false;

  const [portraitVisible, setPortraitVisible] = useState(true);
  const [editedDraft, setEditedDraft] = useState(facebookText);
  const [isEditing, setIsEditing] = useState(false);

  // AI Fix
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

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
      // Select all by default
      setSelectedChannels(new Set(chs.map((c) => c.id)));
    } catch {
      setChannels([]);
    } finally {
      setChannelsLoaded(true);
    }
  }, [pageId]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tzOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };

  let formattedDate = '';
  try {
    if (pubDate) {
      formattedDate = new Date(pubDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', ...tzOptions,
      });
    }
  } catch {}

  let formattedFetchTime = '';
  try {
    if (post.fetchTime) {
      formattedFetchTime = new Date(post.fetchTime).toLocaleString('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, ...tzOptions,
      }).replace(',', '');
    }
  } catch {}

  const handleAiRefine = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: editedDraft, instruction: aiPrompt }),
      });
      const data = await res.json();
      if (data.success) setAiSuggestion(data.refined);
      else alert(`AI Error: ${data.error}`);
    } catch (err) {
      alert(`Network error: ${err}`);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestion = () => {
    setEditedDraft(aiSuggestion);
    setAiSuggestion('');
    setAiPrompt('');
    setShowAiPanel(false);
    setIsEditing(true);
  };

  const postToChannels = async (scheduledTime?: string) => {
    if (selectedChannels.size === 0) {
      alert('Please select at least one channel to post to.');
      return;
    }

    const action = scheduledTime ? 'schedule' : 'post now';
    const channelNames = channels
      .filter((c) => selectedChannels.has(c.id))
      .map((c) => c.platformPageName)
      .join(', ');

    if (!confirm(`${scheduledTime ? '📅 Schedule' : '📘 Post'} to: ${channelNames}?`)) return;

    const results: string[] = [];
    for (const channelId of selectedChannels) {
      try {
        const res = await fetch('/api/facebook/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
            emojiTitle,
            facebookText: editedDraft,
            imageUrl: generatedImageUrl || imageUrl,
            ...(scheduledTime && { scheduledTime }),
          }),
        });
        const data = await res.json();
        const ch = channels.find((c) => c.id === channelId);
        if (data.success) {
          results.push(`✅ ${ch?.platformPageName}: ${data.scheduled ? 'Scheduled' : 'Posted'}`);
        } else {
          results.push(`❌ ${ch?.platformPageName}: ${data.error}`);
        }
      } catch (err) {
        results.push(`❌ Error: ${err}`);
      }
    }
    alert(results.join('\n'));
  };

  return (
    <div
      className="rounded-xl overflow-hidden border transition-opacity duration-200"
      style={{
        backgroundColor: '#1a1a1a',
        borderColor: isDone ? '#22c55e' : '#333',
        opacity: isDone ? 0.6 : 1,
      }}
    >
      {/* Image header */}
      <div className="relative w-full" style={{ height: '200px' }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundColor: '#1a1a1a',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }} />
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-sm text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          <div>
            <span className="font-semibold">{source}</span>
            <span className="mx-1 opacity-70">•</span>
            <span className="opacity-80">{formattedDate}</span>
            {formattedFetchTime && (
              <>
                <span className="mx-1 opacity-70">•</span>
                <span className="opacity-60 text-xs">Fetched: {formattedFetchTime}</span>
              </>
            )}
            {isNew && (
              <span
                className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse"
                style={{ backgroundColor: '#f0e523', color: '#000' }}
              >
                🆕 NEW
              </span>
            )}
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded transition-colors duration-150"
            style={{ backgroundColor: 'rgba(240,229,35,0.15)', color: '#f0e523', border: '1px solid rgba(240,229,35,0.3)' }}
          >
            Source ↗
          </a>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-3">
        {/* Title row */}
        <div className="flex items-start gap-3">
          {portraitUrl && portraitVisible && (
            <img
              src={portraitUrl}
              alt={`Portrait from ${source}`}
              width={60}
              height={60}
              onError={() => setPortraitVisible(false)}
              style={{
                borderRadius: '50%', border: '3px solid #f0e523',
                objectFit: 'cover', flexShrink: 0, width: '60px', height: '60px',
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <h2 className="text-xl font-bold text-white leading-snug">
              {renderBoldMarkdown(emojiTitle)}
            </h2>
          </div>
        </div>

        <p className="text-xs opacity-50 text-gray-400 truncate" title={title}>
          Original: {title}
        </p>

        {/* Generated image */}
        {generatedImageUrl && (
          <div className="mt-2 rounded-lg overflow-hidden border border-gray-700">
            <img src={generatedImageUrl} alt="Generated graphic" className="w-full object-cover" style={{ maxHeight: '300px' }} />
          </div>
        )}

        {/* Download FB image */}
        {(generatedImageUrl || imageUrl) && (
          <a
            href={`/api/image/resize?url=${encodeURIComponent(generatedImageUrl || imageUrl || '')}`}
            download="fb-post-image.jpg"
            className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors duration-150 mt-1"
            style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', cursor: 'pointer', textDecoration: 'none' }}
          >
            📥 Download FB Image (1200×630)
          </a>
        )}

        {/* Editable Facebook Draft */}
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#f0e523' }}>
              Facebook Draft {isEditing && <span className="text-green-400 normal-case tracking-normal">(edited)</span>}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAiPanel(!showAiPanel)}
                className="text-xs px-2 py-1 rounded border transition-colors duration-150"
                style={{ borderColor: '#a855f7', color: showAiPanel ? '#1a1a1a' : '#a855f7', backgroundColor: showAiPanel ? '#a855f7' : 'transparent' }}
              >
                🤖 AI Fix
              </button>
              <CopyButton text={editedDraft} ariaLabel="Copy facebook draft" />
            </div>
          </div>
          <div className="px-3 pb-3">
            <textarea
              value={editedDraft}
              onChange={(e) => { setEditedDraft(e.target.value); setIsEditing(true); }}
              className="w-full text-sm text-gray-200 bg-transparent border-0 outline-none resize-y"
              style={{ lineHeight: '1.6', minHeight: '150px', fontFamily: 'inherit' }}
              rows={8}
            />
          </div>
        </div>

        {/* AI Fix Panel */}
        {showAiPanel && (
          <div className="rounded-lg p-3 flex flex-col gap-3" style={{ backgroundColor: '#0d0d1a', border: '1px solid #a855f7' }}>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#a855f7' }}>
              🤖 AI Draft Editor
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading) handleAiRefine(); }}
                placeholder="e.g. Viết lại đoạn mở đầu, thêm chi tiết..."
                className="flex-1 text-sm px-3 py-2 rounded-lg bg-transparent outline-none"
                style={{ border: '1px solid #333', color: '#e5e7eb' }}
                disabled={aiLoading}
              />
              <button
                onClick={handleAiRefine}
                disabled={aiLoading || !aiPrompt.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-150"
                style={{ backgroundColor: aiLoading ? '#333' : '#a855f7', color: '#fff', cursor: aiLoading ? 'wait' : 'pointer', opacity: !aiPrompt.trim() ? 0.5 : 1 }}
              >
                {aiLoading ? '⏳ Refining...' : '✨ Refine'}
              </button>
            </div>
            {aiSuggestion && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-green-400 font-semibold">AI Suggestion:</span>
                <div
                  className="text-sm text-gray-200 whitespace-pre-wrap rounded-lg p-3"
                  style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', lineHeight: '1.6', maxHeight: '300px', overflowY: 'auto' }}
                >
                  {aiSuggestion}
                </div>
                <div className="flex gap-2">
                  <button onClick={applyAiSuggestion} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#22c55e', color: '#fff', cursor: 'pointer' }}>
                    ✅ Apply Changes
                  </button>
                  <button onClick={() => setAiSuggestion('')} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>
                    ✕ Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Channel selector */}
        {channelsLoaded && channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {channels.map((ch) => {
              const isSelected = selectedChannels.has(ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => toggleChannel(ch.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{
                    backgroundColor: isSelected ? 'rgba(24,119,242,0.15)' : '#161b22',
                    color: isSelected ? '#60a5fa' : '#8b949e',
                    border: `1px solid ${isSelected ? '#1877F2' : '#30363d'}`,
                  }}
                >
                  <span>{isSelected ? '✓' : '○'}</span>
                  <span>📘 {ch.platformPageName}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Post / Schedule actions */}
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 whitespace-nowrap">📅 Schedule:</label>
            <input
              type="datetime-local"
              id={`schedule-${encodeURIComponent(url)}`}
              className="flex-1 text-sm px-2 py-1.5 rounded-lg bg-transparent outline-none"
              style={{ border: '1px solid #333', color: '#e5e7eb', colorScheme: 'dark' }}
            />
          </div>

          <div className="flex gap-2">
            {onToggleDone && (
              <button
                onClick={onToggleDone}
                className="py-2 px-3 rounded-lg text-sm font-semibold transition-colors duration-150"
                style={{
                  backgroundColor: isDone ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                  color: isDone ? '#22c55e' : '#94a3b8',
                  border: `1px solid ${isDone ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
                  cursor: 'pointer',
                }}
              >
                {isDone ? '✅' : '☐'}
              </button>
            )}

            <button
              onClick={() => postToChannels()}
              disabled={selectedChannels.size === 0}
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors duration-150"
              style={{
                backgroundColor: selectedChannels.size > 0 ? '#1877F2' : '#21262d',
                color: selectedChannels.size > 0 ? '#fff' : '#8b949e',
                border: '1px solid #166FE5',
                cursor: selectedChannels.size > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              📘 Post Now {selectedChannels.size > 0 && `(${selectedChannels.size})`}
            </button>

            <button
              onClick={() => {
                const input = document.getElementById(`schedule-${encodeURIComponent(url)}`) as HTMLInputElement;
                const scheduledTime = input?.value;
                if (!scheduledTime) { alert('Please pick a date and time first.'); return; }
                postToChannels(new Date(scheduledTime).toISOString());
              }}
              disabled={selectedChannels.size === 0}
              className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors duration-150"
              style={{
                backgroundColor: selectedChannels.size > 0 ? 'rgba(251,146,60,0.15)' : '#21262d',
                color: selectedChannels.size > 0 ? '#fb923c' : '#8b949e',
                border: `1px solid ${selectedChannels.size > 0 ? 'rgba(251,146,60,0.4)' : '#30363d'}`,
                cursor: selectedChannels.size > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              📅 Schedule {selectedChannels.size > 0 && `(${selectedChannels.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
