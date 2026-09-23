/**
 * Every source answers the same question — "give me items with their comment pool" — so the
 * fetch step, the wizard's fetch test and the New page's picker all talk to one interface.
 */
import type { SourceItem } from '../steps/types';
import { SOURCE_LABELS } from './detect';
import { DEMO_ITEM } from '../demo/steps';
import { getGoldItem, listGold } from './gold';
import { listArticle } from './article';
import { listReddit } from './reddit';
import { listThreads, threadsToken } from './threads';
import { textToItem } from './text';

export type SourceKind =
  | 'gold'
  | 'article'
  | 'text'
  | 'reddit'
  | 'threads'
  | 'facebook'
  | 'instagram'
  | 'demo';

export interface SourceConfig {
  marketId?: string;
  url?: string;
  text?: string;
}

export interface SourceDef {
  kind: SourceKind;
  label: string;
  hint: string;
  /** What the wizard must collect before the fetch test can run. */
  needs: 'market' | 'url' | 'text' | 'none';
  /** Why this source cannot be used right now, or null. Listed either way, never hidden. */
  blocked(): string | null;
  list(cfg: SourceConfig, limit: number): Promise<SourceItem[]>;
  /** Resolve one item by its ref. Defaults to the first item `list` returns. */
  get?(ref: string, cfg: SourceConfig): Promise<SourceItem | null>;
}

function need(v: string | undefined, msg: string): string {
  if (!v || !v.trim()) throw new Error(msg);
  return v.trim();
}

/**
 * A source the owner can paste a link to but Studio cannot read yet. Listed, never hidden —
 * a link that quietly became "the first gold row" is the bug this whole slice is about, and
 * a source that quietly vanished from the list would be the same mistake one level up.
 */
function notWired(kind: SourceKind, why: string): SourceDef {
  return {
    kind,
    label: SOURCE_LABELS[kind],
    hint: why,
    needs: 'url',
    blocked: () => why,
    list: async () => {
      throw new Error(why);
    },
  };
}

const GRAPH = 'Chưa nối. Thêm FACEBOOK_GRAPH_TOKEN rồi thiết lập ở Nguồn tự động.';

export const SOURCES: Record<SourceKind, SourceDef> = {
  gold: {
    kind: 'gold',
    label: SOURCE_LABELS.gold,
    hint: 'Bài đã sinh trong lake, theo thị trường.',
    needs: 'market',
    blocked: () => null,
    list: (cfg, limit) => listGold(need(cfg.marketId, 'Chưa chọn thị trường.'), limit),
    get: (ref, cfg) => getGoldItem(ref, need(cfg.marketId, 'Chưa chọn thị trường.')),
  },
  article: {
    kind: 'article',
    label: SOURCE_LABELS.article,
    hint: 'Dán đường dẫn một bài viết.',
    needs: 'url',
    blocked: () => null,
    list: (cfg) => listArticle(need(cfg.url, 'Chưa có đường dẫn.')),
  },
  reddit: {
    kind: 'reddit',
    label: SOURCE_LABELS.reddit,
    hint: 'Đường dẫn một bài Reddit công khai — bình luận có điểm.',
    needs: 'url',
    blocked: () => null,
    list: (cfg) => listReddit(need(cfg.url, 'Chưa có đường dẫn.')),
  },
  text: {
    kind: 'text',
    label: SOURCE_LABELS.text,
    hint: 'Dán nội dung của bạn, kể cả bài Threads/Facebook chép tay.',
    needs: 'text',
    blocked: () => null,
    list: async (cfg) => [textToItem(need(cfg.text, 'Chưa có nội dung.'))],
  },
  threads: {
    kind: 'threads',
    label: SOURCE_LABELS.threads,
    hint: 'Bài của chính bạn qua Threads API; trả lời kèm lượt thích.',
    needs: 'none',
    blocked: () => (threadsToken() ? null : 'Cần THREADS_ACCESS_TOKEN trong môi trường.'),
    // A pasted threads.net link lands here, and the API cannot read somebody else's post.
    // Returning the owner's own latest post instead would be complaint A again.
    list: (cfg, limit) =>
      cfg.url
        ? Promise.reject(
            new Error(
              'API chỉ lấy được bài của chính bạn. Dán nội dung bài vào ô thay cho đường dẫn.',
            ),
          )
        : listThreads(limit),
  },
  facebook: notWired('facebook', GRAPH),
  instagram: notWired('instagram', GRAPH),
  demo: {
    kind: 'demo',
    label: SOURCE_LABELS.demo,
    hint: 'Một bài mẫu với năm bình luận — không tốn phí.',
    needs: 'none',
    blocked: () => null,
    list: async () => [DEMO_ITEM],
  },
};

/** The source a channel was built on. */
export function channelSource(sourcesJson: string): { def: SourceDef; cfg: SourceConfig } {
  let parsed: { type?: SourceKind }[] = [];
  try {
    parsed = JSON.parse(sourcesJson || '[]');
  } catch {
    /* fall through to demo */
  }
  const first = parsed[0] ?? { type: 'demo' as const };
  const def = SOURCES[(first.type ?? 'demo') as SourceKind] ?? SOURCES.demo;
  return { def, cfg: first as SourceConfig };
}

export async function resolveItem(
  def: SourceDef,
  cfg: SourceConfig,
  ref: string | null,
): Promise<SourceItem> {
  if (ref && def.get) {
    const found = await def.get(ref, cfg);
    if (found) return found;
  }
  const items = await def.list(cfg, 10);
  const match = ref ? items.find((i) => i.id === ref) : undefined;
  if (match) return match;
  if (!items[0]) throw new Error('Nguồn không trả về bài nào.');
  return items[0];
}
