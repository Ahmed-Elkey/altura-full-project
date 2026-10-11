import { expect, test } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off' });
test.beforeEach(async ({ page }) => {
  await page.route('**/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
});
for (const width of [390, 768, 1440]) {
  test(`recovery matches account design without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/account/login');
    await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.balmoral-auth__title').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Inter');
    await page.goto('/account/reset-password');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.locator('.balmoral-auth__error')).toContainText('missing or invalid');
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('recovery validates email and handles unavailable service and accepted request', async ({ page }) => {
  let calls = 0;
  await page.route('**/auth/forgot-password', route => { calls++; return route.fulfill(calls === 1 ? { status: 503, json: {} } : { json: { accepted: true } }); });
  await page.goto('/account/forgot-password');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText('valid email');
  expect(calls).toBe(0);
  await page.getByLabel('Email', { exact: true }).fill('qa@example.invalid');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText('temporarily unavailable');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('.customer-auth__success')).toContainText('Request received');
  expect(calls).toBe(2);
});
test('reset validates confirmation, handles expired link, succeeds and removes token', async ({ page }) => {
  let calls = 0;
  await page.route('**/auth/reset-password', route => { calls++; return route.fulfill(calls === 1 ? { status: 400, json: {} } : { json: { reset: true } }); });
  await page.goto('/account/reset-password#token=synthetic-test-token');
  await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText("don't match");
  expect(calls).toBe(0);
  await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText('invalid or expired');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('.customer-auth__success')).toContainText('password has been updated');
  expect(await page.evaluate(() => location.hash)).toBe('');
});
test('newsletter validates, normalizes, prevents repeat submission and confirms saved subscription', async ({ page }) => {
  let calls = 0;
  let body: any;
  await page.route('**/newsletter/subscribe', async route => {
    calls++; body = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { subscribed: true } });
  });
  await page.goto('/');
  const form = page.locator('.site-footer__newsletterForm');
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('valid email');
  expect(calls).toBe(0);
  await form.getByRole('textbox').fill(' QA@Example.Invalid ');
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(form.getByRole('textbox')).toHaveAttribute('readonly', '');
  await expect(form.getByRole('status')).toContainText('Request received');
  expect(calls).toBe(1);
  expect(body).toEqual({ email: 'qa@example.invalid' });
  await expect(form.getByRole('textbox')).toHaveValue('');
});
test('newsletter exposes failures and allows retry without false success', async ({ page }) => {
  let calls = 0;
  await page.route('**/newsletter/subscribe', route => { calls++; return route.fulfill(calls === 1 ? { status: 500, json: {} } : { json: { subscribed: false } }); });
  await page.goto('/');
  const form = page.locator('.site-footer__newsletterForm');
  await form.getByRole('textbox').fill('qa@example.invalid');
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await form.getByRole('button', { name: 'Subscribe', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByRole('status')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('reset re-reads a new email fragment in the same tab after success', async ({ page }) => {
  let calls = 0;
  await page.route('**/auth/reset-password', route => { calls++; return route.fulfill(calls === 1 ? { json: { reset: true } } : { status: 400, json: {} }); });
  await page.goto('/account/reset-password#token=synthetic-used-token');
  await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('.customer-auth__success')).toBeVisible();
  await page.evaluate(() => { location.hash = '#token=synthetic-used-token'; });
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-password-123!');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('.balmoral-auth__error')).toContainText('invalid or expired');
});
