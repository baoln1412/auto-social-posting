/**
 * What fills the middle of the frame once the inset has gone: the attributed quote and the
 * causal chain, plus the scheduler that stops them and the number card sharing a second.
 *
 * Pure, like numbers.test.ts — the grammar is the whole risk, and a render proves nothing
 * about whether "nên" was mistaken for a connective.
 */
import { describe, expect, it } from 'vitest';
import { fillWindows, middleFills, pickFlow, pickQuote } from '@/lib/studio/steps/middle';

describe('the pull-quote is attributed speech', () => {
  it('lifts the quoted words and who said them', () => {
    const got = pickQuote([
      'Bộ trưởng Nội vụ cho biết: "Chính sách này sẽ thay đổi cách người nhập cư xin visa."',
    ]);
    expect(got?.quote.text).toBe('Chính sách này sẽ thay đổi cách người nhập cư xin visa.');
    expect(got?.quote.who).toBe('Bộ trưởng Nội vụ');
  });

  it('reads the attribution when it trails the quote', () => {
    const got = pickQuote(['"Chúng tôi không còn lựa chọn nào khác", đại diện hiệp hội nói.']);
    expect(got?.quote.text).toBe('Chúng tôi không còn lựa chọn nào khác');
    expect(got?.quote.who).toBe('đại diện hiệp hội');
  });

  it('refuses a scare quote — nobody said it', () => {
    expect(pickQuote(['Họ gọi đó là "giải pháp" cho vấn đề lao động.'])).toBeNull();
  });

  it('refuses a quote too long to set as type', () => {
    const long = 'a'.repeat(200);
    expect(pickQuote([`Ông Nam nói: "${long}"`])).toBeNull();
  });

  it('keeps the diacritics, which is the only thing that makes it Vietnamese', () => {
    const got = pickQuote(['Bà Nguyễn khẳng định: "Người lao động sẽ được bảo vệ đầy đủ."']);
    expect(got?.quote.text).toContain('Người lao động sẽ được bảo vệ');
    expect(got?.quote.who).toBe('Bà Nguyễn');
  });

  it('skips the scenes it is told to skip', () => {
    const texts = ['Ông Nam nói: "Giá sẽ còn tăng trong nhiều tháng tới."', 'Không có gì ở đây.'];
    expect(pickQuote(texts)?.index).toBe(0);
    expect(pickQuote(texts, new Set([0]))).toBeNull();
  });
});

describe('the flow diagram is a causal chain, not a summary', () => {
  it('splits one sentence on its connective into two boxes', () => {
    const got = pickFlow(['Thuế quan mới khiến giá cà phê tăng vọt.']);
    expect(got?.steps).toEqual(['Thuế quan mới', 'giá cà phê tăng vọt']);
  });

  it('takes three boxes when the sentence chains twice', () => {
    const got = pickFlow(['Hạn hán dẫn đến mất mùa, khiến giá cà phê tăng.']);
    expect(got?.steps).toEqual(['Hạn hán', 'mất mùa', 'giá cà phê tăng']);
  });

  it('refuses a sentence with no causal connective', () => {
    expect(pickFlow(['Giá cà phê hôm nay đạt mức cao nhất trong ba năm.'])).toBeNull();
  });

  it('never splits on "nên", which is usually "should"', () => {
    expect(pickFlow(['Bạn nên kiểm tra lại hồ sơ trước khi gửi.'])).toBeNull();
  });

  it('refuses a clause too long to be a box', () => {
    expect(
      pickFlow([
        'Việc chính phủ liên bang siết chặt toàn bộ quy trình xét duyệt thị thực lao động khiến hàng nghìn doanh nghiệp vừa và nhỏ trên khắp cả nước phải thay đổi kế hoạch tuyển dụng.',
      ]),
    ).toBeNull();
  });

  it('prefers the three-box chain over the two-box one', () => {
    const got = pickFlow(['Thuế quan khiến giá tăng.', 'Hạn hán dẫn đến mất mùa, khiến giá tăng.']);
    expect(got?.index).toBe(1);
    expect(got?.steps).toHaveLength(3);
  });
});

describe('one tenant at a time', () => {
  const script = [
    'Giá cà phê robusta đạt 6,92 đô la một pound.',
    'Ông Nam nói: "Giá sẽ còn tăng trong nhiều tháng tới."',
    'Hạn hán dẫn đến mất mùa, khiến giá cà phê tăng.',
  ];

  it('gives each of the three its own scene', () => {
    const fills = middleFills(script);
    expect(fills.map((f) => f.kind)).toEqual(['number', 'quote', 'flow']);
    expect(new Set(fills.map((f) => f.index)).size).toBe(fills.length);
  });

  it('never lets two of them be on screen at once', () => {
    const windows = fillWindows(middleFills(script), [40, 50, 45], 40);
    expect(windows.length).toBeGreaterThan(1);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].from).toBeGreaterThanOrEqual(windows[i - 1].until);
    }
  });

  it('never opens one before the inset has left', async () => {
    const { INSET_SEC } = await import('@/lib/studio/steps/filters');
    const windows = fillWindows(middleFills(script), [40, 50, 45], 40);
    expect(windows[0].from).toBeGreaterThanOrEqual(INSET_SEC);
  });

  it('drops the ones a short reel has no room for', () => {
    const windows = fillWindows(middleFills(script), [40, 50, 45], 13);
    expect(windows.length).toBeLessThan(3);
  });

  it('finds nothing in a script that says nothing', () => {
    expect(middleFills(['Hôm nay trời mưa.'])).toEqual([]);
    expect(middleFills([])).toEqual([]);
  });
});

describe('what reaches ffmpeg', () => {
  it('centres each tenant on its own height, so a quote and a chain both sit balanced', async () => {
    const { middleAt, MIDDLE_LEFT, MIDDLE_CENTER, H } = await import('@/lib/studio/steps/filters');
    const tall = middleAt(600, 12, 18);
    const short = middleAt(200, 12, 18);
    expect(tall).toContain(`overlay=${MIDDLE_LEFT}:`);
    // The resting y, once the entrance has settled.
    const y = (f: string) => Number(f.match(/overlay=\d+:'(-?\d+)\+/)![1]);
    expect(y(tall) + 300).toBe(y(short) + 100);
    expect(y(short)).toBe(Math.round(H * MIDDLE_CENTER - 100));
  });

  it('gives the quote and the chain their own windows in the one filter_complex', async () => {
    const { buildChain, quotePng, flowPng } = await import('@/lib/studio/steps/overlay');
    const quote = (await quotePng({ text: 'Giá sẽ còn tăng trong nhiều tháng tới.', who: 'Ông Nam' }))!;
    const flow = (await flowPng(['Hạn hán', 'mất mùa', 'giá tăng']))!;
    const built = await buildChain({
      layout: 'card-top',
      durationSec: 40,
      middle: [
        { file: quote, from: 12, until: 20 },
        { file: flow, from: 20, until: 30 },
      ],
    });
    expect(built.inputs).toEqual([quote, flow]);
    const windows = [...built.filter.matchAll(/between\(t,([\d.]+),([\d.]+)\)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(windows).toEqual([
      [12, 20],
      [20, 30],
    ]);
  });

  it('keeps both cards inside the frame with their margins', async () => {
    const sharp = (await import('sharp')).default;
    const { quotePng, flowPng } = await import('@/lib/studio/steps/overlay');
    const { MIDDLE_LEFT, W } = await import('@/lib/studio/steps/filters');
    for (const png of [
      await quotePng({ text: 'Người lao động sẽ được bảo vệ đầy đủ trong giai đoạn này.', who: 'Bà Nguyễn' }),
      await flowPng(['Thuế quan mới áp lên cà phê', 'giá bán lẻ tăng vọt']),
    ]) {
      const m = await sharp(png!).metadata();
      expect(MIDDLE_LEFT + (m.width ?? 0)).toBeLessThanOrEqual(W);
    }
  });

  it('draws nothing for a chain of one — that is a label, not a diagram', async () => {
    const { flowPng, quotePng } = await import('@/lib/studio/steps/overlay');
    expect(await flowPng(['Hạn hán'])).toBeNull();
    // And nothing for a quote nobody said, which is the rule that keeps it off the caption.
    expect(await quotePng({ text: 'Giá sẽ còn tăng trong nhiều tháng tới.', who: '' })).toBeNull();
  });
});

describe('it arrives, it does not appear', () => {
  /** The ffmpeg expression grammar used here is a subset JS can evaluate directly. */
  const at = (expr: string, t: number) =>
    // eslint-disable-next-line no-new-func
    new Function('t', 'min', 'max', `return ${expr};`)(t, Math.min, Math.max) as number;

  it('rises into place and decelerates, instead of popping on', async () => {
    const { middleAt, MIDDLE_LIFT, MIDDLE_RISE, MIDDLE_CENTER, H } = await import('@/lib/studio/steps/filters');
    const f = middleAt(200, 12, 18);
    const expr = f.match(/overlay=\d+:'([^']+)'/)![1];
    const rest = Math.round(H * MIDDLE_CENTER - 100);

    expect(at(expr, 12)).toBeCloseTo(rest + MIDDLE_LIFT, 5);
    expect(at(expr, 12 + MIDDLE_RISE)).toBeCloseTo(rest, 5);
    expect(at(expr, 17)).toBeCloseTo(rest, 5);

    // Decelerating: the first half of the travel time covers more ground than the second.
    const half = at(expr, 12 + MIDDLE_RISE / 2);
    expect(rest + MIDDLE_LIFT - half).toBeGreaterThan(half - rest);
  });
});

describe('the chain builds instead of appearing', () => {
  it('emits one layer per box, on beats that get shorter', async () => {
    const { flowLayers, FLOW_BEATS } = await import('@/lib/studio/steps/overlay');
    const layers = await flowLayers(['Hạn hán', 'mất mùa', 'giá tăng']);
    expect(layers).toHaveLength(3);
    expect(layers.map((l) => l.delay)).toEqual(FLOW_BEATS);
    // Accelerating: each box waits less than the one before it did.
    const waits = layers.slice(1).map((l, i) => l.delay - layers[i].delay);
    expect(waits[1]).toBeLessThan(waits[0]);
    // Distinct pictures, one position: they stack by sharing a canvas, not by moving.
    expect(new Set(layers.map((l) => l.file)).size).toBe(3);
  });

  it('gives every layer the same canvas, so one geometry places them all', async () => {
    const sharp = (await import('sharp')).default;
    const { flowLayers, flowPng } = await import('@/lib/studio/steps/overlay');
    const steps = ['Hạn hán ở Brazil', 'mất mùa cà phê', 'giá robusta tăng vọt'];
    const whole = await sharp((await flowPng(steps))!).metadata();
    for (const l of await flowLayers(steps)) {
      const m = await sharp(l.file).metadata();
      expect([m.width, m.height]).toEqual([whole.width, whole.height]);
    }
  });

  it('drops a box the window has no room for rather than cramming it in', async () => {
    const { flowBeats, flowLayers } = await import('@/lib/studio/steps/overlay');
    // A box must finish arriving inside the window or it is a flicker, not a box.
    expect(flowBeats(3)).toHaveLength(3);
    expect(flowBeats(0.6)).toEqual([0]);
    expect(flowBeats(0.2)).toEqual([]);
    expect(await flowLayers(['Hạn hán', 'mất mùa', 'giá tăng'], 0.6)).toHaveLength(1);
  });
});

describe('the still shows one of them, and says which', () => {
  const script = [
    'Giá cà phê robusta đạt 6,92 đô la một pound.',
    'Ông Nam nói: "Giá sẽ còn tăng trong nhiều tháng tới."',
    'Hạn hán dẫn đến mất mùa, khiến giá cà phê tăng.',
  ];

  it('counts round, so the screen never has to be told how many there are', async () => {
    const { fillSpec } = await import('@/lib/studio/steps/reel');
    const fills = middleFills(script);
    expect(fills).toHaveLength(3);
    expect(fillSpec(fills, 0).num).toBe('6,92');
    expect(fillSpec(fills, 1).quote).toContain('Giá sẽ còn tăng');
    expect(fillSpec(fills, 2).flow).toHaveLength(3);
    // Wraps rather than running off the end: the screen counts up and never asks.
    expect(fillSpec(fills, 3)).toEqual(fillSpec(fills, 0));
    expect(fillSpec(fills, undefined)).toEqual(fillSpec(fills, 0));
  });

  it('is empty when the script supplied nothing, so the still draws no band', async () => {
    const { fillSpec } = await import('@/lib/studio/steps/reel');
    expect(fillSpec([], 2)).toEqual({});
  });

  it('shows one tenant for a script that only has a figure', () => {
    // The demo pack's own narration. Cycling a single tenant has to be a no-op in the UI,
    // or the chip moves and the picture does not.
    const demo = [
      'Từ tháng 7, Úc nâng yêu cầu tiếng Anh với visa du học lên IELTS 6.0.',
      'Mức chứng minh tài chính cũng tăng thêm khoảng 21%, lên 29.710 đô la Úc.',
      'Bộ Nội vụ nói thay đổi nhằm siết dòng hồ sơ không thực chất.',
      'Hồ sơ nộp trước ngày hiệu lực vẫn xét theo quy định cũ.',
    ];
    const fills = middleFills(demo);
    expect(fills.map((f) => f.kind)).toEqual(['number']);
    expect(fills[0].number?.value).toBe('29.710');
  });
});
