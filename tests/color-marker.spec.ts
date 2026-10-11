import { test, expect } from '@playwright/test';
for (const width of [390, 768, 1440]) test(`color marker moves continuously at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  const card = page.locator('#main-content #pb-row-promo-headwear .product-preview').first();
  const bars = card.locator('.pcsw__bar');
  const marker = card.locator('.pcsw__marker');
  await card.hover();
  await bars.first().focus();
  await expect(marker).toBeVisible();
  await marker.evaluate(el => el.setAttribute('data-audit-marker', 'persistent'));
  const target = bars.nth(1);
  const animation = await card.locator('.pcsw__wrap').evaluate(async wrap => {
    const marker = wrap.querySelector<HTMLElement>('.pcsw__marker')!;
    const target = wrap.querySelectorAll<HTMLButtonElement>('button')[1];
    const from = new DOMMatrix(getComputedStyle(marker).transform).m41;
    const to = target.offsetLeft + (target.offsetWidth - marker.offsetWidth) / 2;
    target.click();
    const positions: number[] = [];
    await new Promise<void>(resolve => {
      const start = performance.now();
      const sample = () => {
        positions.push(new DOMMatrix(getComputedStyle(marker).transform).m41);
        if (performance.now() - start >= 350) resolve(); else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return { from, to, positions };
  });
  expect(animation.positions.some(x => x > animation.from + 1 && x < animation.to - 1), 'marker must travel through intermediate positions').toBe(true);
  await expect(marker).toHaveAttribute('data-audit-marker', 'persistent');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => { const a = await marker.boundingBox(); const b = await target.boundingBox(); return Math.abs(a!.x + a!.width / 2 - b!.x - b!.width / 2); }).toBeLessThan(1);
  const transition = await marker.evaluate(el => getComputedStyle(el).transitionProperty);
  expect(transition).toContain('transform');
  // Rapid changes settle on the final selection, including wrapped narrow rows.
  for (const bar of await bars.all()) await bar.click();
  const last = bars.last();
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
  await expect.poll(async () => { const a = await marker.boundingBox(); const b = await last.boundingBox(); return Math.abs(a!.x + a!.width / 2 - b!.x - b!.width / 2); }).toBeLessThan(1);
});
test('color marker respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.locator('#main-content #pb-row-promo-headwear .product-preview').first();
  await card.hover();
  await card.locator('.pcsw__bar').first().focus();
  expect(await card.locator('.pcsw__marker').evaluate(el => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.001);
  await card.locator('.pcsw__bar').nth(1).click();
  await expect(card.locator('.pcsw__bar').nth(1)).toHaveAttribute('aria-pressed', 'true');
});
