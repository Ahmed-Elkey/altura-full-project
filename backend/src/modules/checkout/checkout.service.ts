import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CartStatus,
  InventoryReason,
  OrderAddressType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ProductStatus,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { parseDuration } from "../../common/security/duration";
import { CommerceOwner } from "../carts/cart.types";
import {
  DiscountsService,
  presentPromotionLine,
} from "../discounts/discounts.service";
import { orderInclude, presentOrder } from "../orders/order.presenter";
import { ShippingService } from "../shipping/shipping.service";
import { CheckoutAddressDto } from "./dto/checkout-address.dto";
import { CheckoutQuoteDto } from "./dto/checkout-quote.dto";
import { PlaceOrderDto } from "./dto/place-order.dto";

const checkoutCartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            include: {
              categories: true,
              images: {
                orderBy: [
                  { isPrimary: "desc" as const },
                  { position: "asc" as const },
                ],
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CheckoutCart = Prisma.CartGetPayload<{
  include: typeof checkoutCartInclude;
}>;
type CheckoutItem = CheckoutCart["items"][number];
type CheckoutDb = Pick<Prisma.TransactionClient, "cart" | "user">;

interface CartSnapshot {
  cart: CheckoutCart;
  currency: string;
  subtotal: Prisma.Decimal;
  itemCount: number;
  items: Array<{
    cartItemId: string;
    variantId: string;
    sku: string;
    productId: string;
    categoryIds: string[];
    productName: string;
    variantName: string | null;
    colorName: string;
    size: string;
    productImageUrl: string | null;
    unitPrice: Prisma.Decimal;
    quantity: number;
    lineTotal: Prisma.Decimal;
    availableQuantity: number;
  }>;
}

@Injectable()
export class CheckoutService {
  private readonly reservationTtlMs: number;
  private readonly taxRate: Prisma.Decimal;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly shipping: ShippingService,
    private readonly discounts: DiscountsService,
  ) {
    this.reservationTtlMs = parseDuration(
      this.config.get<string>("CHECKOUT_RESERVATION_TTL", "30m"),
    );
    this.taxRate = new Prisma.Decimal(
      this.config.get<number>("DEFAULT_TAX_RATE", 0),
    );
  }

  async shippingMethods(owner: CommerceOwner, countryCode: string) {
    const snapshot = await this.loadSnapshot(this.prisma, owner);
    return {
      cartId: snapshot.cart.id,
      currency: snapshot.currency,
      subtotal: Number(snapshot.subtotal),
      ...(await this.shipping.listForCountry(
        countryCode,
        snapshot.subtotal,
        snapshot.currency,
      )),
    };
  }

  async quote(owner: CommerceOwner, dto: CheckoutQuoteDto) {
    const snapshot = await this.loadSnapshot(this.prisma, owner);
    const email = await this.resolveEmail(this.prisma, owner, dto.email);
    const shipping = await this.shipping.resolveMethod(
      dto.shippingMethodId,
      dto.shippingAddress.countryCode,
      snapshot.subtotal,
      snapshot.currency,
    );
    const shippingTotal = new Prisma.Decimal(shipping.method.price);
    const discount = await this.discounts.evaluate({
      code: dto.discountCode,
      items: snapshot.items,
      subtotal: snapshot.subtotal,
      shippingTotal,
      currency: snapshot.currency,
      userId: owner.userId,
      email,
    });
    const totals = this.calculateTotals(
      snapshot.subtotal,
      shippingTotal,
      discount,
    );

    return {
      cartId: snapshot.cart.id,
      email,
      currency: snapshot.currency,
      itemCount: snapshot.itemCount,
      items: snapshot.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        promotion: discount.allocations
          ? presentPromotionLine({
              ...item,
              id: item.variantId,
              promotionAllocation: discount.allocations[item.variantId],
            })
          : null,
      })),
      shipping: shipping.method,
      discount: {
        code: discount.code,
        type: discount.type,
        itemDiscount: Number(discount.itemDiscount),
        shippingDiscount: Number(discount.shippingDiscount),
        allocations: discount.allocations,
        promotion: discount.promotion,
      },
      totals: this.presentTotals(totals),
      taxRate: Number(this.taxRate),
    };
  }

  async placeOrder(
    owner: CommerceOwner,
    dto: PlaceOrderDto,
    idempotencyKey: string,
  ) {
    const ownerFingerprint = owner.userId
      ? { userId: owner.userId }
      : { sessionId: owner.sessionId };
    const cash = dto.paymentMethod === "CASH_ON_DELIVERY";
    // Preserve legacy CARD request fingerprints; COD is a distinct identity.
    const { paymentMethod, ...legacyPayload } = dto;
    const fingerprint = this.fingerprint({
      owner: ownerFingerprint,
      payload: cash ? { ...legacyPayload, paymentMethod } : legacyPayload,
    });
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: orderInclude,
    });
    if (existing) {
      this.assertIdempotentMatch(existing, fingerprint, owner);
      return { idempotentReplay: true, order: presentOrder(existing) };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const order = await this.prisma.$transaction(
          async (tx) => {
            const snapshot = await this.loadSnapshot(tx, owner);
            const email = await this.resolveEmail(tx, owner, dto.email);
            const shipping = await this.shipping.resolveMethod(
              dto.shippingMethodId,
              dto.shippingAddress.countryCode,
              snapshot.subtotal,
              snapshot.currency,
              tx,
            );
            const shippingTotal = new Prisma.Decimal(shipping.method.price);
            const discount = await this.discounts.evaluate(
              {
                code: dto.discountCode,
                items: snapshot.items,
                subtotal: snapshot.subtotal,
                shippingTotal,
                currency: snapshot.currency,
                userId: owner.userId,
                email,
              },
              tx,
            );
            const totals = this.calculateTotals(
              snapshot.subtotal,
              shippingTotal,
              discount,
            );
            if (cash && snapshot.currency !== "EGP")
              throw new ConflictException(
                "Cash on Delivery requires the configured EGP market",
              );

            for (const item of snapshot.items) {
              const changed = await tx.$executeRaw`
                UPDATE "Inventory"
                SET "reservedQuantity" = "reservedQuantity" + ${item.quantity},
                    "updatedAt" = NOW()
                WHERE "variantId" = ${item.variantId}
                  AND ("quantity" - "reservedQuantity") >= ${item.quantity}
              `;
              if (changed !== 1) {
                throw new ConflictException(
                  `${item.sku} no longer has enough available stock`,
                );
              }
            }

            const now = new Date();
            const reservationExpiresAt = new Date(
              now.getTime() + this.reservationTtlMs,
            );
            const billingAddress = dto.billingAddress ?? dto.shippingAddress;
            const order = await tx.order.create({
              data: {
                orderNumber: this.generateOrderNumber(now),
                idempotencyKey,
                idempotencyFingerprint: fingerprint,
                sourceCartId: snapshot.cart.id,
                userId: owner.userId ?? null,
                email,
                phone: dto.phone ?? dto.shippingAddress.phone ?? null,
                status: cash ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
                currency: snapshot.currency,
                subtotal: totals.subtotal,
                discountTotal: totals.discountTotal,
                shippingTotal: totals.shippingTotal,
                taxTotal: totals.taxTotal,
                grandTotal: totals.grandTotal,
                appliedCode: discount.code,
                customerNote: dto.customerNote,
                placedAt: now,
                reservationExpiresAt: cash ? null : reservationExpiresAt,
                inventoryCommittedAt: cash ? now : undefined,
                items: {
                  create: snapshot.items.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId,
                    sku: item.sku,
                    productName: item.productName,
                    variantName: item.variantName,
                    colorName: item.colorName,
                    size: item.size,
                    productImageUrl: item.productImageUrl,
                    unitPrice: item.unitPrice,
                    quantity: item.quantity,
                    lineTotal: item.lineTotal,
                    ...(discount.allocations
                      ? {
                          promotionAllocation: discount.allocations[
                            item.variantId
                          ] as unknown as Prisma.InputJsonValue,
                        }
                      : {}),
                  })),
                },
                addresses: {
                  create: [
                    this.addressData(
                      OrderAddressType.SHIPPING,
                      dto.shippingAddress,
                    ),
                    this.addressData(OrderAddressType.BILLING, billingAddress),
                  ],
                },
                shipments: {
                  create: {
                    service: shipping.method.name,
                    shippingMethodId: shipping.method.id,
                    priceSnapshot: shippingTotal,
                    currencySnapshot: snapshot.currency,
                  },
                },
                ...(discount.discountId
                  ? {
                      discountUsages: {
                        create: {
                          discountId: discount.discountId,
                          userId: owner.userId ?? null,
                          amount: totals.discountTotal,
                        },
                      },
                    }
                  : {}),
              },
              include: orderInclude,
            });

            if (cash) {
              for (const item of snapshot.items) {
                const committed = await tx.$executeRaw`
                  UPDATE "Inventory" SET "quantity" = "quantity" - ${item.quantity},
                    "reservedQuantity" = "reservedQuantity" - ${item.quantity}, "updatedAt" = NOW()
                  WHERE "variantId" = ${item.variantId}
                    AND "reservedQuantity" >= ${item.quantity} AND "quantity" >= ${item.quantity}
                `;
                if (committed !== 1)
                  throw new ConflictException(
                    "Cash order inventory could not be committed",
                  );
                await tx.inventoryMovement.create({
                  data: {
                    variantId: item.variantId,
                    reason: InventoryReason.PURCHASE,
                    quantity: -item.quantity,
                    referenceId: order.id,
                    note: "Cash on Delivery order committed inventory",
                  },
                });
              }
              await tx.payment.create({
                data: {
                  orderId: order.id,
                  provider: PaymentProvider.CASH_ON_DELIVERY,
                  status: PaymentStatus.PENDING,
                  idempotencyKey: `cod:${order.id}`,
                  idempotencyFingerprint: fingerprint,
                  activeAttemptKey: `cod:${order.id}`,
                  amount: order.grandTotal,
                  currency: order.currency,
                },
              });
              await tx.auditLog.create({
                data: {
                  actorUserId: owner.userId,
                  action: "COD_ORDER_CONFIRMED",
                  entityType: "Order",
                  entityId: order.id,
                  metadata: {
                    orderNumber: order.orderNumber,
                    amount: order.grandTotal.toFixed(2),
                    currency: order.currency,
                  },
                },
              });
            }

            await tx.cart.update({
              where: { id: snapshot.cart.id },
              data: {
                status: CartStatus.CONVERTED,
                sessionId: null,
                expiresAt: null,
              },
            });

            return cash
              ? tx.order.findUniqueOrThrow({
                  where: { id: order.id },
                  include: orderInclude,
                })
              : order;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return { idempotentReplay: false, order: presentOrder(order) };
      } catch (error) {
        const code = this.prismaErrorCode(error);
        if (code === "P2002") {
          const replay = await this.prisma.order.findUnique({
            where: { idempotencyKey },
            include: orderInclude,
          });
          if (replay) {
            this.assertIdempotentMatch(replay, fingerprint, owner);
            return { idempotentReplay: true, order: presentOrder(replay) };
          }
          if (attempt < 2) continue;
        }
        if (code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }

    throw new ConflictException(
      "Checkout could not be completed safely; please retry",
    );
  }

  private async loadSnapshot(
    db: CheckoutDb,
    owner: CommerceOwner,
  ): Promise<CartSnapshot> {
    const cart = owner.userId
      ? await db.cart.findFirst({
          where: { userId: owner.userId, status: CartStatus.ACTIVE },
          include: checkoutCartInclude,
          orderBy: { updatedAt: "desc" },
        })
      : await db.cart.findFirst({
          where: { sessionId: owner.sessionId, status: CartStatus.ACTIVE },
          include: checkoutCartInclude,
        });

    if (!cart || !cart.items.length)
      throw new BadRequestException("Cart is empty");

    let subtotal = new Prisma.Decimal(0);
    let itemCount = 0;
    const items: CartSnapshot["items"] = [];

    for (const item of cart.items) {
      const normalized = this.normalizeCartItem(item, cart.currency);
      subtotal = subtotal.plus(normalized.lineTotal);
      itemCount += item.quantity;
      items.push(normalized);
    }

    return {
      cart,
      currency: cart.currency,
      subtotal: subtotal.toDecimalPlaces(2),
      itemCount,
      items,
    };
  }

  private normalizeCartItem(item: CheckoutItem, cartCurrency: string) {
    const variant = item.variant;
    if (variant.product.status !== ProductStatus.ACTIVE || !variant.active) {
      throw new ConflictException(`${variant.sku} is no longer available`);
    }
    if (variant.currency !== cartCurrency) {
      throw new ConflictException(`${variant.sku} uses a different currency`);
    }
    if (!variant.inventory) {
      throw new ConflictException(`${variant.sku} has no inventory record`);
    }

    const availableQuantity = Math.max(
      0,
      variant.inventory.quantity - variant.inventory.reservedQuantity,
    );
    if (availableQuantity < item.quantity) {
      throw new ConflictException(
        `${variant.sku} only has ${availableQuantity} unit(s) available`,
      );
    }

    const unitPrice = variant.price;
    const lineTotal = unitPrice.mul(item.quantity).toDecimalPlaces(2);
    const image = this.pickImage(item);

    return {
      cartItemId: item.id,
      variantId: variant.id,
      sku: variant.sku,
      productId: variant.product.id,
      categoryIds: variant.product.categories.map(
        (category) => category.categoryId,
      ),
      productName: variant.product.name,
      variantName: variant.title,
      colorName: variant.colorName,
      size: variant.size,
      productImageUrl: image,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      availableQuantity,
    };
  }

  private pickImage(item: CheckoutItem): string | null {
    const color = item.variant.colorName.toLowerCase();
    const matching = item.variant.product.images.find(
      (image) => image.colorName?.toLowerCase() === color,
    );
    return matching?.url ?? item.variant.product.images[0]?.url ?? null;
  }

  private async resolveEmail(
    db: CheckoutDb,
    owner: CommerceOwner,
    supplied?: string,
  ) {
    if (supplied) return supplied.trim().toLowerCase();
    if (!owner.userId)
      throw new BadRequestException("Email is required for guest checkout");

    const user = await db.user.findUnique({
      where: { id: owner.userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException("Customer account not found");
    return user.email.toLowerCase();
  }

  private calculateTotals(
    subtotal: Prisma.Decimal,
    shippingTotal: Prisma.Decimal,
    discount: {
      itemDiscount: Prisma.Decimal;
      shippingDiscount: Prisma.Decimal;
      totalDiscount: Prisma.Decimal;
    },
  ) {
    const taxableSubtotal = subtotal.minus(discount.itemDiscount);
    const taxableShipping = shippingTotal.minus(discount.shippingDiscount);
    const rawTaxableTotal = taxableSubtotal.plus(taxableShipping);
    const taxableTotal = rawTaxableTotal.lt(0)
      ? new Prisma.Decimal(0)
      : rawTaxableTotal;
    const taxTotal = taxableTotal.mul(this.taxRate).toDecimalPlaces(2);
    const grandTotal = subtotal
      .plus(shippingTotal)
      .minus(discount.totalDiscount)
      .plus(taxTotal)
      .toDecimalPlaces(2);

    return {
      subtotal: subtotal.toDecimalPlaces(2),
      discountTotal: discount.totalDiscount.toDecimalPlaces(2),
      shippingTotal: shippingTotal.toDecimalPlaces(2),
      taxTotal,
      grandTotal,
    };
  }

  private presentTotals(
    totals: ReturnType<CheckoutService["calculateTotals"]>,
  ) {
    return {
      subtotal: Number(totals.subtotal),
      discountTotal: Number(totals.discountTotal),
      shippingTotal: Number(totals.shippingTotal),
      taxTotal: Number(totals.taxTotal),
      grandTotal: Number(totals.grandTotal),
    };
  }

  private addressData(type: OrderAddressType, address: CheckoutAddressDto) {
    return {
      type,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
    };
  }

  private generateOrderNumber(now: Date): string {
    const date = now.toISOString().slice(2, 10).replaceAll("-", "");
    const suffix = randomBytes(5).toString("hex").toUpperCase();
    return `ALT-${date}-${suffix}`;
  }

  private fingerprint(value: unknown): string {
    return createHash("sha256")
      .update(this.stableStringify(value))
      .digest("hex");
  }

  private stableStringify(value: unknown): string {
    if (value === undefined) return '"__undefined__"';
    if (value === null || typeof value !== "object")
      return JSON.stringify(value) as string;
    if (Array.isArray(value))
      return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${this.stableStringify(object[key])}`,
      )
      .join(",")}}`;
  }

  private assertIdempotentMatch(
    order: { idempotencyFingerprint: string | null; userId: string | null },
    fingerprint: string,
    owner: CommerceOwner,
  ) {
    if (order.idempotencyFingerprint !== fingerprint) {
      throw new ConflictException(
        "Idempotency key was already used with a different request",
      );
    }
    if (owner.userId && order.userId !== owner.userId) {
      throw new ConflictException(
        "Idempotency key belongs to another checkout",
      );
    }
    if (!owner.userId && order.userId !== null) {
      throw new ConflictException(
        "Idempotency key belongs to another checkout",
      );
    }
  }

  private prismaErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object" || !("code" in error))
      return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
}
