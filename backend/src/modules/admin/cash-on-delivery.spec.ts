import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PaymentProvider, Prisma, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from '../payments/payments.service';

describe('cash collection integrity', () => {
  function fixture() {
    const payment = { id: 'cash', provider: 'CASH_ON_DELIVERY', status: 'PENDING', paidAt: null, amount: new Prisma.Decimal(118), currency: 'EGP' };
    const order = { id: 'order', orderNumber: 'ALT-CASH', status: 'SHIPPED', inventoryCommittedAt: new Date(), grandTotal: new Prisma.Decimal(118), currency: 'EGP', payments: [payment], shipments: [{ trackingNumber: 'LOCAL', shippedAt: new Date(), status: 'SHIPPED' }] };
    const actor = { role: 'ADMIN', status: 'ACTIVE' };
    const tx = { user: { findUnique: jest.fn().mockResolvedValue(actor) }, order: { findUnique: jest.fn().mockResolvedValue(order) }, payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, auditLog: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new AdminService(prisma as any, {} as any);
    jest.spyOn(service, 'getOrder').mockResolvedValue({ orderNumber: order.orderNumber } as any);
    return { service, prisma, tx, actor, order, payment };
  }
  test('controller permits only ADMIN and rejects overrides', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController.prototype.collectCash)).toEqual([UserRole.ADMIN]);
    const controller = new AdminController({} as any, {} as any);
    expect(() => controller.collectCash({ id: 'admin' } as any, 'ALT-CASH', { amount: 1 })).toThrow();
  });
  test('CUSTOMER cannot collect cash even directly through the service', async () => {
    const role = 'CUSTOMER';
    const f = fixture(); f.actor.role = role;
    await expect(f.service.collectCash('actor', 'ALT-CASH')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.payment.updateMany).not.toHaveBeenCalled();
  });
  test.each(['provider', 'before-shipping', 'tracking', 'inventory', 'amount', 'currency', 'paid'])('rejects inconsistent %s', async (kind) => {
    const f = fixture();
    if (kind === 'provider') f.payment.provider = 'MOCK';
    if (kind === 'before-shipping') f.order.status = 'PROCESSING';
    if (kind === 'tracking') f.order.shipments[0].trackingNumber = '';
    if (kind === 'inventory') f.order.inventoryCommittedAt = null as any;
    if (kind === 'amount') f.payment.amount = new Prisma.Decimal(1);
    if (kind === 'currency') f.payment.currency = 'CAD';
    if (kind === 'paid') f.payment.status = 'PAID';
    await expect(f.service.collectCash('admin', 'ALT-CASH')).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.payment.updateMany).not.toHaveBeenCalled(); expect(f.tx.auditLog.create).not.toHaveBeenCalled();
  });
  test('one conditional payment write and audit occur in a serializable transaction without inventory writes', async () => {
    const f = fixture(); await f.service.collectCash('admin', 'ALT-CASH');
    expect(f.tx.payment.updateMany).toHaveBeenCalledWith({ where: { id: 'cash', provider: PaymentProvider.CASH_ON_DELIVERY, status: 'PENDING', paidAt: null }, data: { status: 'PAID', paidAt: expect.any(Date), activeAttemptKey: null } });
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(f.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'COD_CASH_COLLECTED', metadata: expect.objectContaining({ amount: '118.00', currency: 'EGP' }) }) }));
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  test('CAS loser returns conflict without a successful audit', async () => {
    const f = fixture(); f.tx.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.collectCash('admin', 'ALT-CASH')).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.auditLog.create).not.toHaveBeenCalled();
  });
  test('serializable concurrent loser is a 409', async () => {
    const f = fixture(); f.prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('concurrent', { code: 'P2034', clientVersion: '6.19.3' }));
    await expect(f.service.collectCash('admin', 'ALT-CASH')).rejects.toBeInstanceOf(ConflictException);
  });
  test('revenue dates COD by collection and cards by creation, excluding pending', async () => {
    const prisma = { user: { count: jest.fn().mockResolvedValue(0) }, product: { count: jest.fn().mockResolvedValue(0) }, order: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) }, payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null, refundedAmount: null } }) }, $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]), inventory: { aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }) } };
    await new AdminService(prisma as any, {} as any).dashboard();
    const where = (prisma.payment.aggregate.mock.calls[0] as any)[0].where;
    expect(where.status.in).not.toContain('PENDING');
    expect(where.OR).toEqual([{ provider: { not: 'CASH_ON_DELIVERY' }, createdAt: { gte: expect.any(Date) } }, { provider: 'CASH_ON_DELIVERY', paidAt: { gte: expect.any(Date) } }]);
    expect(where.createdAt).toBeUndefined();
  });
  test('received cash return records refund due but never calls the electronic refund path', async () => {
    const payment = { id: 'cash', provider: PaymentProvider.CASH_ON_DELIVERY, status: 'PAID', paidAt: new Date(), amount: new Prisma.Decimal(118), currency: 'EGP', metadata: null };
    const returned = { id: 'return', status: 'IN_TRANSIT', order: { items: [], returns: [], orderNumber: 'ALT-CASH', grandTotal: new Prisma.Decimal(118), subtotal: new Prisma.Decimal(100), currency: 'EGP', payments: [payment], discountUsages: [] }, items: [{ quantity: 1, orderItem: { quantity: 1, lineTotal: new Prisma.Decimal(100) } }] };
    const tx = { returnRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ id: 'return', status: 'RECEIVED', refundAmount: new Prisma.Decimal(100) }) }, payment: { update: jest.fn() }, auditLog: { create: jest.fn() } };
    const prisma = { returnRequest: { findUnique: jest.fn().mockResolvedValue(returned) }, $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const payments = { issueMockRefund: jest.fn() };
    const service = new AdminService(prisma as any, payments as any);
    await expect(service.updateReturnStatus('admin', 'return', { status: 'RECEIVED' } as any)).resolves.toMatchObject({ status: 'RECEIVED', refundAmount: 100 });
    expect(payments.issueMockRefund).not.toHaveBeenCalled();
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: 'cash' }, data: { metadata: { cashRefundRequired: { returnId: 'return', amount: '100.00', currency: 'EGP' } } } });
    returned.status = 'RECEIVED';
    await expect(service.updateReturnStatus('admin', 'return', { status: 'REFUNDED' } as any)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateReturnStatus('admin', 'return', { status: 'CLOSED' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(payments.issueMockRefund).not.toHaveBeenCalled();
  });
  test.each(['completion', 'refund'])('cash cannot enter electronic %s', async (operation) => {
    const prisma = { payment: { findUnique: jest.fn().mockResolvedValue({ id: 'cash', provider: PaymentProvider.CASH_ON_DELIVERY }) }, paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new PaymentsService(prisma as any, new ConfigService({ NODE_ENV: 'development', PAYMENT_MODE: 'mock' }), {} as any, {} as any, {} as any);
    const process = jest.spyOn(service as any, 'processWebhookEvent').mockResolvedValue({});
    const action = operation === 'completion' ? service.completeMock('cash', { outcome: 'paid' }, 'customer') : service.issueMockRefund('cash', new Prisma.Decimal(100), 'return');
    await expect(action).rejects.toThrow('Mock payment not found');
    expect(process).not.toHaveBeenCalled();
  });
});
