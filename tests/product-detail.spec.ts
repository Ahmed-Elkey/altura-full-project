import { test, expect } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  test(`product viewer stays in viewport and recent cards stay compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('altura:recently-viewed', JSON.stringify(['meridian-tee', 'summit-shorts', 'half-tights'])));
    await page.goto('/products/trail-cap');
    const recent = page.getByRole('region', { name: 'Recently viewed' });
    await expect(recent).toBeVisible();
    const card = recent.locator('.product-recently-viewed__item').first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(240);
    const gallery = page.locator('.product-single__media').first();
    const galleryBox = await gallery.boundingBox();
    expect(Math.abs(galleryBox!.height / galleryBox!.width - 1.25)).toBeLessThan(.02);
    expect(await page.locator('#main-content .product-single__title').first().evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/inter/i);
    const opener = page.getByRole('button', { name: /Enlarge .* front image/ }).first();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: /image viewer/ });
    await expect(dialog).toBeVisible();
    const rect = await dialog.boundingBox();
    expect(Math.abs(rect!.y)).toBeLessThan(1);
    expect(rect!.height).toBeLessThanOrEqual(900);
    expect(await dialog.evaluate(el => el.contains(document.elementFromPoint(innerWidth / 2, 24)))).toBe(true);
    const image = dialog.locator('img').first();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    const imageBox = await image.boundingBox();
    expect(imageBox!.y).toBeGreaterThanOrEqual(0);
    expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: `/tmp/altura-product-viewer-${width}.png` });
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeVisible();
    expect((await image.boundingBox())!.width).toBeGreaterThan(imageBox!.width * 1.9);
    await page.getByRole('button', { name: 'Next image', exact: true }).click();
    await expect(image).toHaveAttribute('alt', /back/);
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(image).toHaveAttribute('alt', /front/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    const fullscreen = page.getByRole('button', { name: 'View images full screen' });
    await fullscreen.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close image viewer' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator('button').last()).toBeFocused();
    await page.getByRole('button', { name: 'Close image viewer' }).click();
    await expect(fullscreen).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `/tmp/altura-product-detail-${width}.png`, fullPage: true });
  });
}


test('image viewer shows a recoverable error instead of a blank image', async ({ page }) => {
  await page.route('**/sage-front.jpg', route => route.abort());
  await page.goto('/products/trail-cap');
  await page.getByRole('button', { name: /Enlarge .* front image/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /image viewer/ });
  await expect(dialog.getByRole('alert')).toContainText('This image could not load');
  await page.unroute('**/sage-front.jpg');
  await dialog.getByRole('button', { name: 'Retry image' }).click();
  await expect.poll(() => dialog.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('every active product has four working viewer images', async ({ page, request }) => {
  const catalog = await (await request.get('/api/products')).json();
  const ids = catalog.products.map((product: { id: string }) => product.id);
  expect(ids).toHaveLength(9);
  for (const id of ids) {
    await page.goto(`/products/${id}`);
    await expect(page.locator('#main-content .product-single__title').first()).toBeVisible();
    await page.getByRole('button', { name: /Enlarge .* front image/ }).first().click();
    const dialog = page.getByRole('dialog', { name: /image viewer/ });
    for (const view of ['front', 'back', 'detail', 'angled']) {
      await expect(dialog.locator('img')).toHaveAttribute('alt', new RegExp(view));
      await expect.poll(() => dialog.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      await dialog.getByRole('button', { name: 'Next image' }).click();
    }
    await page.keyboard.press('Escape');
  }
});
