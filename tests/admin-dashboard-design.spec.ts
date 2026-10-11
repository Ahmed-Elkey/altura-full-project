import { test, expect, type Page, type Route } from '@playwright/test';
const admin = { id: 'design-admin', email: 'admin@example.invalid', firstName: 'Admin', lastName: 'Design', role: 'ADMIN', status: 'ACTIVE' };
const dashboard = { generatedAt: '2026-10-07T12:00:00Z', currency: 'EGP', revenueScope: 'Paid EGP orders only', metrics: { customers: 12, activeProducts: 8, ordersToday: 2, paymentReview: 1, netRevenue30d: 1250, grossRevenue30d: 1300, refunded30d: 50, totalOrders: 10, pendingOrders: 2, confirmedPreparingOrders: 3, shippedOrders: 2, deliveredOrders: 3, lowStockSkus: 4, outOfStockSkus: 1, totalSkuRecords: 20, physicalUnits: 100, reservedUnits: 5, availableUnits: 95 }, ordersByStatus: { PENDING: 2, CONFIRMED: 3, SHIPPED: 2, DELIVERED: 3 }, recentOrders: [{ id: 'order-1', orderNumber: 'ALT-DESIGN-1', email: 'shopper@example.invalid', status: 'CONFIRMED', total: 100, currency: 'EGP', itemCount: 1, paymentStatus: 'PENDING', paymentProvider: 'CASH_ON_DELIVERY', createdAt: '2026-10-07T11:00:00Z' }] };
async function setup(page: Page, mode: 'normal' | 'error' | 'empty' | 'customer' = 'normal') {
  let calls = 0;
  let totalOrders = 10;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:4000/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true' };
    const reply = async (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(data) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST' } });
    if (path === '/auth/refresh') return reply(200, { user: { ...admin, role: mode === 'customer' ? 'CUSTOMER' : 'ADMIN' }, accessToken: 'design-token' });
    if (path === '/admin/dashboard') {
      calls++;
      if (mode === 'error' && calls === 1) return reply(503, { message: 'private database stack' });
      return reply(200, mode === 'empty' ? { ...dashboard, recentOrders: [], ordersByStatus: {} } : { ...dashboard, metrics: { ...dashboard.metrics, totalOrders } });
    }
    if (path === '/cart') return reply(200, { currency: 'EGP', items: [], subtotal: 0, issues: [] });
    return reply(200, []);
  });
  return { errors, update: () => { totalOrders = 11; } };
}
test('admin dashboard shares customer fonts and cards while keeping metrics and links', async ({ page }) => {
  const { errors, update } = await setup(page);
  await page.goto('/admin');
  const title = page.getByRole('heading', { name: 'Dashboard', exact: true });
  await expect(title).toBeVisible();
  expect(await title.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Inter/);
  await expect(page.locator('.admin-metric').nth(1).locator('strong')).toHaveText('10');
  expect(await page.locator('.admin-metric').first().evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(0);
  expect(await page.locator('.admin-metric strong').first().evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Inter/);
  await expect(page.getByRole('link', { name: 'ALT-DESIGN-1', exact: true })).toHaveAttribute('href', '/admin/orders/ALT-DESIGN-1');
  update();
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('.admin-metric').nth(1).locator('strong')).toHaveText('11');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole('navigation', { name: 'ALTURA Studio' }).getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`dashboard-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
test('dashboard error can retry without exposing technical messages', async ({ page }) => {
  await setup(page, 'error');
  await page.goto('/admin');
  await expect(page.locator('.admin-error')).toBeVisible();
  await expect(page.locator('.admin-error')).not.toContainText('private database');
  await page.getByRole('button', { name: 'Retry →', exact: true }).click();
  await expect(page.getByRole('link', { name: 'ALT-DESIGN-1', exact: true })).toBeVisible();
});
test('empty dashboard has an explicit recent-orders state', async ({ page }) => {
  await setup(page, 'empty');
  await page.goto('/admin');
  await expect(page.getByText('No orders yet.', { exact: true })).toBeVisible();
  await expect(page.getByText('No order states recorded yet.', { exact: true })).toBeVisible();
});
test('customer cannot see dashboard data', async ({ page }) => {
  await setup(page, 'customer');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/account\/login/);
  await expect(page.locator('.admin-metric')).toHaveCount(0);
});
