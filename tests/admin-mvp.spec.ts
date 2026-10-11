import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', actionTimeout: 15000, navigationTimeout: 30000 });
const api = 'http://127.0.0.1:4000/api/v1';

function credentials() {
  const file = process.env.ALTURA_TEST_CREDENTIALS_PATH;
  if (!file || !existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const value = raw.accounts ? { adminEmail: raw.accounts.admin?.email, adminPassword: raw.accounts.admin?.password } : raw;
  return value.adminEmail && value.adminPassword ? value : null;
}
async function browserApi(page: Page, path: string, method = 'GET', body?: unknown, token?: string) {
  return page.evaluate(async ({ api, path, method, body, token }) => {
    const response = await fetch(api + path, {
      method,
      credentials: 'include',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
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
  const response = page.waitForResponse((item) => item.url().endsWith('/auth/login') && item.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enter Studio', exact: true }).click();
  const auth = await response;
  expect(auth.status()).toBe(200);
  await expect(page).toHaveURL(/\/admin$/);
  return (await auth.json()).accessToken as string;
}

test('Admin MVP manages real products, SKU stock and server-side discounts', async ({ page }) => {
  test.setTimeout(180000);
  test.skip(!credentials(), 'BLOCKED: private synthetic admin credentials missing');
  const token = await loginAdmin(page);
  const suffix = randomUUID().slice(0, 8);
  const slug = `admin-mvp-${suffix}`;
  const sku = `MVP-${suffix.toUpperCase()}`;
  const code = `ALTURA20${suffix.slice(0, 4).toUpperCase()}`;
  let productId = '';
  let variantId = '';
  let discountId = '';

  await expect(page.getByRole('navigation', { name: 'ALTURA Studio' }).getByRole('link')).toHaveCount(5);
  await expect(page.getByText('Total orders', { exact: true })).toBeVisible();
  await expect(page.getByText('Confirmed / preparing', { exact: true })).toBeVisible();

  await page.goto('/admin/products');
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const create = page.locator('form.admin-inline-create').first();
  await create.getByLabel('Name', { exact: true }).fill(`Admin MVP ${suffix}`);
  await create.getByLabel('Slug', { exact: true }).fill(slug);
  await create.getByLabel('Base price (EGP)', { exact: true }).fill('500');
  await create.locator('select').selectOption('ACTIVE');
  await create.getByLabel('Description', { exact: true }).fill('Synthetic product for the isolated Admin MVP verification.');
  await create.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[^/]+$/);
  productId = page.url().split('/').pop()!;
  await expect(page.getByRole('status')).toHaveCount(0);

  const variant = page.locator('form.admin-inline-create').first();
  await variant.getByLabel('SKU', { exact: true }).fill(sku);
  await variant.getByLabel('Color', { exact: true }).fill('Bone');
  await variant.getByLabel('Color hex', { exact: true }).fill('#ded8ca');
  await variant.getByLabel('Size', { exact: true }).fill('S');
  await variant.getByLabel('Price', { exact: true }).fill('500');
  await variant.getByLabel('Initial stock', { exact: true }).fill('8');
  await variant.getByLabel('Low stock at', { exact: true }).fill('3');
  await variant.getByRole('button', { name: 'Add variant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Variant and inventory record created.');
  const product = await browserApi(page, `/admin/catalog/products/${productId}`, 'GET', undefined, token);
  expect(product.status).toBe(200);
  variantId = product.body.variants.find((item: any) => item.sku === sku).id;

  const image = page.locator('.admin-product-editor-grid aside form');
  await image.getByLabel('Image URL', { exact: true }).fill('http://127.0.0.1:3100/icon.svg');
  await image.getByLabel('Alt text', { exact: true }).fill('Synthetic ALTURA mark');
  await image.getByLabel('Primary image', { exact: true }).check();
  await image.getByRole('button', { name: 'Add image', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Image added.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.admin-image-grid').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Image removed.');

  await page.goto(`/admin/inventory?q=${encodeURIComponent(sku)}`);
  const row = page.locator('tbody tr').filter({ hasText: sku });
  await expect(row).toBeVisible();
  await row.getByLabel(`Physical stock for ${sku}`).fill('4');
  await row.getByLabel(`Low stock threshold for ${sku}`).fill('4');
  await row.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`${sku} inventory saved.`);
  await expect(row.getByText('Low stock', { exact: true })).toBeVisible();

  await page.goto('/admin/discounts');
  await page.getByRole('button', { name: 'Create code', exact: true }).click();
  const discount = page.locator('form.admin-inline-create').first();
  await discount.getByLabel('Code', { exact: true }).fill(code);
  await discount.locator('select').selectOption('PERCENTAGE');
  await discount.getByLabel('Value', { exact: true }).fill('20');
  await discount.getByLabel('Minimum subtotal', { exact: true }).fill('100');
  await discount.getByLabel('Total uses', { exact: true }).fill('10');
  await discount.getByLabel('Per customer', { exact: true }).fill('2');
  await discount.getByRole('button', { name: 'Create discount', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Discount created.');
  const discounts = await browserApi(page, '/admin/discounts', 'GET', undefined, token);
  discountId = discounts.body.find((item: any) => item.code === code).id;

  const cart = await browserApi(page, '/cart', 'GET', undefined, token);
  for (const item of cart.body.items) await browserApi(page, `/cart/items/${item.id}`, 'DELETE', undefined, token);
  expect((await browserApi(page, '/cart/items', 'POST', { variantId, quantity: 1 }, token)).status).toBe(201);
  const methods = await browserApi(page, '/checkout/shipping-methods', 'POST', { countryCode: 'EG' }, token);
  expect(methods.status).toBe(201);
  const address = { recipientName: 'Admin MVP Synthetic', phone: '+201000000009', line1: '20 Local Test Street', city: 'Cairo', region: 'Cairo', countryCode: 'EG' };
  const quotePayload = { shippingAddress: address, shippingMethodId: methods.body.methods[0].id, discountCode: code };
  const quote = await browserApi(page, '/checkout/quote', 'POST', quotePayload, token);
  expect(quote.status).toBe(201);
  expect(quote.body.discount.code).toBe(code);
  expect(quote.body.totals.discountTotal).toBe(100);

  const discountRow = page.locator('tbody tr').filter({ hasText: code });
  await discountRow.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Discount disabled.');
  expect((await browserApi(page, '/checkout/quote', 'POST', quotePayload, token)).status).toBe(400);

  const customerEmail = `admin-mvp-${randomUUID()}@example.invalid`;
  const customerPassword = `LocalMvp!${randomBytes(12).toString('hex')}`;
  const registerResponse = await fetch(`${api}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customerEmail, password: customerPassword, firstName: 'MVP', lastName: 'Customer' }) });
  const registered = await registerResponse.json();
  expect(registerResponse.status).toBe(201);
  expect(registered.user.role).toBe('CUSTOMER');
  expect((await browserApi(page, '/admin/discounts', 'POST', { code: `NO${suffix}`, type: 'PERCENTAGE', value: 5 }, registered.accessToken)).status).toBe(403);

  await browserApi(page, `/admin/discounts/${discountId}`, 'PATCH', { active: false }, token);
  await page.goto(`/admin/products/${productId}`);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archive product', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Product archived.');
  expect((await browserApi(page, `/admin/catalog/products/${productId}`, 'GET', undefined, token)).body.status).toBe('ARCHIVED');
});
