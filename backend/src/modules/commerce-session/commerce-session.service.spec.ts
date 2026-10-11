import { CartStatus } from '@prisma/client';
import { CommerceSessionService } from './commerce-session.service';

describe('CommerceSessionService currency safety', () => {
  const config = { getOrThrow: jest.fn(() => 'EGP') } as any;
  let tx: any;
  let prisma: any;
  let service: CommerceSessionService;

  beforeEach(() => {
    tx = {
      cart: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cartItem: {
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      wishlist: { findUnique: jest.fn() },
      wishlistItem: { createMany: jest.fn() },
    };
    tx.wishlist.findUnique.mockResolvedValue(null);
    prisma = { $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)) };
    service = new CommerceSessionService(prisma, config);
  });

  it('creates a merged customer cart with the configured market currency', async () => {
    tx.cart.findUnique.mockResolvedValue({
      id: 'guest-cart',
      status: CartStatus.ACTIVE,
      currency: 'CAD',
      items: [],
    });
    tx.cart.findFirst.mockResolvedValue(null);
    tx.cart.create.mockImplementation(({ data }: { data: { userId: string; currency: string } }) =>
      Promise.resolve({ id: 'customer-cart', ...data, items: [] }),
    );

    const result = await service.merge('customer-1', 'guest-session-1');

    expect(tx.cart.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'customer-1', currency: 'EGP' }),
    }));
    expect(result.cart.customerCartId).toBe('customer-cart');
  });

  it('keeps non-empty carts untouched when guest and customer currencies differ', async () => {
    tx.cart.findUnique.mockResolvedValue({
      id: 'guest-cart',
      status: CartStatus.ACTIVE,
      currency: 'EGP',
      items: [{ id: 'guest-line', variantId: 'egp-variant', quantity: 1 }],
    });
    tx.cart.findFirst.mockResolvedValue({
      id: 'customer-cart',
      currency: 'CAD',
      items: [{ id: 'customer-line', variantId: 'cad-variant', quantity: 1 }],
    });

    const result = await service.merge('customer-1', 'guest-session-1');

    expect(result.cart).toMatchObject({ currencyConflict: true, skippedLines: 1 });
    expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.cart.update).not.toHaveBeenCalled();
  });
});
