import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getMarketCurrency } from '../../common/config/market-currency';

const MAX_LINE_QUANTITY = 20;
const MAX_CART_LINES = 50;
const MAX_WISHLIST_ITEMS = 100;

@Injectable()
export class CommerceSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async merge(userId: string, guestSessionId: string) {
    const marketCurrency = getMarketCurrency(this.config);
    return this.prisma.$transaction(async (tx) => {
      const cartResult = await this.mergeCart(tx, userId, guestSessionId, marketCurrency);
      const wishlistResult = await this.mergeWishlist(tx, userId, guestSessionId);
      return {
        merged: cartResult.hadGuestCart || wishlistResult.hadGuestWishlist,
        cart: cartResult,
        wishlist: wishlistResult,
      };
    });
  }

  private async mergeCart(
    tx: Prisma.TransactionClient,
    userId: string,
    guestSessionId: string,
    marketCurrency: string,
  ) {
    const guestCart = await tx.cart.findUnique({
      where: { sessionId: guestSessionId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                inventory: true,
                product: { select: { status: true } },
              },
            },
          },
        },
      },
    });

    if (!guestCart || guestCart.status !== CartStatus.ACTIVE) {
      return {
        hadGuestCart: false,
        mergedLines: 0,
        adjustedLines: 0,
        skippedLines: 0,
        currencyConflict: false,
      };
    }

    let userCart = await tx.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!userCart) {
      userCart = await tx.cart.create({
        data: {
          userId,
          status: CartStatus.ACTIVE,
          currency: marketCurrency,
        },
        include: { items: true },
      });
    } else if (userCart.items.length === 0 && userCart.currency !== marketCurrency) {
      userCart = await tx.cart.update({
        where: { id: userCart.id },
        data: { currency: marketCurrency },
        include: { items: true },
      });
    }

    if (guestCart.items.length === 0 && guestCart.currency !== marketCurrency) {
      await tx.cart.update({
        where: { id: guestCart.id },
        data: { currency: marketCurrency },
      });
      guestCart.currency = marketCurrency;
    }

    if (guestCart.items.length > 0 && guestCart.currency !== userCart.currency) {
      return {
        hadGuestCart: true,
        mergedLines: 0,
        adjustedLines: 0,
        skippedLines: guestCart.items.length,
        currencyConflict: true,
        customerCartId: userCart.id,
      };
    }

    const existingByVariant = new Map(userCart.items.map((item) => [item.variantId, item]));
    let mergedLines = 0;
    let adjustedLines = 0;
    let skippedLines = 0;
    let currentLineCount = userCart.items.length;

    for (const guestItem of guestCart.items) {
      const variant = guestItem.variant;
      const existing = existingByVariant.get(guestItem.variantId);
      const currentQuantity = existing?.quantity ?? 0;
      const availableQuantity = variant.inventory
        ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity)
        : 0;
      const sellable =
        variant.active &&
        variant.product.status === ProductStatus.ACTIVE &&
        variant.currency === userCart.currency;
      const roomByStock = Math.max(0, availableQuantity - currentQuantity);
      const roomByLineLimit = Math.max(0, MAX_LINE_QUANTITY - currentQuantity);
      const additionalQuantity = sellable
        ? Math.min(guestItem.quantity, roomByStock, roomByLineLimit)
        : 0;

      if (!existing && currentLineCount >= MAX_CART_LINES) {
        skippedLines += 1;
        continue;
      }

      if (additionalQuantity <= 0) {
        skippedLines += 1;
        continue;
      }

      const nextQuantity = currentQuantity + additionalQuantity;
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: nextQuantity },
        });
        existing.quantity = nextQuantity;
      } else {
        const created = await tx.cartItem.create({
          data: {
            cartId: userCart.id,
            variantId: guestItem.variantId,
            quantity: additionalQuantity,
          },
        });
        existingByVariant.set(guestItem.variantId, created);
        currentLineCount += 1;
      }

      mergedLines += 1;
      if (additionalQuantity < guestItem.quantity) adjustedLines += 1;
    }

    await tx.cartItem.deleteMany({ where: { cartId: guestCart.id } });
    await tx.cart.update({
      where: { id: guestCart.id },
      data: {
        status: CartStatus.ABANDONED,
        sessionId: null,
        expiresAt: null,
      },
    });

    return {
      hadGuestCart: true,
      mergedLines,
      adjustedLines,
      skippedLines,
      currencyConflict: false,
      customerCartId: userCart.id,
    };
  }

  private async mergeWishlist(
    tx: Prisma.TransactionClient,
    userId: string,
    guestSessionId: string,
  ) {
    const guestWishlist = await tx.wishlist.findUnique({
      where: { sessionId: guestSessionId },
      include: {
        items: {
          include: {
            product: { select: { status: true } },
          },
        },
      },
    });

    if (!guestWishlist) {
      return {
        hadGuestWishlist: false,
        addedItems: 0,
        skippedItems: 0,
      };
    }

    const userWishlist = await tx.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: true },
    });
    const existingProductIds = new Set(userWishlist.items.map((item) => item.productId));
    const candidateProductIds = guestWishlist.items
      .filter((item) => item.product.status === ProductStatus.ACTIVE)
      .map((item) => item.productId)
      .filter((productId) => !existingProductIds.has(productId));
    const remainingWishlistCapacity = Math.max(0, MAX_WISHLIST_ITEMS - userWishlist.items.length);
    const eligibleProductIds = candidateProductIds.slice(0, remainingWishlistCapacity);

    if (eligibleProductIds.length) {
      await tx.wishlistItem.createMany({
        data: eligibleProductIds.map((productId) => ({
          wishlistId: userWishlist.id,
          productId,
        })),
        skipDuplicates: true,
      });
    }

    const skippedItems = guestWishlist.items.length - eligibleProductIds.length;
    await tx.wishlist.delete({ where: { id: guestWishlist.id } });

    return {
      hadGuestWishlist: true,
      addedItems: eligibleProductIds.length,
      skippedItems,
      customerWishlistId: userWishlist.id,
    };
  }
}
