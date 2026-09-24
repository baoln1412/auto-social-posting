import { expect, test } from '@playwright/test';
import libTour from '@/lib/studio/tours/library.json';
import newTour from '@/lib/studio/tours/new.json';
import runTour from '@/lib/studio/tours/run.json';
import { DEMO_RUN_ID } from '@/lib/studio/demo/seed';

/**
 * The tour points at something. That is the whole claim, and it is the one a tour gets wrong:
 * v2's card sat in the top-right corner naming an element it never touched.
 *
 * So every step is measured — the target inside the hole, the card off the target and on the
 * screen — rather than looked at once in a screenshot.
 */
type R = { x: number; y: number; width: number; height: number };
const inside = (inner: R, outer: R) =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1;
const overlaps = (a: R, b: R) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * Three screens carry a tour, and each one's steps name elements on that screen. A renamed
 * testid does not misplace the card — it drops the step silently — so the count is checked
 * against the file, allowing only the steps whose target is genuinely data-dependent.
 */
const SCREENS = [
  { name: 'create', url: '/studio', steps: newTour.length, optional: 2 },
  // The card step needs a post in the lake; the other three are page furniture.
  { name: 'library', url: '/studio/library', steps: libTour.length, optional: 1 },
  { name: 'run', url: `/studio/runs/${DEMO_RUN_ID}`, steps: runTour.length, optional: 0 },
];

for (const screen of SCREENS) {
  test(`${screen.name}: every step spotlights its own target`, async ({ page }) => {
    await page.goto(screen.url);
    const tour = page.getByTestId('tour');
    await expect(tour).toBeVisible();

    const total = Number(((await tour.innerText()).match(/\d+\/(\d+)/) ?? [])[1]);
    expect(total, 'no step dropped for a target that no longer exists').toBeGreaterThanOrEqual(
      screen.steps - screen.optional,
    );
    expect(total).toBeLessThanOrEqual(screen.steps);
    // The dots are the same count the eyebrow claims, or one of them is lying.
    await expect(page.getByTestId('tour-dots').locator('i')).toHaveCount(total);

    const viewport = page.viewportSize()!;
    for (let n = 1; n <= total; n++) {
      await expect(tour).toContainText(`${n}/${total}`);

      const selector = (await tour.getAttribute('data-tour-target'))!;
      const target = (await page.locator(selector).first().boundingBox())!;
      const ring = (await page.getByTestId('tour-ring').boundingBox())!;
      const card = (await tour.boundingBox())!;

      expect.soft(inside(target, ring), `${n}: target inside the cutout (${selector})`).toBe(true);
      expect.soft(overlaps(card, target), `${n}: card off the target (${selector})`).toBe(false);
      expect.soft(card.x, `${n}: card on screen`).toBeGreaterThanOrEqual(0);
      expect.soft(card.y, `${n}: card on screen`).toBeGreaterThanOrEqual(0);
      expect.soft(card.x + card.width).toBeLessThanOrEqual(viewport.width);
      expect.soft(card.y + card.height).toBeLessThanOrEqual(viewport.height);

      if (n === 1 && screen.name === 'create') await page.screenshot({ path: 'tests/shots/60-tour.png' });
      if (n < total) await page.getByTestId('tour-next').click();
    }
    expect(test.info().errors).toHaveLength(0);

    // Xong closes it, and it stays closed.
    await page.getByTestId('tour-next').click();
    await expect(tour).toHaveCount(0);
    await page.reload();
    await expect(tour).toHaveCount(0);
    console.log(`${screen.name}: checked ${total} tour steps`);
  });
}

test('the tour walks both ways and runs once', async ({ page }) => {
  await page.goto('/studio');
  const tour = page.getByTestId('tour');
  await expect(tour).toBeVisible();
  // Read off the card, not the JSON: a step whose target is not on this screen is dropped,
  // so the file's length is an upper bound and not the number shown.
  const n = Number(((await tour.innerText()).match(/\d+\/(\d+)/) ?? [])[1]);
  await page.screenshot({ path: 'tests/shots/44-tour.png' });

  await page.getByTestId('tour-next').click();
  await expect(tour).toContainText(`2/${n}`);
  await page.getByTestId('tour-back').click();
  await expect(tour).toContainText(`1/${n}`);
  await page.getByTestId('tour-skip').click();
  await expect(tour).toHaveCount(0);

  await page.reload();
  await expect(tour).toHaveCount(0);
});
