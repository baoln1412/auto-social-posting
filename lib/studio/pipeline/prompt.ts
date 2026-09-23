/**
 * How the output shape reaches the pipeline: a delimited block inside the market's
 * `userPrompt`, on the same `content_pages` row the old Settings panel edits.
 *
 * `userPrompt` and not `systemPrompt`: the pipeline skill applies both on top of
 * CONTENT_SOP.md, but `article-processor.ts` also slices the first 500 characters of
 * `systemPrompt` as the niche hint for the relevance filter — a format fragment there would
 * quietly change which articles get classified at all.
 *
 * Delimited and not replaced: whatever the owner wrote by hand stays exactly where it was.
 * Studio owns what is between the markers and nothing else.
 */
export const START = '<!-- studio:output -->';
export const END = '<!-- /studio:output -->';

const BLOCK = new RegExp(
  `${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
);

/** What Studio last wrote, or null if this market has never been set up here. */
export function readBlock(text: string | null | undefined): string | null {
  const m = BLOCK.exec(text ?? '');
  if (!m) return null;
  return m[0].slice(START.length, m[0].length - END.length).trim();
}

/** The owner's own text, with Studio's block taken out. */
export function stripBlock(text: string | null | undefined): string {
  return (text ?? '').replace(BLOCK, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Replace Studio's block, or append one, leaving every other line alone. */
export function upsertBlock(text: string | null | undefined, body: string): string {
  const block = `${START}\n${body.trim()}\n${END}`;
  const existing = text ?? '';
  if (BLOCK.test(existing)) return existing.replace(BLOCK, block);
  const own = existing.trim();
  return own ? `${own}\n\n${block}` : block;
}
