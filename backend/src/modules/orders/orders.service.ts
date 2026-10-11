import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GuestOrderLookupDto } from './dto/guest-order-lookup.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { orderInclude, presentGuestOrder, presentOrder } from './order.presenter';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, query: ListOrdersQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { userId },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      orders: orders.map(presentOrder),
    };
  }

  async getForUser(userId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { userId, orderNumber: orderNumber.trim().toUpperCase() },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return presentOrder(order);
  }

  async lookupGuest(dto: GuestOrderLookupDto) {
    const order = await this.prisma.order.findFirst({
      where: {
        orderNumber: dto.orderNumber.trim().toUpperCase(),
        email: dto.email.trim().toLowerCase(),
      },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return presentGuestOrder(order);
  }

  async releaseExpiredReservations(limit = 100) {
    const now = new Date();
    const candidates = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        inventoryCommittedAt: null,
        inventoryReleasedAt: null,
        reservationExpiresAt: { lte: now },
      },
      select: { id: true, orderNumber: true },
      orderBy: { reservationExpiresAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    const released: string[] = [];
    const skipped: string[] = [];

    for (const candidate of candidates) {
      const didRelease = await this.releaseOneExpired(candidate.id, now);
      (didRelease ? released : skipped).push(candidate.orderNumber);
    }

    return {
      checked: candidates.length,
      released: released.length,
      skipped: skipped.length,
      releasedOrderNumbers: released,
      skippedOrderNumbers: skipped,
    };
  }

  private async releaseOneExpired(orderId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: OrderStatus.PENDING,
          inventoryCommittedAt: null,
          inventoryReleasedAt: null,
          reservationExpiresAt: { lte: now },
        },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: now,
        },
      });

      if (claimed.count !== 1) return false;

      const items = await tx.orderItem.findMany({
        where: { orderId, variantId: { not: null } },
        select: { variantId: true, quantity: true },
      });

      for (const item of items) {
        if (!item.variantId) continue;
        const changed = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedQuantity" = "reservedQuantity" - ${item.quantity},
              "updatedAt" = NOW()
          WHERE "variantId" = ${item.variantId}
            AND "reservedQuantity" >= ${item.quantity}
        `;
        if (changed !== 1) {
          throw new ConflictException(
            `Inventory reservation mismatch while releasing order ${orderId}`,
          );
        }
      }

      await tx.payment.updateMany({
        where: {
          orderId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.REQUIRES_ACTION] },
        },
        data: {
          status: PaymentStatus.CANCELLED,
          activeAttemptKey: null,
          providerInitStartedAt: null,
          failureReason: 'Order reservation expired before payment completed',
          lastWebhookAt: now,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          reservationExpiresAt: null,
          inventoryReleasedAt: now,
        },
      });

      // A checkout that never reached payment must not consume a coupon usage forever.
      await tx.discountUsage.deleteMany({ where: { orderId } });

      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
