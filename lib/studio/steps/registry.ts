/**
 * Which implementation runs a step. Demo channels get fixtures; everything else gets the real
 * engines as each slice lands them.
 */
import type { Channel, Step, StepName } from './types';
import { DEMO_STEPS } from '../demo/steps';
import { fetchStep } from './fetch';
import { draftStep } from './draft';
import { imageStep } from './image';
import { reelStep } from './reel';
import { publishStep } from './publish';

export function isDemoChannel(c: Channel): boolean {
  try {
    return (JSON.parse(c.sources_json || '[]') as { type?: string }[]).some(
      (s) => s.type === 'demo',
    );
  } catch {
    return false;
  }
}

const REAL: Partial<Record<StepName, Step>> = {
  fetch: fetchStep,
  draft: draftStep,
  image: imageStep,
  reel: reelStep,
  publish: publishStep,
};

export function resolveStep(name: StepName, channel: Channel): Step {
  // The demo pack REPLACES the steps that would spend or reach the network; anything it
  // does not name falls through to the real one. `image` is the case that matters: Satori
  // is local and free, so a demo run draws a real card and the Ảnh controls actually work.
  const step = (isDemoChannel(channel) ? (DEMO_STEPS[name] ?? REAL[name]) : REAL[name]);
  if (!step) throw new Error(`Bước "${name}" chưa có engine cho kênh này.`);
  return step;
}
