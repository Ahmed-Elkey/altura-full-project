import { ConfigService } from '@nestjs/config';
import { PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('local return refund integrity', () => {
  function fixture(config: Record<string, unknown> = {}, event: any = null) {
    const payment = { id: 'payment', provider: PaymentProvider.MOCK, status: PaymentStatus.PAID, providerPaymentId: 'mock_pi_payment', providerTransactionId: 'mock_tx_capture', amount: new Prisma.Decimal(130), refundedAmount: new Prisma.Decimal(0), currency: 'EGP' };
    const prisma = { paymentWebhookEvent: { findUnique: jest.fn().mockResolvedValue(event) }, payment: { findUnique: jest.fn().mockResolvedValue(payment) } };
    const service = new PaymentsService(prisma as any, new ConfigService({ NODE_ENV: 'development', PAYMENT_MODE: 'mock', ...config }), {} as any, {} as any, {} as any);
    const process = jest.spyOn(service as any, 'processWebhookEvent').mockResolvedValue({ received: true });
    return { service, payment, process };
  }
  test('refund preserves captured transaction correlation and cumulative refund evidence', async () => {
    const { service, payment, process } = fixture();
    await service.issueMockRefund('payment', new Prisma.Decimal(118), 'return');
    const event = process.mock.calls[0][0] as any;
    expect(event).toMatchObject({ externalEventId: 'admin-return-refund:return', localPaymentId: 'payment', providerPaymentId: 'mock_pi_payment', providerTransactionId: 'mock_tx_capture', status: PaymentStatus.PARTIALLY_REFUNDED, amountMinor: 13000, refundedAmountMinor: 11800, currency: 'EGP' });
    expect((service as any).providerCorrelationError(payment, event)).toBeNull();
  });
  test('a rejected recorded event cannot falsely complete an admin return on retry', async () => {
    const { service, process } = fixture({}, { processedAt: new Date(), paymentId: 'payment', processingError: 'Provider transaction identifier conflicts with the stored payment' });
    await expect(service.issueMockRefund('payment', new Prisma.Decimal(118), 'return')).rejects.toThrow('previous local refund event was rejected');
    expect(process).not.toHaveBeenCalled();
  });
  test('a successful duplicate is idempotent, but another payment cannot reuse it', async () => {
    const { service, process } = fixture({}, { processedAt: new Date(), paymentId: 'payment', processingError: null });
    await expect(service.issueMockRefund('payment', new Prisma.Decimal(118), 'return')).resolves.toMatchObject({ duplicate: true });
    await expect(service.issueMockRefund('other-payment', new Prisma.Decimal(118), 'return')).rejects.toThrow('another payment');
    expect(process).not.toHaveBeenCalled();
  });
  test('production and real providers remain blocked', async () => {
    for (const config of [{ NODE_ENV: 'production' }, { PAYMENT_MODE: 'stripe' }, { PAYMENT_MODE: 'paymob' }]) {
      const { service, process } = fixture(config);
      await expect(service.issueMockRefund('payment', new Prisma.Decimal(118), 'return')).rejects.toThrow('local Mock provider');
      expect(process).not.toHaveBeenCalled();
    }
  });
  test('nonpositive and over-capture amounts remain blocked', async () => {
    const { service, process } = fixture();
    await expect(service.issueMockRefund('payment', new Prisma.Decimal(0), 'return')).rejects.toThrow('positive');
    await expect(service.issueMockRefund('payment', new Prisma.Decimal(131), 'return')).rejects.toThrow('exceeds');
    expect(process).not.toHaveBeenCalled();
  });
});
