import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { CheckoutService } from './checkout.service';
import { PlaceOrderDto } from './dto/place-order.dto';

describe('checkout payment method compatibility', () => {
  test.each([undefined, 'CARD', 'CASH_ON_DELIVERY'])('accepts supported method %s', async (method) => {
    const dto = Object.assign(new PlaceOrderDto(), { paymentMethod: method });
    expect((await validate(dto)).filter(error => error.property === 'paymentMethod')).toHaveLength(0);
  });
  test.each(['MOCK', 'ADMIN', 'PAYPAL', 'WALLET'])('rejects unsupported method %s', async (method) => {
    const dto = Object.assign(new PlaceOrderDto(), { paymentMethod: method });
    expect((await validate(dto)).filter(error => error.property === 'paymentMethod')).toHaveLength(1);
  });
  test('explicit CARD replays the legacy omitted-method hash; changing to COD conflicts before any write', async () => {
    const order: any = { id: 'order', userId: 'user', orderNumber: 'ALT-CARD', subtotal: 100, discountTotal: 0, shippingTotal: 18, taxTotal: 0, grandTotal: 118, items: [], addresses: [], payments: [], shipments: [] };
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) }, $transaction: jest.fn() };
    const service = new CheckoutService(prisma as any, new ConfigService(), {} as any, {} as any);
    const legacy = { email: 'synthetic@example.invalid' } as PlaceOrderDto;
    order.idempotencyFingerprint = (service as any).fingerprint({ owner: { userId: 'user' }, payload: legacy });
    await expect(service.placeOrder({ userId: 'user' }, legacy, 'old-key')).resolves.toMatchObject({ idempotentReplay: true });
    await expect(service.placeOrder({ userId: 'user' }, { ...legacy, paymentMethod: 'CARD' }, 'old-key')).resolves.toMatchObject({ idempotentReplay: true });
    await expect(service.placeOrder({ userId: 'user' }, { ...legacy, paymentMethod: 'CASH_ON_DELIVERY' }, 'old-key')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
