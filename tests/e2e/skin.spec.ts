import { test, expect } from '@playwright/test';
import { dismissTour } from './fixtures';

/**
 * The v3 skin, checked on the rendered page, not the stylesheet.
 *
 * "Every number is mono" is the brand rule; v2 read it as "every label is mono" and the owner
 * called the result plain text. So: an element whose own text has a Vietnamese letter must not be
 * set in a monospace face. The one exception is an eyebrow (`.st-eyebrow`, e.g. `TỔNG QUAN
 * STUDIO · 1/8`), allowed at 11 px or smaller.
 */
const PAGES = [
  '/studio',
  '/studio/library',
  '/studio/kits',
  '/studio/kits/demo',
  '/studio/pipeline',
  '/studio/assets',
  '/studio/channels',
  '/studio/guide',
  '/studio/settings',
];

test('the shell: the lockup, one green CTA, an icon on every nav row, the header', async ({ page }) => {
  await page.goto('/studio');
  await dismissTour(page);

  const side = page.getByTestId('studio-side');
  await expect(side.locator('img[alt="DESOUL"]')).toBeVisible();
  await expect(side.locator('.desoul-subword')).toHaveText(/^studio$/i);
  await expect(side.getByTestId('studio-cta')).toHaveAttribute('href', '/studio');

  const links = side.locator('nav a');
  const n = await links.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) await expect(links.nth(i).locator('svg')).toHaveCount(1);

  const head = page.getByTestId('studio-header');
  await expect(head.getByTestId('page-title')).toBeVisible();
  await expect(head.getByTestId('cost-pill')).toHaveText(/\$\d+\.\d\d/);
  await expect(head.getByTestId('bell')).toBeVisible();
  await expect(head.getByTestId('tier-badge')).toHaveText('owner');
});

for (const path of PAGES) {
  test(`mono is for numbers only — ${path}`, async ({ page }) => {
    await page.goto(path);
    await dismissTour(page);
    const bad = await page.evaluate(() => {
      const vi = /[À-ɏẠ-ỹ]/;
      const own = (el: Element) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
      return Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((el) => !el.closest('.st-eyebrow'))
        .filter((el) => /mono/i.test(getComputedStyle(el).fontFamily))
        .filter((el) => vi.test(own(el)))
        .map((el) => own(el).slice(0, 60));
    });
    expect(bad, `monospace over Vietnamese text on ${path}`).toEqual([]);

    const big = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.st-eyebrow')).filter(
        (el) => parseFloat(getComputedStyle(el).fontSize) > 11,
      ).length,
    );
    expect(big, 'an eyebrow larger than 11px').toBe(0);
  });
}
