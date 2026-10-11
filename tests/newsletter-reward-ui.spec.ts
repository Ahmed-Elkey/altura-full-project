import { expect, test } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/newsletter/offer', route => route.fulfill({ json: { headline: 'Join ALTURA for 10% off products.', terms: 'Confirm by email. One use within 30 days, with the same email at checkout.' } }));
  await page.route('**/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
});

test('newsletter request asks for inbox confirmation without promising activation', async ({ page }) => {
  await page.route('**/api/v1/newsletter/subscribe', route => route.fulfill({ json: { subscribed: true } }));
  await page.goto('/');
  const form = page.locator('.site-footer__newsletterForm');
  await expect(form).toContainText('10%');
  await form.getByRole('textbox').fill('qa@example.invalid');
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Request received');
  await expect(form.getByRole('status')).toContainText('inbox');
});

test('confirmation posts only after a click and reveals the private reward', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/newsletter/confirm', route => {
    requests++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ token: 'synthetic-confirm-token' });
    return route.fulfill({ json: { confirmed: true, reward: { code: 'WELCOME-SYNTHETIC', type: 'PERCENTAGE', value: 10, expiresAt: '2030-11-01T00:00:00Z' } } });
  });
  await page.goto('/newsletter/confirm#token=synthetic-confirm-token');
  await expect(page.getByRole('button', { name: 'Confirm subscription', exact: true })).toBeEnabled();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Confirm subscription', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'WELCOME-SYNTHETIC' })).toBeVisible();
  await expect(page.getByText('Use once within 30 days', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('confirmation explains expired links and allows retry after service errors', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/newsletter/confirm', route => route.fulfill(++calls === 1 ? { status: 503, json: {} } : { status: 400, json: {} }));
  await page.goto('/newsletter/confirm#token=synthetic-expired-token');
  await page.getByRole('button', { name: 'Confirm subscription', exact: true }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText("couldn't connect");
  await page.getByRole('button', { name: 'Confirm subscription', exact: true }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText('invalid or expired');
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
});

for (const action of ['confirm', 'unsubscribe']) {
  test(`${action} without token explains how to recover`, async ({ page }) => {
    await page.goto(`/newsletter/${action}`);
    await expect(page.locator('.balmoral-auth__error')).toContainText('missing');
    await expect(page.getByRole('button', { name: action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe', exact: true })).toBeDisabled();
  });
}

test('unsubscribe requires explicit action and accepts another fragment in the same tab', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/newsletter/unsubscribe', route => { calls++; return route.fulfill({ json: { unsubscribed: true } }); });
  await page.goto('/newsletter/unsubscribe#token=synthetic-optout-token');
  await expect(page.getByRole('button', { name: 'Unsubscribe', exact: true })).toBeEnabled();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Unsubscribe', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'unsubscribed' })).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.evaluate(() => { location.hash = '#token=synthetic-second-token'; });
  await expect(page.getByRole('button', { name: 'Unsubscribe', exact: true })).toBeEnabled();
});

test('admin shows delivery, reward use, search, pagination and constrained retries', async ({ page }) => {
  const user = { id: 'synthetic-admin', email: 'admin@example.invalid', firstName: 'Admin', lastName: null, role: 'ADMIN', status: 'ACTIVE' };
  await page.route('**/auth/refresh', route => route.fulfill({ json: { user, accessToken: 'synthetic-admin-token' } }));
  const queries: string[] = [];
  let retried = false;
  await page.route('**/api/v1/admin/newsletter?*', route => {
    queries.push(route.request().url());
    return route.fulfill({ json: { items: [{ id: 'synthetic-subscriber', email: 'reader@example.invalid', status: 'PENDING', subscribedAt: '2026-10-08T00:00:00Z', confirmedAt: '2026-10-08T00:10:00Z', unsubscribedAt: null, welcomeStatus: retried ? 'SENT' : 'FAILED', welcomeSentAt: retried ? '2026-10-08T01:00:00Z' : null, reward: { code: 'WELCOME-SYNTHETIC', value: 10, type: 'PERCENTAGE', expiresAt: '2030-11-01T00:00:00Z', active: true, usageCount: 1, orderNumbers: ['ALT-TEST-001'] } }], total: 26, page: Number(new URL(route.request().url()).searchParams.get('page')), limit: 25, counts: { total: 26, pending: 2, subscribed: 23, unsubscribed: 1, deliveryFailed: retried ? 0 : 1 } } });
  });
  await page.route('**/api/v1/admin/newsletter/synthetic-subscriber/retry', route => { retried = true; return route.fulfill({ json: { queued: true } }); });
  await page.goto('/admin/newsletter');
  const row = page.getByRole('row').filter({ hasText: 'reader@example.invalid' });
  await expect(row).toContainText('ALT-TEST-001');
  await expect(row).toContainText('Used');
  await row.getByRole('button', { name: 'Retry email', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'queued' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Retry email', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Table pages' })).toContainText('Page 2');
  await page.getByLabel('Search email').fill('reader');
  await page.getByLabel('Subscription status').selectOption('SUBSCRIBED');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => queries.some(query => query.includes('q=reader') && query.includes('status=SUBSCRIBED') && query.includes('page=1'))).toBe(true);
});

for (const width of [390, 768, 1440]) {
  test(`newsletter confirmation fits customer design at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/newsletter/confirm#token=synthetic-responsive-token');
    await expect(page.getByRole('button', { name: 'Confirm subscription', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.hero-build/newsletter-confirm-${width}.png`, fullPage: true });
  });
}
