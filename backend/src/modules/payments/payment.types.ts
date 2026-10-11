import { PaymentProvider, PaymentStatus } from '@prisma/client';

export interface ProviderCreatePaymentInput {
  paymentId: string;
  order: {
    id: string;
    orderNumber: string;
    email: string;
    phone: string | null;
    amountMinor: number;
    amountDecimal: string;
    currency: string;
    reservationExpiresAt: Date | null;
    items: Array<{
      name: string;
      description: string;
      unitAmountMinor: number;
      quantity: number;
    }>;
    billingAddress: {
      recipientName: string;
      phone: string | null;
      line1: string;
      line2: string | null;
      city: string;
      region: string | null;
      postalCode: string | null;
      countryCode: string;
    } | null;
  };
}

export interface ProviderCreatePaymentResult {
  providerPaymentId: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  checkoutSecret?: string;
  checkoutUrl?: string;
  publicKey?: string;
  status: PaymentStatus;
  metadata?: Record<string, unknown>;
}

export interface ProviderWebhookEvent {
  provider: PaymentProvider;
  externalEventId: string;
  eventType: string;
  localPaymentId?: string;
  /** Provider merchant reference. It is only a consistency hint until a signed provider identifier has correlated the payment. */
  merchantReference?: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  providerTransactionId?: string;
  status: PaymentStatus;
  amountMinor?: number;
  refundedAmountMinor?: number;
  currency?: string;
  failureReason?: string;
  occurredAt?: Date;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createPayment(input: ProviderCreatePaymentInput): Promise<ProviderCreatePaymentResult>;
}
