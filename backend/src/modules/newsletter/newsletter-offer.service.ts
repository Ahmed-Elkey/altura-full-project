import {
  Injectable,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DEFAULT_OFFER, normalizeOffer, presentOffer } from "./offer-config";
import { buildNewsletterEmail } from "./newsletter-email";
@Injectable()
export class NewsletterOfferService {
  constructor(private readonly prisma: PrismaService) {}
  private campaign(raw:unknown) {
    const config=normalizeOffer(raw);
    if(config.type!=='PERCENTAGE')config.maximumDiscount=null;
    if(config.type!=='BUY_X_GET_Y'){config.eligibleProductIds=[];config.eligibleCategoryIds=[];config.maxGiftUnits=null;}
    if(config.type==='FIXED_AMOUNT'&&config.value<=0)throw new BadRequestException('Fixed amount must be positive');
    return config;
  }
  async get() {
    const row = await this.prisma.newsletterOffer.upsert({
      where: { id: "newsletter" },
      create: {
        id: "newsletter",
        config: DEFAULT_OFFER as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    return presentOffer(
      this.campaign(row.config),
      row.version,
      row.updatedAt.toISOString(),
    );
  }
  private async validateIds(config: ReturnType<typeof normalizeOffer>) {
    const [products, categories] = await Promise.all([
      config.eligibleProductIds.length
        ? this.prisma.product.count({
            where: { id: { in: config.eligibleProductIds } },
          })
        : 0,
      config.eligibleCategoryIds.length
        ? this.prisma.category.count({
            where: { id: { in: config.eligibleCategoryIds } },
          })
        : 0,
    ]);
    if (
      products !== config.eligibleProductIds.length ||
      categories !== config.eligibleCategoryIds.length
    )
      throw new BadRequestException(
        "An eligible product or category does not exist",
      );
  }
  async update(actorUserId: string, version: number, raw: unknown) {
    const config = this.campaign(raw);
    await this.validateIds(config);
    await this.get();
    const row = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.newsletterOffer.updateMany({
        where: { id: "newsletter", version },
        data: {
          config: config as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Offer settings changed. Reload before saving.",
        );
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "NEWSLETTER_OFFER_UPDATED",
          entityType: "NewsletterOffer",
          entityId: "newsletter",
          metadata: {
            previousVersion: version,
            version: version + 1,
            config: config as unknown as Prisma.InputJsonValue,
          },
        },
      });
      return tx.newsletterOffer.findUniqueOrThrow({
        where: { id: "newsletter" },
      });
    });
    return presentOffer(config, row.version, row.updatedAt.toISOString());
  }
  async preview(raw: unknown) {
    const config = this.campaign(raw);
    await this.validateIds(config);
    return {
      ...presentOffer(config, 0),
      ...buildNewsletterEmail(
        config.enabled && config.type !== "NONE" ? "PREVIEW-CODE" : null,
        new Date(Date.now() + config.validityDays * 86400000),
        "https://example.invalid/newsletter/confirm#token=preview",
        "https://example.invalid/newsletter/unsubscribe#token=preview",
        config,
      ),
    };
  }
}
