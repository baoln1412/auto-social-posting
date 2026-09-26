import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Its own database: this file is otherwise pure, and the drift check below has to seed.
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-kits-'));
process.env.STUDIO_SQLITE_PATH = path.join(dbDir, 'test.db');
import {
  KITS_DIR,
  listKitFiles,
  listPresetFiles,
  loadKitFile,
  validateKit,
  validatePreset,
} from '@/lib/studio/kits/schema';
import { cardParams, captionStyle, effectiveFrame } from '@/lib/studio/kits/load';
import { studioDb } from '@/lib/studio/db';
import { seedDemo } from '@/lib/studio/demo/seed';

describe('the kit directory', () => {
  it('resolves through deploy/assets/kits — the symlink the console shares', () => {
    expect(fs.existsSync(KITS_DIR)).toBe(true);
    expect(fs.existsSync(path.join(KITS_DIR, 'kit.schema.json'))).toBe(true);
  });

  it('ships the kits the pack claims, and every one of them validates', () => {
    const ids = listKitFiles().map((f) => path.basename(f, '.json')).sort();
    expect(ids).toEqual(['demo', 'desoul-posting-vi', 'the-noi-9x16']);
    // A shipped kit that does not validate is seeded and then silently skipped, so the page
    // lists one fewer than the pack has — check the pack, not just its filenames.
    for (const f of listKitFiles()) expect(validateKit(loadKitFile(f)), f).toBeNull();
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
    expect(effectiveFrame(demo, {})).toMatchObject({ includeLayout: true, includeIntro: false });
    // `continuous` is the one layout the overlay pass places itself, so make-reel must not
    // also lay the card out. Built here rather than borrowed from whichever shipped kit
    // happens to use it — that coupling broke when the demo kit moved to `multi`.
    const slides = { ...demo, frame: { ...(demo.frame as object), layout: 'continuous' } } as typeof demo;
    expect(effectiveFrame(slides, {})).toMatchObject({ includeLayout: false, includeIntro: false });
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
    const q = cardParams(kit, draft, 'https://ex.com/a', 'https://ex.com/pic.jpg');
    expect(cardPath(kit)).toBe('/api/studio/card');
    expect(q.get('ratio')).toBe('9:16');
    expect(q.get('theme')).toBe('bao');
    expect(q.get('font')).toBe('BeVietnamPro-Bold');
    expect(q.get('radius')).toBe('28');
    expect(q.get('titleSize')).toBe('90');
    expect(q.get('highlightColor')).toBe('#B3121D');
    // The PICTURE, not the page. This assertion used to read `bg === 'https://ex.com/a'`,
    // which is the article's page url — it did not catch the bug, it wrote it down: the
    // studio route has no scraper, so every studio-engine kit rendered a blank background.
    expect(q.get('bg')).toBe('https://ex.com/pic.jpg');
  });

  it('gives the studio route no background when only the page url is known', async () => {
    const { cardParams } = await load();
    const kit = { id: 'k', name: 'K', card: { engine: 'studio', background: 'article' } } as any;
    // Better nothing than an HTML page handed to an image fetcher.
    expect(cardParams(kit, draft, 'https://ex.com/a').get('bg')).toBeNull();
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

describe('the shipped pack and the seeded rows', () => {
  it('agree after a seed, so the file is what the product actually renders', () => {
    // They drifted once and nothing caught it: the stored `demo` sat at revision 3 with
    // `card.background: "article"` while the file at revision 3 said `"none"`, so seeding
    // saw equal revisions and left the row alone. Every kit on the Bộ nhận diện page was
    // then a kit nobody had shipped.
    seedDemo();
    for (const file of listKitFiles()) {
      const shipped = loadKitFile(file) as { id: string; revision?: number };
      const row = studioDb().prepare('SELECT json FROM studio_kits WHERE id=?').get(shipped.id) as
        | { json: string }
        | undefined;
      expect(row, shipped.id).toBeTruthy();
      const stored = JSON.parse(row!.json) as { revision?: number };
      expect(stored.revision ?? 1, `${shipped.id} stored revision`).toBeGreaterThanOrEqual(
        shipped.revision ?? 1,
      );
      // Equal revisions must mean equal content, or the bump rule is not doing its job.
      if ((stored.revision ?? 1) === (shipped.revision ?? 1)) {
        expect(stored, shipped.id).toEqual(shipped);
      }
    }
  });
});
