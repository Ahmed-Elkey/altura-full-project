import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { DiscountType, Prisma } from "@prisma/client";
import { normalizeOffer, OfferConfig } from "../newsletter/offer-config";
import { PrismaService } from "../../common/prisma/prisma.service";

type DbClient = Pick<Prisma.TransactionClient, "discount" | "discountUsage">;

export interface DiscountEvaluationInput {
  code?: string;
  subtotal: Prisma.Decimal;
  shippingTotal: Prisma.Decimal;
  currency: string;
  userId?: string;
  email: string;
  items?: PromotionItem[];
}

export interface PromotionItem {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPrice: Prisma.Decimal;
}
export interface PromotionUnit {
  discount: number;
  bundle: string | null;
}
export type PromotionAllocations = Record<string, PromotionUnit[]>;

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: DiscountEvaluationInput, db: DbClient = this.prisma) {
    const normalizedCode = input.code?.trim().toUpperCase();
    if (!normalizedCode) {
      return {
        discountId: null,
        code: null,
        type: null,
        itemDiscount: new Prisma.Decimal(0),
        shippingDiscount: new Prisma.Decimal(0),
        totalDiscount: new Prisma.Decimal(0),
      };
    }

    const newsletterReward = normalizedCode.startsWith("NL-");
    const discount = await db.discount.findUnique({
      where: { code: normalizedCode },
      include: {
        newsletterSubscriber: { select: { email: true, confirmedAt: true } },
      },
    });
    const now = new Date();
    if (!discount || !discount.active)
      throw new BadRequestException("Discount code is invalid");
    if (newsletterReward || discount.newsletterSubscriber) {
      const subscriber = discount.newsletterSubscriber;
      if (
        !subscriber?.confirmedAt ||
        subscriber.email.trim().toLowerCase() !==
          input.email.trim().toLowerCase()
      ) {
        throw new BadRequestException(
          "Discount code is not valid for this email",
        );
      }
    }
    let snapshot: OfferConfig | null = null;
    if (
      discount.offerSnapshot !== null &&
      discount.offerSnapshot !== undefined
    ) {
      try {
        snapshot = normalizeOffer(discount.offerSnapshot);
        if (snapshot.type === "NONE") throw new Error("No incentive");
      } catch {
        throw new BadRequestException("Discount configuration is invalid");
      }
    }
    const type = snapshot?.type ?? discount.type;
    const value = snapshot
      ? new Prisma.Decimal(snapshot.value)
      : discount.value;
    const currency = snapshot?.currency ?? discount.currency;
    const minimum = snapshot
      ? snapshot.minimumSubtotal
      : discount.minimumSubtotal;
    const maximum = snapshot
      ? snapshot.maximumDiscount
      : discount.maximumDiscount;
    const scoped =
      snapshot &&
      (snapshot.eligibleProductIds.length ||
        snapshot.eligibleCategoryIds.length);
    let eligibleSubtotal = input.subtotal;
    if (scoped) {
      if (!input.items?.length)
        throw new BadRequestException("Discount requires cart items");
      eligibleSubtotal = input.items
        .filter((item) => this.eligible(item, snapshot!))
        .reduce(
          (sum, item) => sum.plus(item.unitPrice.mul(item.quantity)),
          new Prisma.Decimal(0),
        );
    }
    if (value.lt(0))
      throw new BadRequestException("Discount configuration is invalid");
    if (discount.startsAt && discount.startsAt > now) {
      throw new BadRequestException("Discount code is not active yet");
    }
    if (discount.endsAt && discount.endsAt <= now) {
      throw new BadRequestException("Discount code has expired");
    }
    if (
      minimum !== null &&
      minimum !== undefined &&
      eligibleSubtotal.lt(minimum)
    ) {
      throw new BadRequestException(
        `Discount requires a minimum subtotal of ${Number(minimum)} ${input.currency}`,
      );
    }
    if (currency && currency !== input.currency) {
      throw new BadRequestException(
        "Discount code is not valid for this currency",
      );
    }

    if (discount.usageLimit !== null) {
      const totalUsage = await db.discountUsage.count({
        where: { discountId: discount.id },
      });
      if (totalUsage >= discount.usageLimit) {
        throw new BadRequestException(
          "Discount code usage limit has been reached",
        );
      }
    }

    if (discount.perCustomerLimit !== null) {
      const normalizedEmail = input.email.trim().toLowerCase();
      const identityFilters: Prisma.DiscountUsageWhereInput[] = [
        {
          userId: null,
          order: {
            email: { equals: normalizedEmail, mode: "insensitive" },
          },
        },
      ];
      if (input.userId) identityFilters.push({ userId: input.userId });

      const customerUsage = await db.discountUsage.count({
        where: { discountId: discount.id, OR: identityFilters },
      });
      if (customerUsage >= discount.perCustomerLimit) {
        throw new BadRequestException(
          "Discount code customer usage limit has been reached",
        );
      }
    }

    let itemDiscount = new Prisma.Decimal(0);
    let shippingDiscount = new Prisma.Decimal(0);

    let allocations: PromotionAllocations | undefined;
    let promotion:
      ReturnType<DiscountsService["buyGet"]>["promotion"] | undefined;
    if (type === "BUY_X_GET_Y") {
      const result = this.buyGet(input, snapshot, maximum);
      itemDiscount = result.itemDiscount;
      allocations = result.allocations;
      promotion = result.promotion;
    } else if (type === DiscountType.PERCENTAGE) {
      if (value.lt(0) || value.gt(100)) {
        throw new BadRequestException("Discount configuration is invalid");
      }
      itemDiscount = eligibleSubtotal.mul(value).div(100).toDecimalPlaces(2);
    } else if (type === DiscountType.FIXED_AMOUNT) {
      itemDiscount = (
        eligibleSubtotal.lte(value) ? eligibleSubtotal : value
      ).toDecimalPlaces(2);
    } else if (type === DiscountType.FREE_SHIPPING) {
      shippingDiscount = input.shippingTotal.toDecimalPlaces(2);
    }

    if (maximum !== null && maximum !== undefined && itemDiscount.gt(maximum)) {
      itemDiscount = new Prisma.Decimal(maximum).toDecimalPlaces(2);
    }

    const totalDiscount = itemDiscount
      .plus(shippingDiscount)
      .toDecimalPlaces(2);
    return {
      discountId: discount.id,
      code: discount.code,
      type: type as DiscountType,
      allocations,
      promotion,
      itemDiscount,
      shippingDiscount,
      totalDiscount,
    };
  }
  private eligible(item: PromotionItem, config: OfferConfig) {
    return (
      (!config.eligibleProductIds.length &&
        !config.eligibleCategoryIds.length) ||
      config.eligibleProductIds.includes(item.productId) ||
      item.categoryIds.some((id) => config.eligibleCategoryIds.includes(id))
    );
  }

  private buyGet(
    input: DiscountEvaluationInput,
    config: OfferConfig | null,
    maximum: any,
  ) {
    if (
      !config ||
      !Number.isInteger(config.buyQuantity) ||
      config.buyQuantity < 1 ||
      config.buyQuantity > 100 ||
      !Number.isInteger(config.giftQuantity) ||
      config.giftQuantity < 1 ||
      config.giftQuantity > 100 ||
      (config.maxGiftUnits !== null &&
        (!Number.isInteger(config.maxGiftUnits) ||
          config.maxGiftUnits < 1 ||
          config.maxGiftUnits > 10000))
    ) {
      throw new BadRequestException("Discount configuration is invalid");
    }
    if (!input.items?.length)
      throw new BadRequestException("Discount requires cart items");
    const allocations: PromotionAllocations = {};
    const units: Array<{
      variantId: string;
      index: number;
      price: Prisma.Decimal;
    }> = [];
    let count = 0;
    for (const item of input.items) {
      if (
        allocations[item.variantId] ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 10000 ||
        !item.unitPrice.isFinite() ||
        item.unitPrice.lt(0) ||
        (count += item.quantity) > 10000
      )
        throw new BadRequestException("Discount cart items are invalid");
      allocations[item.variantId] = Array.from(
        { length: item.quantity },
        () => ({ discount: 0, bundle: null }),
      );
      if (this.eligible(item, config)) {
        for (let index = 0; index < item.quantity; index++)
          units.push({
            variantId: item.variantId,
            index,
            price: item.unitPrice,
          });
      }
    }
    units.sort(
      (a, b) =>
        b.price.comparedTo(a.price) ||
        a.variantId.localeCompare(b.variantId) ||
        a.index - b.index,
    );
    const size = config.buyQuantity + config.giftQuantity;
    let gifts = 0;
    let itemDiscount = new Prisma.Decimal(0);
    for (let offset = 0; offset + size <= units.length; offset += size) {
      const group = units.slice(offset, offset + size);
      let discounted = false;
      for (const unit of group.slice(config.buyQuantity).reverse()) {
        if (config.maxGiftUnits !== null && gifts >= config.maxGiftUnits) break;
        const remaining =
          maximum === null || maximum === undefined
            ? unit.price
            : new Prisma.Decimal(maximum).minus(itemDiscount);
        const saving = Prisma.Decimal.min(
          unit.price,
          remaining,
        ).toDecimalPlaces(2);
        if (saving.lte(0)) continue;
        allocations[unit.variantId][unit.index].discount = Number(saving);
        itemDiscount = itemDiscount.plus(saving);
        gifts++;
        discounted = true;
      }
      if (discounted)
        for (const unit of group)
          allocations[unit.variantId][unit.index].bundle =
            `bundle-${offset / size + 1}`;
    }
    const summary = summarizePromotion(
      input.items.map((item) => ({
        ...item,
        id: item.variantId,
        promotionAllocation: allocations[item.variantId],
      })),
    )!;
    const capReached =
      (config.maxGiftUnits !== null && gifts >= config.maxGiftUnits) ||
      (maximum !== null && maximum !== undefined && itemDiscount.gte(maximum));
    return {
      allocations,
      itemDiscount,
      promotion: {
        ...summary,
        buyQuantity: config.buyQuantity,
        giftQuantity: config.giftQuantity,
        eligibleUnits: units.length,
        remainingUnits: capReached ? 0 : size - (units.length % size),
        capReached,
      },
    };
  }
}

export interface PromotionReturnLine {
  id: string;
  quantity: number;
  promotionAllocation?: unknown;
}
/** Return quantities select the next ordered units after previously requested returns. */
export function validatePromotionReturn(
  lines: PromotionReturnLine[],
  selected: Array<{ orderItemId: string; quantity: number }>,
  previouslyReturned: Map<string, number> = new Map(),
): void {
  const bundles = new Map<string, number>();
  const selectedBundles = new Map<string, number>();
  const quantities = new Map(
    selected.map((item) => [item.orderItemId, item.quantity]),
  );
  for (const line of lines) {
    if (
      line.promotionAllocation === null ||
      line.promotionAllocation === undefined
    )
      continue;
    const allocation = promotionUnits(line);
    const offset = previouslyReturned.get(line.id) ?? 0;
    const quantity = quantities.get(line.id) ?? 0;
    if (offset + quantity > line.quantity || offset < 0 || quantity < 0)
      throw new ConflictException("Return quantity exceeds saved allocation");
    allocation.forEach((unit, index) => {
      if (!unit.bundle) return;
      bundles.set(unit.bundle, (bundles.get(unit.bundle) ?? 0) + 1);
      if (index >= offset && index < offset + quantity)
        selectedBundles.set(
          unit.bundle,
          (selectedBundles.get(unit.bundle) ?? 0) + 1,
        );
    });
  }
  for (const [bundle, count] of selectedBundles) {
    if (count !== bundles.get(bundle))
      throw new ConflictException(
        "Promotional bundle units must be returned together",
      );
  }
}
export function promotionUnits(line: PromotionReturnLine): PromotionUnit[] {
  const allocation = line.promotionAllocation;
  if (
    !Array.isArray(allocation) ||
    allocation.length !== line.quantity ||
    allocation.some(
      (unit) =>
        !unit ||
        typeof unit !== "object" ||
        !Number.isFinite(unit.discount) ||
        unit.discount < 0 ||
        (unit.bundle !== null && typeof unit.bundle !== "string"),
    )
  ) {
    throw new ConflictException("Saved promotion allocation is invalid");
  }
  return allocation as PromotionUnit[];
}

export function presentPromotionLine(
  line: PromotionReturnLine & {
    unitPrice: Prisma.Decimal;
    lineTotal?: Prisma.Decimal;
  },
) {
  if (line.promotionAllocation == null) return null;
  const units = promotionUnits(line);
  const savings = units.reduce(
    (sum, unit) => sum.plus(unit.discount),
    new Prisma.Decimal(0),
  );
  return {
    freeUnits: units.filter(
      (unit) => unit.discount > 0 && line.unitPrice.equals(unit.discount),
    ).length,
    discountedUnits: units.filter((unit) => unit.discount > 0).length,
    qualifyingUnits: units.filter((unit) => unit.bundle !== null).length,
    savings: Number(savings.toDecimalPlaces(2)),
    payableTotal: Number(
      (line.lineTotal ?? line.unitPrice.mul(line.quantity))
        .minus(savings)
        .toDecimalPlaces(2),
    ),
  };
}
export function summarizePromotion(
  lines: Array<PromotionReturnLine & { unitPrice: Prisma.Decimal }>,
) {
  if (!lines.some((line) => line.promotionAllocation != null)) return null;
  const bundles = new Set<string>();
  let freeUnits = 0,
    discountedUnits = 0,
    qualifyingUnits = 0;
  let savings = new Prisma.Decimal(0);
  for (const line of lines) {
    const summary = presentPromotionLine(line);
    if (!summary) continue;
    freeUnits += summary.freeUnits;
    discountedUnits += summary.discountedUnits;
    qualifyingUnits += summary.qualifyingUnits;
    savings = savings.plus(summary.savings);
    for (const unit of promotionUnits(line))
      if (unit.bundle) bundles.add(unit.bundle);
  }
  return {
    freeUnits,
    discountedUnits,
    qualifyingUnits,
    savings: Number(savings.toDecimalPlaces(2)),
    bundleCount: bundles.size,
  };
}
