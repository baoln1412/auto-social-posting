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
    expect(a.get('ratio')).toBe('4:5');
    expect(b.get('ratio')).toBe('1:1');
    expect(a.toString()).not.toBe(b.toString());
  });

  it('highlights the clause after the colon when the kit says so, and not otherwise', () => {
    expect(cardParams(vi, draft, undefined).get('hl')).toBe('CỤ BÀ 82 TUỔI BỊ LỪA');
    expect(cardParams(demo, draft, undefined).get('hl')).toBeNull();
  });

  it('omits the article background when the kit does not want one', () => {
    expect(cardParams(demo, draft, 'https://ex.com/a').get('article')).toBeNull();
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
