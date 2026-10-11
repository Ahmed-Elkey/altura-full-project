import { createHmac } from "crypto";
import { ConfigService } from "@nestjs/config";
import { NewsletterService } from "./newsletter.service";

describe("newsletter welcome rewards", () => {
  let row: any, reward: any, prisma: any, mail: any, service: any;
  beforeEach(() => {
    row = {
      id: "subscriber-qa",
      email: "shopper@example.invalid",
      status: "PENDING",
      confirmedAt: null,
      tokenVersion: 0,
      rewardDiscountId: null,
      rewardDiscount: null,
      welcomeStatus: "PENDING",
      welcomeSentAt: null,
      welcomeAttemptedAt: null,
    };
    reward = {
      id: "discount-qa",
      code: "NL-TEST",
      value: 10,
      type: "PERCENTAGE",
      endsAt: new Date(Date.now() + 30 * 86400000),
      active: false,
    };
    const nl = {
      findUnique: jest.fn(async () => ({
        ...row,
        rewardDiscount: row.rewardDiscountId ? reward : null,
      })),
      create: jest.fn(async ({ data }) => Object.assign(row, data)),
      update: jest.fn(async ({ data }) => {
        for (const [key, value] of Object.entries(data)) {
          row[key] =
            key === "tokenVersion" && typeof value === "object"
              ? row.tokenVersion + (value as any).increment
              : value;
        }
        return { ...row, rewardDiscount: row.rewardDiscountId ? reward : null };
      }),
      updateMany: jest.fn(async ({ data }) => {
        Object.assign(row, data);
        return { count: 1 };
      }),
    };
    prisma = {
      discountUsage: { count: jest.fn(async () => 0) },
      newsletterSubscriber: nl,
      discount: {
        create: jest.fn(async ({ data }) => Object.assign(reward, data)),
        update: jest.fn(async ({ data }) => Object.assign(reward, data)),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    mail = {
      assertConfigured: jest.fn(),
      sendMessage: jest.fn(async () => {}),
    };
    service = new (NewsletterService as any)(
      prisma,
      new ConfigService({
        JWT_REFRESH_SECRET: "unit-test-newsletter-secret-32-chars",
        FRONTEND_ORIGIN: "http://127.0.0.1:3100",
      }),
      mail,
    );
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const token = (purpose: string) =>
    new URLSearchParams(
      new URL(
        mail.sendMessage.mock.calls[0][1].text.match(
          new RegExp("http[^\\s]+/newsletter/" + purpose + "#token=[^\\s]+"),
        )[0],
      ).hash.slice(1),
    ).get("token");
  it("creates one private inactive 10% one-use reward and sends branded confirmation", async () => {
    expect(await service.subscribe(" Shopper@Example.Invalid ")).toEqual({
      subscribed: true,
    });
    await flush();
    expect(prisma.discount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PERCENTAGE",
          value: 10,
          usageLimit: 1,
          perCustomerLimit: 1,
          active: false,
        }),
      }),
    );
    expect(mail.sendMessage).toHaveBeenCalledWith(
      row.email,
      expect.objectContaining({
        html: expect.stringContaining("Confirm &amp; unlock 10%"),
      }),
    );
    await service.subscribe(row.email);
    await flush();
    expect(prisma.discount.create).toHaveBeenCalledTimes(1);
    expect(mail.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("confirms a signed email link before activating the reward and subscription", async () => {
    await service.subscribe(row.email);
    await flush();
    const result = await service.confirm(token("confirm"));
    expect(result.confirmed).toBe(true);
    expect(result.reward.code).toBe(reward.code);
    expect(row.status).toBe("SUBSCRIBED");
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(reward.active).toBe(true);
  });
  it("unsubscribes with a signed link without taking away an earned reward", async () => {
    await service.subscribe(row.email);
    await flush();
    await service.confirm(token("confirm"));
    expect(await service.unsubscribe(token("unsubscribe"))).toEqual({
      unsubscribed: true,
    });
    expect(row.status).toBe("UNSUBSCRIBED");
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(reward.active).toBe(true);
    await expect(service.confirm(token("confirm"))).rejects.toThrow();
  });
  it("rejects tampered links without changing subscription state", async () => {
    await expect(service.confirm("bad.token")).rejects.toThrow();
    expect(prisma.newsletterSubscriber.update).not.toHaveBeenCalled();
  });
  it("records failed delivery without losing the subscription or creating another reward", async () => {
    mail.sendMessage.mockRejectedValue(Error("private mail failure"));
    await service.subscribe(row.email);
    await flush();
    expect(row.welcomeStatus).toBe("FAILED");
    expect(prisma.discount.create).toHaveBeenCalledTimes(1);
  });
  it("rejects using an opt-out token for confirmation", async () => {
    await service.subscribe(row.email);
    await flush();
    await expect(service.confirm(token("unsubscribe"))).rejects.toThrow();
    expect(row.confirmedAt).toBeNull();
  });
  it("rejects expired signed confirmation links", async () => {
    await service.subscribe(row.email);
    await flush();
    const original = token("confirm")!.split(".")[0];
    const payload = JSON.parse(Buffer.from(original, "base64url").toString());
    payload.expires = Date.now() - 1;
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac(
      "sha256",
      "unit-test-newsletter-secret-32-chars",
    )
      .update("newsletter:" + data)
      .digest("base64url");
    await expect(service.confirm(data + "." + signature)).rejects.toThrow();
  });
  it("prevents administrator retries after opting out", async () => {
    await service.subscribe(row.email);
    await flush();
    await service.unsubscribe(token("unsubscribe"));
    await expect(service.retry(row.id)).rejects.toThrow();
    expect(mail.sendMessage).toHaveBeenCalledTimes(1);
  });
  it("returns no redeemable code for a previously used reward", async () => {
    await service.subscribe(row.email);
    await flush();
    await service.confirm(token("confirm"));
    prisma.discountUsage.count.mockResolvedValue(1);
    expect((await service.confirm(token("confirm"))).reward).toBeNull();
  });
  it("allows retry after a crashed sending lease expires", async () => {
    await service.subscribe(row.email);
    await flush();
    row.welcomeStatus = "SENDING";
    row.welcomeAttemptedAt = new Date(Date.now() - 180000);
    expect(await service.retry(row.id)).toEqual({ queued: true });
    await flush();
    expect(mail.sendMessage).toHaveBeenCalledTimes(2);
  });
  it("does not revive an administrator-disabled earned reward", async () => {
    await service.subscribe(row.email);
    await flush();
    await service.confirm(token("confirm"));
    reward.active = false;
    expect((await service.confirm(token("confirm"))).reward).toBeNull();
    expect(reward.active).toBe(false);
  });
  it("uses the selected offer for new issuance and its email instead of hard-coded ten percent", async () => {
    const offers = {
      get: jest.fn(async () => ({
        config: {
          ...require("./offer-config").DEFAULT_OFFER,
          type: "FREE_SHIPPING",
          value: 0,
        },
      })),
    };
    service = new (NewsletterService as any)(
      prisma,
      new ConfigService({
        JWT_REFRESH_SECRET: "unit-test-newsletter-secret-32-chars",
        FRONTEND_ORIGIN: "http://127.0.0.1:3100",
      }),
      mail,
      offers,
    );
    await service.subscribe(row.email);
    await flush();
    expect(reward.type).toBe("FREE_SHIPPING");
    expect(mail.sendMessage.mock.calls[0][1].text).toContain("free shipping");
    expect(mail.sendMessage.mock.calls[0][1].text).not.toContain("10%");
  });
  it("supports a confirmed subscription without issuing or later adding a reward", async () => {
    const offers = {
      get: jest.fn(async () => ({
        config: {
          ...require("./offer-config").DEFAULT_OFFER,
          type: "NONE",
          value: 0,
        },
      })),
    };
    service = new (NewsletterService as any)(
      prisma,
      new ConfigService({
        JWT_REFRESH_SECRET: "unit-test-newsletter-secret-32-chars",
        FRONTEND_ORIGIN: "http://127.0.0.1:3100",
      }),
      mail,
      offers,
    );
    await service.subscribe(row.email);
    await flush();
    expect(prisma.discount.create).not.toHaveBeenCalled();
    expect(mail.sendMessage).toHaveBeenCalledTimes(1);
    expect((await service.confirm(token("confirm"))).reward).toBeNull();
    offers.get.mockResolvedValue({
      config: require("./offer-config").DEFAULT_OFFER,
    });
    await service.subscribe(row.email);
    await flush();
    expect(prisma.discount.create).not.toHaveBeenCalled();
  });
  it("respects usage counts for a configured multi-use issued reward", async () => {
    await service.subscribe(row.email);
    await flush();
    reward.usageLimit = 2;
    await service.confirm(token("confirm"));
    prisma.discountUsage.count.mockResolvedValue(1);
    expect((await service.confirm(token("confirm"))).reward.code).toBe(
      reward.code,
    );
  });
});
