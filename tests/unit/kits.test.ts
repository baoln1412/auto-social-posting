import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  KITS_DIR,
  listKitFiles,
  listPresetFiles,
  loadKitFile,
  validateKit,
  validatePreset,
} from '@/lib/studio/kits/schema';
import { cardParams, captionStyle, effectiveFrame } from '@/lib/studio/kits/load';

describe('the kit directory', () => {
  it('resolves through deploy/assets/kits — the symlink the console shares', () => {
    expect(fs.existsSync(KITS_DIR)).toBe(true);
    expect(fs.existsSync(path.join(KITS_DIR, 'kit.schema.json'))).toBe(true);
  });

  it('ships both kits', () => {
    expect(listKitFiles().map((f) => path.basename(f, '.json')).sort()).toEqual([
      'demo',
      'desoul-posting-vi',
    ]);
  });
});

describe('validateKit()', () => {
  it('passes every kit that ships', () => {
    for (const f of listKitFiles()) {
      expect(validateKit(loadKitFile(f)), `${path.basename(f)}: ${validateKit(loadKitFile(f))}`).toBeNull();
    }
  });

  it('rejects a kit missing its identity', () => {
    expect(validateKit({ id: 'x', name: 'X', schemaVersion: 1 })).toMatch(/identity/);
  });

  it('rejects a field no engine can honour', () => {
    const kit = loadKitFile(listKitFiles()[0]) as any;
    expect(validateKit({ ...kit, card: { ...kit.card, fontFamily: 'Comic Sans' } })).toMatch(
      /fontFamily|additional/i,
    );
  });

  it('rejects a caption size outside what caption_style.py clamps to', () => {
    const kit = loadKitFile(listKitFiles()[0]) as any;
    expect(validateKit({ ...kit, captions: { ...kit.captions, size: 400 } })).toBeTruthy();
  });
});

describe('validatePreset()', () => {
  it('validates every preset file against its tab', () => {
    const files = listPresetFiles();
    expect(files.length).toBeGreaterThan(8);
    for (const { tab, file } of files) {
      const err = validatePreset(tab, JSON.parse(fs.readFileSync(file, 'utf8')));
      expect(err, `${tab}/${path.basename(file)}: ${err}`).toBeNull();
    }
  });
});

describe('the kit reaches the engines', () => {
  const vi = loadKitFile(listKitFiles().find((f) => f.includes('desoul-posting-vi'))!) as any;
  const demo = loadKitFile(listKitFiles().find((f) => f.includes('demo'))!) as any;
  const draft = { title: 'MỸ: CỤ BÀ 82 TUỔI BỊ LỪA', text: 'x' };

  it('turns two kits into two different card requests', () => {
    const a = cardParams(vi, draft, 'https://ex.com/a');
    const b = cardParams(demo, draft, 'https://ex.com/a');
    // Each asks for the ratio its own kit declares, and the two requests differ.
    expect(a.get('ratio')).toBe(vi.card.ratio);
    expect(b.get('ratio')).toBe(demo.card.ratio);
    expect(a.get('ratio')).not.toBe(b.get('ratio'));
    expect(a.toString()).not.toBe(b.toString());
  });

  it('highlights the clause after the colon when the kit says so, and not otherwise', () => {
    expect(cardParams(vi, draft, undefined).get('hl')).toBe('CỤ BÀ 82 TUỔI BỊ LỪA');
    const noHl = { ...vi, card: { ...vi.card, highlight: 'none' } };
    expect(cardParams(noHl as any, draft, undefined).get('hl')).toBeNull();
  });

  it('omits the source photo when the kit does not want one', () => {
    // Each engine names it differently: `article` on classic, `bg` on studio.
    const off = { ...demo, card: { ...demo.card, background: 'none' } };
    expect(cardParams(off as any, draft, 'https://ex.com/a').get('bg')).toBeNull();
    expect(cardParams(vi, draft, 'https://ex.com/a').get('article')).toBe('https://ex.com/a');
  });

  it('hands make-reel.py the caption knobs it clamps', () => {
    expect(captionStyle(demo)).toEqual({
      preset: 'dam',
      size: 104,
      pos: 0.5,
      wordsPerCue: 2,
      maxLines: 1,
      case: 'upper',
    });
  });

  it('maps the frame tab onto the two flags startRenderJob takes', () => {
    expect(effectiveFrame(vi, {})).toMatchObject({ includeLayout: true, includeIntro: true });
    expect(effectiveFrame(demo, {})).toMatchObject({ includeLayout: false, includeIntro: false });
  });

  it('lets the per-run drawer win over the kit without changing the kit', () => {
    const before = JSON.stringify(vi);
    expect(effectiveFrame(vi, { includeIntro: false }).includeIntro).toBe(false);
    expect(JSON.stringify(vi)).toBe(before);
  });
});

describe('the two card engines', () => {
  const load = () => import('@/lib/studio/kits/load');
  const draft = { title: 'MỸ: CỤ BÀ 82 TUỔI BỊ LỪA' };

  it('sends the classic route only what that route reads', async () => {
    const { cardParams, cardPath } = await load();
    const kit = { id: 'k', name: 'K', card: { engine: 'classic', ratio: '4:5', theme: 'toi', radius: 40 } } as any;
    const q = cardParams(kit, draft, 'https://ex.com/a');
    expect(cardPath(kit)).toBe('/api/image/card');
    // theme/radius would be a kit promising a look that route has no parameter for.
    expect(q.get('theme')).toBeNull();
    expect(q.get('radius')).toBeNull();
    expect(q.get('article')).toBe('https://ex.com/a');
  });

  it('sends the studio route the whole card tab', async () => {
    const { cardParams, cardPath } = await load();
    const kit = {
      id: 'k',
      name: 'K',
      card: { engine: 'studio', ratio: '9:16', theme: 'bao', font: 'BeVietnamPro-Bold',
              radius: 28, titleSize: 90, highlightColor: '#B3121D', background: 'article' },
    } as any;
    const q = cardParams(kit, draft, 'https://ex.com/a');
    expect(cardPath(kit)).toBe('/api/studio/card');
    expect(q.get('ratio')).toBe('9:16');
    expect(q.get('theme')).toBe('bao');
    expect(q.get('font')).toBe('BeVietnamPro-Bold');
    expect(q.get('radius')).toBe('28');
    expect(q.get('titleSize')).toBe('90');
    expect(q.get('highlightColor')).toBe('#B3121D');
    expect(q.get('bg')).toBe('https://ex.com/a');
  });

  it('never lets the classic route be asked for 9:16, which it cannot make', async () => {
    const { cardParams } = await load();
    const kit = { id: 'k', name: 'K', card: { engine: 'classic', ratio: '9:16' } } as any;
    expect(cardParams(kit, draft).get('ratio')).toBe('4:5');
  });

  it('defaults to classic, so an old kit renders exactly as it did', async () => {
    const { cardEngine, cardPath } = await load();
    expect(cardEngine({ id: 'k', name: 'K' })).toBe('classic');
    expect(cardPath({ id: 'k', name: 'K', card: {} })).toBe('/api/image/card');
  });

  it('validates every card preset, old and new, against the schema', () => {
    for (const { tab, file } of listPresetFiles().filter((f) => f.tab === 'card')) {
      const preset = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(validatePreset(tab, preset), `${file}: ${validatePreset(tab, preset)}`).toBeNull();
    }
  });
});
