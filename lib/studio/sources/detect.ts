/**
 * What the paste box means.
 *
 * v1 stored the box raw as `item_ref` and only ever looked at it when the channel's own
 * source declared `needs: 'url'`. On a gold channel a pasted link was therefore dropped and
 * the first listed gold row was used instead — silently, which is complaint A. Here the link
 * decides the source, on every channel, and a box with no link is the owner's own text.
 *
 * Pure: no fetch, no db. The decision is what has to be testable.
 */
import type { SourceConfig, SourceKind } from './index';

export interface Detected {
  kind: SourceKind;
  cfg: SourceConfig;
}

/**
 * One definition of every source's name, here rather than in the registry because this
 * module is import-free and the New page — a client component — has to show the owner what
 * their paste was read as before they press the button.
 */
export const SOURCE_LABELS: Record<SourceKind, string> = {
  gold: 'Kho bài của kênh',
  article: 'Bài báo',
  text: 'Tự viết',
  reddit: 'Reddit',
  threads: 'Threads',
  facebook: 'Facebook',
  instagram: 'Instagram',
  demo: 'Dữ liệu mẫu',
};

/** Refs a run already stores. `url:` and `reddit:` are prefixes over a link, not kinds. */
const SCHEMES: Record<string, SourceKind> = {
  gold: 'gold',
  demo: 'demo',
  text: 'text',
  threads: 'threads',
};

/** Matched against the host with a leading `www.` already stripped. */
const HOSTS: [RegExp, SourceKind][] = [
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)redd\.it$/, 'reddit'],
  [/(^|\.)facebook\.com$/, 'facebook'],
  [/(^|\.)fb\.(com|watch|me)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
];

function asUrl(s: string): URL | null {
  // A box with a space in it is prose, however many dots it has.
  if (!s || /\s/.test(s)) return null;
  const full = /^https?:\/\//i.test(s)
    ? s
    : // A bare domain is how a link is pasted half the time; treating it as narration
      // would put "reddit.com/r/x" in the owner's voice-over.
      /^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(s)
      ? `https://${s}`
      : null;
  if (!full) return null;
  try {
    const u = new URL(full);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function hostKind(hostname: string): SourceKind {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  for (const [re, kind] of HOSTS) if (re.test(h)) return kind;
  return 'article';
}

/** Null means the box was empty — the channel's own source decides then, and only then. */
export function detectSource(raw: string | null | undefined): Detected | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  const scheme = /^([a-z]+):/.exec(s)?.[1];
  if (scheme && scheme in SCHEMES) return { kind: SCHEMES[scheme], cfg: {} };

  const url = asUrl(s.replace(/^(url|reddit):/, '').trim());
  if (url) return { kind: hostKind(url.hostname), cfg: { url: url.href } };
  if (scheme === 'reddit') return { kind: 'reddit', cfg: {} };

  return { kind: 'text', cfg: { text: s } };
}
