import { Prisma } from "@prisma/client";
import { presentOrder, presentGuestOrder } from "./order.presenter";
const allocation = [
  { discount: 0, bundle: "bundle-1" },
  { discount: 0, bundle: "bundle-1" },
  { discount: 100, bundle: "bundle-1" },
];
const order: any = {
  id: "order",
  orderNumber: "ALT-TEST",
  email: "buyer@example.invalid",
  currency: "EGP",
  subtotal: new Prisma.Decimal(300),
  discountTotal: new Prisma.Decimal(100),
  shippingTotal: new Prisma.Decimal(20),
  taxTotal: new Prisma.Decimal(0),
  grandTotal: new Prisma.Decimal(220),
  items: [
    {
      id: "item",
      quantity: 3,
      unitPrice: new Prisma.Decimal(100),
      lineTotal: new Prisma.Decimal(300),
      promotionAllocation: allocation,
    },
  ],
  addresses: [],
  payments: [],
  shipments: [],
};
describe("saved order promotion presentation", () => {
  test("shows frozen payable amount and free units", () => {
    const result: any = presentOrder(order);
    expect(result.items[0].promotionAllocation).toEqual(allocation);
    expect(result.items[0].promotion).toMatchObject({
      freeUnits: 1,
      savings: 100,
      payableTotal: 200,
    });
    expect(result.promotion).toMatchObject({
      freeUnits: 1,
      savings: 100,
      bundleCount: 1,
      qualifyingUnits: 3,
    });
  });
  test("guest order lookup retains saved offer breakdown", () => {
    const result: any = presentGuestOrder(order);
    expect(result.items[0].promotion.freeUnits).toBe(1);
    expect(result.promotion.savings).toBe(100);
  });
  test("legacy orders keep their original line amounts and no promotion", () => {
    const result: any = presentOrder({
      ...order,
      items: [{ ...order.items[0], promotionAllocation: null }],
    });
    expect(result.items[0].lineTotal).toBe(300);
    expect(result.items[0].promotion).toBeNull();
    expect(result.promotion).toBeNull();
  });
});
