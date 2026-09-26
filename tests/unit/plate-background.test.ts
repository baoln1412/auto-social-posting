import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scenePlate } from '@/lib/studio/plate';
import { cardBox } from '@/lib/studio/steps/filters';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-plate-'));
const card = path.join(dir, 'card.png');
const bg = path.join(dir, 'bg.png');

beforeAll(async () => {
  // A 4:5 card, which is what the shipped Desoul Posting VI kit renders.
  await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#123456' } })
    .png()
    .toFile(card);
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#c86400' } })
    .png()
    .toFile(bg);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const topPixel = async (file: string) => {
  const { data } = await sharp(file).extract({ left: 20, top: 20, width: 4, height: 4 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
};

describe('the space a card does not cover', () => {
  it('is 30% of the frame for a 4:5 card in a 9:16 reel', () => {
    const box = cardBox('card-top', 1080, 1350);
    const uncovered = 1920 - Math.min(1920, box.y + 1350) + Math.max(0, box.y);
    expect(uncovered).toBe(570);
  });

  it('is the stage colour when the kit names no background — the black the owner saw', async () => {
    const out = (await scenePlate({ card, background: null, layout: 'card-top' }))!;
    expect(out).toBeTruthy();
    const [r, g, b] = await topPixel(out);
    // make-reel's neutral plate, not the card and not a picture.
    expect(r).toBeLessThan(40);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
  });

  it('is the article picture when the kit asks for one', async () => {
    const out = (await scenePlate({ card, background: bg, layout: 'card-top' }))!;
    const [r, g, b] = await topPixel(out);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeGreaterThan(70);
    expect(b).toBeLessThan(60);
  });
});

describe('backgroundMedia', () => {
  it('reads `article` as this post’s own picture', async () => {
    const { backgroundMedia, articlePicture } = await import('@/lib/studio/steps/overlay');
    const kit = { id: 'k', name: 'K', frame: { background: 'article' } } as never;
    const item = { images: ['https://ex.com/a.jpg', 'https://ex.com/b.jpg'] };
    expect(backgroundMedia(kit, articlePicture(kit, item))).toEqual({
      url: 'https://ex.com/a.jpg',
      kind: 'image',
    });
  });

  it('prefers the picture the owner chose on the Ảnh step', async () => {
    const { articlePicture } = await import('@/lib/studio/steps/overlay');
    const kit = { id: 'k', name: 'K', card: { bgUrl: 'https://ex.com/chosen.jpg' } } as never;
    expect(articlePicture(kit, { images: ['https://ex.com/a.jpg'] })).toBe('https://ex.com/chosen.jpg');
  });

  it('asks for nothing when the post has no picture at all', async () => {
    const { backgroundMedia, articlePicture } = await import('@/lib/studio/steps/overlay');
    const kit = { id: 'k', name: 'K', frame: { background: 'article' } } as never;
    expect(backgroundMedia(kit, articlePicture(kit, { images: [] }))).toBeNull();
  });

  it('leaves an uploaded background alone', async () => {
    const { backgroundMedia } = await import('@/lib/studio/steps/overlay');
    const kit = { id: 'k', name: 'K', frame: { background: 'media-123' } } as never;
    // No such media row, so null — but it went looking for one rather than treating the id
    // as a url.
    expect(backgroundMedia(kit, 'https://ex.com/a.jpg')).toBeNull();
  });
});
