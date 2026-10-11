import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = "https://www.balmoralrunning.com";
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 900 },
  { name: "small-desktop", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
];

const routes = {
  home: "/",
  shopAll: "/collections/shopall",
  category: "/collections/tops",
  product: "/products/belmore-4-panel-hat-fw26",
};

const roundRect = (rect) => rect && Object.fromEntries(
  ["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, Math.round(rect[key] * 10) / 10]),
);

async function dismissPrivacy(page) {
  const localizationClose = page.locator('#site-localization-dialog button[aria-label*="Close"], #site-localization-dialog [data-ui*="close"]').first();
  if (await localizationClose.isVisible().catch(() => false)) {
    await localizationClose.click({ force: true });
  } else {
    await page.locator("#site-localization-dialog[open]").evaluate((dialog) => dialog.close()).catch(() => {});
  }
  const decline = page.getByRole("button", { name: "Decline", exact: true });
  if (await decline.isVisible().catch(() => false)) await decline.click({ force: true });
}

async function box(locator) {
  return roundRect(await locator.first().boundingBox().catch(() => null));
}

async function baseMetrics(page) {
  return page.evaluate(() => {
    const pick = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        rect: Object.fromEntries(["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, Math.round(rect[key] * 10) / 10])),
        display: style.display,
        position: style.position,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        padding: style.padding,
        gap: style.gap,
        borderBottom: style.borderBottom,
        transition: style.transition,
      };
    };
    const productLink = document.querySelector('a[href*="/products/"]');
    const productImage = productLink?.querySelector("img") || productLink?.closest("li, article, div")?.querySelector("img");
    const productCard = productLink?.closest("li, article") || productLink?.parentElement;
    return {
      viewport: { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      body: pick(document.body),
      header: pick(document.querySelector("header") || document.body.firstElementChild),
      main: pick(document.querySelector("main")),
      h1: pick(document.querySelector("h1")),
      h2: pick(document.querySelector("h2")),
      productCard: pick(productCard),
      productImage: pick(productImage),
      footer: pick(document.querySelector("footer")),
    };
  });
}

async function measurePage(page, path) {
  await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissPrivacy(page);
  await page.waitForTimeout(800);
  return baseMetrics(page);
}

async function overlayMetrics(page, triggerName, drawerSide = null) {
  const trigger = page.getByRole("button", { name: triggerName, exact: true }).first();
  if (!(await trigger.isVisible().catch(() => false))) return { available: false };
  await trigger.click({ force: true });
  await page.waitForTimeout(350);
  const metrics = await page.evaluate(({ triggerName, drawerSide }) => {
    const visible = [...document.querySelectorAll("body *")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.position === "fixed" && rect.width > 150 && rect.height > 150 && style.visibility !== "hidden" && style.display !== "none";
    });
    const candidates = visible.map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, rect, area: rect.width * rect.height };
    }).sort((a, b) => drawerSide === "right" ? b.rect.x - a.rect.x || a.area - b.area : a.area - b.area);
    const selected = candidates.find(({ rect }) => drawerSide !== "right" || rect.right >= innerWidth - 2) || candidates[0];
    if (!selected) return { available: true, fixedCandidates: [] };
    const style = getComputedStyle(selected.element);
    return {
      available: true,
      triggerName,
      rect: Object.fromEntries(["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, Math.round(selected.rect[key] * 10) / 10])),
      transition: style.transition,
      fixedCandidates: candidates.slice(0, 8).map(({ rect }) => ({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) })),
    };
  }, { triggerName, drawerSide });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  return metrics;
}

const browser = await chromium.launch({ headless: true });
const report = { measuredAt: new Date().toISOString(), baseURL, viewports: {} };

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(4_000);
  console.error(`Measuring ${viewport.name} (${viewport.width}x${viewport.height})`);
  const data = {};
  data.home = await measurePage(page, routes.home);
  data.home.hero = await box(page.locator('[class*="pb-row-hero"]').first());
  data.home.promo = await box(page.locator('[class*="pb-row-promo-products"]').first());
  data.home.editorial = await box(page.locator('[class*="pb-row-text-media"]').first());
  data.home.footer = await box(page.locator("footer"));
  data.home.menu = await overlayMetrics(page, "Menu");
  data.home.search = await overlayMetrics(page, "Search");
  data.home.cart = await overlayMetrics(page, "Cart", "right");
  data.shopAll = await measurePage(page, routes.shopAll);
  data.shopAll.filter = await overlayMetrics(page, "Filter by");
  data.category = await measurePage(page, routes.category);
  data.product = await measurePage(page, routes.product);
  data.product.galleryImage = await box(page.locator("main img").first());
  data.product.buyBox = await box(page.locator("main form, main aside").first());
  report.viewports[viewport.name] = data;
  await context.close();
}

await browser.close();
await mkdir("reference/balmoral", { recursive: true });
await writeFile("reference/balmoral/measurements.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
