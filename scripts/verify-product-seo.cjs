// Real local SEO persistence and catalog discovery. Temporary records only; no mail.
const fs = require('fs'), assert = require('assert/strict'), { randomUUID, randomBytes } = require('crypto');
const env = require('../backend/node_modules/dotenv').parse(fs.readFileSync('backend/.env'));
const target = new URL(env.DATABASE_URL);
assert.ok(target.hostname === '127.0.0.1' && target.port === '5434' && target.pathname === '/altura_friend');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { PasswordService } = require('../backend/dist/src/common/security/password.service');
const { chromium, expect } = require('@playwright/test');
const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const tag = randomUUID().replaceAll('-', ''), base = 'http://127.0.0.1:4000/api/v1', origin = 'http://127.0.0.1:3100';
let userId, productId, collectionId, browser, stage = 'setup';
async function api(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status); return response.status === 204 ? null : response.json();
}
(async () => {
 try {
  const password = 'Synthetic!' + randomBytes(18).toString('hex');
  const user = await db.user.create({ data: { email: `seo-qa-${tag}@example.invalid`, role: 'ADMIN', firstName: 'Synthetic', lastName: 'SEO', passwordHash: await new PasswordService().hash(password) } }); userId = user.id;
  const auth = await api('/auth/login', null, 'POST', { email: user.email, password }); const token = auth.accessToken;
  const collection = await api('/admin/catalog/collections', token, 'POST', { slug: 'seo-qa-' + tag, name: 'Synthetic SEO collection', status: 'ACTIVE' }, 201); collectionId = collection.id;
  const product = await api('/admin/catalog/products', token, 'POST', { slug: 'seo-qa-product-' + tag, name: 'Synthetic SEO product', description: 'Temporary product for local SEO verification.', basePrice: 100, currency: 'EGP', status: 'ACTIVE', collectionSlugs: [collection.slug] }, 201); productId = product.id;
  const variant = await api(`/admin/catalog/products/${product.id}/variants`, token, 'POST', { sku: 'SEO-QA-' + tag.toUpperCase(), colorName: 'Bone', size: 'XS', price: 129, currency: 'EGP', initialStock: 3 }, 201);
  await api(`/admin/catalog/products/${product.id}/images`, token, 'POST', { url: '/icon.svg', isPrimary: true, colorName: 'Bone', view: 'front' }, 201);
  stage = 'persist SEO overrides';
  await api(`/admin/catalog/products/${product.id}`, token, 'PATCH', { seoTitle: 'Synthetic running product', seoDescription: 'Real API SEO description for the synthetic product.' });
  browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto(origin + '/products/' + product.slug);
  await expect(page).toHaveTitle('Synthetic running product — ALTURA');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', 'Real API SEO description for the synthetic product.');
  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(JSON.parse);
  const offer = schemas.find(s => s['@type'] === 'Product').offers.find(o => o.sku === variant.sku);
  assert.equal(offer.price, 129); assert.equal(offer.availability, 'https://schema.org/InStock');
  stage = 'clear SEO overrides';
  await api(`/admin/catalog/products/${product.id}`, token, 'PATCH', { seoTitle: '', seoDescription: '' });
  const saved = await db.product.findUnique({ where: { id: product.id } }); assert.equal(saved.seoTitle, null); assert.equal(saved.seoDescription, null);
  await page.reload(); await expect(page).toHaveTitle('Synthetic SEO product — ALTURA');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', product.description);
  stage = 'new collection and dynamic sitemap';
  stage = 'new collection navigation';
  await page.goto(origin + '/collections/' + collection.slug);
  stage = 'new collection heading';
  await expect(page.getByRole('heading', { name: collection.name, exact: true })).toBeVisible();
  stage = 'new collection canonical';
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', origin + '/collections/' + collection.slug);
  stage = 'new catalog sitemap';
  let sitemap = await (await fetch(origin + '/sitemap.xml')).text(); assert.ok(sitemap.includes('/products/' + product.slug)); assert.ok(sitemap.includes('/collections/' + collection.slug));
  stage = 'archive product';
  await api(`/admin/catalog/products/${product.id}/archive`, token, 'POST', {}, 201);
  stage = 'archive sitemap exclusion';
  sitemap = await (await fetch(origin + '/sitemap.xml')).text(); assert.ok(!sitemap.includes('/products/' + product.slug));
 } finally {
  try { if (browser) await browser.close(); }
  finally { try { if (productId) await db.product.deleteMany({ where: { id: productId } }); if (collectionId) await db.collection.deleteMany({ where: { id: collectionId } }); if (userId) { await db.auditLog.deleteMany({ where: { actorUserId: userId } }); await db.user.deleteMany({ where: { id: userId } }); } } finally { await db.$disconnect(); } }
 }
 console.log('PASS: real SEO override save/clear, variant price/stock, new collection canonical and dynamic sitemap inclusion/archive exclusion. Temporary records cleaned. No outbound mail.');
})().catch(() => { console.error('Product SEO verification failed at:', stage, '(private data omitted)'); process.exitCode = 1; });
