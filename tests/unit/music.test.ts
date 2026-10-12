/**
 * The background music bed.
 *
 * It was never built: deploy/make-reel.py's own header says the three skipped items —
 * big-number zone, background music, SFX — "need a real asset source decided first (which
 * track/sound, and is it actually royalty-free), not just code". The source question is
 * settled (no-attribution only, with a licence manifest beside every file), so this is the
 * code half. It mixes in the S12 overlay pass, which already builds its own audio chain, so
 * the pinned renderer is not touched.
 */
import { describe, it, expect } from 'vitest';
import { MUSIC_GAIN, musicLeg, type MusicLevel } from '@/lib/studio/steps/filters';

describe('the bed, as a filter', () => {
  it('is silent at Tắt and absent from the graph', () => {
    expect(MUSIC_GAIN.none).toBe(0);
    expect(musicLeg(3, 60, 'none')).toBeNull();
  });

  it('gets louder in the order the control reads', () => {
    const order: MusicLevel[] = ['none', 'soft', 'default', 'loud'];
    const gains = order.map((l) => MUSIC_GAIN[l]);
    expect(gains).toEqual([...gains].sort((a, b) => a - b));
    // Under a voice, not beside it: even the loud step stays well below the narration.
    expect(MUSIC_GAIN.loud).toBeLessThan(0.35);
  });

  it('loops a short track to the whole reel rather than leaving silence', () => {
    const leg = musicLeg(3, 90, 'default')!;
    expect(leg.label).toBe('[bed]');
    expect(leg.leg).toContain('[3:a]');
    expect(leg.leg).toContain('aloop=loop=-1');
    expect(leg.leg).toContain('atrim=0:90.00');
  });

  it('eases in and out, so the bed never starts or stops on a cut', () => {
    const leg = musicLeg(3, 60, 'default')!;
    expect(leg.leg).toContain('afade=t=in:st=0:d=2.00');
    expect(leg.leg).toContain('afade=t=out:st=58.00:d=2.00');
  });

  it('shortens the fade on a reel too short to carry a 2s one', () => {
    const leg = musicLeg(3, 4, 'soft')!;
    // A 2s fade in and out of a 4s bed is the whole bed; a quarter each end is not.
    expect(leg.leg).toContain('afade=t=in:st=0:d=1.00');
    expect(leg.leg).toContain('afade=t=out:st=3.00:d=1.00');
  });
});

describe('the whole audio chain', () => {
  const plan = (extra: object) => ({ layout: 'multi' as const, durationSec: 30, ...extra });

  it('leaves the narration alone when there is no bed and no whoosh', async () => {
    const { buildChain } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain(plan({}));
    expect(built.aOut).toBeNull();
  });

  it('mixes a bed under the narration', async () => {
    const { buildChain } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain(plan({ music: '/dev/null', musicLevel: 'default' }));
    expect(built.aOut).toBe('[aout]');
    expect(built.inputs).toContain('/dev/null');
    expect(built.filter).toContain('[bed]');
    expect(built.filter).toContain('amix=inputs=2');
  });

  it('drops the bed at Tắt instead of mixing silence', async () => {
    const { buildChain } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain(plan({ music: '/dev/null', musicLevel: 'none' }));
    expect(built.aOut).toBeNull();
    expect(built.inputs).not.toContain('/dev/null');
  });

  it('carries the bed and the whooshes in one mix, not two', async () => {
    const { buildChain } = await import('@/lib/studio/steps/overlay');
    const built = await buildChain(
      plan({ music: '/dev/null', musicLevel: 'soft', sfx: '/dev/null', sceneChars: [10, 10, 10] }),
    );
    expect(built.aOut).toBe('[aout]');
    // narration + 2 boundaries + bed, and exactly one amix in the graph.
    expect(built.filter).toContain('amix=inputs=4');
    expect(built.filter.match(/amix=/g)).toHaveLength(1);
  });
});
