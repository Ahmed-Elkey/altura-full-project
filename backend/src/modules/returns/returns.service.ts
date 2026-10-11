import { validatePromotionReturn } from '../discounts/discounts.service';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { GuestCreateReturnDto } from './dto/guest-create-return.dto';

const COUNTED_RETURN_STATUSES: ReturnStatus[] = Object.values(ReturnStatus).filter(
  (status) => status !== ReturnStatus.REJECTED,
);

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const returns = await this.prisma.returnRequest.findMany({
      where: { userId },
      include: {
        order: { select: { orderNumber: true, currency: true, status: true } },
        items: {
          include: {
            orderItem: {
              select: { productName: true, colorName: true, size: true, productImageUrl: true, unitPrice: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return returns.map((request) => this.present(request));
  }

  async getForUser(userId: string, returnId: string) {
    const request = await this.prisma.returnRequest.findFirst({
      where: { id: returnId, userId },
      include: {
        order: { select: { orderNumber: true, currency: true, status: true } },
        items: {
          include: {
            orderItem: {
              select: { productName: true, colorName: true, size: true, productImageUrl: true, unitPrice: true },
            },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Return request not found');
    return this.present(request);
  }

  async create(userId: string, dto: CreateReturnDto) {
    return this.createForOwner(dto, { userId });
  }

  async createForGuest(dto: GuestCreateReturnDto) {
    return this.createForOwner(dto, { guestEmail: dto.email.trim().toLowerCase() });
  }

  private async createForOwner(
    dto: CreateReturnDto,
    owner: { userId?: string; guestEmail?: string },
  ) {
    const created = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: owner.userId
            ? { userId: owner.userId, orderNumber: dto.orderNumber }
            : { userId: null, orderNumber: dto.orderNumber, email: owner.guestEmail },
          include: {
            items: true,
            returns: { where: { status: { in: COUNTED_RETURN_STATUSES } }, include: { items: true } },
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status !== OrderStatus.DELIVERED) {
          throw new ConflictException('Returns can be requested after an order is delivered');
        }
        if (!dto.items.length) throw new ConflictException('Select at least one item to return');

        const orderItems = new Map(order.items.map((item) => [item.id, item]));
        const alreadyReturned = new Map<string, number>();
        for (const request of order.returns) {
          for (const item of request.items) {
            alreadyReturned.set(item.orderItemId, (alreadyReturned.get(item.orderItemId) ?? 0) + item.quantity);
          }
        }

        const seen = new Set<string>();
        const items = dto.items.map((item) => {
          if (seen.has(item.orderItemId)) throw new ConflictException('Each order item can appear only once');
          seen.add(item.orderItemId);
          const orderItem = orderItems.get(item.orderItemId);
          if (!orderItem) throw new ConflictException('One or more selected items do not belong to this order');
          const returned = alreadyReturned.get(orderItem.id) ?? 0;
          const remaining = orderItem.quantity - returned;
          if (item.quantity > remaining) {
            throw new ConflictException(`${orderItem.productName} has only ${remaining} unit(s) eligible for return`);
          }
          return {
            orderItemId: orderItem.id,
            quantity: item.quantity,
            reason: item.reason || null,
            condition: item.condition || null,
          };
        });

        validatePromotionReturn(order.items,dto.items,alreadyReturned);
        return tx.returnRequest.create({
          data: {
            orderId: order.id,
            userId: owner.userId ?? null,
            reason: dto.reason,
            notes: dto.notes || null,
            items: { create: items },
          },
          include: {
            order: { select: { orderNumber: true, currency: true, status: true } },
            items: {
              include: {
                orderItem: {
                  select: { productName: true, colorName: true, size: true, productImageUrl: true, unitPrice: true },
                },
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.present(created);
  }

  private present(request: any) {
    return {
      id: request.id,
      status: request.status,
      reason: request.reason,
      notes: request.notes,
      refundAmount: request.refundAmount === null ? null : Number(request.refundAmount),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      order: request.order,
      items: request.items.map((item: any) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        reason: item.reason,
        condition: item.condition,
        productName: item.orderItem.productName,
        colorName: item.orderItem.colorName,
        size: item.orderItem.size,
        productImageUrl: item.orderItem.productImageUrl,
        unitPrice: Number(item.orderItem.unitPrice),
      })),
    };
  }
}
