/**
 * Narration → scenes. The post's own text first, split at sentence ends, then each selected
 * comment in the order the owner promoted it.
 *
 * Shared by the reel step's preview and its run so the scene list on the page is the same
 * list the engine gets — a preview that lies about what will render is worse than no preview.
 */
import type { Comment, Selection, SourceItem } from './steps/types';

export interface Scene {
  n: number;
  kind: 'post' | 'comment';
  /** What will be read aloud — the owner's edit if there is one. */
  text: string;
  /** What the source actually said, when an edit replaced it. */
  original?: string;
  score: number | null;
  commentId?: string;
}

/** Sentence-end split that keeps the terminator and tolerates Vietnamese ellipses. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function scenesFor(
  narration: string,
  comments: Comment[],
  selection: Selection,
): Scene[] {
  const edits = selection.edits ?? {};
  const out: Scene[] = [];
  for (const text of splitSentences(narration)) {
    out.push({ n: out.length + 1, kind: 'post', text, score: null });
  }
  const byId = new Map(comments.map((c) => [c.id, c]));
  for (const id of selection.commentIds) {
    const c = byId.get(id);
    if (!c) continue;
    out.push({
      n: out.length + 1,
      kind: 'comment',
      text: edits[id] ?? c.text,
      original: c.text,
      score: c.score,
      commentId: id,
    });
  }
  return out;
}

/**
 * The `COMMENT KHÁC` pool: every comment the source returned, best score first.
 *
 * Every one, including the promoted ones — the tick box IS the promotion, so filtering the
 * chosen out would unmount the box the moment it was ticked, and `Ẩn không chọn` would have
 * nothing left to hide.
 */
export function poolFor(item: SourceItem, _selection: Selection): Comment[] {
  return [...item.comments].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
