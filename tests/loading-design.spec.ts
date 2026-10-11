import { test, expect } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  test(`loading is responsive, accessible and resolves at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/wishlist', async route => {
      await ready;
      await route.fulfill({ json: { itemCount: 0, items: [] } });
    });
    await page.goto('/wishlist');
    const loading = page.getByRole('status', { name: 'Loading saved pieces…' });
    await expect(loading).toBeVisible();
    const box = await loading.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await loading.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/inter/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/altura-loading-${width}.png` });
    release();
    await expect(loading).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Your saved pieces.' })).toBeVisible();
  });
}

test('session loading honors reduced motion and ends with sign in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/refresh', async route => { await ready; await route.fulfill({ status: 401, json: {} }); });
  await page.goto('/account/profile');
  const status = page.getByRole('status', { name: 'Restoring your ALTURA session…' });
  await expect(status).toBeVisible();
  expect(await status.locator('.loading-state__spinner').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  release();
  await expect(page).toHaveURL(/\/account\/login\?next=/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(status).toHaveCount(0);
});

test('failed loading gives a retry rather than leaving the spinner running', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  let failed = true;
  await page.route('**/api/v1/wishlist', route => route.fulfill(failed ? { status: 503, json: {} } : { json: { itemCount: 0, items: [] } }));
  await page.goto('/wishlist');
  await expect(page.locator('.wishlist-page [role=alert]')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading saved pieces…' })).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your saved pieces.' })).toBeVisible();
  await expect(page.locator('.wishlist-page [role=alert]')).toHaveCount(0);
});
