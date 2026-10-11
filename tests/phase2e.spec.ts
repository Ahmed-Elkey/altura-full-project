import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { selectAvailableVariant } from './helpers/catalog';

test.use({ screenshot: "off", trace: "off" });

type TestCredentials = {
  adminEmail: string;
  adminPassword: string;
  customerEmail: string;
  customerPassword: string;
};

function loadCredentials(): TestCredentials | null {
  const path = process.env.ALTURA_TEST_CREDENTIALS_PATH;
  if (!path || !existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<TestCredentials>;
    if (parsed.adminEmail && parsed.adminPassword && parsed.customerEmail && parsed.customerPassword) {
      return parsed as TestCredentials;
    }
  } catch {
    return null;
  }
  return null;
}

const credentials = loadCredentials();

async function loginCustomer(page: Page, email: string, password: string) {
  await page.goto("/account/login");
  await page.locator("#balmoral-email").fill(email);
  await page.getByLabel("Password").fill(password);
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/auth/login") && candidate.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await response;
  expect(loginResponse.status()).toBe(200);
  // Set-Cookie is intentionally not readable to browser JavaScript. Verify the
  // actual Chromium cookie jar instead of inspecting an inaccessible header.
  const refreshCookie = (await page.context().cookies("http://127.0.0.1:4000/api/v1/auth"))
    .find((cookie) => cookie.name === "altura_refresh");
  expect(refreshCookie).toBeDefined();
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.sameSite).toBe("Lax");
  await expect(page).toHaveURL(/\/account(?:$|\/)/);
}

function persistedNewsletterState(email: string) {
  const databaseUrl = process.env.DATABASE_URL;
  const psql = process.env.ALTURA_PSQL_PATH;
  if (!databaseUrl || !psql) throw new Error("Newsletter persistence verification requires the isolated local database process configuration.");
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/altura_dev") {
    throw new Error("Newsletter persistence verification refused a database target outside altura_dev.");
  }
  return execFileSync(psql, [
    "-h", "127.0.0.1", "-p", "5433", "-U", "postgres", "-d", "altura_dev", "-Atc",
    `SELECT COUNT(*) FROM "NewsletterSubscriber" WHERE email = '${email}' AND status = 'SUBSCRIBED';`,
  ], { encoding: "utf8", env: process.env }).trim();
}

test("collection stays within 375–1440px viewports", async ({ page }) => {
  for (const width of [375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/collections/shopall");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `shop all at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test("contact directs honestly, public returns route to the supported account flow, and newsletter persists once", async ({ page }) => {
  const email = `phase2e-${Date.now()}@example.invalid`;
  await page.goto("/info/contact");
  await page.getByLabel("Name").fill("Phase 2E QA");
  await page.locator("#contact-email").fill(email);
  await page.getByLabel("Message").fill("Synthetic local contact form verification.");
  await page.getByLabel("Subject", { exact: true }).fill("Local test question");
  await page.route("**/api/v1/support", route => route.fulfill({ status: 201, json: { ticket: { id: "synthetic-contact", reference: "SUP-TEST" }, accessToken: "synthetic-scoped" } }));
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your message is saved");
  await expect(page.getByRole("link", { name: "View conversation" })).toHaveAttribute("href", "/support/synthetic-contact");

  await page.goto("/start-a-return");
  await expect(page.getByText("Use the secure online return flow", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Order number")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load order →" })).toBeVisible();
  // Legacy /returns URL redirects to the single canonical return page.
  await page.goto("/returns");
  await expect(page).toHaveURL(/\/start-a-return/);
  await expect(page.getByLabel("Order number")).toBeVisible();

  await page.goto("/");
  const newsletter = page.getByRole("textbox", { name: "Email address" });
  await newsletter.fill(email);
  const subscribe = () => page.waitForResponse((candidate) => candidate.url().endsWith("/newsletter/subscribe") && candidate.request().method() === "POST");
  let responsePromise = subscribe();
  await page.getByRole("button", { name: "Subscribe" }).click();
  expect((await responsePromise).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText("your subscription is saved");

  await newsletter.fill(email.toUpperCase());
  responsePromise = subscribe();
  await page.getByRole("button", { name: "Subscribe" }).click();
  expect((await responsePromise).status()).toBe(201);
  expect(persistedNewsletterState(email)).toBe("1");
});

test("guest wishlist uses an HttpOnly session cookie and persists/removes the backend product", async ({ page }) => {
  await page.goto("/products/summit-shorts");
  await expect(page.getByRole("button", { name: "Save to wishlist" })).toBeEnabled();
  const addResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/wishlist/items") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  const added = await addResponse;
  expect(added.status()).toBe(201);
  const guestWishlist = await added.json();
  expect(guestWishlist.ownerType).toBe("guest");
  expect(guestWishlist.itemCount).toBe(1);

  const guestCookie = (await page.context().cookies("http://127.0.0.1:4000/api/v1"))
    .find((cookie) => cookie.name === "altura_guest");
  expect(guestCookie).toBeDefined();
  expect(guestCookie?.httpOnly).toBe(true);
  expect(guestCookie?.sameSite).toBe("Lax");

  await page.getByRole("link", { name: "View wishlist" }).click();
  const savedProduct = page.getByRole("link", { name: "Summit Running Shorts", exact: true });
  await expect(savedProduct).toHaveAttribute("href", "/products/summit-shorts");
  const removeResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.includes("/wishlist/items/") && response.request().method() === "DELETE";
  });
  await page.getByRole("button", { name: "Remove from saved →" }).click();
  expect((await removeResponse).status()).toBe(200);
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();
});

test("a fresh guest cart uses the Egypt market currency and persists an added EGP variant", async ({ page }) => {
  const initialCartResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/api/v1/cart") && response.request().method() === "GET";
  });
  await page.goto("/products/meridian-tee");
  const initialCart = await initialCartResponse;
  expect(initialCart.status()).toBe(200);
  const initial = await initialCart.json();
  expect(initial.currency).toBe("EGP");
  expect(initial.itemCount).toBe(0);
  await selectAvailableVariant(page, 'meridian-tee');

  const addResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/cart/items") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  const added = await addResponse;
  expect(added.status()).toBe(201);
  const cart = await added.json();
  expect(cart.currency).toBe("EGP");
  expect(cart.itemCount).toBe(1);

  const reloadCartResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/api/v1/cart") && response.request().method() === "GET";
  });
  await page.reload();
  const persisted = await reloadCartResponse;
  expect(persisted.status()).toBe(200);
  const restored = await persisted.json();
  expect(restored.currency).toBe("EGP");
  expect(restored.itemCount).toBe(1);
});

test("documented PDP image viewer, recent products, and mobile purchase CTA work on the live catalog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products/summit-shorts");
  await page.getByRole("button", { name: /Enlarge Summit Running Shorts Black front image/ }).click();
  const viewer = page.getByRole("dialog", { name: "Summit Running Shorts image viewer" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer).toContainText("2 / 4");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  await page.locator('label[for="option-2-2"]').click();
  const mobilePurchase = page.locator(".mobile-purchase-bar");
  await expect(mobilePurchase).toBeVisible();
  await expect(mobilePurchase.getByRole("button", { name: "Add to cart" })).toBeEnabled();

  await page.goto("/products/trail-shorts");
  const recentProducts = page.getByRole("region", { name: "Recently viewed" });
  await expect(recentProducts.getByRole("link", { name: "Summit Running Shorts" })).toHaveAttribute("href", "/products/summit-shorts");
});

test("customer session, profile address, wishlist, cart, mock checkout, order history, and logout work in Chromium", async ({ page }) => {
  test.skip(!credentials, "Local synthetic customer credentials are unavailable.");
  if (!credentials) return;

  let wishlistAuthorizationSeen = false;
  let orderKey = "";
  let paymentKey = "";
  let mockPaymentConfirmed = false;
  page.on("request", (request) => {
    const url = new URL(request.url());
    const headers = request.headers();
    if (url.pathname.endsWith("/checkout/place-order")) orderKey = headers["idempotency-key"] || "";
    if (url.pathname.endsWith("/payments/initialize")) paymentKey = headers["idempotency-key"] || "";
  });

  await loginCustomer(page, credentials.customerEmail, credentials.customerPassword);
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();

  // Reset only this synthetic test customer's cart through its normal UI so
  // reruns start from a deterministic state.
  const cartLoad = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/cart") && response.request().method() === "GET";
  });
  await page.goto("/cart");
  expect((await cartLoad).status()).toBe(200);
  await expect(page.getByText("Updating your cart…")).toHaveCount(0);
  const cartLines = page.locator(".cart-item");
  while (await cartLines.count()) {
    const previousCount = await cartLines.count();
    await cartLines.first().getByRole("button", { name: /Remove/ }).click();
    await expect(cartLines).toHaveCount(previousCount - 1);
  }

  await page.goto("/account/profile");
  await expect(page.getByText(credentials.customerEmail, { exact: true })).toBeVisible();
  let addressCard = page.locator(".balmoral-profile__card--addr").filter({ hasText: "Phase 2E Test Avenue" }).first();
  if (!(await addressCard.count())) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const addressDialog = page.getByRole("dialog", { name: "Add address" });
    await addressDialog.getByPlaceholder("First name").fill("Phase 2E");
    await addressDialog.getByPlaceholder("Last name").fill("Browser Test");
    await addressDialog.getByPlaceholder("Address").fill("7 Phase 2E Test Avenue");
    await addressDialog.getByPlaceholder("City").fill("Cairo");
    await addressDialog.getByRole("button", { name: "Save", exact: true }).click();
    addressCard = page.locator(".balmoral-profile__card--addr").filter({ hasText: "7 Phase 2E Test Avenue" }).first();
    await expect(addressCard).toBeVisible();
  }
  await addressCard.getByRole("button", { name: "Edit" }).click();
  const editAddress = page.getByRole("dialog", { name: "Edit address" });
  await editAddress.getByPlaceholder("Address").fill("9 Phase 2E Test Avenue");
  await editAddress.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".balmoral-profile__card--addr").filter({ hasText: "9 Phase 2E Test Avenue" }).first()).toBeVisible();

  await page.goto("/products/summit-shorts");
  await expect(page.getByRole("heading", { name: "Summit Running Shorts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to wishlist" })).toBeEnabled();
  const wishlistRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/wishlist/items") && request.method() === "POST";
  });
  await page.getByRole("button", { name: "Save to wishlist" }).click();
  const wishlistRequest = await wishlistRequestPromise;
  const wishlistHeaders = await wishlistRequest.allHeaders();
  wishlistAuthorizationSeen = Boolean(wishlistHeaders.authorization?.startsWith("Bearer "));
  await expect(page.getByRole("status")).toContainText("Saved to your wishlist");
  expect(wishlistAuthorizationSeen, "Wishlist write should use the signed-in customer's bearer session").toBeTruthy();
  await page.getByRole("link", { name: "View wishlist" }).click();
  const savedProduct = page.getByRole("link", { name: "Summit Running Shorts", exact: true });
  await expect(savedProduct).toHaveAttribute("href", "/products/summit-shorts");
  await page.getByRole("button", { name: "Remove from saved →" }).click();
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();

  await page.goto("/products/summit-shorts");
  await page.locator('label[for="option-2-2"]').click();
  await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeEnabled();
  await selectAvailableVariant(page, 'summit-shorts', 2);
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.goto("/cart");
  const quantity = page.locator(".cart-qty span").first();
  await expect(quantity).toHaveText("1");
  await page.getByRole("button", { name: /Increase .* quantity/ }).click();
  await expect(quantity).toHaveText("2");
  await page.getByRole("button", { name: /Decrease .* quantity/ }).click();
  await expect(quantity).toHaveText("1");
  await page.getByRole("button", { name: /Remove Summit Running Shorts/ }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();

  await page.goto("/products/summit-shorts");
  await page.locator('label[for="option-2-2"]').click();
  await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toBeEnabled();
  await selectAvailableVariant(page, 'summit-shorts');
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.goto("/checkout");
  await expect(page.locator("select").first()).toHaveValue("EG");
  if (await page.getByPlaceholder("Email").count()) {
    await page.getByPlaceholder("Email").fill(credentials.customerEmail);
  } else {
    await expect(page.locator(".bchk-email")).toHaveText(credentials.customerEmail);
  }
  await page.getByPlaceholder("First name").fill("Phase 2E");
  await page.getByPlaceholder("Last name").fill("Browser Test");
  await page.getByPlaceholder("Address").fill("9 Phase 2E Test Avenue");
  await page.getByPlaceholder("City").fill("Cairo");
  const region = page.getByRole("combobox", { name: "Region" });
  if (await region.count()) await region.selectOption({ label: "Cairo" });
  await page.getByPlaceholder("Phone").fill("+201000000000");
  await page.getByPlaceholder("Card number").fill("4242424242424242");
  await page.getByPlaceholder("Expiration date (MM / YY)").fill("12 / 30");
  await page.getByPlaceholder("Security code").fill("123");
  await page.getByPlaceholder("Name on card").fill("Phase 2E Browser Test");
  const orderResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/checkout/place-order") && candidate.request().method() === "POST");
  const paymentResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/payments/initialize") && candidate.request().method() === "POST");
  const mockResponse = page.waitForResponse((candidate) => /\/payments\/mock\/[^/]+\/complete$/.test(new URL(candidate.url()).pathname));
  await page.getByRole("button", { name: "Pay now" }).click();
  expect((await orderResponse).status()).toBe(201);
  const payment = await paymentResponse;
  expect(payment.status()).toBe(201);
  expect((await payment.json()).checkout.mode).toBe("mock");
  const mock = await mockResponse;
  expect(mock.status()).toBeGreaterThanOrEqual(200);
  expect(mock.status()).toBeLessThan(300);
  mockPaymentConfirmed = true;
  await expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 30_000 });
  expect(orderKey).toMatch(/^altura-order-/);
  expect(paymentKey).toMatch(/^altura-payment-/);

  const orderNumber = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1) || "");
  await page.goto("/account/orders");
  const newOrder = page.locator(".balmoral-orders__row").filter({ hasText: orderNumber });
  await expect(newOrder).toBeVisible();
  await newOrder.click();
  await expect(page.getByText(`Order / ${orderNumber}`, { exact: true })).toBeVisible();
  await page.goto("/account/profile");
  const logoutResponse = page.waitForResponse((candidate) => candidate.url().endsWith("/auth/logout") && candidate.request().method() === "POST");
  await page.getByRole("button", { name: "Sign out" }).click();
  expect((await logoutResponse).status()).toBe(204);
  await page.goto("/account");
  await expect(page.locator("#balmoral-email")).toBeVisible();
  expect(mockPaymentConfirmed).toBeTruthy();
});

test("admin can inspect registers and safely edit/archive/restore a synthetic local storefront product", async ({ page }) => {
  test.skip(!credentials, "Local synthetic admin credentials are unavailable.");
  if (!credentials) return;

  await page.goto("/admin/login");
  await page.locator('.admin-login-form input[type="email"]').fill(credentials.adminEmail);
  await page.locator('.admin-login-form input[type="password"]').fill(credentials.adminPassword);
  await page.getByRole("button", { name: "Enter Studio" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  const nav = page.locator(".admin-nav");
  await nav.getByRole("link", { name: "Products" }).click();
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  expect(await page.getByRole("button", { name: /create product/i }).count()).toBe(0);
  const productLink = page.locator('a.admin-table-link[href^="/admin/products/"]').filter({ hasText: "Summit Running Shorts" });
  await expect(productLink).toBeVisible();
  const productPath = await productLink.getAttribute("href");
  if (!productPath) throw new Error("The local test product link was not available.");
  const productId = productPath.split("/").at(-1);
  if (!productId) throw new Error("The local test product id was not available.");
  const adminProductApiPath = `/admin/catalog/products/${productId}`;
  await productLink.click();
  await expect(page.getByRole("heading", { name: "Product record" })).toBeVisible();
  const description = page.locator(".admin-product-form textarea");
  const originalDescription = await description.inputValue();
  const status = page.locator(".admin-product-form select");
  const originalStatus = await status.inputValue();
  const storefront = await page.context().newPage();

  const save = async () => {
    const response = page.waitForResponse((candidate) => candidate.request().method() === "PATCH" && new URL(candidate.url()).pathname.endsWith(adminProductApiPath));
    await page.getByRole("button", { name: "Save product" }).click();
    expect((await response).status()).toBe(200);
  };

  try {
    const editedDescription = `${originalDescription}\nPhase 2E browser verification.`;
    await description.fill(editedDescription);
    await save();
    await storefront.goto("/products/summit-shorts");
    await expect(storefront.getByText("Phase 2E browser verification.", { exact: false })).toBeVisible();

    await status.selectOption("ARCHIVED");
    await save();
    const archivedResponse = await storefront.goto("/products/summit-shorts");
    expect(archivedResponse?.status()).toBe(404);
    await expect(storefront.getByRole("heading", { name: "Summit Running Shorts" })).toHaveCount(0);
  } finally {
    await expect(description).toBeVisible();
    await description.fill(originalDescription);
    await status.selectOption(originalStatus);
    await save();
    await storefront.goto("/products/summit-shorts");
    if (originalStatus === "ACTIVE") await expect(storefront.getByRole("heading", { name: "Summit Running Shorts" })).toBeVisible();
    await storefront.close();
  }

  await nav.getByRole("link", { name: "Inventory" }).click();
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  const inventoryPage = page.locator(".admin-pagination");
  await expect(inventoryPage).toContainText("Page 1 of");
  const firstPageRows = await page.locator(".admin-table--inventory tbody tr").allTextContents();
  await inventoryPage.getByRole("button", { name: "Next" }).click();
  await expect(inventoryPage).toContainText("Page 2 of");
  const secondPageRows = await page.locator(".admin-table--inventory tbody tr").allTextContents();
  expect(new Set(firstPageRows).size).toBe(firstPageRows.length);
  expect(secondPageRows.some((row) => firstPageRows.includes(row))).toBeFalsy();

  await nav.getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  const firstCustomer = page.locator('a.admin-table-link[href^="/admin/customers/"]').first();
  await expect(firstCustomer).toBeVisible();
  await firstCustomer.click();
  await expect(page.locator(".admin-page-header h1")).toBeVisible();

  await nav.getByRole("link", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  const firstOrder = page.locator('a.admin-table-link[href^="/admin/orders/"]').first();
  await expect(firstOrder).toBeVisible();
  await firstOrder.click();
  await expect(page.locator(".admin-page-header h1")).toBeVisible();
});
