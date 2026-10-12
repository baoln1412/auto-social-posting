/**
 * Whether a channel is the demo one, read off its own sources.
 *
 * Its own file, and that is the whole point: it used to live in registry.ts, which imports
 * every step implementation. image.ts needs this predicate, so importing it from there put
 * image.ts inside the registry's own import cycle — and a cycle resolves by handing one
 * module an undefined binding, which surfaced as "Bước image chưa có engine cho kênh này"
 * on channels that plainly had one. A leaf module cannot do that.
 */
import type { Channel } from './types';

export function isDemoChannel(c: Channel): boolean {
  try {
    return (JSON.parse(c.sources_json || '[]') as { type?: string }[]).some(
      (s) => s.type === 'demo',
    );
  } catch {
    return false;
  }
}
