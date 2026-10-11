import { test, expect } from '@playwright/test';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const widths = [1440, 768, 390];
function staticRoutes(directory = 'app', prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory() || entry.name.startsWith('[') || ['admin', 'account', 'api'].includes(entry.name)) return [];
    const folder = path.join(directory, entry.name);
    const route = `${prefix}/${entry.name}`;
    return [...(existsSync(path.join(folder, 'page.tsx')) ? [route] : []), ...staticRoutes(folder, route)];
  });
}
const routes = ['/', ...staticRoutes(), '/collections/tops', '/collections/bottoms', '/collections/accessories', '/collections/t-shirts', '/collections/t-shirts-longsleeves', '/collections/shorts', '/collections/tights', '/collections/headwear', '/collections/fall-26', '/collections/tank-tops', '/collections/pullovers', '/collections/jackets', '/collections/pants', '/collections/socks', '/collections/other', '/collections/performance', '/collections/lifestyle', '/info/about', '/info/shipping', '/info/shipping-returns', '/info/contact', '/info/contact-us', '/info/faqs', '/info/returns', '/info/terms', '/info/instagram', '/pages/shipping-returns'];
for (const width of widths) test(`public route inventory at ${width}px`, async ({ page, request }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/v1/cart', route => route.fulfill({ json: { currency: 'EGP', itemCount: 0, items: [], subtotal: 0, issues: [] } }));
  await page.route('**/api/v1/wishlist', route => route.fulfill({ json: { itemCount: 0, items: [] } }));
  const catalog = await (await request.get('/api/products')).json();
  const productRoutes = catalog.products.map((product: { id: string }) => `/products/${product.id}`);
  const failures: string[] = [];
  for (const route of [...new Set([...routes, ...productRoutes])]) {
    const response = await page.goto(route);
    if (!['/', '/wishlist'].includes(route)) await expect(page.locator('#main-content h1').first()).toBeVisible();
    if (['/returns', '/info/returns', '/info/about', '/info/faqs', '/info/terms'].includes(route)) { await expect(page.locator('h1').first()).toBeVisible(); }
    if (response?.status() !== 200) failures.push(`${route}: HTTP ${response?.status()}`);
    await expect(page.locator('body')).not.toContainText('Application error');
    for (const heading of await page.locator('h1:visible, h2:visible').all()) expect(await heading.evaluate(el => getComputedStyle(el).fontFamily), `${route} heading font`).toMatch(/Inter/i);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) failures.push(`${route}: ${overflow}px horizontal overflow`);
    if (!await page.locator('h1').count() && !['/', '/wishlist'].includes(route)) failures.push(`${route}: missing page heading`);
    const safeName = route.replace(/[^a-z0-9]/gi, '-') || 'home';
    if (['/wishlist','/search','/info/contact','/start-a-return','/info/about-us','/info/terms-policies','/info/f-a-q'].includes(route)) await page.screenshot({ path: test.info().outputPath(`${safeName}-${width}.png`), fullPage: true });
  }
  console.log(`AUDIT ${width}px: ${new Set([...routes, ...productRoutes]).size} public routes, ${productRoutes.length} live products`);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
test('terms and return aliases reach implemented pages', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/account/register');
  await expect(page.getByRole('link', { name: 'Terms of service', exact: true })).toHaveAttribute('href', '/info/terms-policies');
  await page.goto('/info/returns');
  await expect(page).toHaveURL(/\/start-a-return$/);
  await expect(page.locator('.brf').first()).toBeVisible();
});
