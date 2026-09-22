/**
 * The card gate: did the title stay inside the frame, and can the highlight be read?
 *
 * Measured off the rendered PNG, not off a model of the renderer — 506 green tests once
 * missed three layout defects a single screenshot caught (CLAUDE.md §9), and a gate that
 * reasons about what Satori *should* have drawn repeats that mistake.
 */
import sharp from 'sharp';
import { contrastRatio } from '../card/theme';

export interface CardMeasurement {
  width: number;
  height: number;
  /** True if ink reaches the outermost band of the frame — text that escaped its box. */
  edgeInk: boolean;
}

export { contrastRatio } from '../card/theme';

const EXPECTED = [
  [1080, 1350],
  [1080, 1080],
  [1080, 1920],
];

export function layoutFindings(m: CardMeasurement, highlight: string, band: string): string[] {
  const findings: string[] = [];
  if (!EXPECTED.some(([w, h]) => m.width === w && m.height === h)) {
    findings.push(`Ảnh ra ${m.width}×${m.height} — không phải khổ thẻ đã yêu cầu.`);
  }
  if (m.edgeInk) findings.push('Chữ chạm mép khung — tiêu đề tràn ra ngoài hộp.');
  const ratio = contrastRatio(highlight, band);
  if (ratio < 3) {
    findings.push(`Màu nhấn chỉ đạt ${ratio.toFixed(2)}:1 trên nền — dưới ngưỡng 3:1.`);
  }
  return findings;
}

/**
 * The title sits in a band across the bottom. "Inside the frame" means its glyphs do not
 * reach the bottom or side edges of that band.
 *
 * Measured as INK, not as variance. The first version checked that the outer 8px was
 * uniform and flagged every real card: the background photo is full-bleed and the band is a
 * gradient, so variance is the design, not a defect. Glyphs are near-white or the #F8EF63
 * highlight — colours the band itself never reaches — so counting bright pixels says what
 * the gate actually claims. The top edge is never checked: the brand badge lives there on
 * purpose.
 */
const MARGIN = 8;
const BAND_FRACTION = 0.4;
/** Above this share of bright pixels, a strip is carrying text rather than background. */
const INK_SHARE = 0.002;

function brightShare(raw: Buffer, channels: number): number {
  let bright = 0;
  const px = raw.length / channels;
  for (let i = 0; i < raw.length; i += channels) {
    const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
    const white = r > 200 && g > 200 && b > 200;
    const highlight = r > 200 && g > 190 && b < 170;
    if (white || highlight) bright++;
  }
  return px ? bright / px : 0;
}

export async function measureCard(png: Buffer): Promise<CardMeasurement> {
  const { width = 0, height = 0 } = await sharp(png).metadata();
  const bandTop = Math.floor(height * (1 - BAND_FRACTION));
  const bandH = height - bandTop;

  const regions = [
    { left: 0, top: height - MARGIN, width, height: MARGIN },
    { left: 0, top: bandTop, width: MARGIN, height: bandH },
    { left: Math.max(0, width - MARGIN), top: bandTop, width: MARGIN, height: bandH },
  ];

  const shares = await Promise.all(
    regions.map(async (r) => {
      const { data, info } = await sharp(png).extract(r).raw().toBuffer({ resolveWithObject: true });
      return brightShare(data, info.channels);
    }),
  );

  return { width, height, edgeInk: shares.some((s) => s > INK_SHARE) };
}
