import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { selectAvailableVariant } from './helpers/catalog';

function localDatabase() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== '127.0.0.1' || url.port !== '5433' || url.pathname !== '/altura_dev') {
    throw new Error('Phase 2F database verification refused a target outside 127.0.0.1:5433/altura_dev.');
  }
  const { PrismaClient } = require('../backend/node_modules/@prisma/client');
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

function apiPath(url: string) {
  return new URL(url).pathname;
}

test('a fresh authenticated API session without a guest cookie creates one EGP cart', async ({ playwright }) => {
  const email = `phase2f-api-${randomUUID()}@example.invalid`;
  const password = `Phase2F!${randomBytes(10).toString('hex')}`;
  const api: APIRequestContext = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:4000' });
  const db = localDatabase();

  try {
    const registration = await api.post('/api/v1/auth/register', {
      data: { email, password, firstName: 'Phase2F', lastName: 'ApiSession' },
    });
    expect(registration.status()).toBe(201);
    const payload = await registration.json();
    const cookies = (await api.storageState()).cookies;
    expect(cookies.some((cookie) => cookie.name === 'altura_guest')).toBeFalsy();

    const cartResponse = await api.get('/api/v1/cart', {
      headers: { Authorization: `Bearer ${payload.accessToken}` },
    });
    expect(cartResponse.status()).toBe(200);
    const cart = await cartResponse.json();
    expect(cart).toMatchObject({ ownerType: 'customer', currency: 'EGP', itemCount: 0 });

    const activeCarts = await db.cart.findMany({
      where: { userId: payload.user.id, status: 'ACTIVE' },
      select: { id: true, currency: true },
    });
    expect(activeCarts).toEqual([{ id: cart.id, currency: 'EGP' }]);
  } finally {
    await api.dispose();
    await db.$disconnect();
  }
});

async function completeEgyptCheckout(page: Page, email: string, name: string) {
  const requests: Array<{ path: string; key?: string; body: string }> = [];
  page.on('request', (request) => {
    const path = apiPath(request.url());
    if (path.endsWith('/checkout/place-order') || path.endsWith('/payments/initialize') || path.endsWith('/checkout/shipping-methods')) {
      requests.push({ path, key: request.headers()['idempotency-key'], body: request.postData() || '' });
    }
  });

  await page.goto('/products/summit-shorts');
  await selectAvailableVariant(page, 'summit-shorts');
  await expect(page.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled();
  const addPromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/cart/items') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  const added = await addPromise;
  expect(added.status()).toBe(201);
  const cart = await added.json();
  expect(cart.currency).toBe('EGP');
  expect(cart.itemCount).toBe(1);

  await page.goto('/checkout');
  await expect(page.locator('select').first()).toHaveValue('EG');
  if (await page.getByPlaceholder('Email').count()) {
    await page.getByPlaceholder('Email').fill(email);
  } else {
    await expect(page.locator('.bchk-email')).toHaveText(email);
  }
  await page.getByPlaceholder('First name').fill('Phase2F');
  await page.getByPlaceholder('Last name').fill(name);
  await page.getByPlaceholder('Address').fill('Phase 2F Synthetic Test Street 1');
  await page.getByPlaceholder('City').fill('Cairo');
  const region = page.getByRole('combobox', { name: 'Region' });
  if (await region.count()) await region.selectOption({ label: 'Cairo' });
  await page.getByPlaceholder('Phone').fill('+201000000001');
  await expect(page.locator('.bchk-shipList')).toBeVisible();
  await page.getByPlaceholder('Card number').fill('4242424242424242');
  await page.getByPlaceholder('Expiration date (MM / YY)').fill('12 / 30');
  await page.getByPlaceholder('Security code').fill('123');
  await page.getByPlaceholder('Name on card').fill(`Phase2F ${name}`);

  const orderPromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/checkout/place-order') && response.request().method() === 'POST');
  const paymentPromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/payments/initialize') && response.request().method() === 'POST');
  const mockPromise = page.waitForResponse((response) => /\/payments\/mock\/[^/]+\/complete$/.test(apiPath(response.url())));
  await page.getByRole('button', { name: 'Pay now' }).click();
  expect((await orderPromise).status()).toBe(201);
  const payment = await paymentPromise;
  expect(payment.status()).toBe(201);
  expect((await payment.json()).checkout.mode).toBe('mock');
  const mock = await mockPromise;
  expect(mock.status()).toBeGreaterThanOrEqual(200);
  expect(mock.status()).toBeLessThan(300);
  await expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 30_000 });
  await expect(page.getByText('Order received.')).toBeVisible();

  const place = requests.find((request) => request.path.endsWith('/checkout/place-order'));
  const initialize = requests.find((request) => request.path.endsWith('/payments/initialize'));
  expect(requests.some((request) => request.path.endsWith('/checkout/shipping-methods') && request.body.includes('"EG"'))).toBeTruthy();
  expect(place?.key).toMatch(/^altura-order-/);
  expect(initialize?.key).toMatch(/^altura-payment-/);
  const orderNumber = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) || '');
  await page.goto('/account/orders');
  await expect(page.locator('.balmoral-orders__row').filter({ hasText: orderNumber })).toBeVisible();
  return orderNumber;
}

test('fresh customer registration, login, merge, cart and Egypt mock checkout stay on EGP', async ({ page }) => {
  const email = `phase2f-${randomUUID()}@example.invalid`;
  const password = `Phase2F!${randomBytes(10).toString('hex')}`;
  const name = randomBytes(3).toString('hex');
  const db = localDatabase();

  try {
    const initialCookies = await page.context().cookies('http://127.0.0.1:4000/api/v1');
    expect(initialCookies).toHaveLength(0);
    const guestCartPromise = page.waitForResponse((response) =>
      apiPath(response.url()).endsWith('/api/v1/cart') &&
      response.request().method() === 'GET' &&
      !response.request().headers()['authorization'],
    );
    await page.goto('/account/register');
    const guestCartResponse = await guestCartPromise;
    expect(guestCartResponse.status()).toBe(200);
    const guestCart = await guestCartResponse.json();
    expect(guestCart.ownerType).toBe('guest');
    expect(guestCart.currency).toBe('EGP');
    expect(guestCart.itemCount).toBe(0);

    await page.locator('#balmoral-email').fill(email);
    await page.getByLabel('First name').fill('Phase2F');
    await page.getByLabel('Last name').fill(name);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    const registerPromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/api/v1/auth/register'));
    const mergePromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/api/v1/commerce-session/merge'));
    await page.getByRole('button', { name: 'Create account' }).click();
    const registerResponse = await registerPromise;
    expect(registerResponse.status()).toBe(201);
    const registration = await registerResponse.json();
    const userId = registration.user.id as string;
    const mergeResponse = await mergePromise;
    expect(mergeResponse.status()).toBe(201);
    const merge = await mergeResponse.json();
    expect(merge.cart.hadGuestCart).toBeTruthy();
    expect(merge.cart.currencyConflict).toBeFalsy();
    await expect(page).toHaveURL(/\/account(?:$|\/)/);

    let activeCarts = await db.cart.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, currency: true, items: { select: { id: true } } },
    });
    expect(activeCarts).toHaveLength(1);
    expect(activeCarts[0].currency).toBe('EGP');
    expect(activeCarts[0].id).toBe(merge.cart.customerCartId);
    const mergedGuest = await db.cart.findUnique({ where: { id: guestCart.id }, select: { status: true, currency: true } });
    expect(mergedGuest).toMatchObject({ status: 'ABANDONED', currency: 'EGP' });

    await page.goto('/account/profile');
    const logoutPromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/api/v1/auth/logout'));
    await page.getByRole('button', { name: 'Sign out' }).click();
    expect((await logoutPromise).status()).toBe(204);

    await page.goto('/account/login');
    await page.locator('#balmoral-email').fill(email);
    await page.getByLabel('Password').fill(password);
    const loginPromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/api/v1/auth/login'));
    const reloginMergePromise = page.waitForResponse((response) => apiPath(response.url()).endsWith('/api/v1/commerce-session/merge'));
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect((await loginPromise).status()).toBe(200);
    const reloginMerge = await reloginMergePromise;
    expect(reloginMerge.status()).toBe(201);

    activeCarts = await db.cart.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, currency: true, items: { select: { id: true } } },
    });
    expect(activeCarts).toHaveLength(1);
    expect(activeCarts[0].currency).toBe('EGP');

    const orderNumber = await completeEgyptCheckout(page, email, name);
    const orders = await db.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { orderNumber: true, currency: true } });
    expect(orders[0]).toMatchObject({ orderNumber, currency: 'EGP' });

    await page.goto('/account/profile');
    const finalLogout = page.waitForResponse((response) => apiPath(response.url()).endsWith('/api/v1/auth/logout'));
    await page.getByRole('button', { name: 'Sign out' }).click();
    expect((await finalLogout).status()).toBe(204);
  } finally {
    await db.$disconnect();
  }
});
