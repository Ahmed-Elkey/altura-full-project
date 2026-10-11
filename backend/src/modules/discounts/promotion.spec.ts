import { Prisma } from "@prisma/client";
import { DiscountsService } from "./discounts.service";
const config = {
  enabled: true,
  type: "BUY_X_GET_Y",
  value: 0,
  currency: "EGP",
  validityDays: 30,
  usageLimit: 1,
  minimumSubtotal: null,
  maximumDiscount: null,
  buyQuantity: 2,
  giftQuantity: 1,
  maxGiftUnits: null,
  eligibleProductIds: [],
  eligibleCategoryIds: [],
  title: "Welcome",
  welcomeText: "Welcome",
};
const item = (
  variantId: string,
  quantity: number,
  price = 100,
  productId = variantId,
  categoryIds: string[] = [],
) => ({
  variantId,
  productId,
  categoryIds,
  quantity,
  unitPrice: new Prisma.Decimal(price),
});
function setup(overrides = {}) {
  const discount: any = {
    id: "promo",
    code: "BUY2",
    type: "BUY_X_GET_Y",
    value: new Prisma.Decimal(0),
    currency: "EGP",
    minimumSubtotal: null,
    maximumDiscount: null,
    active: true,
    usageLimit: null,
    perCustomerLimit: null,
    offerSnapshot: { ...config, ...overrides },
  };
  const db: any = {
    discount: { findUnique: async () => discount },
    discountUsage: { count: async () => 0 },
  };
  return { service: new DiscountsService(db), discount };
}
const input = (items?: any[]) => ({
  code: "BUY2",
  currency: "EGP",
  email: "buyer@example.invalid",
  subtotal: new Prisma.Decimal(
    items?.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0) ?? 300,
  ),
  shippingTotal: new Prisma.Decimal(20),
  items,
});
describe("buy/get saved unit allocation", () => {
  test.each([
    [2, 0],
    [3, 100],
    [5, 100],
    [6, 200],
  ])("%i units give discount %i", async (quantity, expected) => {
    const result: any = await setup().service.evaluate(
      input([item("a", quantity)]),
    );
    expect(Number(result.itemDiscount)).toBe(expected);
    expect(result.allocations.a).toHaveLength(quantity);
    expect(
      result.allocations.a.reduce((s: number, u: any) => s + u.discount, 0),
    ).toBe(expected);
  });
  test("groups descending prices and gives cheapest unit of each completed bundle", async () => {
    const result: any = await setup().service.evaluate(
      input([item("a", 2, 100), item("b", 2, 70), item("c", 2, 30)]),
    );
    expect(Number(result.itemDiscount)).toBe(100);
    expect(result.allocations.b.map((u: any) => u.discount)).toEqual([70, 0]);
    expect(result.allocations.c.map((u: any) => u.discount)).toEqual([0, 30]);
  });
  test("product and category eligibility are combined as alternatives", async () => {
    const result: any = await setup({
      eligibleProductIds: ["a"],
      eligibleCategoryIds: ["sale"],
    }).service.evaluate(
      input([
        item("a", 2),
        item("b", 1, 40, "b", ["sale"]),
        item("excluded", 10, 1),
      ]),
    );
    expect(Number(result.itemDiscount)).toBe(40);
    expect(
      result.allocations.excluded.every(
        (u: any) => u.bundle === null && u.discount === 0,
      ),
    ).toBe(true);
  });
  test("cap leaves later bundles payable and unrelated to returns", async () => {
    const result: any = await setup({ maxGiftUnits: 1 }).service.evaluate(
      input([item("a", 6)]),
    );
    expect(Number(result.itemDiscount)).toBe(100);
    expect(result.allocations.a.slice(3)).toEqual(
      Array(3).fill({ discount: 0, bundle: null }),
    );
  });
  test("a cap smaller than the configured gift quantity selects cheapest gifts", async () => {
    const result: any = await setup({
      buyQuantity: 1,
      giftQuantity: 2,
      maxGiftUnits: 1,
    }).service.evaluate(
      input([item("a", 1, 100), item("b", 1, 70), item("c", 1, 30)]),
    );
    expect(Number(result.itemDiscount)).toBe(30);
    expect(result.allocations.c[0].discount).toBe(30);
  });
  test("monetary cap agrees with rounded allocation", async () => {
    const result: any = await setup({
      maximumDiscount: 10.01,
    }).service.evaluate(input([item("a", 3, 33.33)]));
    expect(Number(result.itemDiscount)).toBe(10.01);
    expect(result.allocations.a[2].discount).toBe(10.01);
  });
  test.each([undefined, []])("requires actual cart items", async (items) => {
    await expect(setup().service.evaluate(input(items))).rejects.toThrow(
      "items",
    );
  });
  test.each([
    { buyQuantity: 0 },
    { giftQuantity: 1.5 },
    { maxGiftUnits: 0 },
    { eligibleProductIds: "a" },
    { currency: "egp" },
    { eligibleProductIds: ["a", "a"] },
    { buyQuantity: 101 },
    { type: "NONE" },
  ])("rejects invalid snapshot %j", async (bad) => {
    await expect(
      setup(bad).service.evaluate(input([item("a", 3)])),
    ).rejects.toThrow("configuration");
  });
  test("requires a buy/get snapshot even with valid cart units", async () => {
    const { service, discount } = setup();
    discount.offerSnapshot = null;
    await expect(service.evaluate(input([item("a", 3)]))).rejects.toThrow(
      "configuration",
    );
  });
  test("applies snapshot-scoped percentage to eligible product subtotal", async () => {
    const { service } = setup({
      type: "PERCENTAGE",
      value: 10,
      eligibleProductIds: ["a"],
    });
    expect(
      Number(
        (await service.evaluate(input([item("a", 1, 100), item("b", 1, 200)])))
          .itemDiscount,
      ),
    ).toBe(10);
  });
  test("minimum uses eligible subtotal", async () => {
    await expect(
      setup({
        minimumSubtotal: 200,
        eligibleProductIds: ["a"],
      }).service.evaluate(input([item("a", 1, 100), item("b", 1, 500)])),
    ).rejects.toThrow("minimum");
  });
  test("rejects repeated variant rows rather than corrupting unit allocation", async () => {
    await expect(
      setup().service.evaluate(input([item("a", 2), item("a", 1)])),
    ).rejects.toThrow("items");
  });
  test("snapshot terms take precedence over mutable discount values", async () => {
    const { service, discount } = setup();
    discount.type = "PERCENTAGE";
    discount.value = new Prisma.Decimal(99);
    expect(
      Number((await service.evaluate(input([item("a", 3)]))).itemDiscount),
    ).toBe(100);
  });
});
