'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { PostDraft } from '../types';
import { CaptionStyle } from '../lib/captionPresets';

export interface VgMedia {
  id: string;
  url: string; // server URL once uploaded — both images and video clips render
  name: string;
  kind: 'image' | 'video';
  uploading?: boolean;
}

export type VgJobStatus = 'idle' | 'running' | 'done' | 'error';

let mediaSeq = 0;

/**
 * Owns all Video Generation state for one post — script, media, render job.
 * Instantiated once per PostCard (not per drawer-open), so closing/reopening the
 * drawer never loses progress, and a render job keeps polling in the background
 * even while the drawer is closed. `drawerOpen` gates the preview effect only —
 * without it, every already-rendered post on the page would spawn a preview
 * process the moment it loads, since script seeds from post.narration.
 */
export function useVideoGen(post: PostDraft, channelName?: string, drawerOpen = false) {
  // A previously finished render is persisted on the post (videoUrl/narration —
  // see lake.ts::setGoldVideo), so a page refresh should show it as already done
  // instead of resetting to a blank script and losing track of the rendered file.
  const [script, setScript] = useState(post.narration ?? '');
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(Boolean(post.narration));
  const [media, setMedia] = useState<VgMedia[]>([]);
  const [includeIntro, setIncludeIntro] = useState(true);
  const [includeLayout, setIncludeLayout] = useState(true);

  const [style, setStyle] = useState<CaptionStyle>(() => {
    try { return post.captionStyle ? JSON.parse(post.captionStyle) : { preset: 'classic' }; }
    catch { return { preset: 'classic' }; }
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Always holds the latest previewUrl so the unmount-only cleanup effect below
  // doesn't close over a stale (null) value from its first render.
  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<VgJobStatus>(post.videoUrl ? 'done' : 'idle');
  const [jobFile, setJobFile] = useState<string | null>(post.videoUrl ?? null);
  const [jobError, setJobError] = useState('');
  const [jobStep, setJobStep] = useState<string | null>(null);
  const [jobPct, setJobPct] = useState<number | null>(null);
  const [jobDone, setJobDone] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const draftText = [post.emojiTitle?.trim(), post.facebookText?.trim()].filter(Boolean).join('\n\n');

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/video-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: post.article.title, draft: draftText, channelName: channelName ?? '' }),
      });
      const data = await res.json();
      if (data.success) {
        setScript(data.script);
        setApproved(false);
      } else {
        alert(`Lỗi tạo script: ${data.error}`);
      }
    } catch (err) {
      alert(`Lỗi mạng: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [post.article.title, draftText, channelName]);

  // Both images and video clips upload to the server so the renderer can use them.
  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const kind: 'image' | 'video' = f.type.startsWith('video/') ? 'video' : 'image';
      const id = `m${mediaSeq++}`;
      setMedia((prev) => [...prev, { id, url: '', name: f.name, kind, uploading: true }]);
      try {
        const fd = new FormData();
        fd.set('file', f);
        const res = await fetch('/api/image/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok && data.url) {
          setMedia((prev) => prev.map((m) => (m.id === id ? { ...m, url: window.location.origin + data.url, uploading: false } : m)));
        } else {
          setMedia((prev) => prev.filter((m) => m.id !== id));
          alert(data.error ?? 'Upload lỗi');
        }
      } catch (err) {
        setMedia((prev) => prev.filter((m) => m.id !== id));
        alert(`Lỗi mạng khi upload: ${err}`);
      }
    }
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const moveMedia = useCallback((idx: number, dir: -1 | 1) => {
    setMedia((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }, []);

  // Preview deliberately runs BEFORE any TTS, so it cannot use prepared media. Plate
  // precedence: media the user just uploaded -> the post's own article image -> none.
  const plate = media.find((m) => m.kind === 'image' && m.url)?.url
    ?? post.article.imageUrl ?? null;

  useEffect(() => {
    // Gated on drawerOpen: this hook is instantiated once per PostCard (see the
    // header comment), and script seeds from post.narration — without the gate, a
    // page showing 20 already-rendered posts spawns 20 preview processes on load.
    if (!drawerOpen || !script.trim()) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/video/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: script.trim().split(/\s+/).slice(0, 12).join(' '), style, plate }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
      } catch { /* preview is advisory; failing it must never block a render */ }
    }, 250);
    return () => clearTimeout(t);
  }, [drawerOpen, script, style, plate]);

  // Unmount-only: the effect above already revokes the URL it replaces, but a card
  // that unmounts mid-session (e.g. filtered out of a long list) still holds the
  // last one — this hook lives on every card, so that would leak per card.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const saveStyle = useCallback(async () => {
    try {
      const res = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, fields: { caption_style: JSON.stringify(style) } }),
      });
      if (!res.ok) alert('Không lưu được kiểu phụ đề');
    } catch (err) {
      alert(`Lỗi mạng: ${err}`);
    }
  }, [post.id, style]);

  const render = useCallback(async () => {
    setJobStatus('running');
    setJobError('');
    setJobFile(null);
    const uploaded = media.filter((m) => m.url && !m.uploading).map((m) => ({ url: m.url, kind: m.kind }));
    // Fall back to whatever image the post itself is actually showing — article's
    // own photo first, imageUrls[0] as a defensive backup in case imageUrl is
    // ever empty while imageUrls isn't.
    const fallbackImg = post.article.imageUrl || post.article.imageUrls?.[0];
    const media_ = uploaded.length ? uploaded : (fallbackImg ? [{ url: fallbackImg, kind: 'image' as const }] : []);
    try {
      const res = await fetch('/api/video/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emojiTitle: post.emojiTitle || post.article.title, narration: script, media: media_, includeIntro, includeLayout, style, postId: post.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.jobId) {
        setJobStatus('error');
        setJobError(data.error ?? 'Không khởi động được render');
        return;
      }
      setJobId(data.jobId);
    } catch (err) {
      setJobStatus('error');
      setJobError(String(err));
    }
  }, [media, post.id, post.article.imageUrl, post.article.imageUrls, post.emojiTitle, post.article.title, script, includeIntro, includeLayout, style]);

  // Poll job status while running — independent of whether the drawer is open.
  useEffect(() => {
    if (!jobId || jobStatus !== 'running') return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/render?jobId=${jobId}`);
        const data = await res.json();
        setJobStep(data.step ?? null);
        setJobPct(typeof data.pct === 'number' ? data.pct : null);
        setJobDone(Array.isArray(data.done) ? data.done : []);
        if (data.status === 'done') {
          setJobStatus('done');
          setJobFile(data.file);
        } else if (data.status === 'error') {
          setJobStatus('error');
          setJobError(data.error ?? 'Render thất bại');
        }
      } catch {
        // transient network hiccup — next tick retries
      }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, jobStatus]);

  const resetJob = useCallback(() => {
    setJobStatus('idle');
    setJobId(null);
    setJobFile(null);
    setJobError('');
  }, []);

  return {
    script, setScript, loading, approved, setApproved, media,
    addFiles, removeMedia, moveMedia, generate, render, resetJob,
    jobStatus, jobFile, jobError, jobStep, jobPct, jobDone, includeIntro, setIncludeIntro, includeLayout, setIncludeLayout,
    style, setStyle, previewUrl, saveStyle,
  };
}

export type VideoGenState = ReturnType<typeof useVideoGen>;
