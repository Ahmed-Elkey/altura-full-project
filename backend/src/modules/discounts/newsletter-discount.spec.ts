import { BadRequestException } from "@nestjs/common";
import { DiscountType, Prisma } from "@prisma/client";
import { DiscountsService } from "./discounts.service";

describe("newsletter discount eligibility", () => {
  const code = "NL-0123456789ABCDEF0123";
  const now = new Date("2026-10-08T12:00:00Z");
  let discount: any;
  let db: any;
  let service: DiscountsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    discount = {
      id: "reward",
      code,
      type: DiscountType.PERCENTAGE,
      value: new Prisma.Decimal(10),
      currency: null,
      minimumSubtotal: null,
      maximumDiscount: null,
      startsAt: null,
      endsAt: new Date("2026-11-07T12:00:00Z"),
      usageLimit: 1,
      perCustomerLimit: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
      newsletterSubscriber: {
        email: "subscriber@example.invalid",
        confirmedAt: now,
        status: "SUBSCRIBED",
      },
    };
    db = {
      discount: { findUnique: jest.fn(async () => discount) },
      discountUsage: { count: jest.fn(async () => 0) },
    };
    service = new DiscountsService(db);
  });

  afterEach(() => jest.useRealTimers());

  const input = (
    email = "subscriber@example.invalid",
    discountCode = code,
  ) => ({
    code: discountCode,
    email,
    subtotal: new Prisma.Decimal(200),
    shippingTotal: new Prisma.Decimal(25),
    currency: "EGP",
  });

  test("rejects another checkout email even for a signed-in customer", async () => {
    await expect(
      service.evaluate({
        ...input("other@example.invalid"),
        userId: "subscriber-user",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test.each(["PENDING", "SUBSCRIBED", "UNSUBSCRIBED"])(
    "rejects an unconfirmed %s subscriber",
    async (status) => {
      discount.newsletterSubscriber = {
        ...discount.newsletterSubscriber,
        status,
        confirmedAt: null,
      };
      await expect(service.evaluate(input())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  test("rejects an NL code without a subscriber owner", async () => {
    discount.newsletterSubscriber = null;
    await expect(service.evaluate(input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test("keeps email ownership when an administrator renames the reward", async () => {
    discount.code = "RENAMED-REWARD";
    await expect(
      service.evaluate(input("other@example.invalid", "RENAMED-REWARD")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test("normalizes code and owner email and discounts only the product subtotal", async () => {
    discount.newsletterSubscriber.email = "Subscriber@Example.Invalid";
    const result = await service.evaluate(
      input("  SUBSCRIBER@example.invalid  ", ` ${code.toLowerCase()} `),
    );
    expect(result.code).toBe(code);
    expect(result.itemDiscount.toString()).toBe("20");
    expect(result.shippingDiscount.toString()).toBe("0");
    expect(result.totalDiscount.toString()).toBe("20");
    expect(db.discount.findUnique).toHaveBeenCalledWith({
      where: { code },
      include: {
        newsletterSubscriber: { select: { email: true, confirmedAt: true } },
      },
    });
  });

  test("retains an earned reward after newsletter unsubscribe", async () => {
    discount.newsletterSubscriber.status = "UNSUBSCRIBED";
    expect((await service.evaluate(input())).totalDiscount.toString()).toBe(
      "20",
    );
  });

  test("rejects the reward at its exact expiration time", async () => {
    discount.endsAt = now;
    await expect(service.evaluate(input())).rejects.toThrow("expired");
  });

  test("rejects a globally used reward even when the customer usage is zero", async () => {
    db.discountUsage.count.mockImplementation(async ({ where }: any) =>
      where.OR ? 0 : 1,
    );
    await expect(service.evaluate(input())).rejects.toThrow("usage limit");
  });

  test("rejects a reward already used by the customer", async () => {
    db.discountUsage.count.mockImplementation(async ({ where }: any) =>
      where.OR ? 1 : 0,
    );
    await expect(service.evaluate(input())).rejects.toThrow(
      "customer usage limit",
    );
  });

  test("keeps ordinary discounts available without subscriber eligibility", async () => {
    discount.code = "WELCOME10";
    delete discount.newsletterSubscriber;
    expect(
      (
        await service.evaluate(input("other@example.invalid", "welcome10"))
      ).totalDiscount.toString(),
    ).toBe("20");
    expect(db.discount.findUnique).toHaveBeenCalledWith({
      where: { code: "WELCOME10" },
      include: {
        newsletterSubscriber: { select: { email: true, confirmedAt: true } },
      },
    });
  });

  test("uses the provided transaction client for reward validation", async () => {
    const transaction = {
      discount: {
        findUnique: jest.fn(async () => ({
          ...discount,
          newsletterSubscriber: null,
        })),
      },
      discountUsage: { count: jest.fn(async () => 0) },
    };
    await expect(
      service.evaluate(input(), transaction as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.discount.findUnique).not.toHaveBeenCalled();
  });
});
