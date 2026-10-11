import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { selectAvailableVariant } from './helpers/catalog';

// Credentials and card placeholders must never enter retained traces/screenshots.
test.use({ screenshot: 'off', trace: 'off', actionTimeout: 15000, navigationTimeout: 30000 });
const api = 'http://127.0.0.1:4000/api/v1';
function database() {
  const url = new URL(process.env.DATABASE_URL || '');
  const packageQa = process.env.ALTURA_PACKAGE_QA === '1';
  const expected = packageQa ? { port: '5434', path: '/altura_friend' } : { port: '5433', path: '/altura_dev' };
  if (url.hostname !== '127.0.0.1' || url.port !== expected.port || url.pathname !== expected.path) throw new Error('COD QA requires the explicitly selected isolated QA database.');
  const { PrismaClient } = require('../backend/node_modules/@prisma/client');
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}
function credentials() {
  const file = process.env.ALTURA_TEST_CREDENTIALS_PATH;
  if (!file || !existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const value = raw.accounts ? { adminEmail: raw.accounts.admin?.email, adminPassword: raw.accounts.admin?.password } : raw;
  return value.adminEmail && value.adminPassword ? value : null;
}
async function browserApi(page: Page, path: string, method = 'GET', body?: unknown, token?: string) {
  return page.evaluate(async ({ api, path, method, body, token }) => {
    const response = await fetch(api + path, { method, credentials: 'include', headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(path === '/payments/initialize' ? { 'Idempotency-Key': crypto.randomUUID() } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

test('real COD placement, collection, revenue, fulfillment, return and concurrent collection', async ({ page, browser }) => {
  test.setTimeout(240000);
  test.skip(!credentials(), 'BLOCKED: private admin credentials missing');
  const db = database();
  const adminContext = await browser.newContext({ baseURL: test.info().project.use.baseURL as string });
  const admin = await adminContext.newPage();
  const facts: Record<string, unknown> = {};
  try {
    const privateFile = process.env.ALTURA_COD_CUSTOMER_FILE || 'runtime/test-cod-customer.json';
    const savedCredentials = existsSync(privateFile) ? JSON.parse(readFileSync(privateFile, 'utf8')) : null;
    const email = savedCredentials?.email ?? `cod-customer-${randomUUID()}@example.invalid`;
    const password = savedCredentials?.password ?? `LocalCOD!${randomBytes(15).toString('hex')}`;
    await page.goto(savedCredentials ? '/account/login' : '/account/register');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    if (!savedCredentials) {
      await page.getByLabel('First name', { exact: true }).fill('Cash');
      await page.getByLabel('Last name', { exact: true }).fill('Synthetic');
      await page.getByLabel('Confirm password', { exact: true }).fill(password);
    }
    const authPath = savedCredentials ? '/auth/login' : '/auth/register';
    const authenticating = page.waitForResponse(r => r.url().endsWith(authPath) && r.request().method() === 'POST');
    await page.getByRole('button', { name: savedCredentials ? 'Sign in' : 'Create account', exact: true }).click();
    const authenticated = await authenticating;
    expect(authenticated.status()).toBe(savedCredentials ? 200 : 201);
    const registered = { body: await authenticated.json() };
    expect(registered.body.user.role).toBe('CUSTOMER');
    writeFileSync(privateFile, JSON.stringify({ email, password }));
    const customerToken = registered.body.accessToken;
    await expect(page).toHaveURL(/\/account(?:\/orders)?$/);
    const adminToken = await loginAdmin(admin);
    const oldCart = await browserApi(page, '/cart', 'GET', undefined, customerToken);
    for (const item of oldCart.body.items) expect((await browserApi(page, '/cart/items/' + item.id, 'DELETE', undefined, customerToken)).status).toBe(200);
    const variant = await addProduct(page); await page.getByRole('button', { name: 'Close cart' }).click();
    const beforeInventory = await db.inventory.findUnique({ where: { variantId: variant.id } });
    await checkoutAddress(page, email);
    await expect(page.getByRole('radio', { name: 'Credit / Debit Card', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Pay now' }).click();
    await expect(page.getByText('Enter a card number', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Cash on Delivery', exact: true }).check();
    await expect(page.getByPlaceholder('Card number')).toHaveCount(0);
    await expect(page.getByText('Enter a card number', { exact: true })).toHaveCount(0);
    const responsive: unknown[] = [];
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole('radio', { name: 'Cash on Delivery', exact: true })).toBeVisible();
      expect(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(-12).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })) }))).toMatchObject({ width, scroll: width });
      await page.getByRole('radio', { name: 'Credit / Debit Card', exact: true }).check();
      await expect(page.getByPlaceholder('Card number')).toBeVisible();
      await page.getByRole('radio', { name: 'Credit / Debit Card', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radio', { name: 'Cash on Delivery', exact: true })).toBeChecked();
      await expect(page.getByPlaceholder('Security code')).toHaveCount(0);
      responsive.push({ width, noOverflow: true, keyboardRadios: true });
    }
    let paymentRequests = 0;
    page.on('request', request => { if (request.url().includes('/payments/')) paymentRequests++; });
    const placed = page.waitForResponse(r => r.url().endsWith('/checkout/place-order') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Place order', exact: true }).click();
    const placement = await placed; expect(placement.status()).toBe(201);
    const order = (await placement.json()).order;
    const placementPayload = placement.request().postDataJSON();
    for (const field of ['cardNumber', 'exp', 'cvc', 'cardName']) expect(placementPayload).not.toHaveProperty(field);
    const placementKey = placement.request().headers()['idempotency-key'];
    await expect(page).toHaveURL(/\/order-confirmation\//);
    await expect(page.getByText('Cash on Delivery · Payment due on delivery')).toBeVisible();
    expect(paymentRequests).toBe(0);
    const paymentRequestsDuringPlacement = paymentRequests;
    const saved = await db.order.findUnique({ where: { orderNumber: order.orderNumber }, include: { payments: true, items: true } });
    const payment = saved.payments[0];
    expect(saved.status).toBe('CONFIRMED'); expect(saved.inventoryCommittedAt).toBeTruthy(); expect(saved.reservationExpiresAt).toBeNull();
    expect(saved.payments).toHaveLength(1); expect(payment).toMatchObject({ provider: 'CASH_ON_DELIVERY', status: 'PENDING', paidAt: null, currency: 'EGP' });
    expect(Number(payment.amount)).toBe(Number(saved.grandTotal)); expect(Number(payment.refundedAmount)).toBe(0);
    expect(await db.paymentWebhookEvent.count({ where: { paymentId: payment.id } })).toBe(0);
    const committedInventory = await db.inventory.findUnique({ where: { variantId: variant.id } });
    expect(committedInventory.quantity).toBe(beforeInventory.quantity - 1);
    expect(committedInventory.reservedQuantity).toBe(beforeInventory.reservedQuantity);
    expect(await db.inventoryMovement.count({ where: { referenceId: saved.id, reason: 'PURCHASE' } })).toBe(1);
    const replay = await page.evaluate(async ({ api, payload, key, token }) => {
      const r = await fetch(api + '/checkout/place-order', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      return { status: r.status, body: await r.json() };
    }, { api, payload: placementPayload, key: placementKey, token: customerToken });
    expect(replay.status, JSON.stringify({ replay: replay.body, orderUserId: saved.userId, authenticatedUserId: registered.body.user.id, placementHasAuthorization: !!placement.request().headers().authorization })).toBe(201); expect(replay.body.idempotentReplay).toBe(true);
    expect(await db.inventoryMovement.count({ where: { referenceId: saved.id, reason: 'PURCHASE' } })).toBe(1);
    await page.goto(`/account/orders/${order.orderNumber}`);
    await expect(page.getByText('Payment due on delivery', { exact: true })).toBeVisible();
    const path = `/admin/orders/${order.orderNumber}/collect-cash`;
    expect((await browserApi(page, path, 'POST', {})).status).toBe(401);
    expect((await browserApi(page, path, 'POST', {}, customerToken)).status).toBe(403);
    expect((await browserApi(admin, path, 'POST', {}, adminToken)).status).toBe(409);
    expect((await browserApi(admin, path, 'POST', { amount: 1 }, adminToken)).status).toBe(400);
    expect((await browserApi(page, '/payments/initialize', 'POST', { orderNumber: order.orderNumber }, customerToken)).status).toBe(409);
    await admin.goto(`/admin/orders/${order.orderNumber}`);
    await expect(admin.getByText('Awaiting collection', { exact: true }).first()).toBeVisible();
    const workflowLabels: Record<string, string> = { PROCESSING: 'Mark as preparing →', SHIPPED: 'Mark as shipped →', DELIVERED: 'Mark as delivered →' };
    for (const status of ['PROCESSING', 'SHIPPED']) {
      if (status === 'SHIPPED') await admin.getByLabel('Tracking number').fill(`LOCAL-${order.orderNumber}`);
      const changed = admin.waitForResponse(r => r.url().endsWith(`/orders/${order.orderNumber}/workflow`) && r.request().method() === 'PATCH');
      await admin.getByRole('button', { name: workflowLabels[status], exact: true }).click(); expect((await changed).status()).toBe(200);
      expect((await db.order.findUnique({ where: { id: saved.id } })).status).toBe(status);
    }
    expect((await browserApi(admin, `/admin/orders/${order.orderNumber}/workflow`, 'PATCH', { status: 'DELIVERED' }, adminToken)).status).toBe(409);
    const dashboardBefore = (await browserApi(admin, '/admin/dashboard', 'GET', undefined, adminToken)).body.metrics.netRevenue30d;
    for (const width of [390, 768, 1440]) {
      await admin.setViewportSize({ width, height: 1000 });
      await expect(admin.getByRole('button', { name: 'Mark cash as collected', exact: true })).toBeVisible();
      expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const collected = admin.waitForResponse(r => r.url().endsWith('/collect-cash') && r.request().method() === 'POST');
    await admin.getByRole('button', { name: 'Mark cash as collected', exact: true }).click(); expect((await collected).status()).toBe(201);
    await expect(admin.getByText('Collected', { exact: true }).first()).toBeVisible();
    const cashPaid = await db.payment.findUnique({ where: { id: payment.id } });
    expect(cashPaid.status).toBe('PAID'); expect(cashPaid.paidAt).toBeTruthy(); expect(Number(cashPaid.amount)).toBe(Number(saved.grandTotal));
    expect((await db.inventory.findUnique({ where: { variantId: variant.id } })).quantity).toBe(committedInventory.quantity);
    expect((await browserApi(admin, path, 'POST', {}, adminToken)).status).toBe(409);
    expect(await db.auditLog.count({ where: { action: 'COD_CASH_COLLECTED', entityId: payment.id } })).toBe(1);
    const dashboardAfter = (await browserApi(admin, '/admin/dashboard', 'GET', undefined, adminToken)).body.metrics.netRevenue30d;
    expect(dashboardAfter - dashboardBefore).toBeCloseTo(Number(saved.grandTotal), 2);
    const delivered = admin.waitForResponse(r => r.url().endsWith('/workflow') && r.request().method() === 'PATCH');
    await admin.getByRole('button', { name: workflowLabels.DELIVERED, exact: true }).click(); expect((await delivered).status()).toBe(200);
    await page.reload(); await expect(page.getByText('Paid', { exact: true })).toBeVisible();
    await page.goto(`/start-a-return?order=${order.orderNumber}`); await page.getByRole('button', { name: 'Load order →' }).click();
    await page.locator('.returns-item-check').first().click();
    const returning = page.waitForResponse(r => r.url().endsWith('/returns') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Request return →' }).click();
    const returnResponse = await returning; expect(returnResponse.status()).toBe(201); const returned = await returnResponse.json();
    await admin.goto('/admin/returns'); const row = admin.locator('tbody tr').filter({ hasText: returned.id });
    for (const label of ['Approve', 'Mark in transit', 'Mark received']) {
      const changed = admin.waitForResponse(r => r.url().endsWith(`/returns/${returned.id}`) && r.request().method() === 'PATCH');
      await row.getByRole('button', { name: label, exact: true }).click(); expect((await changed).status()).toBe(200);
    }
    await expect(row).toContainText('Refund required'); await expect(row.getByRole('button', { name: 'Issue refund' })).toHaveCount(0);
    expect((await browserApi(admin, `/admin/returns/${returned.id}`, 'PATCH', { status: 'REFUNDED' }, adminToken)).status).toBe(409);
    const cashAfterReturn = await db.payment.findUnique({ where: { id: payment.id } });
    expect(cashAfterReturn.status).toBe('PAID'); expect(Number(cashAfterReturn.refundedAmount)).toBe(0);
    expect(cashAfterReturn.metadata.cashRefundRequired.returnId).toBe(returned.id);
    const savedReturn = await db.returnRequest.findUnique({ where: { id: returned.id } });
    expect(savedReturn.status).toBe('RECEIVED'); expect(Number(savedReturn.refundAmount)).toBe(Number(saved.items[0].lineTotal));
    expect(await db.paymentWebhookEvent.count({ where: { paymentId: payment.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: 'COD_REFUND_REQUIRED', entityId: returned.id } })).toBe(1);
    // A second bounded cash order proves two simultaneous requests cannot both collect.
    const anotherVariant = await addProduct(page); await page.getByRole('button', { name: 'Close cart' }).click();
    await checkoutAddress(page, email); await page.getByRole('radio', { name: 'Cash on Delivery', exact: true }).check();
    const secondPlacement = page.waitForResponse(r => r.url().endsWith('/checkout/place-order') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Place order', exact: true }).click(); const second = (await (await secondPlacement).json()).order;
    await expect(page).toHaveURL(/\/order-confirmation\//);
    for (const status of ['PROCESSING', 'SHIPPED']) expect((await browserApi(admin, `/admin/orders/${second.orderNumber}/workflow`, 'PATCH', { status, ...(status === 'SHIPPED' ? { trackingNumber: `LOCAL-${second.orderNumber}` } : {}) }, adminToken)).status).toBe(200);
    const concurrent = await Promise.all([browserApi(admin, `/admin/orders/${second.orderNumber}/collect-cash`, 'POST', {}, adminToken), browserApi(admin, `/admin/orders/${second.orderNumber}/collect-cash`, 'POST', {}, adminToken)]);
    expect(concurrent.map(r => r.status).sort()).toEqual([201, 409]);
    const secondPayment = await db.payment.findFirst({ where: { order: { orderNumber: second.orderNumber } } });
    expect(await db.auditLog.count({ where: { action: 'COD_CASH_COLLECTED', entityId: secondPayment.id } })).toBe(1);
    Object.assign(facts, { orderNumber: order.orderNumber, secondOrder: second.orderNumber, customerId: registered.body.user.id, returnId: returned.id, amount: Number(saved.grandTotal), pendingRevenue: dashboardBefore, collectedRevenue: dashboardAfter, paymentRequestsDuringPlacement, totalPaymentRequestsIncludingRejectedInitialization: paymentRequests, purchaseMovements: 1, successfulCollectionAudits: 1, concurrentStatuses: concurrent.map(r => r.status), returnStatus: savedReturn.status, refundedAmount: 0, responsive, secondVariant: anotherVariant.id });
    await evidence('cod-real-database-evidence', facts);
  } finally { await adminContext.close(); await db.$disconnect(); }
});

