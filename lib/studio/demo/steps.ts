/**
 * The demo channel's engines. Every one returns a fixture and costs $0, so the whole flow —
 * preview, gate, cost, Continue, a rendered card and a playable reel — can be walked by
 * someone who is not allowed to spend.
 *
 * These are also the reference implementation of the step contract: slice 3's real engines
 * replace the bodies, not the shapes.
 */
import type { GateResult, RunCtx, SourceItem, Step, StepName } from '../steps/types';
import { join } from 'node:path';
import { scenesFor } from '../scenes';
import { frameUrl } from '../frame-url';
import { captionStyle } from '../kits/load';

export const DEMO_CARD_URL = '/studio-demo/card.png';
export const DEMO_CARD_PATH = join(process.cwd(), 'public', 'studio-demo', 'card.png');
export const DEMO_MP4_URL = '/studio-demo/demo.mp4';

const FREE = { usd: 0, note: 'dữ liệu mẫu — không tốn phí' };

export const DEMO_ITEM: SourceItem = {
  id: 'demo:1',
  title: 'ÚC SIẾT VISA DU HỌC TỪ THÁNG 7: ĐIỂM TIẾNG ANH TĂNG, CHỨNG MINH TÀI CHÍNH CAO HƠN',
  url: 'https://example.com/demo-visa-rule',
  source: 'Bản tin mẫu',
  text:
    'Từ tháng 7, Úc nâng yêu cầu tiếng Anh với visa du học lên IELTS 6.0. ' +
    'Mức chứng minh tài chính cũng tăng thêm khoảng 21%, lên 29.710 đô la Úc. ' +
    'Bộ Nội vụ nói thay đổi nhằm siết dòng hồ sơ không thực chất. ' +
    'Hồ sơ nộp trước ngày hiệu lực vẫn xét theo quy định cũ.',
  comments: [
    { id: 'c1', text: 'Nhà mình vừa nộp tuần trước, vậy là kịp rồi.', score: 412, depth: 0 },
    { id: 'c2', text: 'IELTS 6.0 giờ thành sàn, không còn đường vòng nữa.', score: 388, depth: 0 },
    { id: 'c3', text: 'Đúng, trung tâm nào hứa bao đậu là nên tránh.', score: 96, depth: 1 },
    { id: 'c4', text: '29.710 đô một năm, chưa tính học phí. Căng thật.', score: 201, depth: 0 },
    { id: 'c5', text: 'Ai đã có COE rồi thì không ảnh hưởng nhé mọi người.', score: 57, depth: 0 },
  ],
};

/** Demo-only: the override drawer can force a step to throw, so a failed run can be seen. */
function boomIfAsked(name: StepName, ctx: RunCtx): void {
  if (ctx.overrides.demo?.boom === name) {
    throw new Error(`boom: bước "${name}" được ép lỗi để thử luồng hỏng`);
  }
}

const fetchStep: Step<string, SourceItem> = {
  name: 'fetch',
  async preview(_input, ctx) {
    // Demo-only: `cost` makes this step priced, so the spend guard has something to refuse.
    const usd = ctx.overrides.demo?.cost ?? 0;
    return {
      kind: 'items',
      data: [DEMO_ITEM],
      cost: usd ? { usd, note: 'mẫu — giá giả lập' } : FREE,
    };
  },
  async run(_input, ctx) {
    boomIfAsked('fetch', ctx);
    return DEMO_ITEM;
  },
};

export interface Draft {
  title: string;
  text: string;
  hashtags: string[];
  sourceUrl?: string;
}

const draftStep: Step<SourceItem, Draft> = {
  name: 'draft',
  from: 'fetch',
  async preview(item, _ctx) {
    return { kind: 'text', data: { text: item.text, title: item.title }, cost: FREE };
  },
  async run(item, ctx) {
    boomIfAsked('draft', ctx);
    return {
      title: item.title,
      text: item.text,
      hashtags: ['#dinhcuuc', '#duhocuc', '#visa'],
      sourceUrl: item.url,
    };
  },
  async gate(draft, ctx): Promise<GateResult> {
    // The shape of slice 3's real compliance gate: cite a source, read as a report, carry no
    // contact details. Three rules, so `checked` is 3 and never 0.
    const findings: string[] = [];
    if (ctx.overrides.demo?.gateFail) findings.push('Mẫu: ép chặn để thử cổng kiểm duyệt.');
    if (!draft.sourceUrl) findings.push('Bài chưa dẫn nguồn.');
    if (/\b(zalo|whatsapp|liên hệ ngay)\b/i.test(draft.text)) {
      findings.push('Bài có thông tin liên hệ — Meta đọc là lời mời dịch vụ.');
    }
    return { checked: 3, findings };
  },
};

export interface CardAsset {
  url: string;
  kind: 'png';
}

export interface ReelAsset {
  url: string;
  path: string;
  kind: 'mp4';
  durationSec: number;
}

const reelStep: Step<Draft, ReelAsset> = {
  name: 'reel',
  from: 'draft',
  async preview(draft, ctx) {
    const item = (ctx.outputs.fetch as SourceItem | undefined) ?? DEMO_ITEM;
    const scenes = scenesFor(draft.text, item.comments, ctx.selection);
    const i = Math.max(0, Math.min(Number(ctx.overrides.sceneIndex ?? 0) || 0, scenes.length - 1));
    return {
      kind: 'scenes',
      data: {
        scenes,
        sceneIndex: i,
        // Composed, not a fixed picture: the demo tier is what a stranger judges Studio on,
        // and a still PNG where the real thing redraws would be showing them something else.
        // Drawing a frame is local and free, so the "spends nothing" promise is kept.
        firstFrameUrl: frameUrl({
          text: scenes[i]?.text ?? draft.title,
          style: captionStyle(ctx.kit),
          plate: DEMO_CARD_PATH,
        }),
      },
      cost: FREE,
    };
  },
  async run(_draft, ctx) {
    boomIfAsked('reel', ctx);
    return {
      url: DEMO_MP4_URL,
      path: join(process.cwd(), 'public', 'studio-demo', 'demo.mp4'),
      kind: 'mp4' as const,
      durationSec: 6,
    };
  },
};

/** The demo tier publishes to the library and nowhere else — it is not allowed to deliver. */
const publishStep: Step<Draft, { library: boolean; telegram: string; at: string }> = {
  name: 'publish',
  from: 'draft',
  async preview(draft, _ctx) {
    return {
      kind: 'text',
      data: {
        title: draft?.title ?? '',
        text: draft?.text ?? '',
        assets: [{ kind: 'mp4', url: DEMO_MP4_URL }],
        destinations: [
          { id: 'library', label: 'Thư viện', blocked: null },
          { id: 'telegram', label: 'Telegram', blocked: 'Chế độ xem thử không gửi đi đâu cả.' },
        ],
      },
      cost: FREE,
    };
  },
  async run(_draft, ctx) {
    boomIfAsked('publish', ctx);
    return { library: true, telegram: 'off', at: new Date().toISOString() };
  },
};

/**
 * The demo channel's engines — every one a fixture, except `image`.
 *
 * The real image step is already free (Satori, local, `dựng tại chỗ`, $0), and a stub that
 * returned one fixed PNG made every control on the Ảnh screen decorative: the ratio moved
 * and the picture did not. A demo that cannot show what a control does is not a demo of it.
 */
export const DEMO_STEPS: Partial<Record<StepName, Step>> = {
  fetch: fetchStep,
  draft: draftStep,
  reel: reelStep,
  publish: publishStep,
};
