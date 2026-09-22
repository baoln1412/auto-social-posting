/**
 * Every source answers the same question — "give me items with their comment pool" — so the
 * fetch step, the wizard's fetch test and the New page's picker all talk to one interface.
 */
import type { SourceItem } from '../steps/types';
import { DEMO_ITEM } from '../demo/steps';
import { getGoldItem, listGold } from './gold';
import { listArticle } from './article';
import { listReddit } from './reddit';
import { listThreads, threadsToken } from './threads';
import { textToItem } from './text';

export type SourceKind = 'gold' | 'article' | 'text' | 'reddit' | 'threads' | 'demo';

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

export const SOURCES: Record<SourceKind, SourceDef> = {
  gold: {
    kind: 'gold',
    label: 'Kho bài của kênh',
    hint: 'Bài đã sinh trong lake, theo thị trường.',
    needs: 'market',
    blocked: () => null,
    list: (cfg, limit) => listGold(need(cfg.marketId, 'Chưa chọn thị trường.'), limit),
    get: (ref, cfg) => getGoldItem(ref, need(cfg.marketId, 'Chưa chọn thị trường.')),
  },
  article: {
    kind: 'article',
    label: 'Bài báo',
    hint: 'Dán đường dẫn một bài viết.',
    needs: 'url',
    blocked: () => null,
    list: (cfg) => listArticle(need(cfg.url, 'Chưa có đường dẫn.')),
  },
  reddit: {
    kind: 'reddit',
    label: 'Reddit',
    hint: 'Đường dẫn một bài Reddit công khai — bình luận có điểm.',
    needs: 'url',
    blocked: () => null,
    list: (cfg) => listReddit(need(cfg.url, 'Chưa có đường dẫn.')),
  },
  text: {
    kind: 'text',
    label: 'Tự viết',
    hint: 'Dán nội dung của bạn, kể cả bài Threads/Facebook chép tay.',
    needs: 'text',
    blocked: () => null,
    list: async (cfg) => [textToItem(need(cfg.text, 'Chưa có nội dung.'))],
  },
  threads: {
    kind: 'threads',
    label: 'Threads (tài khoản của bạn)',
    hint: 'Bài của chính bạn qua Threads API; trả lời kèm lượt thích.',
    needs: 'none',
    blocked: () => (threadsToken() ? null : 'Cần THREADS_ACCESS_TOKEN trong môi trường.'),
    list: (_cfg, limit) => listThreads(limit),
  },
  demo: {
    kind: 'demo',
    label: 'Dữ liệu mẫu',
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
