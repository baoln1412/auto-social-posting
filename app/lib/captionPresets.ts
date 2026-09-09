// The SAME file deploy/caption_style.py reads. One table, two readers - a preset defined
// twice will drift, and the preview would then disagree with the render.
import presets from '@/deploy/assets/caption-presets.json';

export type PresetKey = keyof typeof presets;
export const PRESETS = presets as Record<string, { label: string } & Record<string, unknown>>;

// Mirrors what deploy/caption_style.py's resolve_style() produces: DEFAULTS merged with
// a preset merged with explicit overrides. The four numeric knobs the panel's sliders
// drive are typed directly so callers get real number types; outline/shadow/highlight
// (and anything else a preset carries) fall through the index signature instead of `any`.
export interface CaptionStyle {
  preset?: string;
  size?: number;
  pos?: number;
  wordsPerCue?: number;
  maxLines?: number;
  case?: 'upper' | 'none';
  [key: string]: unknown;
}
