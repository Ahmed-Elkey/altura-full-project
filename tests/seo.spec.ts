import { expect, test } from '@playwright/test';
import { serializeJsonLd, absoluteUrl } from '../lib/seo';
import { listSitemapProducts } from '../lib/storefront';

const info = ['/info/about-us', '/info/f-a-q', '/info/shipping', '/info/contact', '/info/lookbook', '/info/press', '/info/terms-policies', '/info/journal'];
const privateRoutes = ['/account/login', '/admin/login', '/cart', '/checkout', '/wishlist', '/track-order', '/newsletter/confirm', '/newsletter/unsubscribe', '/start-a-return'];

test('information and legacy aliases have consistent metadata without redirecting canonicals', async ({ page }) => {
  for (const path of [...info, '/about-us', '/f-a-q', '/pages/lookbook']) {
    await page.goto(path);
    const expected = path === '/about-us' ? '/info/about-us' : path === '/f-a-q' ? '/info/f-a-q' : path === '/pages/lookbook' ? '/info/lookbook' : path;
    const canonical = await page.locator('link[rel=canonical]').getAttribute('href');
    expect(new URL(canonical!).pathname).toBe(expected);
    expect((await page.title()).match(/ALTURA/g)).toHaveLength(1);
    expect(await page.locator('meta[name=description]').getAttribute('content')).not.toBe('Performance running apparel shaped by changing ground.');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical!);
    await expect(page.locator('meta[name="twitter:title"]')).not.toHaveAttribute('content', 'ALTURA — Move Higher');
  }
});

test('sitemap lists only unique successful canonical indexable pages', async ({ request, page }) => {
  test.setTimeout(120_000);
  const response = await request.get('/sitemap.xml'); expect(response.ok()).toBe(true);
  const urls = [...(await response.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  expect(urls.length).toBeGreaterThan(10); expect(new Set(urls).size).toBe(urls.length);
  for (const url of urls) {
    const path = new URL(url).pathname;
    expect(path).not.toMatch(/account|admin|cart|checkout|newsletter|instagram|journal|start-a-return/);
    const result = await page.goto(path); expect(result!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', url);
    expect(await page.locator('meta[name=robots]').getAttribute('content')).not.toContain('noindex');
  }
});

test('product uses real image, variant SKU/price/stock and breadcrumb data', async ({ page, request }) => {
  const listing = await (await request.get('http://127.0.0.1:4000/api/v1/catalog/products?limit=100')).json();
  const product = await (await request.get(`http://127.0.0.1:4000/api/v1/catalog/products/${listing.items[0].slug}`)).json();
  await page.goto(`/products/${product.slug}?color=${encodeURIComponent(product.colors[0])}`);
  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = schemas.map(s => JSON.parse(s));
  const schema = parsed.find(s => s['@type'] === 'Product');
  expect(schema.image[0]).not.toContain('opengraph-image');
  expect(new URL(schema.image[0]).pathname).toBe(new URL(product.images[0].url, page.url()).pathname);
  const offers = Array.isArray(schema.offers) ? schema.offers : [schema.offers];
  const variants = product.colorways.flatMap((c: any) => c.variants);
  expect(offers).toHaveLength(variants.length);
  for (const variant of variants) {
    const offer = offers.find((o: any) => o.sku === variant.sku);
    expect(Number(offer.price)).toBe(variant.price);
    expect(offer.availability).toBe(`https://schema.org/${variant.inStock ? 'InStock' : 'OutOfStock'}`);
  }
  expect(parsed.find(s => s['@type'] === 'BreadcrumbList').itemListElement.at(-1).name).toBe(product.name);
  expect(new URL((await page.locator('link[rel=canonical]').getAttribute('href'))!).search).toBe('');
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute('content', schema.image[0]);
});

test('private routes declare noindex in HTML and HTTP headers', async ({ page, request }) => {
  for (const path of privateRoutes) {
    const response = await request.get(path);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    await page.goto(path);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  }
});

// Unit checks for failure modes that are unsafe to manufacture in the live catalog.
test('JSON-LD safely preserves merchant text and rejects unsafe image URLs', async () => {
  const text = '</script><script>alert("merchant")</script> & \u2028';
  const serialized = serializeJsonLd({ name: text });
  expect(serialized).not.toContain('<'); expect(JSON.parse(serialized).name).toBe(text);
  expect(absoluteUrl('javascript:alert(1)')).toBeUndefined();
  expect(absoluteUrl('http://%')).toBeUndefined();
  expect(absoluteUrl('https://user:password@example.com/image.jpg')).toBeUndefined();
});

test('inherited collection aliases show the noindex not-found boundary without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const slug of ['toString', '__proto__']) {
    await page.goto(`/collections/${slug}`);
    await expect(page.getByRole('heading', { name: 'Off the route.' })).toBeVisible();
    expect(await page.locator('meta[name=robots]').evaluateAll(metas => metas.some(meta => meta.getAttribute('content')?.includes('noindex')))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('sitemap reads beyond the first catalog page and propagates API failure', async () => {
  const original = globalThis.fetch;
  const pages: number[] = [];
  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      pages.push(Number(new URL(String(url)).searchParams.get('page')));
      return new Response(JSON.stringify({ items: [], pages: 3 }), { status: 200 });
    }) as typeof fetch;
    await listSitemapProducts(); expect(pages).toEqual([1, 2, 3]);
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    await expect(listSitemapProducts()).rejects.toThrow('Catalog request failed');
  } finally { globalThis.fetch = original; }
});
