import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getMarketCurrency } from '../../common/config/market-currency';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartValidationIssue, CommerceOwner } from './cart.types';

const MAX_LINE_QUANTITY = 20;
const MAX_CART_LINES = 50;

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            include: {
              images: {
                orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CartVariant = CartRecord['items'][number]['variant'];

@Injectable()
export class CartsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async get(owner: CommerceOwner) {
    const cart = await this.getOrCreateCart(owner);
    return this.response(cart);
  }

  async addItem(owner: CommerceOwner, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(owner);
    const sellable = await this.getSellableVariant(dto.variantId);
    const existing = cart.items.find((item) => item.variantId === dto.variantId);
    const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;

    if (!existing && cart.items.length >= MAX_CART_LINES) {
      throw new ConflictException(`A cart cannot exceed ${MAX_CART_LINES} unique items`);
    }
    if (sellable.variant.currency !== cart.currency) {
      throw new ConflictException('This variant uses a different cart currency');
    }
    this.assertCartQuantity(nextQuantity, sellable.availableQuantity);

    await this.prisma.cartItem.upsert({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId: dto.variantId,
        },
      },
      create: {
        cartId: cart.id,
        variantId: dto.variantId,
        quantity: dto.quantity,
      },
      update: {
        quantity: nextQuantity,
      },
    });

    return this.reload(cart.id);
  }

  async updateItem(owner: CommerceOwner, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(owner);
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      select: { id: true, variantId: true },
    });
    if (!item) throw new NotFoundException('Cart item not found');

    const sellable = await this.getSellableVariant(item.variantId);
    this.assertCartQuantity(dto.quantity, sellable.availableQuantity);

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: dto.quantity },
    });

    return this.reload(cart.id);
  }

  async removeItem(owner: CommerceOwner, itemId: string) {
    const cart = await this.getOrCreateCart(owner);
    const deleted = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });
    if (deleted.count !== 1) throw new NotFoundException('Cart item not found');
    return this.reload(cart.id);
  }

  async clear(owner: CommerceOwner) {
    const cart = await this.getOrCreateCart(owner);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.reload(cart.id);
  }

  async validate(owner: CommerceOwner) {
    const cart = await this.getOrCreateCart(owner);
    const result = this.response(cart);
    return {
      valid: result.issues.length === 0,
      ...result,
    };
  }

  async getActiveCartForUser(userId: string): Promise<CartRecord | null> {
    return this.prisma.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      include: cartInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getGuestCart(sessionId: string): Promise<CartRecord | null> {
    return this.prisma.cart.findUnique({
      where: { sessionId },
      include: cartInclude,
    });
  }

  private async getOrCreateCart(owner: CommerceOwner): Promise<CartRecord> {
    try {
      return await this.getOrCreateCartInner(owner);
    } catch (error) {
      // A concurrent request may win the findFirst -> create race against the
      // partial unique indexes (one ACTIVE cart per user/session): retry once
      // and pick up the row the other request created.
      if ((error as { code?: unknown }).code !== 'P2002') throw error;
      return this.getOrCreateCartInner(owner);
    }
  }

  private async getOrCreateCartInner(owner: CommerceOwner): Promise<CartRecord> {
    const marketCurrency = getMarketCurrency(this.config);

    if (owner.userId) {
      const existing = await this.getActiveCartForUser(owner.userId);
      if (existing) {
        if (existing.items.length === 0 && existing.currency !== marketCurrency) {
          return this.prisma.cart.update({
            where: { id: existing.id },
            data: { currency: marketCurrency },
            include: cartInclude,
          });
        }
        return existing;
      }

      return this.prisma.cart.create({
        data: {
          userId: owner.userId,
          status: CartStatus.ACTIVE,
          currency: marketCurrency,
        },
        include: cartInclude,
      });
    }

    const guestSessionId = owner.sessionId;
    const guestExpiresAt = owner.expiresAt;
    if (!guestSessionId || !guestExpiresAt) throw new ConflictException('Guest cart session is invalid');

    const existing = await this.getGuestCart(guestSessionId);
    if (existing?.status === CartStatus.ACTIVE) {
      const updateCurrency = existing.items.length === 0 && existing.currency !== marketCurrency;
      const updateExpiry = !existing.expiresAt || existing.expiresAt.getTime() < guestExpiresAt.getTime() - 60_000;
      if (updateCurrency || updateExpiry) {
        return this.prisma.cart.update({
          where: { id: existing.id },
          data: {
            ...(updateCurrency ? { currency: marketCurrency } : {}),
            ...(updateExpiry ? { expiresAt: guestExpiresAt } : {}),
          },
          include: cartInclude,
        });
      }
      return existing;
    }

    if (existing) {
      return this.prisma.$transaction(async (tx) => {
        await tx.cartItem.deleteMany({ where: { cartId: existing.id } });
        return tx.cart.update({
          where: { id: existing.id },
          data: {
            status: CartStatus.ACTIVE,
            userId: null,
            currency: marketCurrency,
            expiresAt: guestExpiresAt,
          },
          include: cartInclude,
        });
      });
    }

    return this.prisma.cart.create({
      data: {
        sessionId: guestSessionId,
        status: CartStatus.ACTIVE,
        currency: marketCurrency,
        expiresAt: guestExpiresAt,
      },
      include: cartInclude,
    });
  }

  private async getSellableVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        inventory: true,
        product: { select: { id: true, status: true } },
      },
    });

    if (!variant || !variant.active || variant.product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException('Product variant is not available');
    }

    const availableQuantity = variant.inventory
      ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity)
      : 0;

    return { variant, availableQuantity };
  }

  private assertCartQuantity(requestedQuantity: number, availableQuantity: number): void {
    if (requestedQuantity > MAX_LINE_QUANTITY) {
      throw new ConflictException(`A cart line cannot exceed ${MAX_LINE_QUANTITY} units`);
    }
    if (availableQuantity <= 0) {
      throw new ConflictException('This variant is out of stock');
    }
    if (requestedQuantity > availableQuantity) {
      throw new ConflictException(`Only ${availableQuantity} unit(s) are currently available`);
    }
  }

  private async reload(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: cartInclude,
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return this.response(cart);
  }

  private response(cart: CartRecord) {
    const issues: CartValidationIssue[] = [];
    const items = cart.items.map((item) => {
      const variant = item.variant;
      const availableQuantity = variant.inventory
        ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity)
        : 0;
      const sellableProduct = variant.product.status === ProductStatus.ACTIVE;
      const sellableVariant = variant.active;

      if (!sellableProduct) {
        issues.push({
          itemId: item.id,
          variantId: variant.id,
          code: 'PRODUCT_UNAVAILABLE',
          message: 'This product is no longer available',
          requestedQuantity: item.quantity,
          availableQuantity: 0,
        });
      } else if (!sellableVariant) {
        issues.push({
          itemId: item.id,
          variantId: variant.id,
          code: 'VARIANT_UNAVAILABLE',
          message: 'This product option is no longer available',
          requestedQuantity: item.quantity,
          availableQuantity: 0,
        });
      } else if (availableQuantity <= 0) {
        issues.push({
          itemId: item.id,
          variantId: variant.id,
          code: 'OUT_OF_STOCK',
          message: 'This item is out of stock',
          requestedQuantity: item.quantity,
          availableQuantity,
        });
      } else if (item.quantity > availableQuantity) {
        issues.push({
          itemId: item.id,
          variantId: variant.id,
          code: 'QUANTITY_REDUCED',
          message: `Only ${availableQuantity} unit(s) remain`,
          requestedQuantity: item.quantity,
          availableQuantity,
        });
      }

      const unitPrice = Number(variant.price);
      return {
        id: item.id,
        variantId: variant.id,
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
        currency: variant.currency,
        availableQuantity,
        stockStatus:
          availableQuantity <= 0
            ? 'out-of-stock'
            : item.quantity > availableQuantity
              ? 'limited'
              : 'available',
        product: {
          id: variant.product.id,
          slug: variant.product.slug,
          name: variant.product.name,
          status: variant.product.status,
          image: this.pickImage(variant),
        },
        option: {
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          size: variant.size,
          title: variant.title,
        },
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      id: cart.id,
      ownerType: cart.userId ? 'customer' : 'guest',
      currency: cart.currency,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: Number(subtotal.toFixed(2)),
      items,
      issues,
      expiresAt: cart.expiresAt,
      updatedAt: cart.updatedAt,
    };
  }

  private pickImage(variant: CartVariant): string | null {
    const colorImages = variant.product.images.filter(
      (image) => image.colorName?.toLowerCase() === variant.colorName.toLowerCase(),
    );
    return colorImages[0]?.url ?? variant.product.images[0]?.url ?? null;
  }
}
