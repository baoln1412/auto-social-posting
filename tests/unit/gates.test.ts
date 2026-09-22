import { describe, it, expect } from 'vitest';
import { checkCompliance, isSensitive } from '@/lib/studio/gates/compliance';
import { contrastRatio, layoutFindings } from '@/lib/studio/gates/layout';
import { DURATION_BANDS, budgetFindings, cuesFor } from '@/lib/studio/gates/budget';
import { parseDraftJson } from '@/lib/studio/gold';

const clean = {
  title: 'MỸ SIẾT VISA DU HỌC',
  text: 'Bộ Ngoại giao Mỹ công bố quy định mới. Hồ sơ nộp trước ngày hiệu lực vẫn xét theo quy định cũ.',
  hashtags: ['#visa'],
  sourceUrl: 'https://reuters.com/a',
};

describe('isSensitive()', () => {
  it('flags trafficking, smuggling, drugs and weapons', () => {
    expect(isSensitive('đường dây buôn người sang Anh')).toBe(true);
    expect(isSensitive('vượt biên trái phép')).toBe(true);
    expect(isSensitive('bắt giữ lô ma túy')).toBe(true);
  });

  it('leaves ordinary immigration news alone', () => {
    expect(isSensitive(clean.text)).toBe(false);
  });
});

describe('checkCompliance()', () => {
  it('runs all three rules — checked is never 0', () => {
    expect(checkCompliance(clean).checked).toBe(3);
  });

  it('passes a sourced report', () => {
    expect(checkCompliance(clean).findings).toEqual([]);
  });

  it('holds a post with no source', () => {
    const r = checkCompliance({ ...clean, sourceUrl: undefined });
    expect(r.findings.join(' ')).toMatch(/nguồn/i);
  });

  it('holds contact details on any post, sensitive or not', () => {
    expect(checkCompliance({ ...clean, text: `${clean.text} Liên hệ Zalo 0901234567.` }).findings)
      .toHaveLength(1);
  });

  it('holds a post that reads as an offer rather than a report', () => {
    const r = checkCompliance({ ...clean, text: 'Nhận làm hồ sơ, bao đậu visa du học.' });
    expect(r.findings.join(' ')).toMatch(/chào mời|hướng dẫn/i);
  });

  it('holds a price on a sensitive post', () => {
    const r = checkCompliance({
      ...clean,
      text: 'Đường dây đưa người vượt biên thu 20.000 đô mỗi suất.',
    });
    expect(r.findings.join(' ')).toMatch(/giá|lộ trình/i);
  });

  it('lets a price stand on ordinary news — a visa fee is not a smuggling price', () => {
    const r = checkCompliance({ ...clean, text: 'Lệ phí visa tăng lên 185 đô từ tháng 7.' });
    expect(r.findings).toEqual([]);
  });
});

describe('contrastRatio()', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 2);
  });

  it('clears 3:1 for the card highlight on its blue band', () => {
    expect(contrastRatio('#F8EF63', '#1D51A4')).toBeGreaterThanOrEqual(3);
  });
});

describe('layoutFindings()', () => {
  it('passes a card whose margins are clear and whose highlight has contrast', () => {
    expect(layoutFindings({ width: 1080, height: 1350, edgeInk: false }, '#F8EF63', '#1D51A4'))
      .toEqual([]);
  });

  it('holds a card whose text runs into the frame edge', () => {
    expect(layoutFindings({ width: 1080, height: 1350, edgeInk: true }, '#F8EF63', '#1D51A4'))
      .toHaveLength(1);
  });

  it('holds a highlight that cannot be read on its band', () => {
    expect(layoutFindings({ width: 1080, height: 1350, edgeInk: false }, '#8899AA', '#1D51A4'))
      .toHaveLength(1);
  });

  it('holds a card that did not come out at the size it was asked for', () => {
    expect(layoutFindings({ width: 800, height: 600, edgeInk: false }, '#F8EF63', '#1D51A4'))
      .toHaveLength(1);
  });
});

describe('cuesFor()', () => {
  it('groups the narration into cues of wordsPerCue words', () => {
    expect(cuesFor('một hai ba bốn năm sáu bảy', 5)).toEqual(['một hai ba bốn năm', 'sáu bảy']);
  });
});

describe('budgetFindings()', () => {
  const kit = { durationBand: 'short' as const, maxLines: 2, size: 72 };

  it('passes a reel inside its band with short cues', () => {
    expect(budgetFindings(25, 'một hai ba bốn năm', { ...kit, wordsPerCue: 5 })).toEqual([]);
  });

  it('holds a reel that ran past its band', () => {
    const f = budgetFindings(300, 'một hai', { ...kit, wordsPerCue: 5 });
    expect(f.join(' ')).toMatch(/dài/i);
  });

  it('holds a reel shorter than its band', () => {
    expect(budgetFindings(2, 'một hai', { ...kit, wordsPerCue: 5 })).toHaveLength(1);
  });

  it('holds a cue that cannot fit in maxLines', () => {
    const long = Array(14).fill('nhữngchữrấtdàikhôngxuốngdòngđược').join(' ');
    const f = budgetFindings(25, long, { ...kit, wordsPerCue: 14 });
    expect(f.join(' ')).toMatch(/dòng/i);
  });

  it('knows its three bands', () => {
    expect(Object.keys(DURATION_BANDS).sort()).toEqual(['long', 'medium', 'short']);
  });
});

describe('parseDraftJson()', () => {
  it('reads a plain JSON object', () => {
    expect(parseDraftJson('{"emoji_title":"T","body_text":"B"}').title).toBe('T');
  });

  it('survives the model fencing its answer in ```json', () => {
    const d = parseDraftJson('```json\n{"emoji_title":"T","body_text":"B","hashtags":"#a #b"}\n```');
    expect(d.hashtags).toEqual(['#a', '#b']);
  });

  it('collects comment_1..3 as the pool and skips the blanks', () => {
    const d = parseDraftJson('{"emoji_title":"T","body_text":"B","comment_1":"x","comment_3":"z"}');
    expect(d.comments).toEqual(['x', 'z']);
  });

  it('throws on something that is not a draft at all, rather than saving an empty post', () => {
    expect(() => parseDraftJson('xin lỗi, tôi không thể')).toThrow();
    expect(() => parseDraftJson('{"emoji_title":"T"}')).toThrow();
  });
});

describe('measureCard()', () => {
  // Synthesised, not fetched: a full-bleed photo top, a flat band below, optional ink at the
  // very bottom edge. The first version of this gate flagged every real card because the
  // photo and the gradient have variance by design.
  async function card(opts: { inkAtEdge: boolean }): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    const W = 1080;
    const H = 1350;
    const buf = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        if (y < H * 0.55) {
          const n = (x * 7 + y * 13) % 256; // noisy "photograph"
          buf[i] = n;
          buf[i + 1] = (n * 3) % 256;
          buf[i + 2] = (n * 5) % 256;
        } else {
          const t = (y - H * 0.55) / (H * 0.45); // blue gradient band
          buf[i] = 20 + t * 9;
          buf[i + 1] = 60 + t * 21;
          buf[i + 2] = 120 + t * 44;
        }
      }
    }
    if (opts.inkAtEdge) {
      for (let y = H - 6; y < H; y++) {
        for (let x = 100; x < 900; x++) {
          const i = (y * W + x) * 3;
          buf[i] = 255;
          buf[i + 1] = 255;
          buf[i + 2] = 255;
        }
      }
    }
    return sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  }

  it('does not flag a full-bleed photo card whose title stays in its band', async () => {
    const { measureCard } = await import('@/lib/studio/gates/layout');
    const m = await measureCard(await card({ inkAtEdge: false }));
    expect(m).toEqual({ width: 1080, height: 1350, edgeInk: false });
  });

  it('flags a card whose title runs off the bottom edge', async () => {
    const { measureCard } = await import('@/lib/studio/gates/layout');
    expect((await measureCard(await card({ inkAtEdge: true }))).edgeInk).toBe(true);
  });
});
