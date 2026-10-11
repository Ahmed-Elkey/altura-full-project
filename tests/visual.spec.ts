import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { watchBrowserErrors } from './helpers/browser-errors';
import { selectAvailableVariant } from './helpers/catalog';

test.use({ actionTimeout: 15000, navigationTimeout: 30000 });

const root = process.cwd();
const referenceDir = path.join(root, "qa", "reference");
const currentDir = path.join(root, "qa", "current");
const diffDir = path.join(root, "qa", "diff");
const stitchTargetDir = path.join(root, "qa", "stitch-target");
const stitchDiffDir = path.join(root, "qa", "stitch-diff");

const surfaces = ["home", "shop-all", "collection", "product", "cart", "search", "checkout"] as const;
type Surface = typeof surfaces[number];

async function settle(page: Page) {
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

async function prepareCurrent(page: Page, surface: Surface) {
  const routes: Record<Surface, string> = {
    home: "/",
    "shop-all": "/collections/shopall",
    collection: "/collections/tops",
    product: "/products/meridian-tee",
    cart: "/",
    search: "/",
    checkout: "/checkout",
  };
  if (surface === "checkout") {
    await page.goto("/products/trail-cap");
    await selectAvailableVariant(page, 'trail-cap');
    await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
    await page.goto("/checkout");
  } else {
    await page.goto(routes[surface]);
  }
  if (surface === "cart") {
    await page.getByRole("button", { name: /Cart/ }).first().click();
    await page.waitForTimeout(350);
  }
  if (surface === "search") {
    await page.getByRole("button", { name: "Search", exact: true }).first().click();
    await page.waitForTimeout(350);
  }
  await settle(page);
}

function resizeBilinear(src: PNG, targetWidth: number, targetHeight: number): PNG {
  const dst = new PNG({ width: targetWidth, height: targetHeight });
  const xRatio = (src.width - 1) / Math.max(targetWidth - 1, 1);
  const yRatio = (src.height - 1) / Math.max(targetHeight - 1, 1);

  for (let y = 0; y < targetHeight; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, src.height - 1);
    const yWeight = srcY - y0;

    for (let x = 0; x < targetWidth; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, src.width - 1);
      const xWeight = srcX - x0;

      const idx00 = (y0 * src.width + x0) * 4;
      const idx10 = (y0 * src.width + x1) * 4;
      const idx01 = (y1 * src.width + x0) * 4;
      const idx11 = (y1 * src.width + x1) * 4;

      const dstIdx = (y * targetWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = src.data[idx00 + c] * (1 - xWeight) + src.data[idx10 + c] * xWeight;
        const bottom = src.data[idx01 + c] * (1 - xWeight) + src.data[idx11 + c] * xWeight;
        dst.data[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return dst;
}

async function neutralScreenshot(page: Page, options?: { fullPage?: boolean }) {
  await page.addStyleTag({
    content: `
    img, video, picture, svg:not(.wordmark-mark) { visibility: hidden !important; }
    * { background-image: none !important; animation: none !important; transition: none !important; }
    .product-art, .product-visual, [class*="image"], [class*="media"], [class*="hero"], [class*="viewport"] { background: #d9d9d6 !important; }
  `,
  });
  return page.screenshot({ animations: "disabled", fullPage: options?.fullPage ?? false });
}

function makeDiff(reference: Buffer, current: Buffer) {
  const a = PNG.sync.read(reference);
  const b = PNG.sync.read(current);
  expect({ width: b.width, height: b.height }).toEqual({ width: a.width, height: a.height });
  const diff = new PNG({ width: a.width, height: a.height });
  const changedPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.18, includeAA: false });
  return { png: PNG.sync.write(diff), changedPixels, ratio: changedPixels / (a.width * a.height) };
}

function makeStitchDiff(targetBuffer: Buffer, currentFullBuffer: Buffer) {
  const target = PNG.sync.read(targetBuffer);
  const current = PNG.sync.read(currentFullBuffer);
  const normalizedCurrent = resizeBilinear(current, target.width, target.height);
  const diff = new PNG({ width: target.width, height: target.height });
  const changedPixels = pixelmatch(target.data, normalizedCurrent.data, diff.data, target.width, target.height, {
    threshold: 0.18,
    includeAA: false,
  });
  return {
    png: PNG.sync.write(diff),
    changedPixels,
    ratio: changedPixels / (target.width * target.height),
    targetDimensions: `${target.width}x${target.height}`,
    sourceDimensions: `${current.width}x${current.height}`,
  };
}

test("capture layout-focused comparison set and verify visual integrity", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  await Promise.all(
    [referenceDir, currentDir, diffDir, stitchTargetDir, stitchDiffDir].map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
  const stats: Record<string, { changedPixels: number; ratio: number; note: string }> = {};
  const browserEvidence: Record<string, { expectedAnonymousRefreshUrls: number; unexpectedErrors: string[]; overflow: number }> = {};
  const stitchStats: Record<
    string,
    {
      changedPixels: number;
      ratio: number;
      targetDimensions: string;
      sourceDimensions: string;
      note: string;
    }
  > = {};

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    for (const surface of surfaces) {
      const currentContext = await browser.newContext({
        viewport,
        baseURL: test.info().project.use.baseURL as string,
      });
      const currentPage = await currentContext.newPage();
      const observed = watchBrowserErrors(currentPage);

      await prepareCurrent(currentPage, surface);
      await currentPage.screenshot({
        path: path.join(currentDir, `${surface}-${viewport.name}.png`),
        animations: "disabled",
      });
      const overflow = await currentPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${surface} ${viewport.name} overflow`).toBeLessThanOrEqual(1);
      expect(observed.unexpected(), `${surface} ${viewport.name} unexpected browser errors`).toEqual([]);
      browserEvidence[`${surface}-${viewport.name}`] = { expectedAnonymousRefreshUrls: observed.expectedAnonymousRefreshes(), unexpectedErrors: observed.unexpected(), overflow };

      const stitchTargetFile = path.join(stitchTargetDir, `${surface}-${viewport.name}.png`);
      const hasStitchTarget = fs.existsSync(stitchTargetFile);

      let neutralCurrentFull: Buffer | null = null;
      if (hasStitchTarget) {
        neutralCurrentFull = await neutralScreenshot(currentPage, { fullPage: true });
        const stitchTargetBuffer = await readFile(stitchTargetFile);
        const stitchResult = makeStitchDiff(stitchTargetBuffer, neutralCurrentFull);
        await writeFile(path.join(stitchDiffDir, `${surface}-${viewport.name}.png`), stitchResult.png);
        stitchStats[`${surface}-${viewport.name}`] = {
          changedPixels: stitchResult.changedPixels,
          ratio: Number(stitchResult.ratio.toFixed(6)),
          targetDimensions: stitchResult.targetDimensions,
          sourceDimensions: stitchResult.sourceDimensions,
          note: "Layout-focused comparison against approved Stitch design target; photography neutralized and dimensions normalized.",
        };
      }

      const neutralCurrent = await neutralScreenshot(currentPage);
      const refFile = path.join(referenceDir, `${surface}-${viewport.name}.png`);
      if (fs.existsSync(refFile)) {
        const refBuffer = await readFile(refFile);
        const result = makeDiff(refBuffer, neutralCurrent);
        await writeFile(path.join(diffDir, `${surface}-${viewport.name}.png`), result.png);
        stats[`${surface}-${viewport.name}`] = {
          changedPixels: result.changedPixels,
          ratio: Number(result.ratio.toFixed(6)),
          note: "Informational only: photography and brand content are neutralized; no pixel threshold is enforced.",
        };
      }
      await currentContext.close();
    }
  }

  await writeFile(path.join(diffDir, "layout-diff-stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
  await writeFile(path.join(diffDir, "browser-evidence.json"), `${JSON.stringify(browserEvidence, null, 2)}\n`);
  await writeFile(path.join(stitchDiffDir, "stitch-diff-stats.json"), `${JSON.stringify(stitchStats, null, 2)}\n`);
  expect(Object.keys(stats)).toHaveLength(14);
  expect(Object.keys(stitchStats)).toHaveLength(6);
});
