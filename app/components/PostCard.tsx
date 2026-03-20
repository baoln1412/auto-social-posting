'use client';

import { useState, useRef, useEffect } from 'react';
import { PostDraft } from '../types';

interface PostCardProps {
  post: PostDraft;
  isNew?: boolean;
  onToggleDone?: () => void;
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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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

function CollapsibleSection({
  label,
  text,
  defaultOpen = false,
}: {
  label: string;
  text: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: '#f0e523' }}
        >
          {open ? '▾' : '▸'} {label}
        </span>
        <CopyButton text={text} ariaLabel={`Copy ${label.toLowerCase()}`} />
      </div>
      {open && (
        <div className="px-3 pb-3">
          {label === 'NB2 Image Prompt' ? (
            <pre
              className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono select-all"
              style={{ lineHeight: '1.5' }}
            >
              {text}
            </pre>
          ) : (
            <p
              className="text-sm text-gray-200 whitespace-pre-wrap break-words select-all"
              style={{ lineHeight: '1.6' }}
            >
              {text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Render **bold** markdown in title strings
function renderBoldMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#f0e523' }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function PostCard({ post, isNew, onToggleDone }: PostCardProps) {
  const { article, facebookText, nb2Prompt, emojiTitle, emojiTitleVi, commentBait, state } = post;
  const { title, pubDate, source, imageUrl, portraitUrl, url } = article;
  const isDone = post.isDone ?? false;

  const [portraitVisible, setPortraitVisible] = useState(true);

  // Format dates in UTC+7 (Asia/Bangkok)
  const tzOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };

  let formattedDate = '';
  try {
    if (pubDate) {
      formattedDate = new Date(pubDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...tzOptions,
      });
    }
  } catch (err) {
    console.error('Failed to parse date:', err);
  }

  let formattedFetchTime = '';
  try {
    const ft = post.fetchTime;
    if (ft) {
      const d = new Date(ft);
      formattedFetchTime = d.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...tzOptions,
      }).replace(',', '');
    }
  } catch (err) {
    console.error('Failed to parse fetch_time:', err);
  }

  return (
    <div
      className="rounded-xl overflow-hidden border transition-opacity duration-200"
      style={{
        backgroundColor: '#1a1a1a',
        borderColor: isDone ? '#22c55e' : '#333',
        opacity: isDone ? 0.6 : 1,
      }}
    >
      {/* Background image header */}
      <div
        className="relative w-full"
        style={{ height: '200px' }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundColor: '#1a1a1a',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
        />
        {/* Source + date + link */}
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-sm text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          <div>
            <span className="font-semibold">{source}</span>
            {state && state !== 'Unknown' && (
              <>
                <span className="mx-1 opacity-70">•</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: 'rgba(240,229,35,0.2)',
                    color: '#f0e523',
                  }}
                >
                  📍 {state}
                </span>
              </>
            )}
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
                style={{
                  backgroundColor: '#f0e523',
                  color: '#000000',
                }}
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
            style={{
              backgroundColor: 'rgba(240,229,35,0.15)',
              color: '#f0e523',
              border: '1px solid rgba(240,229,35,0.3)',
            }}
          >
            Source ↗
          </a>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-3">
        {/* Portrait + title row */}
        <div className="flex items-start gap-3">
          {portraitUrl && portraitVisible && (
            <img
              src={portraitUrl}
              alt={`Portrait from ${source}`}
              width={60}
              height={60}
              onError={() => setPortraitVisible(false)}
              style={{
                borderRadius: '50%',
                border: '3px solid #f0e523',
                objectFit: 'cover',
                flexShrink: 0,
                width: '60px',
                height: '60px',
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <h2 className="text-xl font-bold text-white leading-snug">
              {renderBoldMarkdown(emojiTitle)}
            </h2>
            {emojiTitleVi && (
              <p className="text-sm mt-1 leading-snug" style={{ color: '#9ca3af' }}>
                ({renderBoldMarkdown(emojiTitleVi)})
              </p>
            )}
          </div>
        </div>

        {/* Original article title (smaller, for reference) */}
        <p className="text-xs opacity-50 text-gray-400 truncate" title={title}>
          Original: {title}
        </p>

        {/* Collapsible sections */}
        <CollapsibleSection label="Facebook Draft" text={facebookText} defaultOpen={true} />
        <CollapsibleSection label="Comment Bait" text={commentBait} />
        <CollapsibleSection label="NB2 Image Prompt" text={nb2Prompt} />

        {/* Done toggle button */}
        {onToggleDone && (
          <button
            onClick={onToggleDone}
            className="w-full mt-2 py-2 rounded-lg text-sm font-semibold transition-colors duration-150"
            style={{
              backgroundColor: isDone ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
              color: isDone ? '#22c55e' : '#94a3b8',
              border: `1px solid ${isDone ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
              cursor: 'pointer',
            }}
          >
            {isDone ? '✅ Done' : '☐ Mark Done'}
          </button>
        )}
      </div>
    </div>
  );
}
