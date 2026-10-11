import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = "https://www.balmoralrunning.com";
const output = path.join(process.cwd(), "reference", "balmoral");
const pages = {
  home: `${base}/`,
  shopall: `${base}/collections/shopall`,
  product: `${base}/products/belmore-4-panel-hat-fw26`,
};

await mkdir(output, { recursive: true });
const manifest = { capturedAt: new Date().toISOString(), purpose: "Private layout analysis only; never imported by ALTURA.", files: [] };
let homeHTML = "";

for (const [name, url] of Object.entries(pages)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const html = await response.text();
  if (name === "home") homeHTML = html;
  const filename = `${name}.html`;
  await writeFile(path.join(output, filename), html);
  manifest.files.push({ filename, source: url, contentType: response.headers.get("content-type") });
}

const resolveAsset = (value) => value ? new URL(value.replaceAll("&amp;", "&"), base).href : "";
const cssURL = resolveAsset(homeHTML.match(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/i)?.[1]);
const scriptURL = resolveAsset(homeHTML.match(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/i)?.[1]);
const imageURL = resolveAsset(homeHTML.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || homeHTML.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]);

for (const [filename, url] of [["representative.css", cssURL], ["representative.js", scriptURL], ["representative-image.jpg", imageURL]]) {
  if (!url) continue;
  const response = await fetch(url);
  if (!response.ok) continue;
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(output, filename), buffer);
  manifest.files.push({ filename, source: url, contentType: response.headers.get("content-type"), bytes: buffer.length });
}

await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Saved ${manifest.files.length} private reference files to ${output}`);
