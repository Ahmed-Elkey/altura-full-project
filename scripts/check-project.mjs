import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "START_ALTURA.bat",
  "TEST_ALTURA.bat",
  "app/layout.tsx",
  "app/page.tsx",
  "app/globals.css",
  "app/checkout/page.tsx",
  "app/api/health/route.ts",
  "app/api/products/route.ts",
  "components/SiteHeader.tsx",
  "components/ProductDetail.tsx",
  "components/CheckoutPreview.tsx",
  "playwright.config.ts",
  "tests/functional.spec.ts",
  "tests/visual.spec.ts",
  "REFERENCE_AUDIT.md",
  "DESIGN_AUDIT.md",
  "QA_REPORT.md",
  "README.md",
  "data/products.ts",
  "data/store.ts",
  "lib/storefront.ts",
  "public/video/altura-hero-home.mp4",
  "public/editorial/story.jpg",
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`[MISSING] ${file}`);
    failed = true;
  }
}

const productsSource = fs.readFileSync(path.join(root, "data", "products.ts"), "utf8");
const productMatches = [...productsSource.matchAll(/\{\n\s*id:\s*"([^"]+)"([\s\S]*?)\n\s*\},/g)];
const draftCount = productMatches.filter(([, , block]) => /\n\s*status:\s*"draft"/.test(block)).length;
const activeCount = productMatches.length - draftCount;
const visibleColorways = productMatches
  .filter(([, , block]) => !/\n\s*status:\s*"draft"/.test(block))
  .reduce((sum, [, , block]) => sum + [...(block.match(/\n\s*colors:\s*\[([^\]]+)\]/)?.[1] || "").matchAll(/"([^"]+)"/g)].length, 0);
const views = ["front", "back", "detail", "angled"];
let expectedAssets = 0;
let checkedAssets = 0;

for (const [, id, block] of productMatches) {
  const colorMatch = block.match(/\n\s*colors:\s*\[([^\]]+)\]/);
  const colors = colorMatch ? [...colorMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
  for (const color of colors) {
    const slug = color.toLowerCase().replace(/\s+/g, "-");
    for (const view of views) {
      expectedAssets += 1;
      const relative = path.join("public", "products", id, `${slug}-${view}.jpg`);
      const absolute = path.join(root, relative);
      if (!fs.existsSync(absolute)) {
        console.error(`[MISSING ASSET] ${relative}`);
        failed = true;
        continue;
      }
      const stats = fs.statSync(absolute);
      if (stats.size < 8000) {
        console.error(`[SMALL ASSET] ${relative} is only ${stats.size} bytes.`);
        failed = true;
      }
      checkedAssets += 1;
    }
  }
}

const productsDir = path.join(root, "public", "products");
const productFolderCount = fs.existsSync(productsDir)
  ? fs.readdirSync(productsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
  : 0;

if (productFolderCount !== productMatches.length) {
  console.error(`[ASSETS] Expected ${productMatches.length} product folders, found ${productFolderCount}.`);
  failed = true;
}
if (checkedAssets !== expectedAssets) {
  console.error(`[ASSETS] Expected ${expectedAssets} product assets, verified ${checkedAssets}.`);
  failed = true;
}

if (activeCount !== 9 || visibleColorways !== 21) {
  console.error(`[CATALOG] Expected 9 active products / 21 visible colorways, found ${activeCount} / ${visibleColorways}.`);
  failed = true;
}

const routeSource = fs.readFileSync(path.join(root, "app", "collections", "[slug]", "page.tsx"), "utf8");
const collectionRoutes = fs.readFileSync(path.join(root, "lib", "collection-routes.ts"), "utf8");
if (!routeSource.includes('@/lib/collection-routes') || !collectionRoutes.includes('"t-shirts"') || !collectionRoutes.includes('"fall-26"')) {
  console.error("[ROUTES] Canonical T-shirts or Fall 26 collection route is missing.");
  failed = true;
}

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
if (!gitignore.includes("reference/balmoral/")) {
  console.error("[REFERENCE] reference/balmoral/ must remain ignored.");
  failed = true;
}

for (const directory of ["app", "components", "data", "lib"]) {
  for (const entry of fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(tsx?|jsx?|css)$/.test(entry.name)) continue;
    const source = fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8");
    if (source.includes("reference/balmoral")) {
      console.error(`[REFERENCE IMPORT] ${path.relative(root, path.join(entry.parentPath, entry.name))}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\nALTURA local project check FAILED.");
  process.exit(1);
}

console.log("ALTURA local project check OK.");
console.log(`Products: ${productMatches.length} total (${activeCount} active / ${draftCount} draft)`);
console.log(`Visible storefront colorways: ${visibleColorways}`);
console.log(`Product folders: ${productFolderCount}`);
console.log(`Verified product JPG assets: ${checkedAssets}`);
console.log("Local API routes: /api/health and /api/products");
