import { test, expect, type Page } from "@playwright/test";

const number = "ALT-261006-2ED28608E7";
const email = "synthetic@example.invalid";
const order = {
  orderNumber: number,
  email,
  status: "SHIPPED",
  paymentMethod: "CASH_ON_DELIVERY",
  paymentStatus: "PENDING",
  currency: "EGP",
  createdAt: "2026-10-06T12:00:00Z",
  placedAt: "2026-10-06T12:00:00Z",
  totals: {
    subtotal: 200,
    discountTotal: 0,
    shippingTotal: 12,
    taxTotal: 0,
    grandTotal: 212,
  },
  items: [
    {
      id: "item",
      productId: null,
      productName: "Meridian T-Shirt",
      colorName: "Bone",
      size: "XS",
      productImageUrl: "/products/meridian-tee/bone-front.jpg",
      unitPrice: 100,
      quantity: 2,
      lineTotal: 200,
    },
  ],
  addresses: [
    {
      type: "SHIPPING",
      recipientName: "Synthetic Shopper",
      phone: null,
      line1: "17 Test Street",
      line2: null,
      city: "Cairo",
      region: null,
      postalCode: null,
      countryCode: "EG",
    },
  ],
  payments: [],
  shipments: [
    {
      status: "SHIPPED",
      carrier: "Local",
      service: "Standard",
      trackingNumber: "LOCAL-DEMO-1",
      trackingUrl: null as string | null,
      shippedAt: "2026-10-07T12:00:00Z",
      deliveredAt: null,
    },
  ],
};

async function setup(
  page: Page,
  authenticated = true,
  trackingUrl: string | null = null,
  lookupStatus = 200,
  shipmentStatus = "SHIPPED",
) {
  await page.route("http://127.0.0.1:4000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let status = 200;
    let data: unknown = {};
    if (path === "/auth/refresh") {
      status = authenticated ? 200 : 401;
      data = authenticated
        ? {
            accessToken: "synthetic",
            user: {
              id: "user",
              email,
              firstName: "Synthetic",
              lastName: "Shopper",
              phone: null,
              role: "CUSTOMER",
              status: "ACTIVE",
              emailVerifiedAt: null,
              lastLoginAt: null,
              createdAt: order.createdAt,
              updatedAt: order.createdAt,
            },
          }
        : {};
    } else if (path.startsWith("/orders/")) {
      status = path === "/orders/guest/lookup" ? lookupStatus : 200;
      data = {
        ...order,
        shipments: [
          { ...order.shipments[0], trackingUrl, status: shipmentStatus },
        ],
        ...(path === "/orders/guest/lookup"
          ? {
              email: "s***@example.invalid",
              addresses: undefined,
              payments: undefined,
            }
          : {}),
      };
    } else if (path === "/cart")
      data = {
        items: [],
        itemCount: 0,
        subtotal: 0,
        currency: "EGP",
        issues: [],
      };
    else if (path === "/users/me/addresses") data = [];
    await route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}

test("shipment without a carrier URL opens local tracking details instead of a dead link", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/account/orders/${number}`);
  await page.getByText(/Track shipment · LOCAL-DEMO-1/).click();
  await expect(
    page.getByText("Carrier tracking is unavailable for this local shipment."),
  ).toBeVisible();
  await expect(page.getByText("Shipped October 7, 2026")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View order confirmation" }),
  ).toHaveAttribute("href", `/order-confirmation/${number}`);
});

test("pending delivery has a shipping label independent of COD payment", async ({
  page,
}) => {
  await setup(page, true, null, 200, "PENDING");
  await page.goto(`/account/orders/${number}`);
  await expect(
    page
      .getByRole("region", { name: "Delivery" })
      .locator(".customer-order__badge"),
  ).toHaveText("Preparing shipment");
  await expect(
    page.getByText("Payment due on delivery", { exact: true }),
  ).toBeVisible();
});

test("unsafe tracking URLs use local details and cannot execute code", async ({
  page,
}) => {
  await setup(page, true, "javascript:alert('unsafe')");
  await page.goto(`/account/orders/${number}`);
  await expect(page.getByRole("link", { name: /Track shipment/ })).toHaveCount(
    0,
  );
  await page
    .getByText("Track shipment · LOCAL-DEMO-1", { exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Carrier tracking is unavailable for this local shipment."),
  ).toBeVisible();
});

test("authenticated confirmation is reachable from order details without an email URL", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/account/orders/${number}`);
  await page.getByRole("link", { name: "View order confirmation" }).click();
  await expect(page).toHaveURL(new RegExp(`/order-confirmation/${number}$`));
  await expect(
    page.getByRole("heading", { name: "Order received." }),
  ).toBeVisible();
  await expect(page.getByText("17 Test Street")).toBeVisible();
  await page.getByRole("link", { name: "View order details" }).click();
  await expect(
    page.getByRole("heading", { name: "Order details" }),
  ).toBeVisible();
});

test("shipment with a carrier URL opens the real carrier link", async ({
  page,
}) => {
  await setup(page, true, "https://example.com/tracking/LOCAL-DEMO-1");
  await page.goto(`/account/orders/${number}`);
  await expect(
    page.getByRole("link", { name: /Track shipment/ }),
  ).toHaveAttribute("href", "https://example.com/tracking/LOCAL-DEMO-1");
  await expect(
    page.getByRole("link", { name: /Track shipment/ }),
  ).toHaveAttribute("target", "_blank");
});

test("guest confirmation uses customer typography and preserves order lookup fields", async ({
  page,
}) => {
  await setup(page, false);
  await page.goto(
    `/order-confirmation/${number}?email=${encodeURIComponent(email)}`,
  );
  const heading = page.getByRole("heading", { name: "Order received." });
  await expect(heading).toBeVisible();
  const style = await heading.evaluate((el) => ({
    font: getComputedStyle(el).fontFamily,
    size: parseFloat(getComputedStyle(el).fontSize),
  }));
  expect(style.font).toMatch(/Inter/);
  expect(style.size).toBeLessThan(40);
  await expect(
    page.getByRole("heading", { name: "Order summary" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Track this order" }).click();
  await expect(page.getByLabel("Order number", { exact: true })).toHaveValue(
    number,
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await page.getByRole("button", { name: "Track order" }).click();
  await page
    .getByText("Track shipment · LOCAL-DEMO-1", { exact: true })
    .click();
  await expect(
    page.getByText("Carrier tracking is unavailable for this local shipment."),
  ).toBeVisible();
});

test("unverified orders never show a success message or order summary", async ({
  page,
}) => {
  await setup(page, false, null, 404);
  await page.goto(
    `/order-confirmation/${number}?email=${encodeURIComponent(email)}`,
  );
  await expect(
    page.getByRole("alert").filter({ hasText: /couldn't find/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Order received." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Order summary" }),
  ).toHaveCount(0);
});

test("order screens keep customer typography without overflow at desktop and mobile sizes", async ({
  page,
}) => {
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    `/account/orders/${number}`,
    `/order-confirmation/${number}`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Order summary" }),
    ).toBeVisible();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      expect(
        await page
          .locator("h1")
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toMatch(/Inter/);
    }
  }
  expect(errors).toEqual([]);
});

test("public confirmation does not bypass sign-in for account order details", async ({
  page,
}) => {
  await setup(page, false);
  await page.goto(`/order-confirmation/${number}`);
  await expect(
    page.getByRole("heading", { name: "Order could not be verified." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Order summary" }),
  ).toHaveCount(0);
  await page.goto(`/account/orders/${number}`);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account\/login\?next=/);
});

test("tracking matches customer pages and displays the shared guest order summary", async ({
  page,
}) => {
  await setup(page, false);
  await page.goto(`/track-order?order=${number}`);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Track your order");
  expect(
    await heading.evaluate((el) => getComputedStyle(el).fontFamily),
  ).toMatch(/Inter/);
  await expect(page.getByLabel("Order number", { exact: true })).toHaveValue(
    number,
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Track order →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Order summary" }),
  ).toBeVisible();
  await expect(page.getByText("s***@example.invalid")).toBeVisible();
  await expect(page.getByText("17 Test Street")).toHaveCount(0);
  await page
    .getByText("Track shipment · LOCAL-DEMO-1", { exact: true })
    .click();
  await expect(page.getByText("Shipped October 7, 2026")).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
