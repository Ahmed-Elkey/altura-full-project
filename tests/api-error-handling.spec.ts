import { test, expect, type Page, type Route } from "@playwright/test";
import { CommerceApiError, UserActionError, cartIssueMessage, getUserErrorMessage, logApiError, type ApiErrorContext } from "../lib/api-errors";
import { commerceFetch } from "../lib/commerce-api";

// All transport fixtures are intercepted locally. These tests do not authenticate
// against PostgreSQL, send mail, invoke gateways, or write application records.
test.use({ trace: "off", screenshot: "off" });
const raw = "TypeError: Failed to fetch; PrismaClientKnownRequestError SELECT secret FROM database; internal_exception_marker";
const offline = "We couldn't connect to ALTURA. Please try again in a moment.";
const unexpected = "Something went wrong on our side. Please try again.";
const limited = "Too many attempts. Please wait a few minutes and try again.";
const timeout = "This is taking longer than expected. Please try again.";
const scenarios: Array<{ status: number; expected: string }> = [
  { status: 400, expected: "Please enter a valid email address and password." },
  { status: 401, expected: "The email or password is incorrect. Please try again." },
  { status: 403, expected: "You don't have permission to do that." },
  { status: 404, expected: "We couldn't find what you requested. Refresh the page and try again." },
  { status: 408, expected: timeout },
  { status: 429, expected: limited },
  { status: 500, expected: unexpected },
  { status: 502, expected: offline },
  { status: 503, expected: offline },
  { status: 504, expected: timeout },
];

for (const scenario of scenarios) {
  test(`mapper hides technical details for HTTP ${scenario.status}`, () => {
    const error = new CommerceApiError(scenario.status, "login", "http", { message: raw });
    expect(getUserErrorMessage(error)).toBe(scenario.expected);
    expect(error.message).toBe(scenario.expected);
    expect(error.details).toEqual({ message: raw });
  });
}

test("unknown errors cannot become display copy; approved local actions remain specific", () => {
  expect(getUserErrorMessage(new Error(raw))).toBe("We couldn't complete that request. Please try again.");
  expect(getUserErrorMessage(new TypeError("Failed to fetch"))).toBe(offline);
  expect(getUserErrorMessage(new DOMException(raw, "AbortError"))).toBe(timeout);
  expect(getUserErrorMessage({ message: raw })).toBe("We couldn't complete that request. Please try again.");
  expect(getUserErrorMessage(new UserActionError("shipping-required"))).toBe("Please select a shipping method to continue.");
  expect(cartIssueMessage("OUT_OF_STOCK")).toBe("An item in your cart is out of stock.");
  expect(cartIssueMessage(raw)).not.toContain(raw);
});

test("validation messages follow the operation, without echoing server validation text", () => {
  const contexts: ApiErrorContext[] = ["register", "cart", "checkout", "newsletter", "returns", "profile", "admin"];
  for (const context of contexts) {
    const message = getUserErrorMessage(new CommerceApiError(400, context, "http", { message: [raw] }));
    expect(message).toContain("Please"); expect(message).not.toContain("TypeError");
  }
  expect(getUserErrorMessage(new CommerceApiError(401, "profile"))).toContain("session has expired");
  expect(getUserErrorMessage(new CommerceApiError(401, "password"))).toBe("Please check your current password and choose a different new password.");
  expect(getUserErrorMessage(new CommerceApiError(404, "orders"))).toContain("Check the details");
});

test("development diagnostics retain technical evidence and redact credentials", () => {
  const original = console.warn;
  const originalEnv = process.env.NODE_ENV;
  const entries: unknown[][] = [];
  console.warn = (...args) => { entries.push(args); };
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    logApiError(new CommerceApiError(500, "generic", "http", { message: "PrismaError password=privateDummy authorization: Bearer dummyBearer postgresql://alice:dummyDb@127.0.0.1:5433/altura_dev person@example.invalid" }), "/orders?token=secret");
    const output = JSON.stringify(entries);
    expect(output).toContain("PrismaError");
    for (const secret of ["privateDummy", "dummyBearer", "dummyDb", "person@example.invalid", "token=secret"]) expect(output).not.toContain(secret);
    Object.assign(process.env, { NODE_ENV: "production" });
    logApiError(new Error(raw));
    expect(entries).toHaveLength(1);
  } finally { console.warn = original; if (originalEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: originalEnv }); }
});

test("transport preserves credentials, auth, idempotency, method and payload", async () => {
  const original = globalThis.fetch;
  let seen: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => { seen = init; return new Response('{"ok":true}', { status: 200 }); };
  try {
    expect(await commerceFetch("/checkout/place-order", { method: "POST", headers: { Authorization: "Bearer synthetic", "Idempotency-Key": "synthetic-key" }, body: '{"country":"EG"}' })).toEqual({ ok: true });
    expect(seen?.credentials).toBe("include"); expect(seen?.method).toBe("POST"); expect(seen?.body).toBe('{"country":"EG"}');
    expect(new Headers(seen?.headers).get("Authorization")).toBe("Bearer synthetic");
    expect(new Headers(seen?.headers).get("Idempotency-Key")).toBe("synthetic-key");
  } finally { globalThis.fetch = original; }
});

for (const mode of ["network", "timeout", "non-json-error", "bad-json-success", "cancelled"] as const) {
  test(`transport safely handles ${mode} without retrying a mutation`, async () => {
    const original = globalThis.fetch; let calls = 0;
    const abort = new AbortController();
    if (mode === "cancelled") abort.abort();
    globalThis.fetch = async (_input, init) => {
      calls++;
      if (mode === "network") throw new TypeError("Failed to fetch");
      if (mode === "timeout" || mode === "cancelled") return new Promise((_resolve, reject) => {
        const rejectAbort = () => reject(new DOMException("Request aborted", "AbortError"));
        if (init?.signal?.aborted) rejectAbort(); else init?.signal?.addEventListener("abort", rejectAbort, { once: true });
      });
      return new Response(raw, { status: mode === "non-json-error" ? 500 : 200 });
    };
    try {
      const error = await commerceFetch("/cart/items", { method: "POST", body: "{}", signal: abort.signal }, { timeoutMs: 10 }).catch(e => e);
      expect(error).toBeInstanceOf(CommerceApiError);
      const expected = mode === "network" ? offline : mode === "timeout" ? timeout : mode === "cancelled" ? "The request was cancelled. Please try again." : mode === "non-json-error" ? unexpected : "We couldn't complete that request. Please try again.";
      expect(getUserErrorMessage(error)).toBe(expected); expect(calls).toBe(1);
    } finally { globalThis.fetch = original; }
  });
}

const emptyCart = { id: "synthetic-cart", ownerType: "guest", currency: "EGP", itemCount: 0, subtotal: 0, items: [], issues: [], expiresAt: null, updatedAt: "2026-10-01T00:00:00.000Z" };
const cart = { ...emptyCart, itemCount: 1, subtotal: 100, items: [{ id: "synthetic-item", variantId: "synthetic-variant", quantity: 1, unitPrice: 100, lineTotal: 100, currency: "EGP", availableQuantity: 5, product: { id: "synthetic-product", slug: "summit-shorts", name: "Synthetic shorts", image: null }, option: { colorName: "Black", colorHex: "#000000", size: "M", title: "Black / M" } }] };
const user = { id: "synthetic-user", email: "synthetic@example.invalid", firstName: "Synthetic", lastName: "Shopper", phone: null, role: "CUSTOMER", status: "ACTIVE", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
async function json(route: Route, status: number, data: unknown) {
  await route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3100", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify(data) });
}
async function setup(page: Page, handler: (route: Route, path: string) => Promise<boolean>, role?: "CUSTOMER" | "ADMIN", populated = false) {
  await page.route("http://127.0.0.1:4000/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3100", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE" } }); return; }
    if (await handler(route, path)) return;
    if (path === "/auth/refresh") await json(route, role ? 200 : 401, role ? { user: { ...user, role }, accessToken: "synthetic-browser-token" } : { message: raw });
    else if (path === "/cart") await json(route, 200, populated ? cart : emptyCart);
    else if (["/admin/catalog/categories", "/admin/catalog/collections", "/catalog/categories"].includes(path)) await json(route, 200, []);
    else if (path === "/users/me/addresses" || path === "/returns") await json(route, 200, []);
    else await json(route, 500, { message: raw });
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}
async function customerSubmit(page: Page, register = false) {
  await page.goto(register ? "/account/register" : "/account/login");
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
  if (register) { await page.getByLabel("First name", { exact: true }).fill("Synthetic"); await page.getByLabel("Last name", { exact: true }).fill("Shopper"); }
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-only-123!");
  if (register) await page.getByLabel("Confirm password", { exact: true }).fill("Synthetic-test-only-123!");
  await page.getByRole("button", { name: register ? "Create account" : "Sign in", exact: true }).click();
}
async function noLeak(page: Page, errors: string[]) {
  expect(await page.locator("body").innerText()).not.toMatch(/Failed to fetch|TypeError|PrismaClient|internal_exception_marker|SELECT secret|stack trace/i);
  expect(errors).toEqual([]);
}

for (const kind of ["customer", "admin"] as const) {
  for (const scenario of [...scenarios, { status: 0, expected: offline }]) {
    test(`Chromium ${kind} login maps ${scenario.status || "network failure"}`, async ({ page }) => {
      const errors = await setup(page, async (route, path) => {
        if (path !== "/auth/login") return false;
        if (!scenario.status) await route.abort("failed"); else await json(route, scenario.status, { message: raw });
        return true;
      });
      if (kind === "customer") await customerSubmit(page);
      else {
        await page.goto("/admin/login");
        await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
        await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-only-123!");
        await expect(page).toHaveURL(/\/account\/login\?next=%2Fadmin/);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
      }
      await expect(page.locator(".balmoral-auth__error")).toHaveText(scenario.expected);
      await noLeak(page, errors);
    });
  }
}

for (const status of [400, 409, 429, 500, 503, 0]) {
  test(`Chromium registration maps ${status || "network failure"}`, async ({ page }) => {
    const errors = await setup(page, async (route, path) => {
      if (path !== "/auth/register") return false;
      if (!status) await route.abort("failed"); else await json(route, status, { message: [raw] }); return true;
    });
    await customerSubmit(page, true);
    await expect(page.locator(".balmoral-auth__error")).toHaveText(getUserErrorMessage(new CommerceApiError(status, "register", status ? "http" : "network")));
    await noLeak(page, errors);
  });
}

test("Chromium removes legacy account hint and never stores an attempted login email", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("altura_last_email", "phase15-admin@altura.local"));
  const errors = await setup(page, async (route, path) => { if (path !== "/auth/login") return false; await json(route, 401, { message: raw }); return true; });
  await page.goto("/account/login");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("altura_last_email"))).toBeNull();
  await expect(page.locator("body")).not.toContainText("phase15-admin@altura.local");
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-test-only-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".balmoral-auth__error")).toContainText("incorrect");
  expect(await page.evaluate(() => localStorage.getItem("altura_last_email"))).toBeNull();
  await noLeak(page, errors);
});

test("Chromium wishlist unavailable state is readable", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/wishlist") return false; await route.abort("failed"); return true; });
  await page.goto("/wishlist"); await expect(page.locator(".wishlist-page [role=alert]")).toHaveText(offline); await noLeak(page, errors);
});

test("Chromium cart mutation preserves the cart and shows rate-limit copy", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/cart/items/synthetic-item") return false; await json(route, 429, { message: raw }); return true; }, undefined, true);
  await page.goto("/cart"); await page.getByRole("button", { name: "Increase Synthetic shorts quantity" }).click();
  await expect(page.locator(".cart-error")).toHaveText(limited);
  await expect(page.locator(".cart-qty span")).toHaveText("1"); await noLeak(page, errors);
});

test("Chromium sanitizes cart issue messages even inside successful responses", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/cart") return false; await json(route, 200, { ...cart, issues: [{ itemId: "synthetic-item", code: "OUT_OF_STOCK", message: raw, availableQuantity: 0 }] }); return true; });
  await page.goto("/cart"); await expect(page.locator(".cart-error")).toHaveText("An item in your cart is out of stock."); await noLeak(page, errors);
});

test("Chromium shipping-method failure blocks checkout with validation copy", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/checkout/shipping-methods") return false; await json(route, 400, { message: raw }); return true; }, undefined, true);
  await page.goto("/checkout"); await expect(page.locator(".bchk-error")).toHaveText("Please check your checkout details, shipping method and discount code.");
  await expect(page.getByRole("button", { name: "Pay now" })).toBeDisabled(); await noLeak(page, errors);
});

test("Chromium order lookup hides backend details for 404", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/orders/guest/lookup") return false; await json(route, 404, { message: raw }); return true; });
  await page.goto("/track-order"); await page.getByLabel("Order number").fill("ALT-SYNTHETIC"); await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
  await page.getByRole("button", { name: "Track order →" }).click();
  await expect(page.locator(".track-form [role=alert]")).toHaveText("We couldn't find that order or return. Check the details and try again."); await noLeak(page, errors);
});

test("Chromium newsletter rate limit never exposes backend messages", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/newsletter/subscribe") return false; await json(route, 429, { message: raw }); return true; });
  await page.goto("/collections/shopall"); await page.getByLabel("Email address", { exact: true }).fill("synthetic@example.invalid");
  await page.getByRole("button", { name: "Subscribe", exact: true }).click();
  await expect(page.locator(".site-footer__newsletterStatus")).toHaveText(limited); await noLeak(page, errors);
});

test("Chromium profile mutation handles forbidden action", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/users/me") return false; await json(route, 403, { message: raw }); return true; }, "CUSTOMER");
  await page.goto("/account/profile"); await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".acct-modal .acct-err")).toHaveText("You don't have permission to do that."); await noLeak(page, errors);
});

test("Chromium returns mutation maps validation failure", async ({ page }) => {
  const errors = await setup(page, async (route, path) => {
    if (path === "/orders/ALT-SYNTHETIC") { await json(route, 200, { orderNumber: "ALT-SYNTHETIC", status: "DELIVERED", currency: "EGP", items: [{ id: "synthetic-line", productName: "Synthetic shorts", quantity: 1, unitPrice: 100 }] }); return true; }
    if (path === "/returns" && route.request().method() === "POST") { await json(route, 400, { message: raw }); return true; }
    return false;
  }, "CUSTOMER");
  await page.goto("/start-a-return"); await page.getByLabel("Order number").fill("ALT-SYNTHETIC"); await page.getByRole("button", { name: "Load order →" }).click();
  await page.locator(".returns-item-check input").check(); await page.getByRole("button", { name: "Request return →" }).click();
  await expect(page.locator(".brf [role=alert]")).toHaveText("Please check the selected items and return details."); await noLeak(page, errors);
});

test("Chromium admin mutation maps 5xx without exposing exceptions", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/admin/discounts") return false; await json(route, route.request().method() === "POST" ? 500 : 200, route.request().method() === "POST" ? { message: raw } : { items: [], total: 0, page: 1, limit: 25 }); return true; }, "ADMIN");
  await page.goto("/admin/discounts"); await page.getByRole("button", { name: "Create code", exact: true }).click(); await page.getByLabel("Code", { exact: true }).fill("SYNTHETIC");
  await page.getByRole("button", { name: "Create discount", exact: true }).click();
  await expect(page.locator(".admin-error")).toContainText(unexpected); await noLeak(page, errors);
});

test("Chromium admin successful payment review still masks stored exception fields", async ({ page }) => {
  const errors = await setup(page, async (route, path) => {
    if (path !== "/admin/payments/review") return false;
    await json(route, 200, { total: 1, orders: [{ id: "synthetic-order", orderNumber: "ALT-SYNTHETIC", email: user.email, status: "PAYMENT_REVIEW", currency: "EGP", totals: { grandTotal: 100 }, payments: [{ id: "synthetic-payment", provider: "MOCK", status: "FAILED", amount: 100, refundedAmount: 0, failureReason: raw, lastWebhookAt: null }] }], failedWebhooks: [{ id: "synthetic-event", provider: "MOCK", externalEventId: "synthetic", eventType: "synthetic", processingError: raw, createdAt: "2026-10-01T00:00:00.000Z" }] }); return true;
  }, "ADMIN");
  await page.goto("/admin/payments"); await expect(page.getByText("Payment needs review. Check the order details.", { exact: true })).toBeVisible();
  await expect(page.getByText("This payment event needs review.", { exact: true })).toBeVisible(); await noLeak(page, errors);
});

test("Chromium actual client deadline ends a stalled login with timeout copy", async ({ page }) => {
  // Deliberately leave this intercepted request unanswered; exercise the real
  // AbortController deadline, not a fabricated HTTP timeout response.
  const errors = await setup(page, async (_route, path) => path === "/auth/login");
  await customerSubmit(page);
  await expect(page.locator(".balmoral-auth__error")).toHaveText(timeout, { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await noLeak(page, errors);
});

test("Chromium guest cart unavailable state uses safe copy", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/cart") return false; await json(route, 503, { message: raw }); return true; });
  await page.goto("/cart"); await expect(page.locator(".cart-error")).toHaveText(offline); await noLeak(page, errors);
});

test("Chromium wishlist removal keeps saved data when forbidden", async ({ page }) => {
  const errors = await setup(page, async (route, path) => {
    if (path === "/wishlist") { await json(route, 200, { itemCount: 1, items: [{ id: "synthetic-wishlist", productId: "synthetic-product", slug: "summit-shorts", name: "Synthetic shorts", status: "ACTIVE", available: true, priceFrom: 100, currency: "EGP", image: null, colors: ["Black"] }] }); return true; }
    if (path === "/wishlist/items/synthetic-product") { await json(route, 403, { message: raw }); return true; }
    return false;
  });
  await page.goto("/wishlist"); await page.getByRole("button", { name: /Remove/ }).click();
  await expect(page.locator(".wishlist-page [role=alert]")).toHaveText("You don't have permission to do that.");
  await expect(page.getByText("Synthetic shorts", { exact: true })).toBeVisible(); await noLeak(page, errors);
});

test("Chromium session refresh preserves a network failure category", async ({ page }) => {
  let refreshes = 0;
  const errors = await setup(page, async (route, path) => {
    if (path === "/auth/refresh") { refreshes++; if (refreshes === 1) await json(route, 200, { user, accessToken: "synthetic-token" }); else await route.abort("failed"); return true; }
    if (path === "/wishlist") { await json(route, 401, { message: raw }); return true; }
    return false;
  });
  await page.goto("/wishlist"); await expect(page.locator(".wishlist-page [role=alert]")).toHaveText(offline);
  expect(refreshes).toBeGreaterThan(1); await noLeak(page, errors);
});

test("Chromium real backend outage shows readable login copy without interception", async ({ page, request }) => {
  // Only run when the real backend health endpoint is unavailable; never submit
  // this synthetic login to a reachable backend in later environments.
  let available = false;
  try { await request.get("http://127.0.0.1:4000/api/v1/health", { timeout: 1000 }); available = true; } catch { /* Expected local outage. */ }
  test.skip(available, "Real outage case requires an unavailable backend.");
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await customerSubmit(page); await expect(page.locator(".balmoral-auth__error")).toHaveText(offline);
  await noLeak(page, errors);
});

const shipping = { id: "synthetic-shipping", code: "SYNTHETIC", name: "Synthetic shipping", currency: "EGP", price: 0, free: true, estimatedMinDays: 1, estimatedMaxDays: 2 };
const quote = { currency: "EGP", itemCount: 1, items: [{ variantId: "synthetic-variant", productName: "Synthetic shorts", colorName: "Black", size: "M", unitPrice: 100, lineTotal: 100, quantity: 1 }], shipping, discount: { code: null, itemDiscount: 0, shippingDiscount: 0 }, totals: { subtotal: 100, discountTotal: 0, shippingTotal: 0, taxTotal: 0, grandTotal: 100 } };

test("checkout uses customer cards and keeps payment selection usable on all screen sizes", async ({ page }) => {
  const errors = await setup(page, async (route, path) => {
    if (path === "/checkout/shipping-methods") { await json(route, 200, { methods: [shipping] }); return true; }
    if (path === "/checkout/quote") { await json(route, 200, quote); return true; }
    return false;
  }, undefined, true);
  await checkoutFields(page);
  const heading = page.getByRole("heading", { name: "Checkout", exact: true });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/Inter/);
  await expect(page.getByRole("heading", { name: "Order summary", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Cash on Delivery", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Cash on Delivery", exact: true }).check();
  await expect(page.getByPlaceholder("Card number")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Place order", exact: true })).toBeEnabled();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: test.info().outputPath(`checkout-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.getByRole("radio", { name: "Credit / Debit Card", exact: true }).check();
  await expect(page.getByPlaceholder("Card number")).toBeVisible();
  expect(errors).toEqual([]);
});

test("empty checkout keeps the same customer heading and card style", async ({ page }) => {
  await setup(page, async () => false);
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your bag is empty.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shop all", exact: true })).toHaveAttribute("href", "/collections/shopall");
});

for (const method of ["CARD", "CASH_ON_DELIVERY"] as const) {
  test(`customer checkout completes the ${method} flow after redesign`, async ({ page }) => {
    const order = { orderNumber: "ALT-CHECKOUT-DESIGN", email: user.email, currency: "EGP", status: "CONFIRMED", paymentMethod: method, paymentStatus: method === "CARD" ? "PAID" : "PENDING", totals: quote.totals, createdAt: "2026-10-07T12:00:00Z", placedAt: "2026-10-07T12:00:00Z", items: quote.items.map(item => ({ ...item, id: item.variantId, productImageUrl: null })), shipments: [] };
    const paymentCalls: string[] = [];
    const errors = await setup(page, async (route, path) => {
      if (path === "/checkout/shipping-methods") { await json(route, 200, { methods: [shipping] }); return true; }
      if (path === "/checkout/quote") { await json(route, 200, quote); return true; }
      if (path === "/checkout/place-order") {
        expect(route.request().postDataJSON().paymentMethod).toBe(method);
        expect(route.request().headers()["idempotency-key"]).toMatch(/^altura-order-/);
        await json(route, 201, { order }); return true;
      }
      if (path === "/payments/initialize") { paymentCalls.push(path); await json(route, 201, { payment: { id: "design-payment" }, checkout: { mode: "mock" } }); return true; }
      if (path === "/payments/mock/design-payment/complete") { paymentCalls.push(path); await json(route, 200, { status: "PAID" }); return true; }
      if (path === "/orders/guest/lookup") { await json(route, 200, order); return true; }
      return false;
    }, undefined, true);
    await checkoutFields(page);
    await expect(page.locator(".bchk-totals")).toHaveAttribute("data-quote-status", "current");
    if (method === "CARD") {
      await page.getByPlaceholder("Card number").fill("4242424242424242");
      await page.getByPlaceholder("Expiration date (MM / YY)").fill("12 / 30");
      await page.getByPlaceholder("Security code").fill("123");
      await page.getByPlaceholder("Name on card").fill("Synthetic");
    } else await page.getByRole("radio", { name: "Cash on Delivery", exact: true }).check();
    await page.getByRole("button", { name: method === "CARD" ? "Pay now" : "Place order", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Order received.", exact: true })).toBeVisible();
    expect(paymentCalls.length).toBe(method === "CARD" ? 2 : 0);
    expect(errors).toEqual([]);
  });
}
async function checkoutFields(page: Page) {
  await page.goto("/checkout");
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  if (await page.getByPlaceholder("Email", { exact: true }).count()) await page.getByPlaceholder("Email", { exact: true }).fill(user.email);
  await page.getByPlaceholder("First name").fill("Synthetic"); await page.getByPlaceholder("Last name").fill("Shopper");
  await page.getByPlaceholder("Address", { exact: true }).fill("1 Synthetic Test Street"); await page.getByPlaceholder("City", { exact: true }).fill("Cairo");
  await page.getByRole("combobox", { name: "Region" }).selectOption({ label: "Cairo" }); await page.getByPlaceholder("Phone", { exact: true }).fill("+201000000000");
}
for (const step of ["quote", "place-order", "initialize", "complete"] as const) {
  test(`Chromium checkout ${step} failure uses safe copy and preserves contracts`, async ({ page }) => {
    const paths: string[] = [];
    const errors = await setup(page, async (route, path) => {
      const req = route.request();
      if (path === "/checkout/shipping-methods") { await json(route, 200, { methods: [shipping] }); return true; }
      if (path === "/checkout/quote") { await json(route, step === "quote" ? 503 : 200, step === "quote" ? { message: raw } : quote); return true; }
      if (path === "/checkout/place-order") {
        paths.push(path); expect(req.headers()["idempotency-key"]).toMatch(/^altura-order-/);
        expect(req.postDataJSON().shippingAddress.countryCode).toBe("EG");
        expect(req.headers().authorization).toBe("Bearer synthetic-browser-token");
        await json(route, step === "place-order" ? 400 : 201, step === "place-order" ? { message: raw } : { order: { orderNumber: "ALT-SYNTHETIC", email: user.email, currency: "EGP", totals: quote.totals } }); return true;
      }
      if (path === "/payments/initialize") {
        paths.push(path); expect(req.headers()["idempotency-key"]).toMatch(/^altura-payment-/);
        await json(route, step === "initialize" ? 500 : 201, step === "initialize" ? { message: raw } : { payment: { id: "synthetic-payment" }, checkout: { mode: "mock" } }); return true;
      }
      if (path === "/payments/mock/synthetic-payment/complete") { paths.push(path); await json(route, 503, { message: raw }); return true; }
      return false;
    }, "CUSTOMER", true);
    await checkoutFields(page);
    if (step !== "quote") {
      await expect(page.locator(".bchk-totals")).toHaveAttribute("data-quote-status", "current");
      await page.getByPlaceholder("Card number").fill("4242424242424242"); await page.getByPlaceholder("Expiration date (MM / YY)").fill("12 / 30");
      await page.getByPlaceholder("Security code").fill("123"); await page.getByPlaceholder("Name on card").fill("Synthetic");
      await page.getByRole("button", { name: "Pay now" }).click();
    }
    const expected = step === "place-order" ? "Please check your checkout details, shipping method and discount code." : step === "initialize" ? unexpected : offline;
    await expect(page.locator(".bchk-error")).toHaveText(expected);
    expect(paths.length).toBe(step === "quote" ? 0 : step === "place-order" ? 1 : step === "initialize" ? 2 : 3);
    await noLeak(page, errors);
  });
}

test("Chromium address creation handles validation failure", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/users/me/addresses" || route.request().method() !== "POST") return false; await json(route, 400, { message: raw }); return true; }, "CUSTOMER");
  await page.goto("/account/profile"); await page.getByRole("button", { name: "Add", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Add address" });
  await modal.getByPlaceholder("First name").fill("Synthetic"); await modal.getByPlaceholder("Last name").fill("Shopper");
  await modal.getByPlaceholder("Address", { exact: true }).fill("1 Synthetic Test Street"); await modal.getByPlaceholder("City", { exact: true }).fill("Cairo");
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(modal.locator(".acct-err")).toHaveText("Please check your details and try again."); await noLeak(page, errors);
});

test("Chromium security sign-out-all handles rejection without unhandled errors", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/auth/logout-all") return false; await json(route, 403, { message: raw }); return true; }, "CUSTOMER");
  await page.goto("/account/security"); await page.getByRole("button", { name: "Sign out all sessions →" }).click();
  await expect(page.locator(".account-form-error")).toHaveText("You don't have permission to do that."); await noLeak(page, errors);
});

test("Chromium password rejection uses credential guidance rather than claiming session expiry", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/users/me/password") return false; await json(route, 401, { message: raw }); return true; }, "CUSTOMER");
  await page.goto("/account/security");
  await page.getByLabel("Current password", { exact: true }).fill("Synthetic-old-password");
  await page.getByLabel("New password", { exact: true }).fill("Synthetic-new-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Synthetic-new-password");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.locator(".account-form-error")).toHaveText("Please check your current password and choose a different new password.");
  await noLeak(page, errors);
});

test("Chromium admin product save preserves edited fields on validation failure", async ({ page }) => {
  const errors = await setup(page, async (route, path) => {
    if (path !== "/admin/catalog/products/synthetic-product") return false;
    await json(route, route.request().method() === "PATCH" ? 400 : 200, route.request().method() === "PATCH" ? { message: raw } : { id: "synthetic-product", slug: "synthetic", name: "Synthetic product", description: "Synthetic", status: "ACTIVE", basePrice: 100, currency: "EGP", featured: false, variants: [], images: [], categories: [], collections: [] }); return true;
  }, "ADMIN");
  await page.goto("/admin/products/synthetic-product"); await page.getByLabel("Name", { exact: true }).fill("Synthetic edited");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.locator(".admin-error")).toContainText("Please check your details and try again.");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Synthetic edited"); await noLeak(page, errors);
});

test("Chromium order confirmation unavailable state does not imply an order succeeded", async ({ page }) => {
  const errors = await setup(page, async (route, path) => { if (path !== "/orders/guest/lookup") return false; await json(route, 503, { message: raw }); return true; });
  await page.goto("/order-confirmation/ALT-SYNTHETIC?email=synthetic%40example.invalid");
  await expect(page.locator(".customer-order [role=alert]")).toHaveText(offline);
  await expect(page.getByRole("heading", { name: "Order received." })).toHaveCount(0); await noLeak(page, errors);
});
