import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { ReturnsService } from './returns.service';

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    userId: 'user-1',
    orderNumber: 'ALT-1',
    status: OrderStatus.DELIVERED,
    items: [{ id: 'item-1', quantity: 2, productName: 'Meridian Tee' }],
    returns: [],
    ...overrides,
  };
}

function makeCreatedRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'return-1',
    status: 'REQUESTED',
    reason: 'Size or fit',
    notes: null,
    refundAmount: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    order: { orderNumber: 'ALT-1', currency: 'EGP', status: OrderStatus.DELIVERED },
    items: [
      {
        id: 'ritem-1',
        orderItemId: 'item-1',
        quantity: 1,
        reason: null,
        condition: null,
        orderItem: { productName: 'Meridian Tee', colorName: 'Black', size: 'M', productImageUrl: null, unitPrice: '1500.00' },
      },
    ],
    ...overrides,
  };
}

function makeService() {
  const tx: any = {
    order: { findFirst: jest.fn() },
    returnRequest: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  return { service: new ReturnsService(prisma), prisma, tx };
}

const dto = {
  orderNumber: 'ALT-1',
  reason: 'Size or fit',
  items: [{ orderItemId: 'item-1', quantity: 1 }],
};

describe('ReturnsService guest returns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an authenticated return scoped to the user', async () => {
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValue(makeOrder());
    tx.returnRequest.create.mockResolvedValue(makeCreatedRequest({ userId: 'user-1' }));

    const result = await service.create('user-1', dto as any);

    expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', orderNumber: 'ALT-1' },
    }));
    expect(tx.returnRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orderId: 'order-1', userId: 'user-1' }),
    }));
    expect(result.id).toBe('return-1');
  });

  it('creates a guest return with a null userId', async () => {
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValue(makeOrder({ userId: null }));
    tx.returnRequest.create.mockResolvedValue(makeCreatedRequest({ userId: null }));

    const result = await service.createForGuest({ ...dto, email: 'guest@example.com' } as any);

    expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: null, orderNumber: 'ALT-1', email: 'guest@example.com' },
    }));
    expect(tx.returnRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ orderId: 'order-1', userId: null }),
    }));
    expect(result.id).toBe('return-1');
  });

  it('rejects a guest return for an order owned by a registered user', async () => {
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValue(null);

    await expect(service.createForGuest({ ...dto, email: 'guest@example.com' } as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it('rejects returns before delivery', async () => {
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValue(makeOrder({ status: OrderStatus.SHIPPED }));

    await expect(service.create('user-1', dto as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects quantities beyond the remaining eligible units', async () => {
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValue(makeOrder());
    const over = { ...dto, items: [{ orderItemId: 'item-1', quantity: 5 }] };

    await expect(service.create('user-1', over as any)).rejects.toBeInstanceOf(ConflictException);
  });
});
