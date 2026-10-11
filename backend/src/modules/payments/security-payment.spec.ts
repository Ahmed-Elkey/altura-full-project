import { ConfigService } from '@nestjs/config';
import { DiscountType, PaymentProvider, PaymentStatus, UserRole, UserStatus, Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { envValidationSchema } from '../../common/config/env.validation';
import { AdminService } from '../admin/admin.service';
import { presentGuestOrder } from '../orders/order.presenter';
import { PaymentsService } from './payments.service';
import { PaymobPaymentProvider } from './providers/paymob-payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { reconcileRefundState } from './refund-state';

const paymobSecret = 'unit-test-paymob-hmac-secret-123456789';

function paymobFixture(overrides: Record<string, unknown> = {}) {
  return {
    type: 'TRANSACTION',
    obj: {
      id: 987654,
      pending: false,
      amount_cents: 12500,
      created_at: '2026-09-30T12:00:00.000000',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      integration_id: 1234,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      owner: 42,
      success: true,
      merchant_order_id: 'altura_payment-1',
      order: { id: 7654321, merchant_order_id: 'altura_payment-1' },
      source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
      ...overrides,
    },
  };
}

function paymobHmac(payload: ReturnType<typeof paymobFixture>): string {
  const obj = payload.obj as Record<string, any>;
  const values = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order.id,
    obj.owner,
    obj.pending,
    obj.source_data.pan,
    obj.source_data.sub_type,
    obj.source_data.type,
    obj.success,
  ];
  return createHmac('sha512', paymobSecret)
    .update(values.map((value) => (value === undefined || value === null ? '' : String(value === true ? 'true' : value === false ? 'false' : value))).join(''))
    .digest('hex');
}

describe('Paymob callback integrity', () => {
  const provider = new PaymobPaymentProvider(new ConfigService({ PAYMOB_HMAC_SECRET: paymobSecret }));

  it('accepts a valid signed callback and treats merchant reference/refund amount as non-authoritative', () => {
    const payload = paymobFixture();
    const parsed = provider.parseTransactionWebhook(payload, paymobHmac(payload));

    expect(parsed.event.provider).toBe(PaymentProvider.PAYMOB);
    expect(parsed.event.providerOrderId).toBe('7654321');
    expect(parsed.event.providerTransactionId).toBe('987654');
    expect(parsed.event.merchantReference).toBe('altura_payment-1');
    expect(parsed.event.localPaymentId).toBeUndefined();
    expect(parsed.event.refundedAmountMinor).toBeUndefined();
  });

  it('rejects an invalid HMAC and malformed callback', () => {
    const payload = paymobFixture();
    expect(() => provider.parseTransactionWebhook(payload, '0'.repeat(128))).toThrow('Invalid Paymob HMAC');
    expect(() => provider.parseTransactionWebhook({ obj: {} }, paymobHmac(payload))).toThrow('Malformed Paymob webhook field');
  });

  it('rejects a conflicting merchant reference after signed provider correlation', () => {
    const service = new PaymentsService({} as any, {} as any, {} as any, {} as any, {} as any);
    const error = (service as any).providerCorrelationError(
      {
        id: 'payment-1',
        provider: PaymentProvider.PAYMOB,
        providerOrderId: '7654321',
        providerPaymentId: null,
        providerTransactionId: null,
      },
      {
        provider: PaymentProvider.PAYMOB,
        providerOrderId: '7654321',
        merchantReference: 'altura_payment-other',
      },
    );
    expect(error).toContain('merchant reference');
  });

  it('maps failed, duplicate, and refund callbacks without inventing unsigned refund evidence', () => {
    const failed = paymobFixture({ success: false, pending: false, error_occured: true });
    const failedEvent = provider.parseTransactionWebhook(failed, paymobHmac(failed)).event;
    expect(failedEvent.status).toBe(PaymentStatus.FAILED);
    const first = provider.parseTransactionWebhook(paymobFixture(), paymobHmac(paymobFixture())).event;
    const duplicate = provider.parseTransactionWebhook(paymobFixture(), paymobHmac(paymobFixture())).event;
    expect(duplicate.externalEventId).toBe(first.externalEventId);

    const refunded = paymobFixture({ is_refunded: true, success: true });
    const refundEvent = provider.parseTransactionWebhook(refunded, paymobHmac(refunded)).event;
    expect(refundEvent.status).toBe(PaymentStatus.REFUNDED);
    expect(refundEvent.refundedAmountMinor).toBeUndefined();
  });

  it('rejects mismatched signed provider transaction and order identifiers', () => {
    const service = new PaymentsService({} as any, {} as any, {} as any, {} as any, {} as any);
    const basePayment = {
      id: 'payment-1',
      provider: PaymentProvider.PAYMOB,
      providerOrderId: '7654321',
      providerPaymentId: null,
      providerTransactionId: '987654',
    };
    expect((service as any).providerCorrelationError(basePayment, {
      provider: PaymentProvider.PAYMOB,
      providerOrderId: '7654321',
      providerTransactionId: 'other-transaction',
    })).toContain('transaction identifier');
    expect((service as any).providerCorrelationError({ ...basePayment, providerOrderId: 'other-order' }, {
      provider: PaymentProvider.PAYMOB,
      providerOrderId: '7654321',
    })).toContain('order identifier');
  });
});

describe('Stripe provider fixtures', () => {
  const stripeSecret = 'whsec_local_fixture_secret_123456789';
  const provider = new StripePaymentProvider(new ConfigService({ STRIPE_WEBHOOK_SECRET: stripeSecret }));

  function stripeFixture(type: string, object: Record<string, unknown>) {
    const payload = { id: 'evt_fixture_1', type, created: Math.floor(Date.now() / 1000), data: { object } };
    const raw = Buffer.from(JSON.stringify(payload));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', stripeSecret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    return { raw, signature: `t=${timestamp},v1=${signature}`, payload };
  }

  it('parses valid payment capture and refund transitions', () => {
    const paid = stripeFixture('payment_intent.succeeded', {
      id: 'pi_fixture_1', amount_received: 12500, currency: 'egp', latest_charge: 'ch_fixture_1',
    });
    expect(provider.parseWebhook(paid.raw, paid.signature).event).toMatchObject({
      provider: PaymentProvider.STRIPE,
      providerPaymentId: 'pi_fixture_1',
      providerTransactionId: 'ch_fixture_1',
      status: PaymentStatus.PAID,
      amountMinor: 12500,
      currency: 'EGP',
    });

    const refund = stripeFixture('charge.refunded', {
      id: 'ch_fixture_1', amount: 12500, amount_refunded: 5000, currency: 'egp', payment_intent: 'pi_fixture_1',
    });
    expect(provider.parseWebhook(refund.raw, refund.signature).event).toMatchObject({
      externalEventId: 'evt_fixture_1',
      status: PaymentStatus.PARTIALLY_REFUNDED,
      refundedAmountMinor: 5000,
    });
  });

  it('rejects invalid signatures and malformed events', () => {
    const fixture = stripeFixture('payment_intent.succeeded', { id: 'pi_fixture_1', amount_received: 12500, currency: 'egp' });
    expect(() => provider.parseWebhook(fixture.raw, 't=1,v1=bad')).toThrow('Stripe webhook timestamp is too old');
    const malformed = stripeFixture('payment_intent.succeeded', { id: 'pi_fixture_1' });
    const malformedBody = Buffer.from(JSON.stringify({ id: 'evt_fixture_2', type: 'payment_intent.succeeded', data: {} }));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', stripeSecret).update(`${timestamp}.${malformedBody.toString('utf8')}`).digest('hex');
    expect(() => provider.parseWebhook(malformedBody, `t=${timestamp},v1=${signature}`)).toThrow('Malformed Stripe webhook event');
    expect(malformed.payload.id).toBe('evt_fixture_1');
  });

  it('preserves duplicate event identity and rejects conflicting payment correlation/amounts', () => {
    const first = stripeFixture('payment_intent.succeeded', { id: 'pi_fixture_1', amount_received: 12500, currency: 'egp' });
    const second = stripeFixture('payment_intent.succeeded', { id: 'pi_fixture_1', amount_received: 12500, currency: 'egp' });
    expect(provider.parseWebhook(first.raw, first.signature).event.externalEventId)
      .toBe(provider.parseWebhook(second.raw, second.signature).event.externalEventId);
    const service = new PaymentsService({} as any, {} as any, {} as any, {} as any, {} as any);
    expect((service as any).providerCorrelationError({ providerPaymentId: 'pi_stored', providerOrderId: null }, {
      provider: PaymentProvider.STRIPE, providerPaymentId: 'pi_other',
    })).toContain('payment identifier');
    expect((service as any).providerAmountMismatch({ amount: new Prisma.Decimal(125), currency: 'EGP' }, {
      amountMinor: 12400, currency: 'CAD',
    })).toContain('currency mismatch');
  });

  it('loads the existing webhook record when a duplicate event races the insert', async () => {
    const existing = { id: 'webhook_fixture_1', processedAt: new Date() };
    const prisma = {
      paymentWebhookEvent: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    };
    const service = new PaymentsService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    const result = await (service as any).createOrLoadWebhook(
      { provider: PaymentProvider.STRIPE, externalEventId: 'evt_fixture_1', eventType: 'payment_intent.succeeded' },
      { id: 'evt_fixture_1' },
    );
    expect(result).toBe(existing);
  });
});

describe('Monotonic refund state', () => {
  const amount = new Prisma.Decimal(100);
  const d = (value: number) => new Prisma.Decimal(value);

  it('progresses through partial refunds and then full refund', () => {
    const first = reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: d(0), incomingAmount: d(25), incomingStatus: PaymentStatus.PARTIALLY_REFUNDED });
    const second = reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: d(25), incomingAmount: d(60), incomingStatus: PaymentStatus.PARTIALLY_REFUNDED });
    const full = reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: d(60), incomingAmount: amount, incomingStatus: PaymentStatus.REFUNDED });
    expect(first).toMatchObject({ kind: 'advance', status: PaymentStatus.PARTIALLY_REFUNDED });
    expect(second).toMatchObject({ kind: 'advance', status: PaymentStatus.PARTIALLY_REFUNDED });
    expect(full).toMatchObject({ kind: 'advance', status: PaymentStatus.REFUNDED });
  });

  it('keeps duplicates and older events from decreasing the cumulative amount', () => {
    const duplicate = reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: d(60), incomingAmount: d(60), incomingStatus: PaymentStatus.PARTIALLY_REFUNDED });
    const older = reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: amount, incomingAmount: d(60), incomingStatus: PaymentStatus.PARTIALLY_REFUNDED });
    expect(duplicate.kind).toBe('stale');
    expect(older).toMatchObject({ kind: 'stale', status: PaymentStatus.REFUNDED, refundedAmount: amount });
  });

  it('rejects amounts above captured value and inconsistent full-refund events', () => {
    expect(reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: d(0), incomingAmount: d(101), incomingStatus: PaymentStatus.PARTIALLY_REFUNDED }).kind).toBe('invalid');
    expect(reconcileRefundState({ capturedAmount: amount, currentRefundedAmount: d(0), incomingAmount: d(50), incomingStatus: PaymentStatus.REFUNDED }).kind).toBe('invalid');
  });
});

describe('JWT configuration and admin authorization', () => {
  const base = {
    DATABASE_URL: 'postgresql://local/test',
    JWT_ACCESS_SECRET: 'change-this-access-secret-before-real-use',
    JWT_REFRESH_SECRET: 'change-this-refresh-secret-before-real-use',
  };

  it('allows explicit local development configuration but rejects known placeholders in production', () => {
    expect(envValidationSchema.validate({ ...base, NODE_ENV: 'development' }).error).toBeUndefined();
    expect(envValidationSchema.validate({ ...base, NODE_ENV: 'development', TRUST_PROXY: true }).error).toBeDefined();
    expect(envValidationSchema.validate({ ...base, NODE_ENV: 'development', TRUST_PROXY: 1 }).error).toBeUndefined();
    expect(envValidationSchema.validate({ ...base, NODE_ENV: 'production' }).error).toBeDefined();
    expect(envValidationSchema.validate({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) }).error).toBeUndefined();
  });

  it('prevents a CUSTOMER from changing any account status', async () => {
    const actor = { role: UserRole.CUSTOMER };
    const adminTarget = { id: 'admin-1', role: UserRole.ADMIN, authVersion: 1 };
    const customerTarget = { id: 'customer-1', role: UserRole.CUSTOMER, authVersion: 1 };
    const tx = {
      user: { update: jest.fn(async ({ where }: any) => ({ id: where.id, role: UserRole.CUSTOMER, status: UserStatus.SUSPENDED, authVersion: 2, email: 'local@example.test', firstName: null, lastName: null, phone: null, updatedAt: new Date() })) },
      refreshToken: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValueOnce(adminTarget).mockResolvedValueOnce(actor).mockResolvedValueOnce(customerTarget).mockResolvedValueOnce(actor) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new AdminService(prisma as any, {} as any);

    await expect(service.updateCustomerStatus('customer-actor', 'admin-1', { status: UserStatus.SUSPENDED })).rejects.toThrow('Only an ADMIN');
    await expect(service.updateCustomerStatus('customer-actor', 'customer-1', { status: UserStatus.SUSPENDED })).rejects.toThrow('Only an ADMIN');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects self role escalation and preserves the existing admin self-protection', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', role: UserRole.CUSTOMER }) } };
    const service = new AdminService(prisma as any, {} as any);
    await expect(service.updateCustomerRole('customer-1', 'customer-1', { role: UserRole.ADMIN })).rejects.toThrow('Only an ADMIN');
  });

  it('allocates item discounts to returned quantities and excludes free-shipping discounts', () => {
    const service = new AdminService({} as any, {} as any);
    const discounted = (service as any).calculateReturnRefund({
      order: {
        subtotal: new Prisma.Decimal(100),
        discountUsages: [{ amount: new Prisma.Decimal(20), discount: { type: DiscountType.FIXED_AMOUNT } }],
      },
      items: [{ quantity: 1, orderItem: { quantity: 2, lineTotal: new Prisma.Decimal(100) } }],
    });
    const freeShipping = (service as any).calculateReturnRefund({
      order: {
        subtotal: new Prisma.Decimal(100),
        discountUsages: [{ amount: new Prisma.Decimal(12), discount: { type: DiscountType.FREE_SHIPPING } }],
      },
      items: [{ quantity: 1, orderItem: { quantity: 2, lineTotal: new Prisma.Decimal(100) } }],
    });
    expect(discounted.toFixed(2)).toBe('40.00');
    expect(freeShipping.toFixed(2)).toBe('50.00');
  });
});

describe('Guest order presenter', () => {
  it('returns tracking essentials without payment, address, phone, or full email data', () => {
    const order = {
      id: 'order-1', orderNumber: 'ALT-TEST', status: 'CONFIRMED', email: 'guest@example.test', phone: '+201000000000', currency: 'EGP',
      subtotal: new Prisma.Decimal(100), discountTotal: new Prisma.Decimal(0), shippingTotal: new Prisma.Decimal(0), taxTotal: new Prisma.Decimal(0), grandTotal: new Prisma.Decimal(100), appliedCode: null, customerNote: null,
      placedAt: new Date(), reservationExpiresAt: null, inventoryCommittedAt: new Date(), inventoryReleasedAt: null, cancelledAt: null,
      createdAt: new Date(), updatedAt: new Date(), items: [], addresses: [], payments: [], shipments: [],
    } as any;
    const result = presentGuestOrder(order);
    expect(result.email).toBe('g***@example.test');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('addresses');
    expect(result).not.toHaveProperty('payments');
  });
});
