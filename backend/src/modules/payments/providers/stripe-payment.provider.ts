import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentProviderAdapter,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderWebhookEvent,
} from '../payment.types';

interface StripePaymentIntentResponse {
  id?: string;
  client_secret?: string | null;
  status?: string;
  error?: { message?: string };
}

interface StripeEventEnvelope {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: Record<string, unknown> };
}

@Injectable()
export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.STRIPE;

  constructor(private readonly config: ConfigService) {}

  async createPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderCreatePaymentResult> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    if (!secretKey) throw new ServiceUnavailableException('Stripe is not configured');

    const body = new URLSearchParams();
    body.set('amount', String(input.order.amountMinor));
    body.set('currency', input.order.currency.toLowerCase());
    body.set('automatic_payment_methods[enabled]', 'true');
    body.set('receipt_email', input.order.email);
    body.set('description', `ALTURA ${input.order.orderNumber}`);
    body.set('metadata[altura_order_id]', input.order.id);
    body.set('metadata[altura_order_number]', input.order.orderNumber);
    body.set('metadata[altura_payment_id]', input.paymentId);

    let response: Response;
    try {
      response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `altura-payment-${input.paymentId}`,
        },
        body,
      });
    } catch {
      throw new BadGatewayException('Stripe could not be reached');
    }

    const payload = (await response.json().catch(() => ({}))) as StripePaymentIntentResponse;
    if (!response.ok || !payload.id) {
      throw new BadGatewayException(payload.error?.message ?? 'Stripe payment initialization failed');
    }

    return {
      providerPaymentId: payload.id,
      checkoutSecret: payload.client_secret ?? undefined,
      status: this.mapIntentStatus(payload.status),
      metadata: { stripeStatus: payload.status ?? null },
    };
  }

  parseWebhook(rawBody: Buffer, signatureHeader: string | undefined): {
    payload: StripeEventEnvelope;
    event: ProviderWebhookEvent;
  } {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim();
    if (!secret) throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    if (!signatureHeader) throw new UnauthorizedException('Missing Stripe-Signature header');

    this.verifySignature(rawBody, signatureHeader, secret);

    let payload: StripeEventEnvelope;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as StripeEventEnvelope;
    } catch {
      throw new UnauthorizedException('Invalid Stripe webhook payload');
    }

    if (!payload.id || !payload.type || !payload.data?.object) {
      throw new UnauthorizedException('Malformed Stripe webhook event');
    }

    const object = payload.data.object;
    const paymentIntentId =
      typeof object.id === 'string' && payload.type.startsWith('payment_intent.')
        ? object.id
        : typeof object.payment_intent === 'string'
          ? object.payment_intent
          : undefined;

    const amountMinor = this.numberField(
      object,
      payload.type === 'payment_intent.succeeded' ? 'amount_received' : 'amount',
    );
    const refundedAmountMinor = payload.type === 'charge.refunded'
      ? this.numberField(object, 'amount_refunded')
      : undefined;
    const currency = typeof object.currency === 'string' ? object.currency.toUpperCase() : undefined;
    const failureReason = this.failureReason(object);

    return {
      payload,
      event: {
        provider: PaymentProvider.STRIPE,
        externalEventId: payload.id,
        eventType: payload.type,
        providerPaymentId: paymentIntentId,
        providerTransactionId:
          typeof object.latest_charge === 'string'
            ? object.latest_charge
            : typeof object.id === 'string' && payload.type.startsWith('charge.')
              ? object.id
              : undefined,
        status: this.mapEventStatus(payload.type, object),
        amountMinor,
        refundedAmountMinor,
        currency,
        failureReason,
        occurredAt: payload.created ? new Date(payload.created * 1000) : undefined,
      },
    };
  }

  private verifySignature(rawBody: Buffer, header: string, secret: string): void {
    const values = header.split(',').map((part) => part.trim());
    const timestamp = values.find((part) => part.startsWith('t='))?.slice(2);
    const signatures = values
      .filter((part) => part.startsWith('v1='))
      .map((part) => part.slice(3));

    if (!timestamp || signatures.length === 0) {
      throw new UnauthorizedException('Malformed Stripe-Signature header');
    }

    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber)) throw new UnauthorizedException('Invalid Stripe timestamp');
    const ageSeconds = Math.abs(Date.now() / 1000 - timestampNumber);
    if (ageSeconds > 300) throw new UnauthorizedException('Stripe webhook timestamp is too old');

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const valid = signatures.some((signature) => {
      if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
      const received = Buffer.from(signature, 'hex');
      return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
    });
    if (!valid) throw new UnauthorizedException('Invalid Stripe webhook signature');
  }

  private mapIntentStatus(status?: string): PaymentStatus {
    if (status === 'succeeded') return PaymentStatus.PAID;
    if (status === 'canceled') return PaymentStatus.CANCELLED;
    if (status === 'requires_action' || status === 'processing' || status === 'requires_confirmation') {
      return PaymentStatus.REQUIRES_ACTION;
    }
    return PaymentStatus.PENDING;
  }

  private mapEventStatus(type: string, object: Record<string, unknown>): PaymentStatus {
    switch (type) {
      case 'payment_intent.succeeded':
        return PaymentStatus.PAID;
      case 'payment_intent.payment_failed':
        return PaymentStatus.FAILED;
      case 'payment_intent.canceled':
        return PaymentStatus.CANCELLED;
      case 'charge.refunded': {
        const refunded = this.numberField(object, 'amount_refunded') ?? 0;
        const amount = this.numberField(object, 'amount') ?? 0;
        return refunded >= amount && amount > 0
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;
      }
      default:
        return PaymentStatus.REQUIRES_ACTION;
    }
  }

  private numberField(object: Record<string, unknown>, key: string): number | undefined {
    const value = object[key];
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
  }

  private failureReason(object: Record<string, unknown>): string | undefined {
    const error = object.last_payment_error;
    if (!error || typeof error !== 'object') return undefined;
    const message = (error as Record<string, unknown>).message;
    return typeof message === 'string' ? message.slice(0, 500) : undefined;
  }
}
