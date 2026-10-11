import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Synthetic display data only. Every API request is intercepted; mutations fail closed.
const timestamp = '2026-10-07T12:00:00Z';
const number = 'ALT-AUDIT-001';
const user = { id: 'audit-user', email: 'shopper@example.invalid', firstName: 'Synthetic', lastName: 'Shopper', phone: '+201000000000', role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: timestamp, lastLoginAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
const address = { id: 'audit-address', type: 'SHIPPING', recipientName: 'Synthetic Shopper', firstName: 'Synthetic', lastName: 'Shopper', phone: user.phone, line1: '17 Test Street', line2: null, city: 'Cairo', region: 'Cairo', postalCode: '11511', countryCode: 'EG', isDefault: true, isDefaultShipping: true, isDefaultBilling: true };
const order = { id: 'audit-order', orderNumber: number, email: user.email, phone: user.phone, status: 'DELIVERED', paymentMethod: 'CASH_ON_DELIVERY', paymentStatus: 'PAID', currency: 'EGP', createdAt: timestamp, placedAt: timestamp, updatedAt: timestamp, appliedCode: null, customerNote: null, internalNote: 'Synthetic display fixture', reservationExpiresAt: null, inventoryCommittedAt: timestamp, inventoryReleasedAt: null, totals: { subtotal: 400, discountTotal: 0, shippingTotal: 50, taxTotal: 0, grandTotal: 450 }, items: [{ id: 'audit-item', productId: 'audit-product', sku: 'AUDIT-BONE-S', productName: 'Synthetic Meridian Tee', colorName: 'Bone', size: 'S', productImageUrl: '/icon.svg', unitPrice: 200, quantity: 2, lineTotal: 400 }], addresses: [address], payments: [{ id: 'audit-payment', provider: 'CASH_ON_DELIVERY', status: 'PAID', amount: 450, refundedAmount: 0, currency: 'EGP', failureReason: null, paidAt: timestamp, lastWebhookAt: timestamp, createdAt: timestamp }], shipments: [{ id: 'audit-shipment', status: 'DELIVERED', carrier: 'Local', service: 'Standard', trackingNumber: 'AUDIT-TRACK-001', trackingUrl: null, shippedAt: timestamp, deliveredAt: timestamp }], customer: user, statusHistory: [], webhookEvents: [] };
const inventory = { quantity: 8, reservedQuantity: 0, availableQuantity: 8, lowStockThreshold: 3 };
const product = { id: 'audit-product', slug: 'synthetic-meridian', name: 'Synthetic Meridian Tee', shortDescription: 'Synthetic fixture', description: 'Synthetic product for display verification.', status: 'ACTIVE', basePrice: 200, compareAtPrice: null, currency: 'EGP', featured: false, inStock: true, updatedAt: timestamp, images: [{ id: 'audit-image', url: '/icon.svg', altText: 'Synthetic fixture', colorName: 'Bone', view: 'front', isPrimary: true, position: 0 }], colorways: [{ name: 'Bone', hex: '#ded8ca' }], variants: [{ id: 'audit-variant', sku: 'AUDIT-BONE-S', colorName: 'Bone', colorHex: '#ded8ca', size: 'S', price: 200, currency: 'EGP', active: true, inventory }], categories: [], collections: [] };
const customer = { ...user, orderCount: 1, lifetimeValue: 450, addresses: [address], orders: [order] };
const dashboard = { generatedAt: timestamp, currency: 'EGP', revenueScope: 'Paid EGP orders only', metrics: { customers: 12, activeProducts: 8, ordersToday: 2, paymentReview: 1, netRevenue30d: 1250, grossRevenue30d: 1300, refunded30d: 50, totalOrders: 10, pendingOrders: 2, confirmedPreparingOrders: 3, shippedOrders: 2, deliveredOrders: 3, lowStockSkus: 4, outOfStockSkus: 1, totalSkuRecords: 20, physicalUnits: 100, reservedUnits: 5, availableUnits: 95 }, ordersByStatus: { DELIVERED: 1 }, recentOrders: [{ ...order, total: 450, itemCount: 2, paymentStatus: 'PAID', paymentProvider: 'CASH_ON_DELIVERY' }] };

async function fixtures(page: Page, role: 'CUSTOMER' | 'ADMIN') {
  const errors: string[] = [];
  const unexpected: string[] = [];
  const calls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/health**', route => route.fulfill({ json: { status: 'ok', commerceReady: true, backend: 'ready', catalog: 'ready' } }));
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const headers = { 'Access-Control-Allow-Origin': new URL(process.env.ALTURA_BASE_URL || 'http://127.0.0.1:3100').origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push(path + url.search);
    if (request.method() !== 'GET' && path !== '/auth/refresh') {
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 405, headers, json: { message: 'Mutation blocked by display audit' } });
    }
    const currentPage = Number(url.searchParams.get('page') || 1);
    const paginated = { page: currentPage, limit: 20, total: 21, pages: 2, totalPages: 2 };
    let data: unknown;
    if (path === '/auth/refresh') data = { user: { ...user, role }, accessToken: 'synthetic-display-token' };
    else if (path === '/users/me') data = user;
    else if (path === '/users/me/addresses') data = [address];
    else if (path === '/cart') data = { currency: 'EGP', items: [], itemCount: 0, subtotal: 0, issues: [] };
    else if (path === '/wishlist') data = { itemCount: 0, items: [] };
    else if (path === '/orders') data = { ...paginated, orders: [{ ...order, orderNumber: currentPage === 1 ? number : 'ALT-AUDIT-002' }] };
    else if (path.startsWith('/orders/')) data = order;
    else if (path === '/admin/dashboard') data = dashboard;
    else if (path === '/admin/orders') data = { ...paginated, orders: [{ ...order, orderNumber: currentPage === 1 ? number : 'ALT-AUDIT-002' }] };
    else if (path.startsWith('/admin/orders/')) data = order;
    else if (path === '/admin/catalog/products') data = { ...paginated, items: [product] };
    else if (path.startsWith('/admin/catalog/products/')) data = product;
    else if (['/catalog/categories', '/catalog/collections', '/admin/catalog/categories', '/admin/catalog/collections'].includes(path)) data = [];
    else if (path === '/admin/inventory') data = { ...paginated, items: [{ ...inventory, id: 'audit-inventory', variantId: 'audit-variant', sku: 'AUDIT-BONE-S', colorName: 'Bone', size: 'S', variantActive: true, product, lowStock: false, updatedAt: timestamp }] };
    else if (path === '/admin/customers') data = { ...paginated, customers: [customer] };
    else if (path.startsWith('/admin/customers/')) data = customer;
    else if (path === '/admin/discounts') data = [{ id: 'audit-discount', code: 'AUDIT20', type: 'PERCENTAGE', value: 20, currency: 'EGP', active: true, minimumSubtotal: null, maximumDiscount: null, usageCount: 0, usageLimit: 10, perCustomerLimit: 1, startsAt: null, endsAt: null }];
    else if (path === '/admin/payments/review') data = { total: 1, orders: [{ ...order, status: 'PAYMENT_REVIEW' }], failedWebhooks: [] };
    else if (path === '/admin/returns') data = [{ id: 'audit-return', status: 'REQUESTED', reason: 'Size does not fit', notes: null, refundAmount: null, paymentMethod: 'CASH_ON_DELIVERY', cashRefundRequired: false, createdAt: timestamp, order: { ...order, grandTotal: 450 }, user, items: order.items }];
    else if (path === '/admin/shipping') data = [{ id: 'audit-zone', name: 'Egypt', countries: ['EG'], active: true, methods: [{ id: 'audit-method', code: 'LOCAL', name: 'Local delivery', currency: 'EGP', price: 50, freeAbove: 1000, estimatedMinDays: 2, estimatedMaxDays: 4, active: true }] }];
    else if (path === '/admin/audit') data = [{ id: 'audit-entry', action: 'ORDER_DELIVERED', entityType: 'ORDER', entityId: 'audit-order', metadata: { status: 'DELIVERED' }, createdAt: timestamp, actor: { ...user, role: 'ADMIN' } }];
    else { unexpected.push(`GET ${path}`); return route.fulfill({ status: 404, headers, json: { message: 'Missing audit fixture' } }); }
    await route.fulfill({ headers, json: data });
  });
  return { errors, unexpected, calls };
}

const customerRoutes = ['/account', '/account/profile', '/account/security', '/account/orders', `/account/orders/${number}`];
const adminRoutes = ['/admin', '/admin/orders', `/admin/orders/${number}`, '/admin/products', '/admin/products/audit-product', '/admin/inventory', '/admin/customers', '/admin/customers/audit-user', '/admin/discounts', '/admin/payments', '/admin/returns', '/admin/shipping', '/admin/audit'];
for (const width of [1440, 768, 390]) {
  test.describe(`protected route audit at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const route of [...customerRoutes, ...adminRoutes]) {
      test(`${route} uses Inter and contains its content`, async ({ page }) => {
        const state = await fixtures(page, route.startsWith('/admin') ? 'ADMIN' : 'CUSTOMER');
        await page.goto(route);
        const loaded = route === '/account/profile' ? page.locator('.balmoral-profile__card').first() : route === '/account/security' ? page.getByRole('heading', { name: 'Keep your account yours.' }) : route === '/account' || route === '/account/orders' ? page.getByRole('link', { name: new RegExp(number) }).first() : route.startsWith('/account/orders/') ? page.getByRole('heading', { name: 'Order details', exact: true }) : page.locator('.admin-page-heading h1, .customer-admin__heading h1').first();
        await expect(loaded).toBeVisible();
        if (route.startsWith('/admin')) {
          await expect.poll(() => state.calls.some(call => call.startsWith(route === '/admin' ? '/admin/dashboard' : route.startsWith('/admin/products') ? '/admin/catalog/products' : route.startsWith('/admin/payments') ? '/admin/payments/review' : route))).toBe(true);
          await expect(page.locator('.admin-table-loading')).toHaveCount(0);
        }
        await page.evaluate(() => document.fonts.ready);
        const headings = page.locator('h1:visible, h2:visible');
        for (let index = 0; index < await headings.count(); index++) {
          const heading = headings.nth(index);
          expect.soft(await heading.evaluate(el => getComputedStyle(el).fontFamily), `${route} heading: ${await heading.textContent()}`).toMatch(/Inter/i);
        }
        expect.soft(await page.evaluate(() => document.documentElement.scrollWidth), `${route} root overflow`).toBeLessThanOrEqual(width + 1);
        for (const table of await page.locator('.admin-table-wrap').all()) {
          const box = await table.boundingBox();
          expect.soft(box?.x ?? -1, 'table left containment').toBeGreaterThanOrEqual(-1);
          expect.soft((box?.x ?? 0) + (box?.width ?? 0), 'table right containment').toBeLessThanOrEqual(width + 1);
          expect.soft(await table.evaluate(el => getComputedStyle(el).overflowX)).toMatch(/auto|scroll/);
        }
        if (width <= 768 && await page.locator('.admin-search-field').count()) expect.soft((await page.locator('.admin-search-field').boundingBox())!.height, 'search label vertical flex basis').toBeLessThan(100);
        await expect(page.locator('.admin-error, .balmoral-orders__error, .account-form-error')).toHaveCount(0);
        expect(state.errors).toEqual([]);
        expect(state.unexpected).toEqual([]);
        if (process.env.ALTURA_AUDIT_SCREENSHOTS === '1') {
          mkdirSync('qa/full-stack', { recursive: true });
          await page.screenshot({ path: `qa/full-stack/${route.replace(/[^a-z0-9]/gi, '-')}-${width}.png`, fullPage: true, animations: 'disabled' });
        }
      });
    }
    test('profile exposes security and traps edit-contact focus', async ({ page }) => {
      const state = await fixtures(page, 'CUSTOMER');
      await page.goto('/account/profile');
      await expect(page.getByRole('link', { name: /security|password/i })).toHaveAttribute('href', '/account/security');
      const edit = page.getByRole('button', { name: /Edit/ }).first();
      await edit.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      const controls = dialog.locator('button:visible:not(:disabled), input:visible:not(:disabled), select:visible:not(:disabled), a[href]:visible');
      await controls.last().focus();
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await controls.first().focus();
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(edit).toBeFocused();
      expect(state.unexpected).toEqual([]);
    });
    test('admin order filters and pagination request chosen values', async ({ page }) => {
      const state = await fixtures(page, 'ADMIN');
      await page.goto('/admin/orders');
      await expect(page.locator('tbody')).toContainText(number);
      await page.locator('.admin-search-field input').fill('AUDIT');
      await page.locator('.admin-filter-bar select').selectOption('DELIVERED');
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect.poll(() => state.calls.some(call => call.includes('q=AUDIT') && call.includes('status=DELIVERED'))).toBe(true);
      await page.locator('.admin-pagination').getByRole('button', { name: /^Next/ }).click();
      await expect(page.locator('tbody')).toContainText('ALT-AUDIT-002');
      await expect.poll(() => state.calls.some(call => call.includes('page=2') && call.includes('status=DELIVERED') && call.includes('q=AUDIT'))).toBe(true);
      expect(state.unexpected).toEqual([]);
    });
    test('customer order pagination changes displayed data', async ({ page }) => {
      const state = await fixtures(page, 'CUSTOMER');
      await page.goto('/account/orders');
      await expect(page.getByRole('link', { name: new RegExp(number) })).toBeVisible();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByRole('link', { name: /ALT-AUDIT-002/ })).toBeVisible();
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(page.getByRole('link', { name: new RegExp(number) })).toBeVisible();
      expect(state.unexpected).toEqual([]);
    });
  });
}
