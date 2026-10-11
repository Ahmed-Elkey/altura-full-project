import { ConflictException } from '@nestjs/common';
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { AdminService } from './admin.service';

describe('admin MVP order cancellation', () => {
  function fixture(paymentStatus: PaymentStatus = PaymentStatus.PENDING) {
    const order = {
      id: 'order',
      orderNumber: 'ALT-MVP',
      status: OrderStatus.CONFIRMED,
      inventoryCommittedAt: new Date(),
      inventoryReleasedAt: null,
      grandTotal: new Prisma.Decimal(250),
      currency: 'EGP',
      payments: [{
        status: paymentStatus,
        provider: PaymentProvider.CASH_ON_DELIVERY,
        amount: new Prisma.Decimal(250),
        currency: 'EGP',
      }],
      items: [{ variantId: 'variant', quantity: 2 }],
    };
    const tx = {
      order: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      discountUsage: { deleteMany: jest.fn() },
      inventoryMovement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new AdminService(prisma as any, {} as any);
    jest.spyOn(service, 'getOrder').mockResolvedValue({ orderNumber: order.orderNumber } as any);
    return { service, prisma, tx };
  }

  test('cancels unpaid COD before shipping, restores exact stock and records history', async () => {
    const { service, prisma, tx } = fixture();
    await service.updateOrderWorkflow('admin', 'alt-mvp', { status: OrderStatus.CANCELLED });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ variantId: 'variant', reason: 'CANCELLATION', quantity: 2, referenceId: 'order' }) });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: PaymentStatus.CANCELLED, activeAttemptKey: null } }));
    expect(tx.discountUsage.deleteMany).toHaveBeenCalledWith({ where: { orderId: 'order' } });
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OrderStatus.CANCELLED, cancelledAt: expect.any(Date), inventoryReleasedAt: expect.any(Date) }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ORDER_CANCELLED', metadata: expect.objectContaining({ from: OrderStatus.CONFIRMED, to: OrderStatus.CANCELLED }) }) }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });

  test('paid orders cannot use cancellation and must follow refund/return handling', async () => {
    const { service, tx } = fixture(PaymentStatus.PAID);
    await expect(service.updateOrderWorkflow('admin', 'ALT-MVP', { status: OrderStatus.CANCELLED })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });
});
