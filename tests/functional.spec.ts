import { expect, test } from "@playwright/test";
import { watchBrowserErrors } from './helpers/browser-errors';

const requiredRoutes = [
  "/", "/collections/shopall", "/collections/tops", "/collections/bottoms", "/collections/accessories",
  "/collections/t-shirts", "/collections/t-shirts-longsleeves", "/collections/shorts", "/collections/tights",
  "/collections/headwear", "/collections/fall-26", "/products/meridian-tee", "/checkout",
  "/info/about-us", "/info/shipping", "/info/contact", "/info/f-a-q", "/info/terms-policies",
];

test("required pages, APIs, production assets, and draft exclusion", async ({ page, request }) => {
  // This inventory visits many documents in one session. Authentication has
  // its own real-service suite; keep this anonymous scan from exhausting the
  // per-IP refresh allowance while catalog and assets remain live.
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, headers: { 'Access-Control-Allow-Origin': new URL(page.url()).origin, 'Access-Control-Allow-Credentials': 'true' }, json: {} }));
  const observed = watchBrowserErrors(page);
  for (const route of requiredRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    const canonical = ({ "/info/about": "/info/about-us", "/info/faqs": "/info/f-a-q", "/info/terms": "/info/terms-policies" } as Record<string, string>)[route];
    if (canonical) { await expect(page).toHaveURL(new RegExp(`${canonical}$`)); await expect(page.locator("#main-content h1").first()).toBeVisible(); }
  }
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const healthBody = await health.json();
  expect(healthBody).toMatchObject({ status: "ok", liveness: "ok", commerceReady: true, catalog: "ready", storefrontMode: "local" });
  expect(healthBody.products).toBeGreaterThan(0);
  const products = await request.get("/api/products?q=tee");
  expect(products.ok()).toBeTruthy();
  const body = await products.json();
  expect(JSON.stringify(body)).not.toContain('"status":"draft"');
  expect(JSON.stringify(body)).not.toContain("Crest Tank Top");
  const missingApi = await request.get("/api/does-not-exist");
  expect(missingApi.status()).toBe(404);
  await page.goto("/collections/shopall");
  // Verify lazy product images too, rather than checking them before the
  // browser has requested below-the-fold/color-preview assets.
  await page.locator("img").evaluateAll(images => images.forEach(image => { (image as HTMLImageElement).loading = "eager"; }));
  await expect.poll(() => page.locator("img").evaluateAll(images => images.filter(image => !(image as HTMLImageElement).complete || !(image as HTMLImageElement).naturalWidth).map(image => (image as HTMLImageElement).src))).toEqual([]);
  const imageFailures = await page.locator("img").evaluateAll((images) => images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).map((image) => (image as HTMLImageElement).src));
  expect(imageFailures).toEqual([]);
  await page.goto("/");
  await expect(page.locator(".pb-row-hero__title:visible").first()).toBeVisible();
  const fontStatus = await page.evaluate(() => document.fonts.status);
  expect(["loaded", "loading"]).toContain(fontStatus);
  const heroFont = await page.evaluate(() => {
    const el = document.querySelector(".pb-row-hero__title");
    return el ? window.getComputedStyle(el).fontFamily : "";
  });
  expect(heroFont.toLowerCase()).toMatch(/inter/);
  const bodyFont = await page.evaluate(() => window.getComputedStyle(document.body).fontFamily);
  expect(bodyFont.toLowerCase()).toMatch(/inter/);

  expect(observed.unexpected()).toEqual([]);
});

test("search, no-results, menu, filters, and sorting are keyboard-safe", async ({ page }) => {
  await page.goto("/");
  const searchButton = page.getByRole("button", { name: "Search", exact: true });
  await searchButton.click();
  const input = page.getByRole("textbox", { name: "Search by keyword" });
  await expect(input).toBeFocused();
  await input.fill("Meridian");
  await expect(page.getByRole("dialog", { name: "Search products" }).getByRole("link", { name: /Meridian T-Shirt/ })).toBeVisible();
  await input.fill("no-such-altura-product");
  await expect(page.getByText(/No results for/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(searchButton).toBeFocused();

  // The current header exposes the full collection navigation on desktop and
  // the dialog-backed Menu control at mobile widths. Exercise the actual
  // dialog path rather than the retired desktop Shop button.
  await page.setViewportSize({ width: 390, height: 844 });
  const menuButton = page.getByRole("button", { name: "Menu", exact: true });
  await menuButton.click();
  await expect(page.getByRole("dialog", { name: "Site menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuButton).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/collections/shopall");
  const filterButton = page.getByRole("button", { name: /Filter by/ });
  await filterButton.click();
  const xsFilter = page.getByLabel("XS");
  await page.locator("label").filter({ hasText: /^XS$/ }).click();
  await expect(xsFilter).toBeChecked();
  await expect(page.locator(".product-preview").first()).toBeVisible();
  await page.locator("#product-archives__filters select").selectOption("price-desc");
  await page.keyboard.press("Escape");
  await expect(filterButton).toBeFocused();
  const prices = await page.locator(".product-preview__price span").allTextContents();
  const values = prices.map((price) => Number(price.replace(/[^0-9.]/g, "")));
  expect(values[0]).toBeGreaterThanOrEqual(values.at(-1) || 0);
});

test("product controls, cart lifecycle, and persistence", async ({ page }) => {
  await page.goto("/products/meridian-tee");
  const forest = page.getByRole("radio", { name: "Forest" });
  await forest.check({ force: true });
  await expect(forest).toBeChecked();
  await page.getByRole("radio", { name: "M", exact: true }).check({ force: true });

  const moreDetails = page.getByRole("button", { name: "+ More" });
  await moreDetails.click();
  await expect(page.getByText("Made in Egypt")).toBeVisible();
  const closeDetails = page.getByRole("button", { name: "- Close" });
  await closeDetails.click();
  await expect(page.locator(".product-single__descMore")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  const cart = page.getByRole("dialog", { name: "Shopping cart" });
  await expect(cart).toBeVisible();
  await expect(cart.getByText("Meridian T-Shirt").first()).toBeVisible();
  await cart.getByRole("button", { name: /Increase Meridian/ }).click();
  await expect(cart.locator(".site-cart__itemIncrement span")).toHaveText("2");
  await cart.getByRole("button", { name: "Close cart" }).click();
  await page.reload();
  // Reload can restore the scrolled product position where the header hides.
  // Bring the actual navigation back into view before using its cart button.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Cart/ }).click();
  await expect(page.locator(".site-cart__itemIncrement span")).toHaveText("2");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".site-cart__empty")).toBeVisible();

  await page.goto("/products/northline-tee");
  await expect(page.getByRole("heading", { name: "Northline T-Shirt" })).toBeVisible();
});

test("checkout supports empty, shipping, review, and payment-preview states", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Your bag is empty." })).toBeVisible();
  await page.goto("/products/trail-cap");
  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Shopping cart" })).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.getByPlaceholder("Email").fill("runner@example.com");
  await page.getByPlaceholder("First name").fill("Altura");
  await page.getByPlaceholder("Last name").fill("Runner");
  await page.getByPlaceholder("Address").fill("17 Ridge Road");
  await page.getByPlaceholder("City").fill("Cairo");
  await page.getByPlaceholder("Postal code (optional)").fill("11511");
  await page.getByLabel("Region").selectOption({ label: "Cairo" });
  await expect(page.getByRole("heading", { name: "Shipping method" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay now" })).toBeVisible();
});

test("mobile menu, sticky CTA, custom 404, and viewport overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(page.getByRole("dialog", { name: "Site menu" })).toBeVisible();
  await page.getByRole("dialog", { name: "Site menu" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/products/half-tights");
  await expect(page.getByRole("button", { name: "Add to cart", exact: true }).first()).toBeVisible();
  await page.goto("/route-that-does-not-exist");
  await expect(page.getByRole("heading", { name: "Off the route." })).toBeVisible();

  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
    for (const route of ["/", "/collections/shopall", "/products/meridian-tee", "/checkout"]) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
