'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { PostDraft } from '../types';

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
 * even while the drawer is closed.
 */
export function useVideoGen(post: PostDraft, channelName?: string) {
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [approved, setApproved] = useState(false);
  const [media, setMedia] = useState<VgMedia[]>([]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<VgJobStatus>('idle');
  const [jobFile, setJobFile] = useState<string | null>(null);
  const [jobError, setJobError] = useState('');
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
        body: JSON.stringify({ emojiTitle: post.emojiTitle || post.article.title, narration: script, media: media_ }),
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
  }, [media, post.article.imageUrl, post.article.imageUrls, post.emojiTitle, post.article.title, script]);

  // Poll job status while running — independent of whether the drawer is open.
  useEffect(() => {
    if (!jobId || jobStatus !== 'running') return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/render?jobId=${jobId}`);
        const data = await res.json();
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
    }, 4000);
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
    jobStatus, jobFile, jobError,
  };
}

export type VideoGenState = ReturnType<typeof useVideoGen>;
