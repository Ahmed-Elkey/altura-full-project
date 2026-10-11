import { test, expect } from '@playwright/test';
for (const width of [390, 768, 1440]) test(`information controls and readable headers at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/info/contact');
  const title = page.locator('h1:visible').first();
  await expect(title).toHaveCSS('color', 'rgb(17, 17, 17)');
  expect((await page.locator('.pb-row-page-header:visible').first().boundingBox())!.height).toBeLessThan(150);
  await expect.poll(() => page.evaluate(() => !document.body.classList.contains('--site-header-inverted'))).toBe(true);
  const prepare = page.getByRole('button', { name: 'Send message' });
  await prepare.click();
  await expect(page.getByRole('alert').filter({ hasText: 'valid email' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Synthetic Audit');
  await page.getByLabel('Email', { exact: true }).fill('audit@example.invalid');
  await page.getByLabel('Subject', { exact: true }).fill('A question');
  await page.route('**/api/v1/support', route => route.fulfill({ status: 201, json: { ticket: { id: 'synthetic-contact', reference: 'SUP-TEST' }, accessToken: 'synthetic-scoped' } }));
  await page.getByLabel('Message', { exact: true }).fill('Local preview only');
  await prepare.click();
  await expect(page.getByRole('status')).toContainText('Your message is saved');
  await expect(page.getByRole('link', { name: 'View conversation' })).toHaveAttribute('href', '/support/synthetic-contact');
  await page.screenshot({ path: `/tmp/altura-contact-final-${width}.png`, fullPage: true });
  await page.goto('/info/f-a-q');
  await expect(page.locator('#main-content details')).toHaveCount(5);
  for (const detail of await page.locator('#main-content details').all()) {
    const summary = detail.locator('summary');
    await summary.click(); await expect(detail).toHaveAttribute('open', '');
    await expect(detail.locator('.accordions__content')).toBeVisible();
    await summary.focus(); await page.keyboard.press('Enter'); await expect(detail).not.toHaveAttribute('open', '');
  }
  await page.goto('/lookbook');
  const scroller = page.locator('.swiper-wrapper').first();
  if (width === 1440) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeLessThanOrEqual(12);
  } else {
    expect(await scroller.evaluate(el => getComputedStyle(el).overflowX)).toMatch(/auto|scroll/);
    await scroller.evaluate(el => el.scrollTo({ left: 200 }));
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
});
