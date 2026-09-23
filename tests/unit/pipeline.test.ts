import { describe, it, expect } from 'vitest';
import { DEFAULT_ORDER, orderQueue, scoreRow } from '@/lib/studio/pipeline/order';
import { FORMATS, formatById, outputPrompt, DEFAULT_OUTPUT } from '@/lib/studio/formats';
import { readBlock, stripBlock, upsertBlock } from '@/lib/studio/pipeline/prompt';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  title: 'Mỹ siết visa H-1B',
  source_name: 'Reuters',
  category: 'immigration',
  topics: JSON.stringify(['immigration']),
  relevance_score: 0.5,
  ...over,
});

describe('the queue is ordered, never gated', () => {
  // Measured, and the reason this is a test and not a comment: every hard filter tried on
  // the match queue dropped 35–58% of sources that were actually applied. A keyword gate
  // and a relevance floor are both permanent NO-GOs, so nothing here may remove a row.
  it('returns every row it was given, under any configuration', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', topics: '[]', relevance_score: 0 }), row({ id: 'c', source_name: 'Nobody' })];
    for (const cfg of [
      DEFAULT_ORDER,
      { ...DEFAULT_ORDER, topics: ['labor'] },
      { ...DEFAULT_ORDER, sourceWeights: { Reuters: 5 } },
      { ...DEFAULT_ORDER, topicBoost: 0, recencyBoost: 0, weightBoost: 0, relevanceBoost: 0 },
    ]) {
      expect(orderQueue(rows, cfg).map((r) => r.row.id).sort()).toEqual(['a', 'b', 'c']);
    }
  });

  it('puts a boosted topic above an unboosted one', () => {
    const rows = [
      row({ id: 'other', topics: JSON.stringify(['education']) }),
      row({ id: 'wanted', topics: JSON.stringify(['labor']) }),
    ];
    const out = orderQueue(rows, { ...DEFAULT_ORDER, topics: ['labor'] });
    expect(out[0].row.id).toBe('wanted');
  });

  it('puts a weighted source above an unweighted one, all else equal', () => {
    const rows = [row({ id: 'plain', source_name: 'Blog' }), row({ id: 'heavy', source_name: 'Reuters' })];
    const out = orderQueue(rows, { ...DEFAULT_ORDER, sourceWeights: { Reuters: 3 } });
    expect(out[0].row.id).toBe('heavy');
  });

  it('prefers the newer of two identical rows', () => {
    // getSilver() hands rows back newest-first and does not return classified_at, so
    // position in the crawl's own ordering IS the recency signal.
    const rows = [row({ id: 'new' }), row({ id: 'old' })];
    expect(orderQueue(rows, DEFAULT_ORDER)[0].row.id).toBe('new');
  });

  it('uses the classifier score as a signal and never as a floor', () => {
    // Compared at the same position, because recency is positional — otherwise this would
    // be measuring which row the lake handed back first.
    const at = (v: unknown) => scoreRow(row({ relevance_score: v }), 0, 2, DEFAULT_ORDER).score;
    expect(at(1)).toBeGreaterThan(at(0));
    // A relevance of zero is a low rank, never an exclusion.
    expect(orderQueue([row({ relevance_score: 0 })], DEFAULT_ORDER)).toHaveLength(1);
    expect(at(null)).toBe(at(0));
  });

  it('shows its working, so a row’s place is explainable', () => {
    const s = scoreRow(row(), 0, 1, { ...DEFAULT_ORDER, topics: ['immigration'], sourceWeights: { Reuters: 2 } });
    const labels = s.parts.map((p) => p.label);
    expect(labels).toEqual(['chủ đề', 'nguồn', 'mới', 'điểm lọc']);
    expect(s.score).toBeCloseTo(
      s.parts.reduce((n, p) => n + p.value, 0),
      6,
    );
  });

  it('survives a row whose topics column is not JSON', () => {
    expect(() => orderQueue([row({ topics: 'not json' })], DEFAULT_ORDER)).not.toThrow();
  });
});

describe('the output shape', () => {
  it('offers the five formats the plan names', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['tin-ngan', 'giai-thich', 'danh-sach', 'hoi-dap', 'cau-chuyen']);
    expect(FORMATS.every((f) => f.label && f.fragment.length > 40)).toBe(true);
  });

  it('falls back to the first format rather than throwing on an unknown id', () => {
    expect(formatById('khong-co').id).toBe('tin-ngan');
  });

  it('always cites the source and always carries the Meta rule, whatever the settings', () => {
    // Not toggleable by construction: the project's compliance gate sits in this path, and
    // a setting that could switch it off would be a way round it.
    for (const f of FORMATS) {
      const p = outputPrompt({ ...DEFAULT_OUTPUT, format: f.id, cta: '', tone: '' });
      expect(p).toContain('Theo ');
      expect(p).toMatch(/tường thuật|lên án/);
      expect(p).toMatch(/không.*(liên hệ|giá|đường dây)/i);
    }
  });

  it('puts the chosen format’s fragment in the prompt', () => {
    expect(outputPrompt({ ...DEFAULT_OUTPUT, format: 'danh-sach' })).toContain(
      formatById('danh-sach').fragment,
    );
  });

  it('is stable for the same settings, so the preview cache can key on it', () => {
    expect(outputPrompt(DEFAULT_OUTPUT)).toBe(outputPrompt({ ...DEFAULT_OUTPUT }));
  });

  it('says nothing about length by default, so it cannot contradict CONTENT_SOP.md', () => {
    // The SOP the pipeline already follows targets ~500 words, floor 450. A Studio default
    // of "~220 từ" reached the same generation step as a second, louder instruction.
    expect(outputPrompt(DEFAULT_OUTPUT)).not.toMatch(/Độ dài/);
    expect(outputPrompt({ ...DEFAULT_OUTPUT, length: 'medium' })).toContain('500 từ');
  });
});

describe('the output shape reaches the pipeline without trampling the owner’s prompt', () => {
  it('appends a block when there is none', () => {
    const out = upsertBlock('Viết cho người Việt ở Mỹ.', 'Dạng: tin ngắn.');
    expect(out).toContain('Viết cho người Việt ở Mỹ.');
    expect(readBlock(out)).toBe('Dạng: tin ngắn.');
  });

  it('replaces only its own block, however many times it is saved', () => {
    const own = 'Dòng của chủ kênh.';
    let t = upsertBlock(own, 'một');
    t = upsertBlock(t, 'hai');
    t = upsertBlock(t, 'ba');
    expect(readBlock(t)).toBe('ba');
    expect(stripBlock(t)).toBe(own);
    expect(t.match(/studio:output/g)).toHaveLength(2); // one open, one close
  });

  it('reads null from a prompt Studio has never touched', () => {
    expect(readBlock('Chỉ có chữ của tôi.')).toBeNull();
    expect(readBlock('')).toBeNull();
    expect(readBlock(null)).toBeNull();
  });

  it('survives a multi-line body with markdown in it', () => {
    const body = '## Dạng bài\n- một\n- hai\n\nTheo <nguồn>.';
    expect(readBlock(upsertBlock('x', body))).toBe(body);
  });
});
