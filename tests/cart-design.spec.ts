import { test, expect, type Page, type Route } from "@playwright/test";

const emptyCart = { id: "design-cart", ownerType: "guest", currency: "EGP", itemCount: 0, subtotal: 0, items: [], issues: [], expiresAt: null, updatedAt: "2026-10-07T00:00:00Z" };
const item = { id: "design-item", variantId: "design-variant", quantity: 1, unitPrice: 100, lineTotal: 100, currency: "EGP", availableQuantity: 2, product: { id: "design-product", slug: "summit-shorts", name: "Summit Running Shorts", image: null }, option: { colorName: "Black", colorHex: "#000000", size: "M", title: "Black / M" } };
const initialCart = { ...emptyCart, itemCount: 1, subtotal: 100, items: [item] };
async function reply(route: Route, status: number, data: unknown) {
  await route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3100", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify(data) });
}
async function setup(page: Page, mode: "filled" | "empty" | "error" | "delayed" | "mutation-error" = "filled") {
  let cart = structuredClone(initialCart);
  let requests = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://127.0.0.1:4000/api/v1/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3100", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Allow-Methods": "GET,PATCH,DELETE" } }); return;
    }
    if (path === "/auth/refresh") return reply(route, 401, {});
    if (path === "/health") return reply(route, 200, { status: "ok", database: "connected" });
    if (path === "/cart") {
      requests++;
      if (mode === "delayed") await pending;
      if (mode === "error" && requests === 1) return reply(route, 503, { message: "private database stack" });
      return reply(route, 200, mode === "empty" ? emptyCart : cart);
    }
    if (path === "/cart/items/design-item") {
      if (mode === "mutation-error") return reply(route, 429, {});
      if (request.method() === "DELETE") { cart = { ...cart, itemCount: 0, subtotal: 0, items: [] }; }
      else {
        const quantity = request.postDataJSON().quantity;
        cart = { ...cart, itemCount: quantity, subtotal: quantity * 100, items: [{ ...item, quantity, lineTotal: quantity * 100 }] };
      }
      return reply(route, 200, cart);
    }
    return reply(route, 200, []);
  });
  return { release, errors };
}

test("cart matches customer typography and cards and shows the cart currency", async ({ page }) => {
  const { errors } = await setup(page);
  await page.goto("/cart");
  const heading = page.getByRole("heading", { name: "Cart", exact: true });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Inter/);
  await expect(page.locator(".cart-itemPrice")).toHaveText(/EGP\s*100\.00/);
  await expect(page.locator(".cart-itemPrice")).not.toContainText("$");
  await expect(page.getByRole("link", { name: "Checkout (1)", exact: true })).toHaveAttribute("href", "/checkout");
  expect(await page.locator(".customer-cart__itemsCard").evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`cart-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("cart quantity controls preserve stock limits and removal reaches the empty state", async ({ page }) => {
  const { errors } = await setup(page);
  await page.goto("/cart");
  const increase = page.getByRole("button", { name: "Increase Summit Running Shorts quantity" });
  await increase.click();
  await expect(increase).toBeDisabled();
  await expect(page.getByRole("link", { name: "Checkout (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Decrease Summit Running Shorts quantity" }).click();
  await expect(increase).toBeEnabled();
  await page.getByRole("button", { name: "Remove Summit Running Shorts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shop all", exact: true })).toHaveAttribute("href", "/collections/shopall");
  expect(errors).toEqual([]);
});

test("cart loading does not expose a zero-price checkout summary", async ({ page }) => {
  const { release } = await setup(page, "delayed");
  await page.goto("/cart");
  await expect(page.getByRole("status", { name: "Loading your cart…" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Checkout/ })).toHaveCount(0);
  release();
  await expect(page.getByRole("link", { name: "Checkout (1)", exact: true })).toBeVisible();
});

test("cart request failure has a retry state instead of claiming the bag is empty", async ({ page }) => {
  await setup(page, "error");
  await page.goto("/cart");
  await expect(page.locator(".cart-error[role=alert]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your cart is empty", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("link", { name: "Checkout (1)", exact: true })).toBeVisible();
});

test("cart mutation failure preserves products and keeps the error readable", async ({ page }) => {
  const { errors } = await setup(page, "mutation-error");
  await page.goto("/cart");
  await page.getByRole("button", { name: "Remove Summit Running Shorts", exact: true }).click();
  await expect(page.locator(".cart-error[role=alert]")).toContainText("Please wait");
  await expect(page.locator(".cart-itemMeta")).toContainText("Summit Running Shorts");
  await expect(page.getByRole("link", { name: "Checkout (1)", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
