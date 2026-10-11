import { ListDiscountsQueryDto } from './dto/list-discounts-query.dto';
import { DEFAULT_OFFER, OfferConfig } from '../newsletter/offer-config';
import { promotionUnits, validatePromotionReturn, PromotionReturnLine } from '../discounts/discounts.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscountType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ProductStatus,
  ReturnStatus,
  ShipmentStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { orderInclude, presentOrder } from '../orders/order.presenter';
import { PaymentsService } from '../payments/payments.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { ListAdminCustomersQueryDto } from './dto/list-admin-customers-query.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { ListPaymentReviewQueryDto } from './dto/list-payment-review-query.dto';
import { UpdateCustomerRoleDto } from './dto/update-customer-role.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { UpdateOrderWorkflowDto } from './dto/update-order-workflow.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

const revenueStatuses: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

const returnTransitions: Record<ReturnStatus, ReturnStatus[]> = {
  [ReturnStatus.REQUESTED]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
  [ReturnStatus.APPROVED]: [ReturnStatus.IN_TRANSIT],
  [ReturnStatus.REJECTED]: [],
  [ReturnStatus.IN_TRANSIT]: [ReturnStatus.RECEIVED],
  [ReturnStatus.RECEIVED]: [ReturnStatus.REFUNDED],
  [ReturnStatus.REFUNDED]: [ReturnStatus.CLOSED],
  [ReturnStatus.CLOSED]: [],
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async dashboard() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      customers,
      activeProducts,
      ordersToday,
      paymentReview,
      orderStatusGroups,
      revenue,
      recentOrders,
      lowStockRows,
      outOfStockRows,
      inventoryTotals,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      this.prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.order.count({ where: { status: OrderStatus.PAYMENT_REVIEW } }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.payment.aggregate({
        where: {
          status: { in: revenueStatuses },
          currency: 'EGP',
          OR: [
            { provider: { not: PaymentProvider.CASH_ON_DELIVERY }, createdAt: { gte: thirtyDaysAgo } },
            { provider: PaymentProvider.CASH_ON_DELIVERY, paidAt: { gte: thirtyDaysAgo } },
          ],
        },
        _sum: { amount: true, refundedAmount: true },
      }),
      this.prisma.order.findMany({
        include: {
          _count: { select: { items: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, provider: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Inventory" i
        JOIN "ProductVariant" v ON v.id = i."variantId"
        JOIN "Product" p ON p.id = v."productId"
        WHERE p.status = 'ACTIVE'
          AND v.active = true
          AND (i.quantity - i."reservedQuantity") > 0
          AND (i.quantity - i."reservedQuantity") <= i."lowStockThreshold"
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Inventory" i
        JOIN "ProductVariant" v ON v.id = i."variantId"
        JOIN "Product" p ON p.id = v."productId"
        WHERE p.status = 'ACTIVE'
          AND v.active = true
          AND (i.quantity - i."reservedQuantity") <= 0
      `,
      this.prisma.inventory.aggregate({
        _sum: { quantity: true, reservedQuantity: true },
        _count: { _all: true },
      }),
    ]);

    const gross = Number(revenue._sum.amount ?? 0);
    const refunded = Number(revenue._sum.refundedAmount ?? 0);
    const ordersByStatus = Object.fromEntries(
      orderStatusGroups.map((row) => [row.status, row._count._all]),
    ) as Partial<Record<OrderStatus, number>>;
    const totalOrders = orderStatusGroups.reduce((sum, row) => sum + row._count._all, 0);

    return {
      generatedAt: now,
      currency: 'EGP',
      revenueScope: 'EGP payments only; historical currencies are excluded',
      metrics: {
        customers,
        activeProducts,
        ordersToday,
        paymentReview,
        netRevenue30d: gross - refunded,
        grossRevenue30d: gross,
        refunded30d: refunded,
        totalOrders,
        pendingOrders:
          (ordersByStatus[OrderStatus.PENDING] ?? 0) +
          (ordersByStatus[OrderStatus.PAYMENT_REVIEW] ?? 0),
        confirmedPreparingOrders:
          (ordersByStatus[OrderStatus.CONFIRMED] ?? 0) +
          (ordersByStatus[OrderStatus.PROCESSING] ?? 0),
        shippedOrders: ordersByStatus[OrderStatus.SHIPPED] ?? 0,
        deliveredOrders: ordersByStatus[OrderStatus.DELIVERED] ?? 0,
        lowStockSkus: Number(lowStockRows[0]?.count ?? 0n),
        outOfStockSkus: Number(outOfStockRows[0]?.count ?? 0n),
        totalSkuRecords: inventoryTotals._count._all,
        physicalUnits: inventoryTotals._sum.quantity ?? 0,
        reservedUnits: inventoryTotals._sum.reservedQuantity ?? 0,
        availableUnits:
          (inventoryTotals._sum.quantity ?? 0) - (inventoryTotals._sum.reservedQuantity ?? 0),
      },
      ordersByStatus,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        email: order.email,
        status: order.status,
        total: Number(order.grandTotal),
        currency: order.currency,
        itemCount: order._count.items,
        paymentStatus: order.payments[0]?.status ?? null,
        paymentProvider: order.payments[0]?.provider ?? null,
        createdAt: order.createdAt,
      })),
    };
  }

  async listOrders(query: ListAdminOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      orders: orders.map(presentOrder),
    };
  }

  async getOrder(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      include: {
        ...orderInclude,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            status: true,
          },
        },
        webhookEvents: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            provider: true,
            externalEventId: true,
            eventType: true,
            processingError: true,
            processedAt: true,
            createdAt: true,
          },
        },
        returns: {
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const statusHistory = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'Order',
        entityId: order.id,
        action: { in: ['ORDER_STATUS_UPDATED', 'ORDER_CANCELLED'] },
      },
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...presentOrder(order),
      internalNote: order.internalNote,
      customer: order.user,
      statusHistory: statusHistory.map((entry) => ({
        id: entry.id,
        action: entry.action,
        metadata: entry.metadata,
        actor: entry.actor,
        createdAt: entry.createdAt,
      })),
      webhookEvents: order.webhookEvents,
      returns: order.returns.map((request) => ({
        ...request,
        refundAmount: request.refundAmount === null ? null : Number(request.refundAmount),
      })),
    };
  }

  async updateOrderWorkflow(
    actorUserId: string,
    orderNumber: string,
    dto: UpdateOrderWorkflowDto,
  ) {
    const normalizedNumber = orderNumber.trim().toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { orderNumber: normalizedNumber },
        select: {
          id: true, orderNumber: true, status: true, inventoryCommittedAt: true,
          inventoryReleasedAt: true,
          payments: { select: { status: true, provider: true, amount: true, currency: true } },
          items: { select: { variantId: true, quantity: true } },
          grandTotal: true, currency: true,
        },
      });
      if (!current) throw new NotFoundException('Order not found');
      const allowed: Partial<Record<OrderStatus, OrderStatus[]>> = {
        [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
        [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
        [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      };
      if (!allowed[current.status]?.includes(dto.status)) {
        throw new ConflictException(`Unsafe admin transition from ${current.status} to ${dto.status}`);
      }
      const cod = current.payments.find(payment => payment.provider === PaymentProvider.CASH_ON_DELIVERY);
      if (cod && (current.payments.length !== 1 || !cod.amount.equals(current.grandTotal) || cod.currency !== current.currency || current.currency !== 'EGP' || (cod.status !== PaymentStatus.PENDING && cod.status !== PaymentStatus.PAID))) {
        throw new ConflictException('Cash payment identity or amount is inconsistent');
      }
      const now = new Date();
      if (dto.status === OrderStatus.CANCELLED) {
        if (dto.trackingNumber !== undefined || dto.carrier !== undefined) {
          throw new ConflictException('Tracking information cannot be supplied when cancelling an order');
        }
        if (current.inventoryReleasedAt) {
          throw new ConflictException('Order inventory has already been released');
        }
        if (current.payments.some((payment) =>
          payment.status === PaymentStatus.PAID ||
          payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
          payment.status === PaymentStatus.REFUNDED,
        )) {
          throw new ConflictException('Paid orders must use the refund or return workflow');
        }

        for (const item of current.items) {
          if (!item.variantId) throw new ConflictException('Order inventory cannot be safely restored');
          if (current.inventoryCommittedAt) {
            const restored = await tx.$executeRaw`
              UPDATE "Inventory"
              SET quantity = quantity + ${item.quantity}, "updatedAt" = NOW()
              WHERE "variantId" = ${item.variantId}
            `;
            if (restored !== 1) throw new ConflictException('Order inventory could not be restored');
            await tx.inventoryMovement.create({
              data: {
                variantId: item.variantId,
                reason: 'CANCELLATION',
                quantity: item.quantity,
                referenceId: current.id,
                note: `Stock restored after cancellation of ${current.orderNumber}`,
              },
            });
          } else {
            const released = await tx.$executeRaw`
              UPDATE "Inventory"
              SET "reservedQuantity" = "reservedQuantity" - ${item.quantity}, "updatedAt" = NOW()
              WHERE "variantId" = ${item.variantId}
                AND "reservedQuantity" >= ${item.quantity}
            `;
            if (released !== 1) throw new ConflictException('Order reservation could not be released');
          }
        }

        await tx.payment.updateMany({
          where: {
            orderId: current.id,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.REQUIRES_ACTION, PaymentStatus.FAILED] },
          },
          data: { status: PaymentStatus.CANCELLED, activeAttemptKey: null },
        });
        await tx.discountUsage.deleteMany({ where: { orderId: current.id } });
        const cancelled = await tx.order.updateMany({
          where: { id: current.id, status: current.status, inventoryReleasedAt: null },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: now,
            inventoryReleasedAt: now,
            reservationExpiresAt: null,
          },
        });
        if (cancelled.count !== 1) {
          throw new ConflictException('Order state changed while cancellation was being applied; reload and try again');
        }
        await this.audit(actorUserId, 'ORDER_CANCELLED', 'Order', current.id, {
          orderNumber: current.orderNumber,
          from: current.status,
          to: OrderStatus.CANCELLED,
        }, tx);
        return;
      }
      const unpaidCashFulfillment = cod?.status === PaymentStatus.PENDING && dto.status !== OrderStatus.DELIVERED;
      if (!current.inventoryCommittedAt || (!unpaidCashFulfillment && !current.payments.some((payment) => payment.status === PaymentStatus.PAID))) {
        throw new ConflictException('Fulfillment requires a paid order with committed inventory');
      }
      if (dto.status !== OrderStatus.SHIPPED && (dto.trackingNumber !== undefined || dto.carrier !== undefined)) {
        throw new ConflictException('Tracking information is supplied when marking an order shipped');
      }
      const shipments = await tx.shipment.findMany({ where: { orderId: current.id }, orderBy: { createdAt: 'asc' } });
      if (shipments.length > 1) throw new ConflictException('The local fulfillment workflow supports one shipment per order');
      const shipment = shipments[0];
      if (dto.status === OrderStatus.SHIPPED) {
        const trackingNumber = (dto.trackingNumber ?? shipment?.trackingNumber ?? '').trim();
        if (!trackingNumber) throw new ConflictException('Add shipment tracking before marking the order as shipped');
        if (shipment && shipment.status !== ShipmentStatus.PENDING && shipment.status !== ShipmentStatus.READY) {
          throw new ConflictException('Shipment is not ready to be shipped');
        }
        const data = { status: ShipmentStatus.SHIPPED, trackingNumber, carrier: dto.carrier?.trim() || shipment?.carrier || 'Delivery', shippedAt: now };
        if (shipment) {
          const changed = await tx.shipment.updateMany({ where: { id: shipment.id, status: shipment.status }, data });
          if (changed.count !== 1) throw new ConflictException('Shipment state changed; reload and retry');
        } else {
          await tx.shipment.create({ data: { orderId: current.id, ...data } });
        }
      } else if (dto.status === OrderStatus.DELIVERED) {
        if (!shipment?.trackingNumber || !shipment.shippedAt || (shipment.status !== ShipmentStatus.SHIPPED && shipment.status !== ShipmentStatus.IN_TRANSIT)) {
          throw new ConflictException('A tracked shipped shipment is required before marking delivery');
        }
        const changed = await tx.shipment.updateMany({
          where: { id: shipment.id, status: shipment.status },
          data: { status: ShipmentStatus.DELIVERED, deliveredAt: now },
        });
        if (changed.count !== 1) throw new ConflictException('Shipment state changed; reload and retry');
      }
      const claimed = await tx.order.updateMany({
        where: {
          id: current.id,
          status: current.status,
          inventoryCommittedAt: { not: null },
        },
        data: { status: dto.status },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Order state changed while this transition was being applied; reload and try again');
      }

      await this.audit(actorUserId, 'ORDER_STATUS_UPDATED', 'Order', current.id, {
        orderNumber: current.orderNumber,
        from: current.status,
        to: dto.status,
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.getOrder(normalizedNumber);
  }

  async updateOrderNote(actorUserId: string, orderNumber: string, dto: UpdateOrderNoteDto) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      select: { id: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { internalNote: dto.internalNote || null },
      });
      await this.audit(actorUserId, 'ORDER_NOTE_UPDATED', 'Order', order.id, {
        orderNumber: order.orderNumber,
      }, tx);
    });
    return this.getOrder(order.orderNumber);
  }

  async listCustomers(query: ListAdminCustomersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const ids = users.map((user) => user.id);
    const orderStats = ids.length
      ? await this.prisma.order.groupBy({
          by: ['userId'],
          where: {
            userId: { in: ids },
            currency: 'EGP',
            status: {
              in: [
                OrderStatus.CONFIRMED,
                OrderStatus.PROCESSING,
                OrderStatus.SHIPPED,
                OrderStatus.DELIVERED,
                OrderStatus.PARTIALLY_REFUNDED,
              ],
            },
          },
          _count: { _all: true },
          _sum: { grandTotal: true },
        })
      : [];
    const statsByUser = new Map(orderStats.map((row) => [row.userId, row]));

    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      customers: users.map((user) => {
        const stats = statsByUser.get(user.id);
        return {
          ...user,
          orderCount: stats?._count._all ?? 0,
          lifetimeValue: Number(stats?._sum.grandTotal ?? 0),
        };
      }),
    };
  }

  async getCustomer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        addresses: { orderBy: { createdAt: 'desc' } },
        orders: {
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const lifetime = await this.prisma.order.aggregate({
      where: {
        userId,
        currency: 'EGP',
        status: {
          in: [
            OrderStatus.CONFIRMED,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPED,
            OrderStatus.DELIVERED,
            OrderStatus.PARTIALLY_REFUNDED,
          ],
        },
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
    });

    return {
      ...user,
      orders: user.orders.map(presentOrder),
      orderCount: lifetime._count._all,
      lifetimeValue: Number(lifetime._sum.grandTotal ?? 0),
    };
  }

  async updateCustomerStatus(
    actorUserId: string,
    userId: string,
    dto: UpdateCustomerStatusDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Customer not found');
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { role: true },
    });
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only an ADMIN can change account status');
    }
    if (user.id === actorUserId && dto.status !== UserStatus.ACTIVE) {
      throw new ConflictException('You cannot suspend or disable your own active admin session');
    }

    const nextAuthVersion = dto.status === UserStatus.ACTIVE ? user.authVersion : user.authVersion + 1;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status, authVersion: nextAuthVersion },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          authVersion: true,
          updatedAt: true,
        },
      });
      if (dto.status !== UserStatus.ACTIVE) {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'USER_STATUS_UPDATED',
          entityType: 'User',
          entityId: userId,
          metadata: { from: user.status, to: dto.status },
        },
      });
      return changed;
    });
    return updated;
  }

  async updateCustomerRole(actorUserId: string, userId: string, dto: UpdateCustomerRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Customer not found');
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { role: true },
    });
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only an ADMIN can change customer roles');
    }
    if (user.id === actorUserId && dto.role !== UserRole.ADMIN) {
      throw new ConflictException('You cannot remove your own ADMIN role');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.update({
        where: { id: userId },
        data: { role: dto.role, authVersion: { increment: 1 } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          updatedAt: true,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'USER_ROLE_UPDATED',
          entityType: 'User',
          entityId: userId,
          metadata: { from: user.role, to: dto.role },
        },
      });
      return changed;
    });
    return updated;
  }

  async listDiscounts(query?:ListDiscountsQueryDto) {
    const {page=1,limit=25,q,source,type}=query||{};
    const where:Prisma.DiscountWhereInput={...(q?{code:{contains:q.trim().toUpperCase(),mode:'insensitive'}}:{}),...(type?{type}:{}),
      ...(source==='NEWSLETTER'?{OR:[{newsletterSubscriber:{isNot:null}},{code:{startsWith:'NL-'}}]}:source==='GENERAL'?{newsletterSubscriber:{is:null},NOT:{code:{startsWith:'NL-'}}}:{})};
    const discounts=await this.prisma.discount.findMany({where,include:{_count:{select:{usages:true}},newsletterSubscriber:{select:{id:true}}},orderBy:[{active:'desc'},{createdAt:'desc'}],...(query?{skip:(page-1)*limit,take:limit}:{})});
    const items=discounts.map(({newsletterSubscriber,...discount})=>{
      const offer=discount.offerSnapshot&&typeof discount.offerSnapshot==='object'&&!Array.isArray(discount.offerSnapshot)?discount.offerSnapshot as Record<string,any>:{};
      return {...discount,value:Number(discount.value),minimumSubtotal:discount.minimumSubtotal===null?null:Number(discount.minimumSubtotal),maximumDiscount:discount.maximumDiscount===null?null:Number(discount.maximumDiscount),usageCount:discount._count.usages,_count:undefined,source:newsletterSubscriber||discount.code.startsWith('NL-')?'NEWSLETTER':'GENERAL',buyQuantity:offer.buyQuantity,giftQuantity:offer.giftQuantity,maxGiftUnits:offer.maxGiftUnits,eligibleProductIds:offer.eligibleProductIds||[],eligibleCategoryIds:offer.eligibleCategoryIds||[]};
    });
    return query?{items,total:await this.prisma.discount.count({where}),page,limit}:items;
  }

  async createDiscount(actorUserId: string, dto: CreateDiscountDto) {
    this.assertDiscount(dto);
    await this.assertPromotionEligibility(dto);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const discount = await tx.discount.create({ data: this.createDiscountData(dto) });
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: 'DISCOUNT_CREATED',
            entityType: 'Discount',
            entityId: discount.id,
            metadata: { code: discount.code, type: discount.type },
          },
        });
        return discount;
      });
      return this.presentDiscount(created);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Discount code already exists');
      }
      throw error;
    }
  }

  async updateDiscount(actorUserId: string, discountId: string, dto: UpdateDiscountDto) {
    const existing = await this.prisma.discount.findUnique({ where: { id: discountId }, include: { newsletterSubscriber: { select: { id: true } } } });
    if (!existing) throw new NotFoundException('Discount not found');
    if (existing.newsletterSubscriber && Object.keys(dto).some((key) => key !== 'active')) {
      throw new ConflictException('Issued newsletter reward terms are immutable; only active can be changed');
    }
    const originalOffer = existing.offerSnapshot as unknown as OfferConfig | null;
    const promotion = { buyQuantity: dto.buyQuantity ?? originalOffer?.buyQuantity, giftQuantity: dto.giftQuantity ?? originalOffer?.giftQuantity, maxGiftUnits: dto.maxGiftUnits === undefined ? originalOffer?.maxGiftUnits : dto.maxGiftUnits, eligibleProductIds: dto.eligibleProductIds ?? originalOffer?.eligibleProductIds ?? [], eligibleCategoryIds: dto.eligibleCategoryIds ?? originalOffer?.eligibleCategoryIds ?? [] };
    const merged = {
      ...promotion,
      type: dto.type ?? existing.type,
      value: dto.value ?? Number(existing.value),
      maximumDiscount:
        dto.maximumDiscount === undefined
          ? existing.maximumDiscount === null
            ? undefined
            : Number(existing.maximumDiscount)
          : dto.maximumDiscount,
      startsAt: dto.startsAt === undefined ? existing.startsAt : dto.startsAt,
      endsAt: dto.endsAt === undefined ? existing.endsAt : dto.endsAt,
    };
    if (!existing.newsletterSubscriber) {
      this.assertDiscount(merged);
      await this.assertPromotionEligibility(merged);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const discount = await tx.discount.update({
          where: { id: discountId },
          data: { ...this.updateDiscountData(dto),
            ...(!existing.newsletterSubscriber && merged.type === DiscountType.BUY_X_GET_Y ? { offerSnapshot: this.generalPromotionSnapshot({ ...dto, ...merged, currency: dto.currency ?? existing.currency ?? undefined, minimumSubtotal: dto.minimumSubtotal === undefined ? (existing.minimumSubtotal === null ? undefined : Number(existing.minimumSubtotal)) : dto.minimumSubtotal }) } : {}),
            ...(!existing.newsletterSubscriber && dto.type && dto.type !== DiscountType.BUY_X_GET_Y ? { offerSnapshot: Prisma.DbNull } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: 'DISCOUNT_UPDATED',
            entityType: 'Discount',
            entityId: discountId,
            metadata: { code: discount.code },
          },
        });
        return discount;
      });
      return this.presentDiscount(updated);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Discount code already exists');
      }
      throw error;
    }
  }

  async listPaymentReview(query: ListPaymentReviewQueryDto) {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.PAYMENT_REVIEW,
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              {
                payments: {
                  some: {
                    OR: [
                      { providerPaymentId: { contains: query.q, mode: 'insensitive' } },
                      { providerTransactionId: { contains: query.q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [orders, total, failedWebhooks] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.paymentWebhookEvent.findMany({
        where: { processingError: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          provider: true,
          externalEventId: true,
          eventType: true,
          orderId: true,
          paymentId: true,
          processingError: true,
          processedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      orders: orders.map(presentOrder),
      failedWebhooks,
    };
  }

  async collectCash(actorUserId: string, orderNumber: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actor = await tx.user.findUnique({ where: { id: actorUserId } });
        if (actor?.role !== UserRole.ADMIN || actor.status !== UserStatus.ACTIVE) {
          throw new ForbiddenException('Only an active administrator can collect cash');
        }
        const order = await tx.order.findUnique({ where: { orderNumber }, include: { payments: true, shipments: true } });
        if (!order) throw new NotFoundException('Order not found');
        const payment = order.payments[0];
        const shipment = order.shipments[0];
        if (order.status !== OrderStatus.SHIPPED || !order.inventoryCommittedAt ||
            order.payments.length !== 1 || payment?.provider !== PaymentProvider.CASH_ON_DELIVERY ||
            payment.status !== PaymentStatus.PENDING || payment.paidAt !== null ||
            !payment.amount.equals(order.grandTotal) || payment.currency !== order.currency || order.currency !== 'EGP' ||
            order.shipments.length !== 1 || !shipment?.trackingNumber?.trim() || !shipment.shippedAt ||
            (shipment.status !== ShipmentStatus.SHIPPED && shipment.status !== ShipmentStatus.IN_TRANSIT)) {
          throw new ConflictException('Cash cannot be collected in the current order state');
        }
        const paidAt = new Date();
        const changed = await tx.payment.updateMany({
          where: { id: payment.id, provider: PaymentProvider.CASH_ON_DELIVERY, status: PaymentStatus.PENDING, paidAt: null },
          data: { status: PaymentStatus.PAID, paidAt, activeAttemptKey: null },
        });
        if (changed.count !== 1) throw new ConflictException('Cash has already been collected');
        await this.audit(actorUserId, 'COD_CASH_COLLECTED', 'Payment', payment.id, {
          orderNumber, amount: order.grandTotal.toFixed(2), currency: order.currency, paidAt: paidAt.toISOString(),
        }, tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Cash collection state changed; refresh the order');
      }
      throw error;
    }
    return this.getOrder(orderNumber);
  }

  async listReturns() {
    const requests = await this.prisma.returnRequest.findMany({
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            currency: true,
            email: true,
            grandTotal: true,
            payments: { select: { provider: true } },
          },
        },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: {
          include: {
            orderItem: {
              select: { productName: true, colorName: true, size: true, unitPrice: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return requests.map((request) => ({
      id: request.id,
      status: request.status,
      reason: request.reason,
      notes: request.notes,
      refundAmount: request.refundAmount === null ? null : Number(request.refundAmount),
      paymentMethod: request.order.payments.some((payment) => payment.provider === PaymentProvider.CASH_ON_DELIVERY) ? 'CASH_ON_DELIVERY' : 'CARD',
      cashRefundRequired: request.status === ReturnStatus.RECEIVED && request.order.payments.some((payment) => payment.provider === PaymentProvider.CASH_ON_DELIVERY),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      order: {
        orderNumber: request.order.orderNumber, status: request.order.status, currency: request.order.currency, email: request.order.email,
        grandTotal: Number(request.order.grandTotal),
      },
      user: request.user,
      items: request.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        reason: item.reason,
        condition: item.condition,
        productName: item.orderItem.productName,
        colorName: item.orderItem.colorName,
        size: item.orderItem.size,
        unitPrice: Number(item.orderItem.unitPrice),
      })),
    }));
  }

  async updateReturnStatus(actorUserId: string, returnId: string, dto: UpdateReturnStatusDto) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: {
        order: {
          include: {
            items: true,
            returns: { where: { status: { not: ReturnStatus.REJECTED } }, include: { items: true } },
            payments: { orderBy: { createdAt: 'desc' } },
            discountUsages: { include: { discount: true } },
          },
        },
        items: { include: { orderItem: true } },
      },
    });
    if (!request) throw new NotFoundException('Return request not found');

    if ([ReturnStatus.APPROVED, ReturnStatus.RECEIVED, ReturnStatus.REFUNDED].includes(dto.status as any)) {
      validatePromotionReturn(request.order.items, request.items, this.returnAllocationOffsets(request));
    }
    const cashPayment = request.order.payments.find((payment) => payment.provider === PaymentProvider.CASH_ON_DELIVERY);
    if (cashPayment && (dto.status === ReturnStatus.REFUNDED || dto.status === ReturnStatus.CLOSED)) {
      throw new ConflictException('Cash repayment requires a separate manual process');
    }
    const cashRefundDue = cashPayment && dto.status === ReturnStatus.RECEIVED
      ? this.calculateReturnRefund(request) : null;
    if (cashRefundDue && (cashPayment!.status !== PaymentStatus.PAID || !cashPayment!.paidAt ||
        !cashPayment!.amount.equals(request.order.grandTotal) || cashPayment!.currency !== request.order.currency ||
        !cashRefundDue.gt(0) || cashRefundDue.gt(cashPayment!.amount))) {
      throw new ConflictException('Cash return does not have a valid collected payment');
    }

    if (!returnTransitions[request.status].includes(dto.status)) {
      throw new ConflictException(
        `Return cannot move from ${request.status} to ${dto.status}`,
      );
    }

    const refundAmount = dto.status === ReturnStatus.REFUNDED
      ? this.calculateReturnRefund(request)
      : null;
    if (refundAmount) {
      if (!refundAmount.gt(0)) throw new ConflictException('Return has no refundable item value');

      const payment = request.order.payments.find(
        (candidate) =>
          (candidate.status === PaymentStatus.PAID ||
            candidate.status === PaymentStatus.PARTIALLY_REFUNDED) &&
          candidate.refundedAmount.lt(candidate.amount),
      );
      if (!payment) throw new ConflictException('No refundable captured payment is available for this return');

      await this.payments.issueMockRefund(payment.id, refundAmount, request.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.returnRequest.updateMany({
        where: {
          id: returnId,
          status: request.status,
          ...(dto.status === ReturnStatus.REFUNDED ? { refundAmount: null } : {}),
        },
        data: {
          status: dto.status,
          ...(cashRefundDue ? { refundAmount: cashRefundDue } : {}),
          ...(dto.status === ReturnStatus.REFUNDED
            ? {
                refundAmount,
              }
            : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException('Return state changed; refresh and retry');
      if (cashRefundDue && cashPayment) {
        const existing = cashPayment.metadata && typeof cashPayment.metadata === 'object' && !Array.isArray(cashPayment.metadata)
          ? cashPayment.metadata as Prisma.JsonObject : {};
        // One fixed-size marker; the per-return audit and ReturnRequest retain the full history.
        await tx.payment.update({ where: { id: cashPayment.id }, data: { metadata: {
          ...existing, cashRefundRequired: { returnId, amount: cashRefundDue.toFixed(2), currency: request.order.currency },
        } as Prisma.InputJsonObject } });
        await this.audit(actorUserId, 'COD_REFUND_REQUIRED', 'ReturnRequest', returnId, {
          orderNumber: request.order.orderNumber, paymentId: cashPayment.id, amount: cashRefundDue.toFixed(2), currency: request.order.currency,
        }, tx);
      }
      await this.audit(actorUserId, 'RETURN_STATUS_UPDATED', 'ReturnRequest', returnId, {
        from: request.status,
        to: dto.status,
        orderNumber: request.order.orderNumber,
      }, tx);
      return tx.returnRequest.findUnique({ where: { id: returnId } });
    });

    return {
      id: updated?.id ?? returnId,
      status: updated?.status ?? dto.status,
      refundAmount: updated?.refundAmount === null || updated?.refundAmount === undefined
        ? null
        : Number(updated.refundAmount),
    };
  }

  async listShipping() {
    const zones = await this.prisma.shippingZone.findMany({
      include: {
        methods: {
          orderBy: [{ active: 'desc' }, { price: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    return zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      countries: zone.countries,
      active: zone.active,
      methods: zone.methods.map((method) => ({
        id: method.id,
        code: method.code,
        name: method.name,
        currency: method.currency,
        price: Number(method.price),
        freeAbove: method.freeAbove === null ? null : Number(method.freeAbove),
        estimatedMinDays: method.estimatedMinDays,
        estimatedMaxDays: method.estimatedMaxDays,
        active: method.active,
      })),
    }));
  }

  async listAudit(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.prisma.auditLog.findMany({
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
  }

  private audit(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata?: Prisma.InputJsonValue,
    db: Pick<Prisma.TransactionClient, 'auditLog'> = this.prisma,
  ) {
    return db.auditLog.create({
      data: { actorUserId, action, entityType, entityId, metadata },
    });
  }

  private createDiscountData(dto: CreateDiscountDto): Prisma.DiscountUncheckedCreateInput {
    return {
      ...(dto.type === DiscountType.BUY_X_GET_Y ? { offerSnapshot: this.generalPromotionSnapshot(dto) } : {}),
      code: dto.code,
      type: dto.type,
      value: dto.value,
      currency: dto.currency || null,
      minimumSubtotal: dto.minimumSubtotal ?? null,
      maximumDiscount: dto.maximumDiscount ?? null,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      usageLimit: dto.usageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? null,
      active: dto.active ?? true,
    };
  }

  private updateDiscountData(dto: UpdateDiscountDto): Prisma.DiscountUncheckedUpdateInput {
    return {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.value !== undefined ? { value: dto.value } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency || null } : {}),
      ...(dto.minimumSubtotal !== undefined ? { minimumSubtotal: dto.minimumSubtotal } : {}),
      ...(dto.maximumDiscount !== undefined ? { maximumDiscount: dto.maximumDiscount } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
      ...(dto.perCustomerLimit !== undefined ? { perCustomerLimit: dto.perCustomerLimit } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
  }

  private presentDiscount<T extends {
    value: Prisma.Decimal;
    minimumSubtotal: Prisma.Decimal | null;
    maximumDiscount: Prisma.Decimal | null;
  }>(discount: T) {
    return {
      ...discount,
      value: Number(discount.value),
      minimumSubtotal:
        discount.minimumSubtotal === null ? null : Number(discount.minimumSubtotal),
      maximumDiscount:
        discount.maximumDiscount === null ? null : Number(discount.maximumDiscount),
    };
  }

  private calculateReturnRefund(request: {
    order: {
      items?: Array<PromotionReturnLine>;
      returns?: Array<{ id: string; createdAt: Date; items: Array<{orderItemId:string;quantity:number}> }>;
      subtotal: Prisma.Decimal;
      discountUsages: Array<{ amount: Prisma.Decimal; discount: { type: DiscountType } }>;
    };
    id?: string;
    createdAt?: Date;
    items: Array<{
      orderItemId?: string;
      quantity: number;
      orderItem: {
        id?: string;
        unitPrice?: Prisma.Decimal;
        promotionAllocation?: unknown;
        quantity: number;
        lineTotal: Prisma.Decimal;
      };
    }>;
  }): Prisma.Decimal {
    if (request.items.some((item) => item.orderItem.promotionAllocation != null)) {
      const offsets = this.returnAllocationOffsets(request);
      validatePromotionReturn(request.order.items ?? request.items.map((item) => ({
        ...item.orderItem, id: item.orderItemId ?? item.orderItem.id!,
      })), request.items.map((item) => ({ orderItemId: item.orderItemId ?? item.orderItem.id!, quantity: item.quantity })), offsets);
      return request.items.reduce((sum, item) => {
        const id = item.orderItemId ?? item.orderItem.id!;
        const price = item.orderItem.unitPrice ?? item.orderItem.lineTotal.div(item.orderItem.quantity);
        const units = promotionUnits({ ...item.orderItem, id });
        const offset = offsets.get(id) ?? 0;
        return units.slice(offset, offset + item.quantity).reduce((amount, unit) => {
          if (new Prisma.Decimal(unit.discount).gt(price)) throw new ConflictException('Saved promotion allocation exceeds item value');
          return amount.plus(price.minus(unit.discount));
        }, sum);
      }, new Prisma.Decimal(0)).toDecimalPlaces(2);
    }
    const returnedGross = request.items.reduce(
      (sum, item) => {
        const lineUnit = item.orderItem.lineTotal.div(item.orderItem.quantity);
        return sum.plus(lineUnit.mul(item.quantity));
      },
      new Prisma.Decimal(0),
    );
    const usage = request.order.discountUsages[0];
    // FREE_SHIPPING discounts do not reduce the economic value of returned
    // items. Shipping/tax refund policy remains unchanged and is excluded.
    const itemDiscount =
      usage && usage.discount.type !== DiscountType.FREE_SHIPPING && request.order.subtotal.gt(0)
        ? (usage.amount.lt(request.order.subtotal) ? usage.amount : request.order.subtotal)
            .mul(returnedGross)
            .div(request.order.subtotal)
        : new Prisma.Decimal(0);
    return returnedGross.minus(itemDiscount).toDecimalPlaces(2);
  }

  private generalPromotionSnapshot(dto: Pick<UpdateDiscountDto, 'currency' | 'minimumSubtotal' | 'maximumDiscount' | 'buyQuantity' | 'giftQuantity' | 'maxGiftUnits' | 'eligibleProductIds' | 'eligibleCategoryIds'>): Prisma.InputJsonValue {
    return {
      ...DEFAULT_OFFER, type: 'BUY_X_GET_Y', value: 0,
      currency: dto.currency ?? 'EGP', minimumSubtotal: dto.minimumSubtotal ?? null,
      maximumDiscount: dto.maximumDiscount ?? null,
      buyQuantity: dto.buyQuantity!, giftQuantity: dto.giftQuantity!,
      maxGiftUnits: dto.maxGiftUnits ?? null,
      eligibleProductIds: dto.eligibleProductIds ?? [], eligibleCategoryIds: dto.eligibleCategoryIds ?? [],
    };
  }

  private async assertPromotionEligibility(dto: { type?: DiscountType; eligibleProductIds?: string[]; eligibleCategoryIds?: string[] }) {
    if (dto.type !== DiscountType.BUY_X_GET_Y) return;
    const productIds = dto.eligibleProductIds ?? [];
    const categoryIds = dto.eligibleCategoryIds ?? [];
    if (productIds.length && await this.prisma.product.count({ where: { id: { in: productIds } } }) !== productIds.length) throw new ConflictException('Unknown eligible product');
    if (categoryIds.length && await this.prisma.category.count({ where: { id: { in: categoryIds } } }) !== categoryIds.length) throw new ConflictException('Unknown eligible category');
  }

  private returnAllocationOffsets(request: { id?: string; createdAt?: Date; order: {
    returns?: Array<{ id: string; createdAt: Date; items: Array<{orderItemId: string; quantity: number}> }>
  } }) {
    const offsets = new Map<string, number>();
    for (const previous of request.order.returns ?? []) {
      if (previous.id === request.id || (request.createdAt && previous.createdAt > request.createdAt)) continue;
      for (const item of previous.items) offsets.set(item.orderItemId, (offsets.get(item.orderItemId) ?? 0) + item.quantity);
    }
    return offsets;
  }

  private assertDiscount(dto: {
    type?: DiscountType;
    value?: number;
    maximumDiscount?: number;
    buyQuantity?: number;
    giftQuantity?: number;
    maxGiftUnits?: number | null;
    startsAt?: string | Date | null;
    endsAt?: string | Date | null;
  }) {
    if (dto.type === DiscountType.BUY_X_GET_Y) {
      if (!Number.isInteger(dto.buyQuantity) || dto.buyQuantity! < 1 || dto.buyQuantity! > 100) throw new ConflictException('buyQuantity must be between 1 and 100');
      if (!Number.isInteger(dto.giftQuantity) || dto.giftQuantity! < 1 || dto.giftQuantity! > 100) throw new ConflictException('giftQuantity must be between 1 and 100');
      if (dto.value !== 0) throw new ConflictException('BUY_X_GET_Y discount value must be 0');
      if (dto.maxGiftUnits != null && (!Number.isInteger(dto.maxGiftUnits) || dto.maxGiftUnits < 1 || dto.maxGiftUnits > 10000)) throw new ConflictException('maxGiftUnits must be between 1 and 10000');
    }
    if (dto.type === DiscountType.PERCENTAGE && dto.value !== undefined && dto.value > 100) {
      throw new ConflictException('Percentage discount cannot exceed 100%');
    }
    if (dto.type === DiscountType.FREE_SHIPPING && dto.value !== undefined && dto.value !== 0) {
      throw new ConflictException('FREE_SHIPPING discount value must be 0');
    }
    if (dto.maximumDiscount !== undefined && dto.maximumDiscount < 0) {
      throw new ConflictException('maximumDiscount cannot be negative');
    }
    if (dto.startsAt && dto.endsAt) {
      const startsAt = dto.startsAt instanceof Date ? dto.startsAt : new Date(dto.startsAt);
      const endsAt = dto.endsAt instanceof Date ? dto.endsAt : new Date(dto.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new ConflictException('Discount dates are invalid');
      }
      if (endsAt <= startsAt) {
        throw new ConflictException('Discount end date must be after the start date');
      }
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002',
    );
  }
}
