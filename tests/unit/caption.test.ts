import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { PRESETS } from '@/app/lib/captionPresets';
import { resolveCaption } from '@/lib/studio/caption';

/**
 * The preview draws the caption; deploy/make-reel.py renders it. Two implementations of the
 * same style resolution drift on the first preset anyone adds — so this asks the renderer's
 * own caption_style.py what it produces and requires the TypeScript to match, key for key.
 *
 * The module is imported, not edited: deploy/ stays exactly as it is.
 */
function python(style: unknown): Record<string, unknown> {
  const out = execFileSync(
    '/opt/homebrew/bin/python3',
    [
      '-c',
      [
        'import sys, json',
        'sys.path.insert(0, "deploy")',
        'import caption_style',
        'print(json.dumps(caption_style.resolve(json.loads(sys.argv[1]))))',
      ].join('\n'),
      JSON.stringify(style ?? {}),
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(out) as Record<string, unknown>;
}

const CASES: unknown[] = [
  {},
  { preset: 'classic' },
  ...Object.keys(PRESETS).map((preset) => ({ preset })),
  { preset: 'dam', size: 99 },
  { preset: 'tinnong', highlight: { mode: 'block' } },
  { preset: 'nope' },
  { size: 9999 },
  { size: 1 },
  { wordsPerCue: 0 },
  { maxLines: 99 },
  { pos: 0.99 },
  { band: { on: true, opacity: 400 } },
];

describe('resolveCaption agrees with the renderer', () => {
  for (const style of CASES) {
    it(`matches caption_style.py for ${JSON.stringify(style)}`, () => {
      expect(resolveCaption(style as never)).toEqual(python(style));
    });
  }
});

describe('resolveCaption', () => {
  it('keeps nested keys a preset did not set', () => {
    // "tinnong" sets only highlight.color; wiping highlight.mode would turn word-by-word
    // highlighting off in the preview but not in the render.
    expect(resolveCaption({ preset: 'tinnong' }).highlight.mode).toBe('word');
  });

  it('falls back to classic rather than throwing on an unknown preset', () => {
    expect(resolveCaption({ preset: 'khong-co' }).size).toBe(64);
  });
});
