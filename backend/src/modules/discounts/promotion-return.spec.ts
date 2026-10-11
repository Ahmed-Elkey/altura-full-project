import { Prisma } from "@prisma/client";
import * as promotion from "./discounts.service";
import { AdminService } from "../admin/admin.service";
const paid = { discount: 0, bundle: "bundle-1" };
const gift = { discount: 50, bundle: "bundle-1" };
const lines = [
  {
    id: "a",
    quantity: 2,
    unitPrice: new Prisma.Decimal(100),
    promotionAllocation: [paid, paid],
  },
  {
    id: "b",
    quantity: 1,
    unitPrice: new Prisma.Decimal(50),
    promotionAllocation: [gift],
  },
];
const validate = (...args: any[]) =>
  (promotion as any).validatePromotionReturn(...args);
describe("promotion bundle returns", () => {
  test("rejects a free gift without its qualifying paid units", () =>
    expect(() => validate(lines, [{ orderItemId: "b", quantity: 1 }])).toThrow(
      "together",
    ));
  test("rejects paid units without their gift", () =>
    expect(() => validate(lines, [{ orderItemId: "a", quantity: 2 }])).toThrow(
      "together",
    ));
  test("permits entire bundle", () =>
    expect(() =>
      validate(lines, [
        { orderItemId: "a", quantity: 2 },
        { orderItemId: "b", quantity: 1 },
      ]),
    ).not.toThrow());
  test("permits unbundled units at prior return offset", () =>
    expect(() =>
      validate(
        [
          {
            ...lines[0],
            quantity: 3,
            promotionAllocation: [paid, paid, { discount: 0, bundle: null }],
          },
          lines[1],
        ],
        [{ orderItemId: "a", quantity: 1 }],
        new Map([
          ["a", 2],
          ["b", 1],
        ]),
      ),
    ).not.toThrow());
  test("ignores historical lines without allocation", () =>
    expect(() =>
      validate(
        [{ id: "old", quantity: 5, promotionAllocation: null }],
        [{ orderItemId: "old", quantity: 1 }],
      ),
    ).not.toThrow());
  test("rejects malformed saved allocation", () =>
    expect(() =>
      validate(
        [{ ...lines[0], promotionAllocation: [paid] }],
        [{ orderItemId: "a", quantity: 1 }],
      ),
    ).toThrow("allocation"));
});
describe("saved refundable amount", () => {
  const service: any = new AdminService({} as any, {} as any);
  const request = (items: any[]) => ({
    order: {
      items: lines,
      subtotal: new Prisma.Decimal(250),
      discountUsages: [
        { amount: new Prisma.Decimal(50), discount: { type: "BUY_X_GET_Y" } },
      ],
    },
    items,
  });
  test("refunds only paid bundle value", () => {
    expect(
      Number(
        service.calculateReturnRefund(
          request([
            {
              orderItemId: "a",
              quantity: 2,
              orderItem: { ...lines[0], lineTotal: new Prisma.Decimal(200) },
            },
            {
              orderItemId: "b",
              quantity: 1,
              orderItem: { ...lines[1], lineTotal: new Prisma.Decimal(50) },
            },
          ]),
        ),
      ),
    ).toBe(200);
  });
  test("never refunds a gift alone", () => {
    expect(() =>
      service.calculateReturnRefund(
        request([
          {
            orderItemId: "b",
            quantity: 1,
            orderItem: { ...lines[1], lineTotal: new Prisma.Decimal(50) },
          },
        ]),
      ),
    ).toThrow("together");
  });
  test("retains proportional legacy refund", () => {
    expect(
      Number(
        service.calculateReturnRefund({
          order: {
            subtotal: new Prisma.Decimal(200),
            discountUsages: [
              {
                amount: new Prisma.Decimal(20),
                discount: { type: "PERCENTAGE" },
              },
            ],
          },
          items: [
            {
              quantity: 1,
              orderItem: { quantity: 2, lineTotal: new Prisma.Decimal(200) },
            },
          ],
        }),
      ),
    ).toBe(90);
  });
});
