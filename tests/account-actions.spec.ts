import { test, expect, type Page } from '@playwright/test';
test.use({ trace: 'off', screenshot: 'off' });
const user = { id: 'actions', email: 'actions@example.invalid', role: 'CUSTOMER', firstName: 'Actions', lastName: 'QA', status: 'ACTIVE' };
const cart = { id: 'actions-cart', ownerType: 'customer', currency: 'EGP', itemCount: 1, subtotal: 100, issues: [], items: [{ id: 'item', variantId: 'variant', quantity: 1, unitPrice: 100, lineTotal: 100, currency: 'EGP', availableQuantity: 3, product: { id: 'product', slug: 'summit-shorts', name: 'Test shorts', image: null }, option: { colorName: 'Black', size: 'M', title: 'Black / M' } }] };
async function fixture(page: Page) {
  let signedIn = true, fail = false, calls = 0;
  const headers = { 'Access-Control-Allow-Origin': process.env.ALTURA_BASE_URL || 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/auth/refresh') return route.fulfill({ headers, status: signedIn ? 200 : 401, json: signedIn ? { accessToken: 'synthetic', user } : {} });
    if (path === '/auth/logout') { calls++; if (fail) return route.fulfill({ headers, status: 503, json: {} }); signedIn = false; return route.fulfill({ headers, status: 204 }); }
    if (path === '/users/me/password' || path === '/auth/logout-all') { signedIn = false; return route.fulfill({ headers, status: 204 }); }
    if (path === '/cart') return route.fulfill({ headers, json: cart });
    if (path === '/checkout/shipping-methods') return route.fulfill({ headers, json: { methods: [] } });
    if (path === '/users/me/addresses') return route.fulfill({ headers, json: [] });
    if (path === '/newsletter/me') return route.fulfill({ headers, json: { status: 'UNSUBSCRIBED', reward: null, confirmedAt: null } });
    return route.fulfill({ headers, json: {} });
  });
  return { fail: (value: boolean) => { fail = value; }, calls: () => calls };
}
for (const width of [390, 768, 1440]) for (const path of ['/checkout', '/account/profile']) {
  test(`${path} at ${width}px logout succeeds and failure preserves a retryable signed-in state`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await fixture(page); await page.goto(path);
    await expect(page.locator('body')).toContainText(user.email);
    const click = async () => {
      if (path === '/checkout') { await page.getByRole('button', { name: 'Email options' }).click(); await page.getByRole('menuitem', { name: 'Sign out' }).click(); }
      else await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    };
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    api.fail(true); await click();
    await expect(page.getByRole('alert').filter({ hasText: /.+/ }).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect(page.locator('body')).toContainText(user.email);
    api.fail(false); await click();
    if (path === '/checkout') { await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible(); await expect(page.getByPlaceholder('Email', { exact: true })).toHaveValue(''); }
    else await expect(page).toHaveURL(/\/account\/login\?next=/);
    expect(api.calls()).toBe(2);
  });
}
test('profile points marketing preferences to the working newsletter controls', async ({ page }) => {
  await fixture(page); await page.goto('/account/profile');
  await expect(page.getByText('Unavailable in this local demo.', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: 'Manage email preferences' }).click();
  await expect(page).toHaveURL(/\/account\/rewards$/);
  await expect(page.getByRole('heading', { name: 'Newsletter preference', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toBeVisible();
});

test('successful password revocation clears the session without another logout request', async ({ page }) => {
  const api = await fixture(page); api.fail(true); await page.goto('/account/security');
  await page.getByLabel('Current password', { exact: true }).fill('CurrentSynthetic!123');
  await page.getByLabel('New password', { exact: true }).fill('NewSynthetic!123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('NewSynthetic!123');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/login\?next=/);
  expect(api.calls()).toBe(0);
});
test('sign out all sessions clears verified revocation without another logout request', async ({ page }) => {
  const api = await fixture(page); api.fail(true); await page.goto('/account/security');
  await page.getByRole('button', { name: 'Sign out all sessions' }).click();
  await expect(page).toHaveURL(/\/account\/login/);
  expect(api.calls()).toBe(0);
});
