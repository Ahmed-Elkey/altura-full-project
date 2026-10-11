import { expect, test } from "@playwright/test";

const widths = [390, 768, 1024, 1440, 1920];

test("homepage feature rows and footer stay balanced across viewport sizes", async ({ page, request }) => {
  await page.goto("/");
  await expect.poll(() => page.locator('.pb-row-promo-products__products img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const productLinks = new Set<string>();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator(".pb-row-promo-products__products img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);

    const layout = await page.evaluate(() => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, right: box.right, width: box.width, height: box.height, bottom: box.bottom };
      };
      const row = (id: string) => {
        const section = document.getElementById(id)!;
        const media = section.querySelector(".pb-row-promo-products__promoMedia")!;
        const content = section.querySelector(".pb-row-promo-products__promoContent")!;
        const products = section.querySelector(".pb-row-promo-products__products")!;
        const cards = [...products.querySelectorAll<HTMLAnchorElement>(".product-preview__link")];
        return {
          media: rect(media),
          content: rect(content),
          products: rect(products),
          links: cards.map((card) => card.href),
          imagesLoaded: cards.every((card) => {
            const image = card.querySelector("img");
            return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
          }),
          imagesUseCover: cards.every((card) => getComputedStyle(card.querySelector("img")!).objectFit === "cover"),
        };
      };
      const footer = document.querySelector(".site-footer")!;
      const form = footer.querySelector(".site-footer__newsletterForm")!;
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        headwear: row("pb-row-promo-headwear"),
        raceDay: row("pb-row-promo-raceday"),
        footer: {
          bounds: rect(footer),
          nav: rect(footer.querySelector(".site-footer__nav")!),
          newsletter: rect(footer.querySelector(".site-footer__newsletter")!),
          input: rect(form.querySelector("input")!),
          submit: rect(form.querySelector("button")!),
          controls: [...footer.querySelectorAll("select")].map(rect),
        },
      };
    });

    expect(layout.documentWidth, `horizontal overflow at ${width}px`).toBe(width);
    expect(layout.headwear.links).toHaveLength(1);
    expect(layout.raceDay.links).toHaveLength(2);
    expect(new Set(layout.headwear.links.map((href) => new URL(href).pathname)).size).toBe(1);
    expect(new Set(layout.raceDay.links.map((href) => new URL(href).pathname)).size).toBe(2);
    expect(layout.headwear.imagesLoaded && layout.raceDay.imagesLoaded).toBeTruthy();
    expect(layout.headwear.imagesUseCover && layout.raceDay.imagesUseCover).toBeTruthy();
    expect(layout.headwear.content.bottom).toBeLessThanOrEqual(layout.headwear.media.bottom + 1);
    expect(layout.raceDay.content.bottom).toBeLessThanOrEqual(layout.raceDay.media.bottom + 1);

    if (width >= 768) {
      expect(Math.abs(layout.headwear.media.width - layout.raceDay.media.width), `promo images should have equal widths at ${width}px`).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.headwear.media.height - layout.raceDay.media.height), `promo images should have equal heights at ${width}px`).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.headwear.media.height - layout.headwear.products.height), `Headwear panel mismatch at ${width}px`).toBeLessThanOrEqual(40);
      expect(Math.abs(layout.raceDay.media.width - layout.raceDay.products.width), `Race Day halves differ only by the outer 10px product gutter at ${width}px`).toBeLessThanOrEqual(11);
      expect(layout.raceDay.products.height, `two smaller product cards should end above the promo at ${width}px`).toBeLessThan(layout.raceDay.media.height);
      expect(layout.footer.nav.x, `footer links should use the left side at ${width}px`).toBeLessThanOrEqual(24);
    }

    expect(layout.footer.input.right).toBeLessThanOrEqual(layout.footer.newsletter.right + 1);
    expect(layout.footer.submit.right).toBeLessThanOrEqual(layout.footer.newsletter.right + 1);
    for (const control of layout.footer.controls) {
      expect(control.x).toBeGreaterThanOrEqual(layout.footer.bounds.x);
      expect(control.right).toBeLessThanOrEqual(layout.footer.bounds.right);
    }

    for (const href of [...layout.headwear.links, ...layout.raceDay.links]) {
      productLinks.add(href);
    }
    if ([390, 768, 1440].includes(width)) await page.locator('#pb-row-promo-raceday').screenshot({ path: test.info().outputPath(`race-day-${width}.png`) });
  }

  for (const href of productLinks) {
    const response = await request.get(href);
    expect(response.status(), `product link ${href}`).toBe(200);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const capCard = page.locator("#pb-row-promo-headwear .product-preview");
  const blackSwatch = capCard.getByRole("button", { name: "Black" });
  await blackSwatch.scrollIntoViewIfNeeded();
  const swatchBounds = await blackSwatch.boundingBox();
  expect(swatchBounds).not.toBeNull();
  await page.mouse.move(swatchBounds!.x + swatchBounds!.width / 2, swatchBounds!.y + swatchBounds!.height / 2);
  await page.waitForTimeout(300);
  await blackSwatch.click();
  await expect(blackSwatch).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => { const src = await capCard.locator("img").getAttribute("src"); const url = new URL(src!, "http://127.0.0.1:3100"); return url.pathname === "/_next/image" ? url.searchParams.get("url") : url.pathname; }).toBe("/products/trail-cap/black-front.jpg");
  await expect(capCard.locator("a")).toHaveAttribute("href", /color=Black/);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator(".site-footer__credits")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
