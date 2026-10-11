import { NewsletterOfferService } from "./newsletter-offer.service";
import {
  DEFAULT_OFFER,
  issuedOffer,
  normalizeOffer,
  presentOffer,
} from "./offer-config";
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, NewsletterStatus } from "@prisma/client";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PasswordResetMailService } from "../auth/password-reset-mail.service";
import { buildNewsletterEmail } from "./newsletter-email";
import { NewsletterListDto } from "./dto/newsletter-list.dto";

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: PasswordResetMailService,
    @Optional() private readonly offers?: NewsletterOfferService,
  ) {}
  private origin() {
    const raw =
      this.config.get<string>("NEWSLETTER_ORIGIN") ||
      this.config.get<string>("PASSWORD_RESET_ORIGIN") ||
      this.config.get<string>("FRONTEND_ORIGIN")?.split(",")[0];
    try {
      const url = new URL(raw || "");
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        (this.config.get("NODE_ENV") === "production" &&
          url.protocol !== "https:")
      )
        throw Error();
      return url.origin;
    } catch {
      throw new ServiceUnavailableException(
        "Newsletter is temporarily unavailable",
      );
    }
  }
  private secret() {
    const secret = this.config.get<string>("JWT_REFRESH_SECRET");
    if (!secret)
      throw new ServiceUnavailableException(
        "Newsletter is temporarily unavailable",
      );
    return secret;
  }
  private sign(row: any, purpose: string) {
    const data = Buffer.from(
      JSON.stringify({
        id: row.id,
        email: row.email,
        version: row.tokenVersion,
        purpose,
        ...(purpose === "confirm"
          ? { expires: Date.now() + 30 * 86400000 }
          : {}),
      }),
    ).toString("base64url");
    return (
      data +
      "." +
      createHmac("sha256", this.secret())
        .update("newsletter:" + data)
        .digest("base64url")
    );
  }
  private decode(token: string, purpose: string) {
    try {
      if (typeof token !== "string" || token.length > 2048) throw Error();
      const [data, signature, extra] = token.split(".");
      if (!data || !signature || extra !== undefined) throw Error();
      const expected = createHmac("sha256", this.secret())
        .update("newsletter:" + data)
        .digest();
      const actual = Buffer.from(signature, "base64url");
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw Error();
      const payload = JSON.parse(Buffer.from(data, "base64url").toString());
      if (
        payload.purpose !== purpose ||
        typeof payload.id !== "string" ||
        typeof payload.email !== "string" ||
        !Number.isInteger(payload.version) ||
        (purpose === "confirm" &&
          (!Number.isFinite(payload.expires) || payload.expires <= Date.now()))
      )
        throw Error();
      return payload;
    } catch {
      throw new BadRequestException(
        "This newsletter link is invalid or expired",
      );
    }
  }
  private async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        if (attempt >= 2 || !["P2034", "P2002"].includes(error?.code))
          throw error;
      }
    }
  }
  async subscribe(email: string) {
    this.mail.assertConfigured();
    this.origin();
    this.secret();
    const normalizedEmail = email.trim().toLowerCase();
    const current = this.offers
      ? await this.offers.get()
      : presentOffer(DEFAULT_OFFER, 1);
    const row = await this.transaction(async (tx) => {
      let subscriber = await tx.newsletterSubscriber.findUnique({
        where: { email: normalizedEmail },
        include: { rewardDiscount: true },
      });
      if (!subscriber)
        subscriber = await tx.newsletterSubscriber.create({
          data: {
            email: normalizedEmail,
            status: NewsletterStatus.PENDING,
            source: "storefront",
          },
          include: { rewardDiscount: true },
        });
      // Issuance is recorded even when this campaign has no incentive, so repeat
      // signup cannot create an extra reward after an administrator changes terms.
      if (!subscriber.rewardIssuedAt && !subscriber.rewardDiscountId) {
        const offer = current.config;
        const reward =
          offer.enabled && offer.type !== "NONE"
            ? await tx.discount.create({
                data: {
                  code: "NL-" + randomBytes(10).toString("hex").toUpperCase(),
                  type: offer.type as any,
                  value: offer.value,
                  currency: offer.type === "PERCENTAGE" ? null : offer.currency,
                  usageLimit: offer.usageLimit,
                  perCustomerLimit: offer.usageLimit,
                  active: false,
                  minimumSubtotal: offer.minimumSubtotal,
                  maximumDiscount:
                    offer.type === "PERCENTAGE" ? offer.maximumDiscount : null,
                  endsAt: new Date(Date.now() + offer.validityDays * 86400000),
                  offerSnapshot: offer as unknown as Prisma.InputJsonValue,
                },
              })
            : null;
        subscriber = await tx.newsletterSubscriber.update({
          where: { id: subscriber.id },
          data: {
            rewardDiscountId: reward?.id || null,
            rewardIssuedAt: new Date(),
            offerSnapshot: offer as unknown as Prisma.InputJsonValue,
            status: NewsletterStatus.PENDING,
          },
          include: { rewardDiscount: true },
        });
      }
      if (subscriber.status === "UNSUBSCRIBED")
        subscriber = await tx.newsletterSubscriber.update({
          where: { id: subscriber.id },
          data: {
            status: NewsletterStatus.PENDING,
            welcomeStatus: "PENDING",
            welcomeAttemptedAt: null,
          },
          include: { rewardDiscount: true },
        });
      return subscriber;
    });
    if (
      !(row.status === "SUBSCRIBED" && row.confirmedAt) &&
      (["PENDING", "FAILED"].includes(row.welcomeStatus) ||
        (row.welcomeStatus === "SENDING" &&
          row.welcomeAttemptedAt &&
          Date.now() - row.welcomeAttemptedAt.getTime() > 120000)) &&
      (!row.welcomeAttemptedAt ||
        Date.now() - row.welcomeAttemptedAt.getTime() > 15 * 60000)
    ) {
      setImmediate(() => {
        void this.deliver(row.id).catch(() => undefined);
      });
    }
    return { subscribed: true };
  }
  private async deliver(id: string) {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
      include: { rewardDiscount: true },
    });
    if (
      !row ||
      row.status === "UNSUBSCRIBED" ||
      (row.status === "SUBSCRIBED" && row.confirmedAt)
    )
      return;
    const now = new Date();
    const lease = await this.prisma.newsletterSubscriber.updateMany({
      where: {
        id,
        tokenVersion: row.tokenVersion,
        welcomeStatus: { in: ["PENDING", "FAILED", "SENDING"] },
        OR: [
          { welcomeStatus: { not: "SENDING" } },
          { welcomeAttemptedAt: { lt: new Date(Date.now() - 120000) } },
        ],
      },
      data: { welcomeStatus: "SENDING", welcomeAttemptedAt: now },
    });
    if (!lease.count) return;
    try {
      const origin = this.origin();
      const message = buildNewsletterEmail(
        row.rewardDiscount?.code || null,
        row.rewardDiscount?.endsAt ||
          new Date(
            (row.rewardIssuedAt || row.createdAt || new Date()).getTime() +
              this.rowOffer(row).validityDays * 86400000,
          ),
        origin + "/newsletter/confirm#token=" + this.sign(row, "confirm"),
        origin +
          "/newsletter/unsubscribe#token=" +
          this.sign(row, "unsubscribe"),
        this.rowOffer(row),
      );
      await this.mail.sendMessage(row.email, message);
      await this.prisma.newsletterSubscriber.updateMany({
        where: {
          id,
          tokenVersion: row.tokenVersion,
          welcomeStatus: "SENDING",
          welcomeAttemptedAt: now,
        },
        data: { welcomeStatus: "SENT", welcomeSentAt: new Date() },
      });
    } catch {
      await this.prisma.newsletterSubscriber.updateMany({
        where: {
          id,
          tokenVersion: row.tokenVersion,
          welcomeStatus: "SENDING",
          welcomeAttemptedAt: now,
        },
        data: { welcomeStatus: "FAILED" },
      });
    }
  }
  async confirm(token: string) {
    const payload = this.decode(token, "confirm");
    return this.transaction(async (tx) => {
      const row = await tx.newsletterSubscriber.findUnique({
        where: { id: payload.id },
        include: { rewardDiscount: true },
      });
      if (
        !row ||
        row.email !== payload.email ||
        row.tokenVersion !== payload.version
      )
        throw new BadRequestException(
          "This newsletter link is invalid or expired",
        );
      const now = new Date();
      await tx.newsletterSubscriber.update({
        where: { id: row.id },
        data: {
          status: NewsletterStatus.SUBSCRIBED,
          confirmedAt: row.confirmedAt || now,
          unsubscribedAt: null,
        },
      });
      let reward = row.rewardDiscount;
      if (reward && !row.confirmedAt && reward.endsAt && reward.endsAt > now)
        reward = await tx.discount.update({
          where: { id: reward.id },
          data: { active: true },
        });
      const used = reward
        ? await tx.discountUsage.count({ where: { discountId: reward.id } })
        : 0;
      return {
        confirmed: true,
        reward:
          used < (reward?.usageLimit || 1) &&
          reward?.active &&
          reward.endsAt &&
          reward.endsAt > now
            ? {
                code: reward.code,
                type: reward.type,
                value: Number(reward.value),
                expiresAt: reward.endsAt.toISOString(),
                ...this.rewardCopy(reward),
              }
            : null,
      };
    });
  }
  async unsubscribe(token: string) {
    const payload = this.decode(token, "unsubscribe");
    return this.transaction(async (tx) => {
      const row = await tx.newsletterSubscriber.findUnique({
        where: { id: payload.id },
      });
      if (
        !row ||
        row.email !== payload.email ||
        (row.tokenVersion !== payload.version &&
          !(
            row.status === "UNSUBSCRIBED" &&
            row.tokenVersion === payload.version + 1
          ))
      )
        throw new BadRequestException(
          "This newsletter link is invalid or expired",
        );
      if (row.status !== "UNSUBSCRIBED")
        await tx.newsletterSubscriber.update({
          where: { id: row.id },
          data: {
            status: NewsletterStatus.UNSUBSCRIBED,
            unsubscribedAt: new Date(),
            tokenVersion: { increment: 1 },
          },
        });
      return { unsubscribed: true };
    });
  }
  async list(query: NewsletterListDto) {
    const { page = 1, limit = 25, status, q } = query;
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(status ? { status } : {}),
      ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
    };
    const [
      items,
      total,
      all,
      pending,
      subscribed,
      unsubscribed,
      deliveryFailed,
    ] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { subscribedAt: "desc" },
        include: {
          rewardDiscount: {
            include: {
              usages: { include: { order: { select: { orderNumber: true } } } },
            },
          },
        },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({ where: { status: "PENDING" } }),
      this.prisma.newsletterSubscriber.count({
        where: { status: "SUBSCRIBED" },
      }),
      this.prisma.newsletterSubscriber.count({
        where: { status: "UNSUBSCRIBED" },
      }),
      this.prisma.newsletterSubscriber.count({
        where: {
          OR: [
            { welcomeStatus: "FAILED" },
            {
              welcomeStatus: "SENDING",
              welcomeAttemptedAt: { lt: new Date(Date.now() - 120000) },
            },
          ],
        },
      }),
    ]);
    return {
      items: items.map(
        ({ rewardDiscount: r, tokenVersion, rewardDiscountId, ...row }) => ({
          ...row,
          welcomeStatus:
            row.welcomeStatus === "SENDING" &&
            row.welcomeAttemptedAt &&
            Date.now() - row.welcomeAttemptedAt.getTime() > 120000
              ? "FAILED"
              : row.welcomeStatus,
          reward: r
            ? {
                code: r.code,
                type: r.type,
                value: Number(r.value),
                expiresAt: r.endsAt,
                active: r.active,
                usageCount: r.usages.length,
                orderNumbers: r.usages.map((u) => u.order.orderNumber),
                ...this.rewardCopy(r),
              }
            : null,
        }),
      ),
      total,
      page,
      limit,
      counts: { total: all, pending, subscribed, unsubscribed, deliveryFailed },
    };
  }
  private rowOffer(row: any) {
    return row.offerSnapshot
      ? normalizeOffer(row.offerSnapshot)
      : row.rewardDiscount
        ? issuedOffer(row.rewardDiscount)
        : DEFAULT_OFFER;
  }
  private rewardCopy(reward: any) {
    const offer = issuedOffer(reward),
      display = presentOffer(offer, 0);
    return { offer, description: display.description, terms: display.terms };
  }
  async me(email: string) {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        rewardDiscount: { include: { _count: { select: { usages: true } } } },
      },
    });
    const r = row?.rewardDiscount;
    return {
      status: row?.status || null,
      confirmedAt: row?.confirmedAt || null,
      reward:
        r && row?.confirmedAt
          ? {
              code: r.code,
              type: r.type,
              value: Number(r.value),
              expiresAt: r.endsAt,
              active: r.active,
              usageCount: r._count.usages,
              usageLimit: r.usageLimit,
              ...this.rewardCopy(r),
            }
          : null,
    };
  }
  async unsubscribeMe(email: string) {
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (row && row.status !== "UNSUBSCRIBED")
      await this.prisma.newsletterSubscriber.updateMany({
        where: { id: row.id, tokenVersion: row.tokenVersion },
        data: {
          status: "UNSUBSCRIBED",
          unsubscribedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
    return { unsubscribed: true };
  }
  async retry(id: string) {
    this.mail.assertConfigured();
    this.origin();
    const row = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
    });
    if (
      !row ||
      row.status === "UNSUBSCRIBED" ||
      (row.status === "SUBSCRIBED" && row.confirmedAt) ||
      row.welcomeStatus === "SENT" ||
      (row.welcomeStatus === "SENDING" &&
        row.welcomeAttemptedAt &&
        Date.now() - row.welcomeAttemptedAt.getTime() < 120000)
    )
      throw new BadRequestException("This welcome email cannot be retried");
    setImmediate(() => {
      void this.deliver(id).catch(() => undefined);
    });
    return { queued: true };
  }
}
