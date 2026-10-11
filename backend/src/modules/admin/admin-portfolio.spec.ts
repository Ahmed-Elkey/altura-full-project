import { ConflictException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma, ShipmentStatus, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('portfolio revenue and fulfillment', () => {
  function fixture(status: OrderStatus = OrderStatus.PROCESSING, shipment: any = { id: 'shipment', status: ShipmentStatus.PENDING }) {
    const order = { id: 'order', orderNumber: 'ALT-LOCAL', status, inventoryCommittedAt: new Date(), payments: [{ status: PaymentStatus.PAID as PaymentStatus }] };
    const tx = {
      order: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shipment: { findMany: jest.fn().mockResolvedValue(shipment ? [shipment] : []), updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new AdminService(prisma as any, {} as any);
    jest.spyOn(service, 'getOrder').mockResolvedValue({ orderNumber: 'ALT-LOCAL' } as any);
    return { service, prisma, tx, order };
  }
  test('workflow mutation permits ADMIN only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController.prototype.updateOrderWorkflow)).toEqual([UserRole.ADMIN]);
  });
  test('revenue query includes EGP and subtracts refunds', async () => {
    const prisma = {
      user: { count: jest.fn().mockResolvedValue(1) }, product: { count: jest.fn().mockResolvedValue(1) },
      order: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(150), refundedAmount: new Prisma.Decimal(25) } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]), inventory: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 5, reservedQuantity: 0 }, _count: { _all: 1 } }) },
    };
    const result = await new AdminService(prisma as any, {} as any).dashboard();
    expect(prisma.payment.aggregate.mock.calls[0][0].where.currency).toBe('EGP');
    expect(result).toMatchObject({ currency: 'EGP', metrics: { netRevenue30d: 125 } });
  });
  test('processing is reachable for a paid committed order', async () => {
    const { service, tx } = fixture(OrderStatus.CONFIRMED);
    await service.updateOrderWorkflow('admin', 'alt-local', { status: OrderStatus.PROCESSING });
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: OrderStatus.PROCESSING } }));
    expect(tx.shipment.updateMany).not.toHaveBeenCalled();
  });
  test('customer register monetary totals exclude historical currencies', async () => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'customer' }]), count: jest.fn().mockResolvedValue(1) },
      order: { groupBy: jest.fn().mockResolvedValue([{ userId: 'customer', _count: { _all: 1 }, _sum: { grandTotal: new Prisma.Decimal(118) } }]) },
      $transaction: jest.fn(async (queries: any[]) => Promise.all(queries)),
    };
    const result = await new AdminService(prisma as any, {} as any).listCustomers({ page: 1, limit: 25 });
    expect(prisma.order.groupBy.mock.calls[0][0].where.currency).toBe('EGP');
    expect(result.customers[0]).toMatchObject({ orderCount: 1, lifetimeValue: 118 });
  });
  test('customer detail value is EGP scoped while full history stays available', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'customer', orders: [] }) },
      order: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 1 }, _sum: { grandTotal: new Prisma.Decimal(118) } }) },
    };
    const result = await new AdminService(prisma as any, {} as any).getCustomer('customer');
    expect(prisma.order.aggregate.mock.calls[0][0].where.currency).toBe('EGP');
    expect(prisma.user.findUnique.mock.calls[0][0].select.orders).not.toHaveProperty('where.currency');
    expect(result).toMatchObject({ orderCount: 1, lifetimeValue: 118 });
  });
  test.each([OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.CONFIRMED])('rejects skipped/reversed transition to %s', async (status) => {
    const { service, tx } = fixture();
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });
  test('rejects unpaid or uncommitted orders', async () => {
    const { service, order, tx } = fixture();
    order.payments = [{ status: PaymentStatus.PENDING }];
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED, trackingNumber: 'LOCAL' })).rejects.toThrow('paid');
    order.payments = [{ status: PaymentStatus.PAID }]; order.inventoryCommittedAt = null as any;
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED, trackingNumber: 'LOCAL' })).rejects.toThrow('committed');
    expect(tx.shipment.updateMany).not.toHaveBeenCalled();
  });
  test('rejects empty tracking and inconsistent shipment', async () => {
    const { service, tx } = fixture();
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED })).rejects.toThrow('tracking');
    tx.shipment.findMany.mockResolvedValue([{ id: 'shipment', status: ShipmentStatus.DELIVERED }]);
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED, trackingNumber: 'LOCAL' })).rejects.toThrow('not ready');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });
  test('shipping records tracking and timestamps within a serializable transaction', async () => {
    const { service, tx, prisma } = fixture();
    await service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED, trackingNumber: 'LOCAL-123', carrier: 'Local fixture' });
    expect(tx.shipment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ShipmentStatus.SHIPPED, trackingNumber: 'LOCAL-123', shippedAt: expect.any(Date) }) }));
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: OrderStatus.PROCESSING }), data: { status: OrderStatus.SHIPPED } }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
  test('creates the tracked local shipment when none exists', async () => {
    const { service, tx } = fixture(OrderStatus.PROCESSING, null);
    await service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED, trackingNumber: 'LOCAL-123' });
    expect(tx.shipment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'order', status: ShipmentStatus.SHIPPED, trackingNumber: 'LOCAL-123' }) });
  });
  test('delivery requires a tracked shipped shipment and sets delivery time', async () => {
    const { service, tx } = fixture(OrderStatus.SHIPPED, { id: 'shipment', status: ShipmentStatus.SHIPPED, trackingNumber: 'LOCAL-123', shippedAt: new Date() });
    await service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.DELIVERED });
    expect(tx.shipment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: ShipmentStatus.DELIVERED, deliveredAt: expect.any(Date) } }));
    tx.shipment.findMany.mockResolvedValue([{ id: 'shipment', status: ShipmentStatus.PENDING }]);
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.DELIVERED })).rejects.toThrow('tracked');
  });
  test('CAS conflicts fail the transaction before writing an audit event', async () => {
    const { service, tx } = fixture();
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateOrderWorkflow('admin', 'ALT-LOCAL', { status: OrderStatus.SHIPPED, trackingNumber: 'LOCAL-123' })).rejects.toThrow('Order state changed');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    // Actual rollback is guaranteed by Prisma's callback transaction and checked against real DB in the browser/API gate.
  });
});
