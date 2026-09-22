/**
 * Which implementation runs a step. Demo channels get fixtures; everything else gets the real
 * engines as each slice lands them.
 */
import type { Channel, Step, StepName } from './types';
import { DEMO_STEPS } from '../demo/steps';

export function isDemoChannel(c: Channel): boolean {
  try {
    return (JSON.parse(c.sources_json || '[]') as { type?: string }[]).some(
      (s) => s.type === 'demo',
    );
  } catch {
    return false;
  }
}

/** Real engines, filled in by slice 3. */
const REAL: Partial<Record<StepName, Step>> = {};

export function resolveStep(name: StepName, channel: Channel): Step {
  const step = (isDemoChannel(channel) ? DEMO_STEPS : REAL)[name];
  if (!step) throw new Error(`Bước "${name}" chưa có engine cho kênh này.`);
  return step;
}
