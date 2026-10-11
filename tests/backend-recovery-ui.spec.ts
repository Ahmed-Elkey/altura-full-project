import fs from "node:fs";
import { expect, test } from "@playwright/test";

// Real loopback services only: no route interception, registration, purchase,
// fixture edits, email, payment provider or external webhook requests.
test.use({ trace: "off", screenshot: "off" });
const mode = process.env.ALTURA_EXPECT_RUNTIME || "healthy";
if (!["healthy", "degraded"].includes(mode)) throw new Error("Expected runtime must be healthy or degraded.");
const api = "http://127.0.0.1:4000/api/v1";
const evidence = process.env.ALTURA_RECOVERY_EVIDENCE || "test-results/backend-recovery-ui";

for (const width of [390, 768, 1440]) {
  for (const path of ["/", "/collections/shopall"]) {
    test(`${mode} ${width}px ${path}: header, notice, hero and navigation`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 900 });
      const health = await request.get("/api/health");
      expect(health.status()).toBe(mode === "healthy" ? 200 : 503);
      expect((await health.json()).commerceReady).toBe(mode === "healthy");
      await page.goto(path);
      const banner = page.locator("[data-commerce-degraded]");
      const fallback = page.locator("[data-catalog-fallback]");
      if (mode === "degraded") { await expect(banner).toBeVisible(); await expect(fallback).toBeVisible(); }
      else { await expect(banner).toHaveCount(0); await expect(fallback).toHaveCount(0); }
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".site-header__wrap")).toHaveCSS("color", mode === "degraded" ? "rgb(17, 17, 17)" : "rgb(255, 255, 255)");
      // Measure settled presentation rather than a transient route animation.
      await page.evaluate(async () => {
        const animations = document.querySelector(".route-stage")?.getAnimations() || [];
        await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
      });
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null; };
        const header = document.querySelector(".site-header__wrap")!;
        return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, header: rect(".site-header__wrap"), banner: rect("[data-commerce-degraded]"), fallback: rect("[data-catalog-fallback]"), hero: rect("main .shopify-section:first-of-type"), navColor: getComputedStyle(header).color, backgroundOpacity: getComputedStyle(document.querySelector(".site-header__bg")!).opacity };
      });
      const key = `${mode}-${width}-${path === "/" ? "home" : "collection"}`;
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(`${evidence}/${key}-geometry.json`, JSON.stringify(geometry, null, 2));
      await page.screenshot({ path: `${evidence}/${key}.png` });
      expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1);
      if (mode === "degraded") {
        expect(geometry.header!.top).toBeGreaterThanOrEqual(geometry.banner!.bottom - 1);
        expect(geometry.navColor).toBe("rgb(17, 17, 17)");
        expect(Number(geometry.backgroundOpacity)).toBe(1);
        expect(geometry.hero!.top).toBeGreaterThanOrEqual(geometry.header!.bottom - 1);
        expect(geometry.fallback!.top).toBeGreaterThanOrEqual(geometry.hero!.bottom - 1);
        expect(geometry.banner!.height).toBeLessThanOrEqual(width === 390 ? 90 : 54);
      } else {
        expect(geometry.header!.top).toBe(0);
        expect(geometry.hero!.top).toBeCloseTo(0, 0);
        expect(geometry.navColor).toBe("rgb(255, 255, 255)");
      }
      for (const label of ["Cart", "Search"]) {
        const control = page.locator(".site-header").getByRole("button", { name: label, exact: true });
        await expect(control).toBeVisible();
        const box = await control.boundingBox(); expect(box).toBeTruthy();
        expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      }
      if (width < 1200) {
        await page.getByRole("button", { name: "Menu", exact: true }).click();
        const menu = page.getByRole("dialog", { name: "Site menu" }); await expect(menu).toBeVisible();
        await expect(menu.getByRole("link", { name: "Collection", exact: true })).toBeVisible();
        const close = menu.getByRole("button", { name: "Close", exact: true }); await expect(close).toBeVisible();
        const closeBox = await close.boundingBox(); expect(closeBox!.y).toBeGreaterThanOrEqual(mode === "degraded" ? geometry.banner!.bottom : 0);
        await close.click(); await expect(menu).toBeHidden();
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
      }
    });
  }
}

test("real local health, catalog and canonical-origin CORS", async ({ request }) => {
  test.skip(mode !== "healthy", "Backend intentionally unavailable for degraded-layout verification.");
  const health = await request.get(`${api}/health`, { headers: { Origin: "http://127.0.0.1:3100" } });
  expect(health.status()).toBe(200); expect((await health.json()).database).toBe("connected");
  expect(health.headers()["access-control-allow-origin"]).toBe("http://127.0.0.1:3100");
  expect(health.headers()["access-control-allow-credentials"]).toBe("true");
  const catalog = await request.get(`${api}/catalog/products?limit=10`); expect(catalog.status()).toBe(200); expect((await catalog.json()).items.length).toBeGreaterThan(0);
  const products = await request.get("/api/products"); expect(products.status()).toBe(200);
  const body = await products.json(); expect(body.source).toBe("backend"); expect(body.degraded).toBe(false);
  const loginOptions = await request.fetch(`${api}/auth/login`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3100", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
  expect(loginOptions.status()).toBe(204);
  fs.writeFileSync(`${evidence}/real-health-cors.json`, JSON.stringify({ backendHealth: 200, database: "connected", catalog: 200, source: body.source, degraded: body.degraded, corsOrigin: health.headers()["access-control-allow-origin"], credentialsAllowed: true, loginPreflight: 204 }, null, 2));
});

for (const kind of ["customer", "admin"] as const) {
  test(`real Chromium ${kind} login and protected API reads`, async ({ page }) => {
    test.skip(mode !== "healthy", "Backend intentionally unavailable for degraded-layout verification.");
    const file = process.env.ALTURA_TEST_CREDENTIALS_PATH;
    test.skip(!file || !fs.existsSync(file), `BLOCKED: existing private ${kind} credentials unavailable.`);
    const rawConfig = JSON.parse(fs.readFileSync(file!, "utf8"));
    const privateConfig = rawConfig.accounts ? {
      customerEmail: rawConfig.accounts.customer?.email,
      customerPassword: rawConfig.accounts.customer?.password,
      adminEmail: rawConfig.accounts.admin?.email,
      adminPassword: rawConfig.accounts.admin?.password,
    } : rawConfig;
    const email = privateConfig[`${kind}Email`], password = privateConfig[`${kind}Password`];
    test.skip(!email || !password, `BLOCKED: existing private ${kind} credentials unavailable.`);
    // Read existing credentials only. Never include credentials/tokens/cookies in
    // snapshots, reports, attachments or retained browser traces.
    const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(kind === "customer" ? "/account/login" : "/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const loggedIn = page.waitForResponse(r => r.url().endsWith("/auth/login") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await loggedIn; expect(response.status()).toBe(200);
    const payload = await response.json(); expect(payload.user.role).toBe(kind === "customer" ? "CUSTOMER" : "ADMIN");
    await expect(page).toHaveURL(kind === "customer" ? /\/account$/ : /\/admin$/, { timeout: 20000 });
    const results = await page.evaluate(async ({ api, token, paths }) => {
      const result: Array<{ path: string; status: number; itemCount?: number; role?: string }> = [];
      for (const path of paths) { const r = await fetch(api + path, { credentials: "include", headers: { Authorization: `Bearer ${token}` } }); const b = await r.json(); result.push({ path, status: r.status, ...(typeof b.itemCount === "number" ? { itemCount: b.itemCount } : {}), ...(typeof b.role === "string" ? { role: b.role } : {}) }); }
      return result;
    }, { api, token: payload.accessToken, paths: kind === "customer" ? ["/users/me", "/orders", "/cart", "/wishlist"] : ["/auth/me", "/admin/dashboard", "/admin/orders?limit=5"] });
    for (const item of results) expect(item.status).toBe(200);
    const cookieFlags = (await page.context().cookies()).filter(c=>["altura_refresh", "altura_guest"].includes(c.name)).map(c=>({ name: c.name, httpOnly: c.httpOnly, sameSite: c.sameSite, secure: c.secure }));
    expect(cookieFlags.length).toBeGreaterThan(0); for (const cookie of cookieFlags) { expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Lax"); }
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(`${evidence}/real-${kind}-smoke.json`, JSON.stringify({ loginStatus: 200, role: payload.user.role, endpoints: results, cookieFlags, pageErrors }, null, 2));
    expect(pageErrors).toEqual([]);
  });
}

test("real fresh guest cart and wishlist remain empty and stable", async ({ page }) => {
  test.skip(mode !== "healthy", "Backend intentionally unavailable for degraded-layout verification.");
  await page.goto("/cart"); await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  const read = () => page.evaluate(async (api) => {
    const result: Array<{ path: string; status: number; id?: string; itemCount?: number; currency?: string }> = [];
    for (const path of ["/cart", "/wishlist"]) { const r = await fetch(api + path, { credentials: "include" }); const b = await r.json(); result.push({ path, status: r.status, id: b.id, itemCount: b.itemCount, currency: b.currency }); }
    return result;
  }, api);
  const first = await read(); const second = await read();
  for (const item of first) { expect(item.status).toBe(200); expect(item.itemCount).toBe(0); }
  expect(first[0].currency).toBe("EGP"); expect(second[0].id).toBe(first[0].id);
  const cookies = await page.context().cookies(); expect(cookies.some(c=>c.name==="altura_guest"&&c.httpOnly&&c.sameSite==="Lax")).toBe(true);
  fs.writeFileSync(`${evidence}/real-guest-smoke.json`, JSON.stringify({ first, second, stableCart: true, guestCookieHttpOnly: true }, null, 2));
});
