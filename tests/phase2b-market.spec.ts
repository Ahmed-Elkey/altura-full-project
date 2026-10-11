import { expect, test } from "@playwright/test";
import { selectAvailableVariant } from './helpers/catalog';

test("backend catalog is the storefront source and exposes the Egypt market", async ({ page, request }) => {
  const backend = await request.get("http://127.0.0.1:4000/api/v1/catalog/products?limit=100");
  expect(backend.status()).toBe(200);
  const catalog = await backend.json();
  expect(catalog.total).toBeGreaterThan(0);
  expect(catalog.items.every((item: { currency: string }) => item.currency === "EGP")).toBeTruthy();

  await page.goto("/products/summit-shorts");
  await expect(page.getByRole("heading", { name: "Summit Running Shorts" })).toBeVisible();
  await expect(page.locator(".product-single__price")).toContainText("EGP");

  const shopAll = await page.request.get("http://127.0.0.1:3100/api/products?limit=100");
  expect(shopAll.status()).toBe(200);
  const storefront = await shopAll.json();
  expect(storefront.products).toHaveLength(catalog.total);
  expect(storefront).toMatchObject({ source: 'backend', degraded: false });
  expect(storefront.products.every((item: { currency?: string }) => item.currency === "EGP")).toBeTruthy();
});

test("guest cart persists and completes the default Egypt mock checkout", async ({ page }) => {
  const checkoutRequests: Array<{ path: string; idempotencyKey: string | undefined; body: string }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" || !["/checkout/place-order", "/payments/initialize", "/checkout/shipping-methods"].some((path) => url.pathname.endsWith(path))) return;
    checkoutRequests.push({ path: url.pathname, idempotencyKey: request.headers()["idempotency-key"], body: request.postData() || "" });
  });

  await page.goto("/products/summit-shorts");
  const selected = await selectAvailableVariant(page, 'summit-shorts');
  await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeEnabled();
  const add = page.waitForResponse((response) => response.url().endsWith('/cart/items') && response.request().method() === 'POST');
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  expect((await (await add).json()).items[0].variantId).toBe(selected.id);
  await page.goto("/checkout");
  await expect(page.locator("select").first()).toHaveValue("EG");
  await expect(page.getByText("Summit Running Shorts").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Summit Running Shorts").first()).toBeVisible();

  await page.getByPlaceholder("Email").fill("phase2b-guest@example.test");
  await page.getByPlaceholder("First name").fill("Phase");
  await page.getByPlaceholder("Last name").fill("Guest");
  await page.getByPlaceholder("Address").fill("17 Nile Street");
  await page.getByPlaceholder("City").fill("Cairo");
  await expect(page.locator(".bchk-shipList")).toBeVisible();
  await page.getByRole("combobox", { name: "Region" }).selectOption({ label: "Cairo" });
  await page.getByPlaceholder("Phone").fill("+201000000000");
  await page.getByPlaceholder("Card number").fill("4242424242424242");
  await page.getByPlaceholder("Expiration date (MM / YY)").fill("12 / 30");
  await page.getByPlaceholder("Security code").fill("123");
  await page.getByPlaceholder("Name on card").fill("Phase Guest");
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 30_000 });
  await expect(page.getByText("Order received.")).toBeVisible();

  const place = checkoutRequests.find((entry) => entry.path.endsWith("/checkout/place-order"));
  const payment = checkoutRequests.find((entry) => entry.path.endsWith("/payments/initialize"));
  expect(checkoutRequests.some((entry) => entry.path.endsWith("/checkout/shipping-methods") && entry.body.includes('"EG"'))).toBeTruthy();
  expect(place?.idempotencyKey).toMatch(/^altura-order-/);
  expect(payment?.idempotencyKey).toMatch(/^altura-payment-/);
});
