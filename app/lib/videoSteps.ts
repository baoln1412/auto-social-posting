/**
 * Render stage labels/order, shared by the server job tracker (videoJobs.ts,
 * which pulls in child_process/fs/duckdb) and the client drawer (VideoGenModal.tsx,
 * 'use client'). Kept import-free so neither side drags server-only modules
 * into the client bundle.
 */
export const STEP_LABELS: Record<string, string> = {
  tts: 'Giọng đọc',
  align: 'Căn chữ',
  media: 'Tải ảnh/video',
  captions: 'Dựng phụ đề',
  compose: 'Ghép video',
  intro: 'Chèn intro',
};
export const STEP_ORDER = ['tts', 'align', 'media', 'captions', 'compose', 'intro'];
