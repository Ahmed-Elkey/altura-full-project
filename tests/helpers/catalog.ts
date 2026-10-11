import { expect, type Page } from '@playwright/test';

/** Pick actual sellable stock; do not refill fixtures or assume the default size is available. */
export async function selectAvailableVariant(page: Page, slug: string, minimumQuantity = 1) {
  const response = await page.request.get(`http://127.0.0.1:4000/api/v1/catalog/products/${slug}`);
  expect(response.status()).toBe(200);
  const product = await response.json();
  const candidates = product.colorways.flatMap((color: { name: string; variants: Array<{ id: string; size: string; availableQuantity: number; inStock: boolean }> }) =>
    color.variants.filter((variant) => variant.inStock && variant.availableQuantity >= minimumQuantity).map((variant) => ({ ...variant, color: color.name })));
  candidates.sort((a: { availableQuantity: number }, b: { availableQuantity: number }) => b.availableQuantity - a.availableQuantity);
  expect(candidates.length, `Sellable ${slug} fixture stock is required; no stock will be inserted`).toBeGreaterThan(0);
  const variant = candidates[0];
  for (const name of [variant.color, variant.size]) {
    if (name === variant.size && product.sizes.length === 1) {
      await expect(page.locator('.product-form__singleSize')).toHaveText(variant.size.toUpperCase());
      continue;
    }
    const radio = page.getByRole('radio', { name, exact: true });
    const id = await radio.getAttribute('id');
    expect(id).toBeTruthy();
    await page.locator(`label[for="${id}"]`).click();
    await expect(radio).toBeChecked();
  }
  await expect(page.getByRole('button', { name: 'Add to cart', exact: true }).first()).toBeEnabled();
  return variant as { id: string; size: string; color: string; availableQuantity: number };
}
