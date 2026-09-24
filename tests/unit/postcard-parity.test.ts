import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The owner's complaint that opened v3: "the steps to fix the post images and video seem
 * missing compared to our ASP." This is the test that keeps them present.
 *
 * Every control PostCard's News Card section has, and the Studio testid that answers it. It
 * fails two ways on purpose: the PostCard string is gone (the mapping went stale and someone
 * must re-read it) or the Studio testid is not rendered (the control was dropped). The e2e
 * half — that the testid is actually on the Ảnh screen — is tests/e2e/run-image.spec.ts;
 * this half is what makes a change to PostCard itself show up as a red build here.
 */
const PARITY: { postcard: string; studio: string; what: string }[] = [
  { postcard: '4:5 Portrait', studio: 'img-ratio-4:5', what: 'tỉ lệ 4:5' },
  { postcard: '1:1 Square', studio: 'img-ratio-1:1', what: 'tỉ lệ 1:1' },
  { postcard: 'Main image', studio: 'img-main', what: 'ảnh chính' },
  { postcard: 'Circle image', studio: 'img-inset', what: 'ảnh tròn' },
  { postcard: 'Save to post', studio: 'img-save', what: 'lưu vào bài' },
  { postcard: 'reset to article images', studio: 'img-reset', what: 'bỏ ảnh đã chọn' },
  { postcard: 'Download FB Image', studio: 'img-download', what: 'tải 1200×630' },
  { postcard: 'Open full size', studio: 'img-open', what: 'mở ảnh gốc' },
  { postcard: 'AI Fix', studio: 'draft-ai', what: 'sửa bằng AI' },
  { postcard: 'Apply', studio: 'draft-ai-apply', what: 'áp dụng gợi ý' },
  { postcard: 'Discard', studio: 'draft-ai-discard', what: 'bỏ gợi ý' },
];

const postCard = fs.readFileSync(path.join(process.cwd(), 'app', 'components', 'PostCard.tsx'), 'utf8');
const runView = fs.readFileSync(path.join(process.cwd(), 'app', 'studio', 'components', 'RunView.tsx'), 'utf8');

describe('the run page carries every control the old post card has', () => {
  it.each(PARITY)('$what', ({ postcard, studio }) => {
    expect(postCard, `PostCard no longer says "${postcard}" — re-read it and fix this mapping`).toContain(postcard);
    expect(runView, `the Studio screen is missing ${studio} (${postcard})`).toContain(`data-testid="${studio}"`);
  });

  it('checked every control in the list', () => {
    expect(PARITY.length).toBeGreaterThanOrEqual(11);
  });
});

/** VideoGenModal's script button, the other thing the old app has and the run page needs. */
describe('the draft screen carries the old video modal’s script button', () => {
  it('Tạo script', () => {
    const modal = fs.readFileSync(path.join(process.cwd(), 'app', 'components', 'VideoGenModal.tsx'), 'utf8');
    expect(modal).toContain('Tạo script');
    expect(runView).toContain('data-testid="draft-script"');
  });
});
