import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CommerceOwner } from '../carts/cart.types';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

const wishlistInclude = {
  items: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      product: {
        include: {
          images: {
            orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
          },
          variants: {
            where: { active: true },
            orderBy: { position: 'asc' as const },
            include: { inventory: true },
          },
        },
      },
    },
  },
} satisfies Prisma.WishlistInclude;

type WishlistRecord = Prisma.WishlistGetPayload<{ include: typeof wishlistInclude }>;
const MAX_WISHLIST_ITEMS = 100;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async get(owner: CommerceOwner) {
    const wishlist = await this.getOrCreate(owner);
    return this.response(wishlist);
  }

  async add(owner: CommerceOwner, dto: AddWishlistItemDto) {
    const wishlist = await this.getOrCreate(owner);
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException('Product is not available');
    }

    const alreadySaved = wishlist.items.some((item) => item.productId === dto.productId);
    if (!alreadySaved && wishlist.items.length >= MAX_WISHLIST_ITEMS) {
      throw new ConflictException(`Wishlist cannot exceed ${MAX_WISHLIST_ITEMS} products`);
    }

    await this.prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId: dto.productId,
        },
      },
      create: {
        wishlistId: wishlist.id,
        productId: dto.productId,
      },
      update: {},
    });

    return this.reload(wishlist.id);
  }

  async remove(owner: CommerceOwner, productId: string) {
    const wishlist = await this.getOrCreate(owner);
    const deleted = await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, productId },
    });
    if (deleted.count === 0) throw new NotFoundException('Wishlist item not found');
    return this.reload(wishlist.id);
  }

  private async getOrCreate(owner: CommerceOwner): Promise<WishlistRecord> {
    if (owner.userId) {
      const existing = await this.prisma.wishlist.findUnique({
        where: { userId: owner.userId },
        include: wishlistInclude,
      });
      if (existing) return existing;

      return this.prisma.wishlist.create({
        data: { userId: owner.userId },
        include: wishlistInclude,
      });
    }

    const guestSessionId = owner.sessionId;
    const guestExpiresAt = owner.expiresAt;
    if (!guestSessionId || !guestExpiresAt) throw new ConflictException('Guest wishlist session is invalid');

    const existing = await this.prisma.wishlist.findUnique({
      where: { sessionId: guestSessionId },
      include: wishlistInclude,
    });
    if (existing) {
      if (!existing.expiresAt || existing.expiresAt.getTime() < guestExpiresAt.getTime() - 60_000) {
        return this.prisma.wishlist.update({
          where: { id: existing.id },
          data: { expiresAt: guestExpiresAt },
          include: wishlistInclude,
        });
      }
      return existing;
    }

    return this.prisma.wishlist.create({
      data: {
        sessionId: guestSessionId,
        expiresAt: guestExpiresAt,
      },
      include: wishlistInclude,
    });
  }

  private async reload(wishlistId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { id: wishlistId },
      include: wishlistInclude,
    });
    if (!wishlist) throw new NotFoundException('Wishlist not found');
    return this.response(wishlist);
  }

  private response(wishlist: WishlistRecord) {
    return {
      id: wishlist.id,
      ownerType: wishlist.userId ? 'customer' : 'guest',
      itemCount: wishlist.items.length,
      items: wishlist.items.map((item) => {
        const product = item.product;
        const sellableVariants = product.variants.filter((variant) => {
          if (!variant.inventory) return false;
          return variant.inventory.quantity - variant.inventory.reservedQuantity > 0;
        });
        const colors = [...new Set(product.variants.map((variant) => variant.colorName))];
        const prices = product.variants.map((variant) => Number(variant.price));

        return {
          id: item.id,
          productId: product.id,
          slug: product.slug,
          name: product.name,
          status: product.status,
          available: product.status === ProductStatus.ACTIVE && sellableVariants.length > 0,
          priceFrom: prices.length ? Math.min(...prices) : Number(product.basePrice),
          currency: product.currency,
          image: product.images[0]?.url ?? null,
          colors,
          addedAt: item.createdAt,
        };
      }),
      expiresAt: wishlist.expiresAt,
      updatedAt: wishlist.updatedAt,
    };
  }
}
