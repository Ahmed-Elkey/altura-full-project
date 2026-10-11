import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Real local services only: no request interception. Never retain credentials,
// tokens, cookies, or password-filled screenshots/traces.
test.use({ screenshot: 'off', trace: 'off' });
const api = 'http://127.0.0.1:4000/api/v1';
function database() {
  const url = new URL(process.env.DATABASE_URL || '');
  const packageQa = process.env.ALTURA_PACKAGE_QA === '1';
  const expected = packageQa ? { port: '5434', path: '/altura_friend' } : { port: '5433', path: '/altura_dev' };
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== expected.port || url.pathname !== expected.path) throw new Error('BLOCKED: requires the explicitly selected isolated QA database');
  const { PrismaClient } = require('../backend/node_modules/@prisma/client');
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}
async function browserApi(page: Page, path: string, method = 'GET', body?: unknown, token?: string) {
  return page.evaluate(async ({ api, path, method, body, token }) => {
    const response = await fetch(api + path, { method, credentials: 'include', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }, { api, path, method, body, token });
}
async function fillRegistration(page: Page, email: string, password: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('First name', { exact: true }).fill('Registration');
  await page.getByLabel('Last name', { exact: true }).fill('Synthetic');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
}

test('new customer: explicit choice, real registration, merge, reload, profile, logout, sign-in and duplicate email', async ({ page }) => {
  // This covers multiple real navigations and authentication cycles, not one action.
  test.setTimeout(120_000);
  const db = database();
  const email = `registration-ux-${randomUUID()}@example.invalid`;
  const password = `Synthetic!${randomBytes(18).toString('hex')}`;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/account/login?next=%2Faccount%2Fprofile');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    // A guessed/unknown email must sign in unsuccessfully, never silently register.
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const unknown = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect((await unknown).status()).toBe(401);
    await expect(page.getByRole('alert').filter({ hasText: 'incorrect' })).toBeVisible();
    expect(await db.user.count({ where: { email } })).toBe(0);

    const variant = await db.productVariant.findFirst({ where: { active: true, currency: 'EGP', product: { status: 'ACTIVE' }, inventory: { quantity: { gt: 2 }, reservedQuantity: { lt: 2 } } }, select: { id: true, productId: true } });
    expect(variant).toBeTruthy();
    expect((await browserApi(page, '/cart/items', 'POST', { variantId: variant.id, quantity: 1 })).status).toBe(201);
    expect((await browserApi(page, '/wishlist/items', 'POST', { productId: variant.productId })).status).toBe(201);
    const guestCookie = (await page.context().cookies(api)).find(c => c.name === 'altura_guest');
    expect(guestCookie?.httpOnly).toBe(true);
    await page.getByRole('link', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/account\/register\?next=%2Faccount%2Fprofile$/);
    await fillRegistration(page, email, password);
    const registered = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST');
    const merged = page.waitForResponse(r => r.url().endsWith('/commerce-session/merge') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const registration = await registered;
    expect(registration.status()).toBe(201);
    const payload = await registration.json();
    expect(payload.user.role).toBe('CUSTOMER');
    expect(payload).not.toHaveProperty('refreshToken');
    expect(Object.keys(registration.request().postDataJSON()).sort()).toEqual(['email', 'firstName', 'lastName', 'password']);
    expect((await merged).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.locator('body')).toContainText(email);
    expect(await db.user.findUnique({ where: { email }, select: { role: true, status: true, firstName: true, lastName: true } })).toEqual({ role: 'CUSTOMER', status: 'ACTIVE', firstName: 'Registration', lastName: 'Synthetic' });
    const cart = await browserApi(page, '/cart', 'GET', undefined, payload.accessToken);
    const wishlist = await browserApi(page, '/wishlist', 'GET', undefined, payload.accessToken);
    expect(cart.status).toBe(200); expect(cart.body.items.some((item: { variantId: string }) => item.variantId === variant.id)).toBe(true);
    expect(wishlist.status).toBe(200);
    expect(await db.wishlistItem.count({ where: { wishlist: { userId: payload.user.id }, productId: variant.productId } })).toBe(1);
    expect(await db.cartItem.count({ where: { cart: { userId: payload.user.id }, variantId: variant.id } })).toBe(1);
    const refreshCookie = (await page.context().cookies(api + '/auth')).find(c => c.name === 'altura_refresh');
    expect(refreshCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false, path: '/api/v1/auth' });
    // Successful ownership transfer deliberately clears the guest credential.
    expect((await page.context().cookies(api)).find(c => c.name === 'altura_guest')?.value).not.toBe(guestCookie?.value);
    const refreshed = page.waitForResponse(r => r.url().endsWith('/auth/refresh') && r.request().method() === 'POST');
    const profile = page.waitForResponse(r => r.url().endsWith('/users/me/addresses') && r.request().method() === 'GET');
    await page.reload();
    expect((await refreshed).status()).toBe(200); expect((await profile).status()).toBe(200);
    await expect(page.locator('body')).toContainText(email);
    const loggedOut = page.waitForResponse(r => r.url().endsWith('/auth/logout') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect((await loggedOut).status()).toBe(204);
    await expect.poll(async () => (await page.context().cookies(api + '/auth')).some(c => c.name === 'altura_refresh')).toBe(false);
    await page.goto('/account/profile');
    await expect(page).toHaveURL(/\/account\/login\?next=/);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const signedIn = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect((await signedIn).status()).toBe(200);
    await expect(page).toHaveURL(/\/account\/profile$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.goto('/account/register'); await fillRegistration(page, email, password);
    const duplicate = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    expect((await duplicate).status()).toBe(409);
    await expect(page.locator('.balmoral-auth__error')).toHaveText('This email is already registered. Please sign in or use another email.');
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(await db.newsletterSubscriber.count({ where: { email } })).toBe(0);
    expect(errors).toEqual([]);
    await test.info().attach('real-registration-evidence', { body: JSON.stringify({ email, role: 'CUSTOMER', register: 201, duplicate: 409, unknownEmailLogin: 401, reloadRefresh: 200, profile: 200, logout: 204, signIn: 200, cartMerged: true, wishlistMerged: true, newsletterRecords: 0, cookieFlags: { httpOnly: true, sameSite: 'Lax', secure: false }, pageErrors: errors }), contentType: 'application/json' });
  } finally { try { await db.user.deleteMany({ where: { email } }); } finally { await db.$disconnect(); } }
});

test('existing customer can sign in without a registration step', async ({ page }) => {
  const file = process.env.ALTURA_TEST_CREDENTIALS_PATH;
  test.skip(!file || !existsSync(file), 'BLOCKED: private local customer credentials required');
  const raw = JSON.parse(readFileSync(file!, 'utf8'));
  const credentials = raw.accounts ? { customerEmail: raw.accounts.customer?.email, customerPassword: raw.accounts.customer?.password } : raw;
  await page.goto('/account/login?next=%2Faccount%2Fprofile');
  await page.getByLabel('Email', { exact: true }).fill(credentials.customerEmail);
  await page.getByLabel('Password', { exact: true }).fill(credentials.customerPassword);
  const signedIn = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await signedIn).status()).toBe(200);
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.locator('body')).toContainText(credentials.customerEmail);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
});

test('real public registration rejects injected ADMIN role without inserting an account', async ({ request }) => {
  const db = database();
  const email = `registration-security-${randomUUID()}@example.invalid`;
  try {
    const response = await request.post(api + '/auth/register', { data: { email, password: `Synthetic!${randomBytes(18).toString('hex')}`, firstName: 'Synthetic', lastName: 'Security', role: 'ADMIN' } });
    expect(response.status()).toBe(400);
    expect(await db.user.count({ where: { email } })).toBe(0);
  } finally { try { await db.user.deleteMany({ where: { email } }); } finally { await db.$disconnect(); } }
});

for (const width of [390, 768, 1440]) {
  for (const mode of ['login', 'register']) {
    test(`${mode} at ${width}px: explicit options, validation, keyboard, alignment and no overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/account/${mode}?next=%2Faccount%2Fprofile`);
      await expect(page.getByRole('navigation', { name: 'Customer account options' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: mode === 'register' ? 'Sign in' : 'Create account', exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
      const fields = mode === 'register' ? ['Email', 'First name', 'Last name', 'Password', 'Confirm password'] : ['Email', 'Password'];
      await page.getByLabel('Email', { exact: true }).focus();
      for (const label of fields) { await expect(page.getByLabel(label, { exact: true })).toBeFocused(); await page.keyboard.press('Tab'); }
      const submit = page.getByRole('button', { name: mode === 'register' ? 'Create account' : 'Sign in', exact: true });
      await expect(submit).toBeFocused();
      const design = await page.locator('.balmoral-auth__card').evaluate(card => {
        const button = card.querySelector('button[type="submit"]')!;
        return { cardBackground: getComputedStyle(card).backgroundColor, radius: getComputedStyle(card).borderRadius, buttonBackground: getComputedStyle(button).backgroundColor, font: getComputedStyle(card.querySelector('h1')!).fontFamily };
      });
      expect(design.cardBackground).toBe('rgb(255, 255, 255)');
      expect(design.radius).toBe('12px');
      expect(design.buttonBackground).toBe('rgb(17, 17, 17)');
      expect(design.font).toMatch(/inter/i);
      await page.keyboard.press('Enter');
      await expect(page.locator('.balmoral-auth__error')).toHaveText('Please enter a valid email address.');
      if (mode === 'register') {
        await fillRegistration(page, 'validation@example.invalid', 'short'); await submit.click();
        await expect(page.locator('.balmoral-auth__error')).toHaveText('Choose a password between 10 and 128 characters.');
        await page.getByLabel('Password', { exact: true }).fill('Synthetic-test-only-123!');
        await submit.click();
        await expect(page.locator('.balmoral-auth__error')).toContainText("passwords don't match");
        await page.getByRole('link', { name: 'Sign in', exact: true }).focus();
        await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeFocused();
        // Clear password values before retaining the layout evidence.
        await page.getByLabel('Password', { exact: true }).fill(''); await page.getByLabel('Confirm password', { exact: true }).fill('');
      }
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.balmoral-auth__card')!.getBoundingClientRect();
        const error = document.querySelector('.balmoral-auth__error')!.getBoundingClientRect();
        return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, left: card.left, right: card.right, center: (card.left + card.right) / 2, errorLeft: error.left, errorRight: error.right };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(width);
      expect(Math.abs(layout.center - width / 2)).toBeLessThanOrEqual(1);
      expect(layout.left).toBeGreaterThanOrEqual(0); expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.errorLeft).toBeGreaterThanOrEqual(layout.left); expect(layout.errorRight).toBeLessThanOrEqual(layout.right);
      // Normalize the scroll position before full-page capture so fixed, hidden
      // skip links are not rendered at the old viewport offset by Chromium.
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
      await test.info().attach(`auth-${mode}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await test.info().attach('layout', { body: JSON.stringify(layout), contentType: 'application/json' });
    });
  }
}
