import { test, expect, type Page } from "@playwright/test";
const number = "ALT-PROMOTION-QA";
const promotion = {
  buyQuantity: 2,
  giftQuantity: 1,
  eligibleUnits: 5,
  remainingUnits: 1,
  capReached: false,
  qualifyingUnits: 3,
  freeUnits: 1,
  discountedUnits: 1,
  savings: 100,
  bundleCount: 1,
};
const linePromotion = {
  qualifyingUnits: 3,
  freeUnits: 1,
  discountedUnits: 1,
  savings: 100,
  payableTotal: 400,
};
const cartItem = {
  id: "item",
  variantId: "variant",
  quantity: 5,
  unitPrice: 100,
  lineTotal: 500,
  currency: "EGP",
  availableQuantity: 10,
  product: {
    id: "product",
    slug: "summit-shorts",
    name: "Synthetic shorts",
    image: null,
  },
  option: { colorName: "Black", size: "M", title: "Black / M" },
};
const shipping = {
  id: "shipping",
  code: "QA",
  name: "Synthetic shipping",
  price: 20,
  currency: "EGP",
  free: false,
  estimatedMinDays: 1,
  estimatedMaxDays: 2,
};
const totals = {
  subtotal: 500,
  discountTotal: 100,
  shippingTotal: 20,
  taxTotal: 0,
  grandTotal: 420,
};
async function setup(page: Page, missing = false) {
  await page.route("http://127.0.0.1:4000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const headers = {
      "Access-Control-Allow-Origin": new URL(
        test.info().project.use.baseURL as string,
      ).origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let status = 200;
    let data: unknown = {};
    if (path === "/auth/refresh")
      data = {
        accessToken: "synthetic",
        user: {
          id: "user",
          email: "synthetic@example.invalid",
          firstName: "Synthetic",
          lastName: "Shopper",
          role: "CUSTOMER",
          status: "ACTIVE",
        },
      };
    else if (path === "/cart")
      data = {
        id: "cart",
        items: [cartItem],
        itemCount: 5,
        subtotal: 500,
        currency: "EGP",
        issues: [],
      };
    else if (path === "/users/me/addresses") data = [];
    else if (path === "/checkout/shipping-methods")
      data = { methods: [shipping] };
    else if (path === "/checkout/quote")
      data = {
        currency: "EGP",
        itemCount: 5,
        items: [
          {
            ...cartItem,
            productName: "Synthetic shorts",
            colorName: "Black",
            size: "M",
            promotion: missing ? null : linePromotion,
          },
        ],
        shipping,
        discount: {
          code: "BUY2",
          type: "BUY_X_GET_Y",
          itemDiscount: missing ? 0 : 100,
          shippingDiscount: 0,
          promotion: missing
            ? {
                ...promotion,
                eligibleUnits: 2,
                qualifyingUnits: 0,
                freeUnits: 0,
                discountedUnits: 0,
                savings: 0,
              }
            : promotion,
        },
        totals: missing
          ? { ...totals, discountTotal: 0, grandTotal: 520 }
          : totals,
      };
    else if (path.startsWith("/orders/"))
      data = {
        orderNumber: number,
        email: "synthetic@example.invalid",
        status: "DELIVERED",
        currency: "EGP",
        createdAt: "2026-10-08T12:00:00Z",
        placedAt: "2026-10-08T12:00:00Z",
        totals,
        promotion: {
          qualifyingUnits: 3,
          freeUnits: 1,
          discountedUnits: 1,
          savings: 100,
          bundleCount: 1,
        },
        items: [
          {
            id: "item",
            productName: "Synthetic shorts",
            colorName: "Black",
            size: "M",
            quantity: 5,
            lineTotal: 500,
            productImageUrl: null,
            promotion: linePromotion,
          },
        ],
        shipments: [],
        addresses: [],
      };
    else status = 404;
    await route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}
async function fillCheckout(page: Page) {
  await page.goto("/checkout");
  await page.getByPlaceholder("First name").fill("Synthetic");
  await page.getByPlaceholder("Last name").fill("Shopper");
  await page
    .getByPlaceholder("Address", { exact: true })
    .fill("1 Synthetic Street");
  await page.getByPlaceholder("City", { exact: true }).fill("Cairo");
  await page
    .getByRole("combobox", { name: "Region" })
    .selectOption({ label: "Cairo" });
  await page.getByPlaceholder("Phone", { exact: true }).fill("+201000000000");
}
test("checkout shows server qualifying units, free gifts and remaining units", async ({
  page,
}) => {
  await setup(page);
  await fillCheckout(page);
  const breakdown = page.getByRole("status", {
    name: "Buy/get offer breakdown",
  });
  await expect(breakdown).toContainText("5 eligible units");
  await expect(breakdown).toContainText(
    "3 units in qualifying bundles · 1 free unit",
  );
  await expect(breakdown).toContainText("Add 1 more eligible unit");
  await expect(page.locator(".bchk-itemMeta")).toContainText("1 free unit");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`promotion-checkout-${width}.png`),
      fullPage: true,
    });
  }
});
test("unqualified checkout does not promise a gift", async ({ page }) => {
  await setup(page, true);
  await fillCheckout(page);
  const breakdown = page.getByRole("status", {
    name: "Buy/get offer breakdown",
  });
  await expect(breakdown).toContainText("0 free units");
  await expect(breakdown).toContainText("Add 1 more eligible unit");
});
test("order shows saved gifts, payable line and bundle return terms", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/account/orders/${number}`);
  const breakdown = page.getByRole("status", {
    name: "Buy/get offer breakdown",
  });
  await expect(breakdown).toContainText("1 free unit");
  await expect(breakdown).toContainText(
    "Return each discounted bundle together",
  );
  await expect(page.locator(".customer-order__item-info")).toContainText(
    "1 free unit",
  );
  await expect(page.locator(".customer-order__price")).toContainText("400");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`promotion-order-${width}.png`),
      fullPage: true,
    });
  }
});
