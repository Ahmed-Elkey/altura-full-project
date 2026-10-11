import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { DiscountsService } from "../discounts/discounts.service";
import { CheckoutService } from "./checkout.service";
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
function setup(quantity: number) {
  const db: any = {
    discount: {
      findUnique: async () => ({
        id: "offer",
        code: "BUY2",
        type: "BUY_X_GET_Y",
        value: new Prisma.Decimal(0),
        active: true,
        usageLimit: null,
        perCustomerLimit: null,
        offerSnapshot: config,
      }),
    },
  };
  const discounts = new DiscountsService(db);
  const shipping: any = {
    resolveMethod: async () => ({ method: { id: "ship", price: 20 } }),
  };
  const service = new CheckoutService(
    db,
    new ConfigService(),
    shipping,
    discounts,
  );
  jest
    .spyOn(service as any, "loadSnapshot")
    .mockResolvedValue({
      cart: { id: "cart" },
      currency: "EGP",
      subtotal: new Prisma.Decimal(quantity * 100),
      itemCount: quantity,
      items: [
        {
          variantId: "variant",
          productId: "product",
          categoryIds: [],
          quantity,
          unitPrice: new Prisma.Decimal(100),
          lineTotal: new Prisma.Decimal(quantity * 100),
        },
      ],
    });
  return service;
}
describe("server quote promotion breakdown", () => {
  test("reports actual gift savings and qualifying units", async () => {
    const quote: any = await setup(5).quote(
      { sessionId: "guest", expiresAt: new Date("2099-01-01") },
      {
        email: "guest@example.invalid",
        shippingMethodId: "ship",
        discountCode: "BUY2",
        shippingAddress: { countryCode: "EG" },
      } as any,
    );
    expect(quote.discount.promotion).toMatchObject({
      buyQuantity: 2,
      giftQuantity: 1,
      eligibleUnits: 5,
      remainingUnits: 1,
      freeUnits: 1,
      discountedUnits: 1,
      savings: 100,
    });
    expect(quote.items[0].promotion).toMatchObject({
      freeUnits: 1,
      savings: 100,
      payableTotal: 400,
    });
  });
  test("shows missing qualifying units without claiming free gifts", async () => {
    const quote: any = await setup(2).quote(
      { sessionId: "guest", expiresAt: new Date("2099-01-01") },
      {
        email: "guest@example.invalid",
        shippingMethodId: "ship",
        discountCode: "BUY2",
        shippingAddress: { countryCode: "EG" },
      } as any,
    );
    expect(quote.discount.promotion).toMatchObject({
      eligibleUnits: 2,
      remainingUnits: 1,
      freeUnits: 0,
      savings: 0,
    });
  });
});
