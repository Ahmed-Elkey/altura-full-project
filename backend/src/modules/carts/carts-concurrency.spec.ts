import { CartStatus } from '@prisma/client';
import { CartsService } from './carts.service';

const now = new Date('2026-10-01T00:00:00.000Z');

function makeCart(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cart-1',
    userId: null,
    sessionId: 'session-1',
    status: CartStatus.ACTIVE,
    currency: 'EGP',
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  };
}

describe('CartsService concurrent creation (P2002 retry)', () => {
  const config = { getOrThrow: jest.fn(() => 'EGP'), get: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries once and picks up the row created by a racing request (guest)', async () => {
    const prisma: any = {
      cart: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      productVariant: { findUnique: jest.fn() },
    };
    prisma.cart.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce(makeCart());
    const service = new CartsService(prisma, config);

    const result = await service.get({
      sessionId: 'session-1',
      expiresAt: new Date(now.getTime() + 172_800_000),
    });

    expect(prisma.cart.create).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('cart-1');
  });

  it('retries once and picks up the row created by a racing request (customer)', async () => {
    const prisma: any = {
      cart: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      productVariant: { findUnique: jest.fn() },
    };
    prisma.cart.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.cart.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(makeCart({ userId: 'user-9', sessionId: null }));
    const service = new CartsService(prisma, config);

    const result = await service.get({ userId: 'user-9' });

    expect(prisma.cart.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('cart-1');
  });

  it('rethrows non-unique errors without retrying', async () => {
    const prisma: any = {
      cart: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockRejectedValue(new Error('connection lost')),
        update: jest.fn(),
      },
      productVariant: { findUnique: jest.fn() },
    };
    const service = new CartsService(prisma, config);

    await expect(service.get({ userId: 'user-9' })).rejects.toThrow('connection lost');
    expect(prisma.cart.create).toHaveBeenCalledTimes(1);
  });
});
