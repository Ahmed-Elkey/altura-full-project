import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { selectAvailableVariant } from './helpers/catalog';

// Credentials and card placeholders must never enter retained traces/screenshots.
test.use({ screenshot: 'off', trace: 'off', actionTimeout: 15000, navigationTimeout: 30000 });
const api = 'http://127.0.0.1:4000/api/v1';
function database() {
  const url = new URL(process.env.DATABASE_URL || '');
  const packageQa = process.env.ALTURA_PACKAGE_QA === '1';
  const expected = packageQa ? { port: '5434', path: '/altura_friend' } : { port: '5433', path: '/altura_dev' };
  if (url.hostname !== '127.0.0.1' || url.port !== expected.port || url.pathname !== expected.path) throw new Error('Phase 2G requires the explicitly selected isolated QA database.');
  const { PrismaClient } = require('../backend/node_modules/@prisma/client');
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}
function credentials() {
  const file = process.env.ALTURA_TEST_CREDENTIALS_PATH;
  if (!file || !existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const value = raw.accounts ? { adminEmail: raw.accounts.admin?.email, adminPassword: raw.accounts.admin?.password, customerEmail: raw.accounts.customer?.email, customerPassword: raw.accounts.customer?.password } : raw;
  return value.adminEmail && value.adminPassword ? value : null;
}
async function browserApi(page: Page, path: string, method = 'GET', body?: unknown, token?: string) {
  return page.evaluate(async ({ api, path, method, body, token }) => {
    const response = await fetch(api + path, { method, credentials: 'include', headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }, { api, path, method, body, token });
}
async function loginAdmin(page: Page) {
  const config = credentials();
  if (!config) throw new Error('Private synthetic admin credentials are required (BLOCKED).');
  await page.goto('/admin/login');
  await page.getByLabel('Email', { exact: true }).fill(config.adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(config.adminPassword);
  const login = page.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enter Studio', exact: true }).click();
  const response = await login;
  expect(response.status()).toBe(200);
  const token = (await response.json()).accessToken;
  await expect(page).toHaveURL(/\/admin$/);
  return token as string;
}
async function checkoutAddress(page: Page, email: string) {
  await page.goto('/checkout');
  await expect(page.getByPlaceholder('First name')).toBeVisible();
  if (await page.getByPlaceholder('Email', { exact: true }).count()) await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.getByPlaceholder('First name').fill('Portfolio');
  await page.getByPlaceholder('Last name').fill('Synthetic');
  await page.getByPlaceholder('Address', { exact: true }).fill('17 Phase 2G Test Street');
  await page.getByPlaceholder('City', { exact: true }).fill('Cairo');
  await page.getByRole('combobox', { name: 'Region' }).selectOption({ label: 'Cairo' });
  await page.getByPlaceholder('Phone', { exact: true }).fill('+201000000007');
  await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
}
async function addProduct(page: Page, slug = 'summit-shorts') {
  await page.goto(`/products/${slug}`);
  const variant = await selectAvailableVariant(page, slug, 2);
  const promise = page.waitForResponse((response) => response.url().endsWith('/cart/items') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click();
  expect((await promise).status()).toBe(201);
  return variant;
}
async function pay(page: Page) {
  await expect(page.getByRole('radio', { name: 'Credit / Debit Card', exact: true })).toBeChecked();
  await page.getByPlaceholder('Card number').fill('4242424242424242');
  await page.getByPlaceholder('Expiration date (MM / YY)').fill('12 / 30');
  await page.getByPlaceholder('Security code').fill('123');
  await page.getByPlaceholder('Name on card').fill('Portfolio Synthetic');
  await expect(page.getByRole('button', { name: 'Pay now' })).toBeEnabled();
  const displayed = await page.locator('.bchk-total').innerText();
  const placed = page.waitForResponse((response) => response.url().endsWith('/checkout/place-order') && response.request().method() === 'POST');
  const initialized = page.waitForResponse((response) => response.url().endsWith('/payments/initialize') && response.request().method() === 'POST');
  const paid = page.waitForResponse((response) => /\/payments\/mock\/[^/]+\/complete$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Pay now' }).click();
  const response = await placed;
  expect(response.status()).toBe(201);
  const order = (await response.json()).order;
  for (const field of ['cardNumber', 'exp', 'cvc', 'cardName']) expect(response.request().postDataJSON()).not.toHaveProperty(field);
  expect(response.request().headers()['idempotency-key']).toMatch(/^altura-order-/);
  const payment = await initialized;
  expect(payment.status()).toBe(201);
  expect((await payment.json()).checkout.mode).toBe('mock');
  expect((await paid).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Order received.' })).toBeVisible();
  expect(displayed).toContain('EGP'); expect(displayed).not.toContain('$');
  expect(Number(displayed.replace(/[^\d.]/g, ''))).toBe(order.totals.grandTotal);
  return order;
}
async function evidence(name: string, value: unknown) {
  await test.info().attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}

test('liveness, commerce readiness and metadata agree on the configured local origin', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ liveness: 'ok', commerceReady: true, backend: 'ready', catalog: 'ready' });
  expect((await request.get('/api/health?probe=liveness')).status()).toBe(200);
  const robots = await (await request.get('/robots.txt')).text();
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(robots).toContain('http://127.0.0.1:3100/sitemap.xml');
  expect(sitemap).toContain('<loc>http://127.0.0.1:3100');
  expect(robots + sitemap).not.toContain('localhost:3000');
  for (const route of ['/', '/collections/shopall', '/products/summit-shorts']) {
    await page.goto(route);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `http://127.0.0.1:3100${route === '/' ? '' : route}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `http://127.0.0.1:3100${route === '/' ? '' : route}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'http://127.0.0.1:3100/opengraph-image.jpg');
    expect(await page.locator('[data-commerce-degraded]').count()).toBe(0);
  }
});

test('guest quote invalidation, late responses, EGP total and mock order snapshot remain consistent', async ({ page, browser }) => {
  test.setTimeout(120000);
  test.skip(!credentials(), 'BLOCKED: private synthetic admin credentials are required for bounded discount verification');
  const db = database();
  const adminContext = await browser.newContext({ baseURL: test.info().project.use.baseURL as string });
  const admin = await adminContext.newPage();
  const token = await loginAdmin(admin);
  const code = `G${randomBytes(5).toString('hex').toUpperCase()}`;
  const discount = await browserApi(admin, '/admin/discounts', 'POST', { code, type: 'PERCENTAGE', value: 10, currency: 'EGP', usageLimit: 5, active: true }, token);
  expect(discount.status).toBe(201);
  let latestQuote: any;
  const quotes: any[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/checkout/quote') && response.ok()) {
      const data = await response.json().catch(() => null);
      if (data) {
        const input = JSON.parse(response.request().postData() || '{}');
        if (input.shippingAddress.line1 !== 'Old delayed address') latestQuote = data;
        quotes.push({ address: input.shippingAddress.line1, shipping: data.shipping.code, totals: data.totals });
      }
    }
  });
  try {
    const variant = await addProduct(page);
    await page.getByRole('button', { name: 'Close cart' }).click();
    await page.getByRole('button', { name: 'Save to wishlist' }).click();
    await expect(page.getByRole('status')).toContainText('Saved to your wishlist');
    const cartBefore = await browserApi(page, '/cart');
    expect(cartBefore.body.items[0].variantId).toBe(variant.id);
    await page.goto('/checkout');
    await expect(page.locator('.bchk-total')).toContainText('Awaiting quote');
    await expect(page.locator('.bchk-totals')).not.toContainText('Free');
    await checkoutAddress(page, `phase2g-guest-${randomUUID()}@example.invalid`);
    expect(latestQuote.currency).toBe('EGP');
    expect(Number((await page.locator('.bchk-total').innerText()).replace(/[^\d.]/g, ''))).toBe(latestQuote.totals.grandTotal);

    // Delay genuine responses only; the quote body/prices still come from NestJS.
    let delayed = 0;
    await page.route('**/checkout/quote', async (route) => {
      const response = await route.fetch();
      if (JSON.parse(route.request().postData() || '{}').shippingAddress.line1 === 'Old delayed address') {
        delayed++; await new Promise((resolve) => setTimeout(resolve, 1600));
      }
      await route.fulfill({ response });
    });
    await page.getByPlaceholder('Address', { exact: true }).fill('Old delayed address');
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'pending');
    await expect.poll(() => delayed).toBe(1);
    await page.getByPlaceholder('Address', { exact: true }).fill('Current verified address');
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
    const express = page.locator('.bchk-shipRow').filter({ hasText: /express/i });
    await express.click();
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'pending');
    await expect(page.locator('.bchk-total')).toContainText('Awaiting quote');
    await expect(page.getByRole('button', { name: 'Pay now' })).toBeDisabled();
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
    await page.waitForTimeout(1800);
    await expect(page.locator('.bchk-total')).toContainText(`EGP ${latestQuote.totals.grandTotal}`);
    const expressQuote = latestQuote;
    expect(expressQuote.shipping.code.toLowerCase()).toContain('express');
    await page.unroute('**/checkout/quote');
    await page.getByRole('link', { name: 'Cart', exact: true }).click();
    await page.getByRole('button', { name: /Increase .* quantity/ }).click();
    await expect(page.locator('.cart-qty span').first()).toHaveText('2');
    await checkoutAddress(page, `phase2g-guest-${randomUUID()}@example.invalid`);
    expect(latestQuote.items[0].quantity).toBe(2);
    await page.locator('.bchk-shipRow').filter({ hasText: /express/i }).click();
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
    const beforeDiscount = latestQuote;
    await page.getByPlaceholder('Discount code', { exact: true }).fill(code);
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'pending');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
    await expect.poll(() => latestQuote.totals.discountTotal).toBeGreaterThan(0);
    expect(latestQuote.totals.discountTotal).toBeGreaterThan(0);
    expect(latestQuote.totals.grandTotal).toBeLessThan(beforeDiscount.totals.grandTotal);
    await page.getByRole('button', { name: 'Remove discount', exact: true }).click();
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'pending');
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
    expect(latestQuote.totals.discountTotal).toBe(0);
    await page.getByPlaceholder('Discount code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.locator('.bchk-totals')).toHaveAttribute('data-quote-status', 'current');
    await expect.poll(() => latestQuote.totals.discountTotal).toBeGreaterThan(0);
    const authoritative = latestQuote;
    const order = await pay(page);
    expect(order.totals).toEqual(authoritative.totals);
    const saved = await db.order.findUnique({ where: { orderNumber: order.orderNumber }, include: { payments: true, items: true, addresses: true } });
    expect(saved.status).toBe('CONFIRMED'); expect(saved.currency).toBe('EGP');
    expect(saved.payments[0]).toMatchObject({ provider: 'MOCK', status: 'PAID' });
    expect(Number(saved.grandTotal)).toBe(authoritative.totals.grandTotal);
    expect(saved.addresses.find((address: any) => address.type === 'SHIPPING').line1).toBe('17 Phase 2G Test Street');
    const guestCookie = (await page.context().cookies(api)).find((cookie) => cookie.name === 'altura_guest');
    expect(guestCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    await page.reload(); await expect(page.getByRole('heading', { name: 'Order received.' })).toBeVisible();
    await evidence('guest-order-and-quote', { orderNumber: order.orderNumber, currency: saved.currency, totals: authoritative.totals, quotes, cookie: { httpOnly: guestCookie?.httpOnly, sameSite: guestCookie?.sameSite }, lateQuoteIgnored: true });
  } finally {
    await browserApi(admin, `/admin/discounts/${discount.body.id}`, 'PATCH', { active: false }, token);
    await adminContext.close(); await db.$disconnect();
  }
});

test('nonexistent confirmation never displays successful order wording, including lookup in progress', async ({ page }) => {
  await page.route('**/orders/guest/lookup', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({ response });
  });
  await page.goto('/order-confirmation/ALT-NONEXISTENT-PHASE2G?email=missing%40example.invalid');
  await expect(page.getByRole('heading', { name: 'Verifying your order…' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order received.' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Order could not be verified.' })).toBeVisible();
  await expect(page.locator('.confirmation-note[role="alert"]')).toContainText("We couldn't find that order or return.");
});

test('clean customer and admin demo reaches delivered, eligible return, mock refund and consistent database states', async ({ page, browser }) => {
  test.setTimeout(180000);
  test.skip(!credentials(), 'BLOCKED: private synthetic admin credentials are required');
  const db = database();
  const adminContext = await browser.newContext({ baseURL: test.info().project.use.baseURL as string });
  const admin = await adminContext.newPage();
  try {
    const email = `phase2g-customer-${randomUUID()}@example.invalid`;
    const password = `Local2G!${randomBytes(15).toString('hex')}`;
    await page.goto('/account/register');
    await page.locator('#balmoral-email').fill(email);
    await page.getByLabel('First name', { exact: true }).fill('Portfolio');
    await page.getByLabel('Last name', { exact: true }).fill('Customer');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    const registered = page.waitForResponse((response) => response.url().endsWith('/auth/register') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const registration = await registered;
    expect(registration.status()).toBe(201);
    const user = (await registration.json()).user;
    await expect(page).toHaveURL(/\/account(?:\/orders)?$/);
    await page.goto('/account/profile');
    await expect(page.getByText('Unavailable in this local demo. Marketing preferences are not saved.')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const address = page.getByRole('dialog', { name: 'Add address' });
    await address.getByPlaceholder('First name').fill('Portfolio'); await address.getByPlaceholder('Last name').fill('Customer');
    await address.getByPlaceholder('Address', { exact: true }).fill('19 Phase 2G Local Avenue'); await address.getByPlaceholder('City').fill('Cairo');
    await address.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.balmoral-profile__card--addr').filter({ hasText: '19 Phase 2G Local Avenue' })).toBeVisible();
    expect(await db.address.count({ where: { userId: user.id, line1: '19 Phase 2G Local Avenue', countryCode: 'EG' } })).toBe(1);
    const loggedOut = page.waitForResponse((response) => response.url().endsWith('/auth/logout') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign out' }).click(); expect((await loggedOut).status()).toBe(204);
    await expect(page.locator('#balmoral-email')).toBeVisible();
    await page.goto('/account/login'); await page.locator('#balmoral-email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const signedIn = page.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); expect((await signedIn).status()).toBe(200);
    await expect(page).toHaveURL(/\/account(?:\/orders)?$/);
    const refreshed = page.waitForResponse((response) => response.url().endsWith('/auth/refresh') && response.request().method() === 'POST');
    await page.reload(); expect((await refreshed).status()).toBe(200);
    const cookie = (await page.context().cookies(api + '/auth')).find((item) => item.name === 'altura_refresh');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    await page.goto('/account/profile');
    await expect(page.getByText('Unavailable in this local demo. Marketing preferences are not saved.')).toBeVisible();
    await addProduct(page); await page.getByRole('button', { name: 'Close cart' }).click();
    await page.getByRole('button', { name: 'Save to wishlist' }).click();
    await expect(page.getByRole('status')).toContainText('Saved to your wishlist');
    expect(await db.wishlistItem.count({ where: { wishlist: { userId: user.id } } })).toBe(1);
    await checkoutAddress(page, email); const order = await pay(page);
    await page.goto('/account/orders'); await expect(page.locator('.balmoral-orders__row').filter({ hasText: order.orderNumber })).toBeVisible();
    await page.goto(`/order-confirmation/${order.orderNumber}`);
    await expect(page.getByRole('heading', { name: 'Order received.' })).toBeVisible();

    const adminToken = await loginAdmin(admin);
    expect((await browserApi(admin, `/admin/orders/${order.orderNumber}/collect-cash`, 'POST', {}, adminToken)).status).toBe(409);
    // Direct real-browser API negatives verify the role/transition boundary.
    const anonymous = await browserApi(page, `/admin/orders/${order.orderNumber}/workflow`, 'PATCH', { status: 'DELIVERED' });
    expect(anonymous.status).toBe(401);
    const skip = await browserApi(admin, `/admin/orders/${order.orderNumber}/workflow`, 'PATCH', { status: 'DELIVERED' }, adminToken);
    expect(skip.status).toBe(409);
    const before = await db.order.findUnique({ where: { orderNumber: order.orderNumber }, include: { shipments: true } });
    expect(before.status).toBe('CONFIRMED'); expect(before.shipments[0].status).toBe('PENDING');
    await page.goto(`/start-a-return?order=${order.orderNumber}`); await page.getByRole('button', { name: 'Load order →' }).click();
    await expect(page.getByText('Returns become available after an order is marked delivered.')).toBeVisible();
    await admin.goto(`/admin/customers/${user.id}`); await expect(admin.getByText(email, { exact: true }).first()).toBeVisible();
    await expect(admin.getByText('Order value · EGP only', { exact: true })).toBeVisible();
    await admin.goto('/admin/inventory'); await expect(admin.locator('.admin-table tbody tr').first()).toBeVisible();
    await admin.goto(`/admin/orders/${order.orderNumber}`);
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      if (status === 'SHIPPED') {
        await expect(admin.getByRole('button', { name: 'Mark as shipped →', exact: true })).toBeDisabled();
        const missing = await browserApi(admin, `/admin/orders/${order.orderNumber}/workflow`, 'PATCH', { status }, adminToken); expect(missing.status).toBe(409);
        await admin.getByLabel('Tracking number').fill(`LOCAL-${order.orderNumber}`); await admin.getByLabel('Carrier label').fill('Synthetic local fulfillment');
      }
      const changed = admin.waitForResponse((response) => response.url().endsWith(`/orders/${order.orderNumber}/workflow`) && response.request().method() === 'PATCH');
      const action = status === 'PROCESSING' ? 'Mark as preparing →' : status === 'SHIPPED' ? 'Mark as shipped →' : 'Mark as delivered →';
      await admin.getByRole('button', { name: action, exact: true }).click(); expect((await changed).status()).toBe(200);
      const saved = await db.order.findUnique({ where: { orderNumber: order.orderNumber }, include: { shipments: true } });
      expect(saved.status).toBe(status);
      if (status !== 'PROCESSING') expect(saved.shipments[0].status).toBe(status);
    }
    await page.goto(`/account/orders/${order.orderNumber}`); await expect(page.getByRole('heading', { name: 'Delivered' })).toBeVisible();
    await page.goto(`/start-a-return?order=${order.orderNumber}`); await page.getByRole('button', { name: 'Load order →' }).click();
    await page.locator('.returns-item-check').first().click();
    const submitted = page.waitForResponse((response) => response.url().endsWith('/returns') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Request return →' }).click();
    const response = await submitted; expect(response.status()).toBe(201); const request = await response.json();
    await expect(page.getByRole('status')).toContainText('Your return request has been submitted');
    await admin.goto('/admin/returns');
    const row = admin.locator('tbody tr').filter({ hasText: request.id });
    await expect(row).toBeVisible();
    const transitions = [['APPROVED', 'Approve'], ['IN_TRANSIT', 'Mark in transit'], ['RECEIVED', 'Mark received'], ['REFUNDED', 'Issue refund'], ['CLOSED', 'Close']];
    for (const [status, label] of transitions) {
      const change = admin.waitForResponse((candidate) => candidate.url().endsWith(`/admin/returns/${request.id}`) && candidate.request().method() === 'PATCH');
      await row.getByRole('button', { name: label, exact: true }).click();
      const changed = await change;
      expect(changed.status(), `${status}: ${JSON.stringify(await changed.json())}`).toBe(200);
      await expect(row.locator('.admin-status')).toHaveText(status.replaceAll('_', ' '));
    }
    const savedReturn = await db.returnRequest.findUnique({ where: { id: request.id }, include: { items: true } });
    const savedOrder = await db.order.findUnique({ where: { orderNumber: order.orderNumber }, include: { payments: true, shipments: true, items: true } });
    expect(savedReturn.status).toBe('CLOSED'); expect(Number(savedReturn.refundAmount)).toBe(Number(savedOrder.items[0].lineTotal));
    expect(savedOrder.payments[0]).toMatchObject({ provider: 'MOCK', status: 'PARTIALLY_REFUNDED' });
    expect(savedOrder.status).toBe('PARTIALLY_REFUNDED'); expect(savedOrder.shipments[0].status).toBe('DELIVERED');
    expect(savedOrder.shipments[0].shippedAt).toBeTruthy(); expect(savedOrder.shipments[0].deliveredAt).toBeTruthy();
    const duplicateRefund = await browserApi(admin, `/admin/returns/${request.id}`, 'PATCH', { status: 'REFUNDED' }, adminToken); expect(duplicateRefund.status).toBe(409);
    expect(await db.paymentWebhookEvent.count({ where: { externalEventId: `admin-return-refund:${request.id}` } })).toBe(1);
    await page.reload(); await expect(page.locator('.return-history-row').filter({ hasText: order.orderNumber })).toContainText('Closed');
    const dashboard = await browserApi(admin, '/admin/dashboard', 'GET', undefined, adminToken); expect(dashboard.status).toBe(200);
    const sum = await db.payment.aggregate({ where: { currency: 'EGP', status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, OR: [{ provider: { not: 'CASH_ON_DELIVERY' }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, { provider: 'CASH_ON_DELIVERY', paidAt: { gte: new Date(Date.now() - 30 * 86400000) } }] }, _sum: { amount: true, refundedAmount: true } });
    expect(dashboard.body.currency).toBe('EGP'); expect(dashboard.body.metrics.netRevenue30d).toBe(Number(sum._sum.amount) - Number(sum._sum.refundedAmount));
    await admin.goto('/admin'); await expect(admin.getByText('30 day net revenue · EGP only')).toBeVisible();
    await admin.goto('/admin/audit'); await expect(admin.locator('tbody tr').filter({ hasText: 'ORDER STATUS UPDATED' }).filter({ hasText: order.orderNumber }).first()).toBeVisible();
    expect(await db.auditLog.count({ where: { entityId: savedOrder.id, action: 'ORDER_STATUS_UPDATED' } })).toBe(3);
    expect(await db.auditLog.count({ where: { entityId: request.id, action: 'RETURN_STATUS_UPDATED' } })).toBe(5);
    await evidence('customer-fulfillment-return', { orderNumber: order.orderNumber, userId: user.id, returnId: request.id, orderStatus: savedOrder.status, shipmentStatus: savedOrder.shipments[0].status, paymentStatus: savedOrder.payments[0].status, captured: Number(savedOrder.payments[0].amount), refund: Number(savedReturn.refundAmount), returnStatus: savedReturn.status, refundEventCount: 1, egpRevenue: dashboard.body.metrics.netRevenue30d });
  } finally { await adminContext.close(); await db.$disconnect(); }
});

test('customer tokens cannot mutate the admin-only local fulfillment workflow', async ({ page, browser }) => {
  const db = database();
  const accountContext = await browser.newContext({ baseURL: test.info().project.use.baseURL as string });
  const account = await accountContext.newPage();
  let userId: string | undefined;
  try {
    await account.goto('/');
    const email = `phase2g-role-${randomUUID()}@example.invalid`;
    const password = `LocalRole!${randomBytes(14).toString('hex')}`;
    const registered = await browserApi(account, '/auth/register', 'POST', { email, password, firstName: 'Local', lastName: 'RoleFixture' });
    expect(registered.status).toBe(201); userId = registered.body.user.id;
    const target = await db.order.findFirst({ where: { email: { startsWith: 'phase2g-customer-' }, currency: 'EGP' }, orderBy: { createdAt: 'desc' }, select: { orderNumber: true } });
    expect(target).toBeTruthy();
    const path = `/admin/orders/${target.orderNumber}/workflow`;
    expect((await browserApi(account, path, 'PATCH', { status: 'PROCESSING' }, registered.body.accessToken)).status).toBe(403);
    await evidence('fulfillment-roles', { customerDenied: 403, adminMutationRequired: true, fixtureUserId: userId });
  } finally {
    await accountContext.close(); await db.$disconnect();
  }
});
