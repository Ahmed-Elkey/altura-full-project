import { ConflictException } from '@nestjs/common';
import { CartStatus, ProductStatus } from '@prisma/client';
import { CartsService } from './carts.service';

const now = new Date('2026-10-01T00:00:00.000Z');

function makeCart(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cart-1',
    userId: null,
    sessionId: 'session-1',
    status: CartStatus.ACTIVE,
    currency: 'CAD',
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  };
}

describe('CartsService market currency', () => {
  const config = { getOrThrow: jest.fn(() => 'EGP') } as any;
  const prisma = {
    cart: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productVariant: { findUnique: jest.fn() },
  } as any;
  const service = new CartsService(prisma, config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reconciles an empty active customer cart to the configured market currency', async () => {
    prisma.cart.findFirst.mockResolvedValue(makeCart({ userId: 'customer-1', sessionId: null }));
    prisma.cart.update.mockResolvedValue(makeCart({ userId: 'customer-1', sessionId: null, currency: 'EGP' }));

    const result = await service.get({ userId: 'customer-1' });

    expect(prisma.cart.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cart-1' },
      data: { currency: 'EGP' },
    }));
    expect(result.currency).toBe('EGP');
  });

  it('reconciles only an empty active guest cart when its market currency is stale', async () => {
    prisma.cart.findUnique.mockResolvedValue(makeCart());
    prisma.cart.update.mockResolvedValue(makeCart({ currency: 'EGP' }));

    const result = await service.get({
      sessionId: 'session-1',
      expiresAt: new Date(now.getTime() + 172_800_000),
    });

    expect(prisma.cart.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cart-1' },
      data: expect.objectContaining({ currency: 'EGP' }),
    }));
    expect(result.currency).toBe('EGP');
  });

  it('preserves a non-empty old-market cart and rejects an incompatible variant', async () => {
    prisma.cart.findFirst.mockResolvedValue(makeCart({
      userId: 'customer-1',
      sessionId: null,
      items: [{ id: 'old-line', variantId: 'old-variant', quantity: 1 }],
    }));
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'egp-variant',
      active: true,
      currency: 'EGP',
      inventory: { quantity: 5, reservedQuantity: 0 },
      product: { status: ProductStatus.ACTIVE },
    });

    await expect(service.addItem(
      { userId: 'customer-1' },
      { variantId: 'egp-variant', quantity: 1 },
    )).rejects.toThrow(ConflictException);
    expect(prisma.cart.update).not.toHaveBeenCalled();
  });

  it('sets the canonical currency explicitly when creating a new guest cart', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);
    prisma.cart.create.mockImplementation(({ data }: { data: { currency: string } }) =>
      Promise.resolve(makeCart({ currency: data.currency })),
    );

    const result = await service.get({
      sessionId: 'new-session',
      expiresAt: new Date(now.getTime() + 172_800_000),
    });

    expect(prisma.cart.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currency: 'EGP' }),
    }));
    expect(result.currency).toBe('EGP');
  });
});
