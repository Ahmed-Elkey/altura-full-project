import { test, expect } from '@playwright/test';

// The approved customer design uses a consistent light palette. Retired
// dark-mode controls are not part of the current application's interface.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const headers = { 'Access-Control-Allow-Origin': route.request().headers()['origin'] || 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) return route.fulfill({ status: 401, headers, json: {} });
    if (path.endsWith('/health')) return route.fulfill({ headers, json: { status: 'ok', database: 'connected' } });
    return route.fulfill({ headers, json: { currency: 'EGP', items: [], subtotal: 0, itemCount: 0, issues: [] } });
  });
});
for (const preference of ['light', 'dark'] as const) test(`customer palette stays consistent with OS ${preference} preference`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: preference });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/account/login', '/account/register', '/cart', '/checkout', '/wishlist', '/track-order']) {
      await page.goto(route);
      const palette = await page.evaluate(() => { const css = getComputedStyle(document.documentElement); return { background: css.getPropertyValue('--background').trim().toLowerCase().replace(/^#fff$/, '#ffffff'), text: css.getPropertyValue('--text-primary').trim().toLowerCase().replace(/^#111$/, '#111111'), overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
      expect(palette).toEqual({ background: '#ffffff', text: '#111111', overflow: false });
    }
  }
  expect(errors).toEqual([]);
});
test('registration keyboard validation and autofill remain readable', async ({ page }) => {
  await page.goto('/account/register');
  await page.getByLabel('Email', { exact: true }).fill('display@example.invalid');
  await page.getByLabel('First name', { exact: true }).fill('Display');
  await page.getByLabel('Last name', { exact: true }).fill('Audit');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-Preview-A');
  await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-Preview-B');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.balmoral-auth__error')).toHaveText("Your passwords don't match. Please check them and try again.");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#balmoral-email' });
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });
  await page.getByLabel('Email', { exact: true }).focus();
  expect(await page.locator('.balmoral-auth__inputBox').first().evaluate(box => getComputedStyle(box).boxShadow)).not.toBe('none');
  expect(await page.getByLabel('Email', { exact: true }).evaluate(input => getComputedStyle(input).webkitTextFillColor)).toBe('rgb(17, 17, 17)');
});
