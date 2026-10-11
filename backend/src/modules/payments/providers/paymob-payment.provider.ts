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

interface PaymobIntentionResponse {
  id?: string;
  intention_order_id?: number | string;
  client_secret?: string;
  status?: string;
  confirmed?: boolean;
  detail?: string;
  message?: string;
}

type JsonObject = Record<string, unknown>;

@Injectable()
export class PaymobPaymentProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.PAYMOB;

  constructor(private readonly config: ConfigService) {}

  async createPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderCreatePaymentResult> {
    const secretKey = this.config.get<string>('PAYMOB_SECRET_KEY')?.trim();
    if (!secretKey) throw new ServiceUnavailableException('Paymob is not configured');

    const paymentMethods = this.paymentMethodIds();
    if (!paymentMethods.length) {
      throw new ServiceUnavailableException('Paymob payment methods are not configured');
    }

    const billing = input.order.billingAddress;
    const [firstName, ...lastParts] = (billing?.recipientName ?? 'ALTURA Customer')
      .trim()
      .split(/\s+/);
    const lastName = lastParts.join(' ') || 'Customer';
    const expirationSeconds = input.order.reservationExpiresAt
      ? Math.max(60, Math.floor((input.order.reservationExpiresAt.getTime() - Date.now()) / 1000))
      : 1800;

    const body = {
      amount: input.order.amountMinor,
      currency: input.order.currency.toUpperCase(),
      payment_methods: paymentMethods,
      billing_data: {
        apartment: billing?.line2 ?? 'NA',
        first_name: firstName || 'ALTURA',
        last_name: lastName,
        street: billing?.line1 ?? 'NA',
        building: 'NA',
        phone_number: billing?.phone ?? input.order.phone ?? 'NA',
        city: billing?.city ?? 'NA',
        country: billing?.countryCode ?? 'NA',
        email: input.order.email,
        floor: 'NA',
        state: billing?.region ?? 'NA',
        postal_code: billing?.postalCode ?? 'NA',
      },
      extras: {
        altura_order_id: input.order.id,
        altura_order_number: input.order.orderNumber,
        altura_payment_id: input.paymentId,
      },
      special_reference: `altura_${input.paymentId}`,
      expiration: expirationSeconds,
      notification_url: this.config.get<string>('PAYMOB_NOTIFICATION_URL'),
      redirection_url: this.config.get<string>('PAYMOB_REDIRECTION_URL'),
    };

    const baseUrl = this.config.get<string>('PAYMOB_BASE_URL', 'https://accept.paymob.com').replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/intention/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new BadGatewayException('Paymob could not be reached');
    }

    const payload = (await response.json().catch(() => ({}))) as PaymobIntentionResponse;
    if (!response.ok || !payload.id || !payload.client_secret) {
      throw new BadGatewayException(
        payload.detail ?? payload.message ?? 'Paymob payment initialization failed',
      );
    }

    return {
      providerPaymentId: payload.id,
      providerOrderId:
        payload.intention_order_id === undefined ? undefined : String(payload.intention_order_id),
      checkoutSecret: payload.client_secret,
      publicKey: this.config.get<string>('PAYMOB_PUBLIC_KEY')?.trim() || undefined,
      status: payload.confirmed ? PaymentStatus.PAID : PaymentStatus.REQUIRES_ACTION,
      metadata: {
        paymobStatus: payload.status ?? null,
        specialReference: `altura_${input.paymentId}`,
      },
    };
  }

  parseTransactionWebhook(body: unknown, hmac: string | undefined): {
    payload: JsonObject;
    event: ProviderWebhookEvent;
  } {
    const secret = this.config.get<string>('PAYMOB_HMAC_SECRET')?.trim();
    if (!secret) throw new ServiceUnavailableException('Paymob HMAC secret is not configured');
    if (!hmac) throw new UnauthorizedException('Missing Paymob hmac query parameter');
    if (!body || typeof body !== 'object') throw new UnauthorizedException('Malformed Paymob webhook');

    const payload = body as JsonObject;
    const obj = this.objectField(payload, 'obj');
    this.verifyHmac(obj, hmac, secret);

    const transactionId = this.stringValue(obj.id);
    const paymobOrder = this.objectField(obj, 'order');
    // Current Paymob transaction callbacks expose merchant_order_id on the
    // nested order object; accepting the top-level location as a compatibility
    // fallback keeps correlation resilient across callback variants.
    const merchantOrderId = this.stringValue(
      obj.merchant_order_id ?? paymobOrder.merchant_order_id,
    );
    const providerOrderId = this.stringValue(paymobOrder.id);
    const amountMinor = this.integerValue(obj.amount_cents);
    const currency = typeof obj.currency === 'string' ? obj.currency.toUpperCase() : undefined;
    const success = obj.success === true;
    const pending = obj.pending === true;
    const refunded = obj.is_refunded === true;
    const voided = obj.is_voided === true;

    let status: PaymentStatus;
    if (refunded) {
      // refunded_amount_cents is not part of Paymob's HMAC field list. The
      // service therefore refuses to change local refund state from this
      // callback until an authenticated cumulative amount is available.
      status = PaymentStatus.REFUNDED;
    } else if (voided) {
      status = PaymentStatus.CANCELLED;
    } else if (pending) {
      status = PaymentStatus.REQUIRES_ACTION;
    } else if (success) {
      status = PaymentStatus.PAID;
    } else {
      status = PaymentStatus.FAILED;
    }

    const externalEventId = [
      transactionId,
      String(pending),
      String(success),
      String(refunded),
      String(voided),
    ].join(':');

    return {
      payload,
      event: {
        provider: PaymentProvider.PAYMOB,
        externalEventId,
        eventType: 'TRANSACTION',
        merchantReference: merchantOrderId || undefined,
        providerOrderId,
        // Paymob's HMAC-authenticated obj.id is the transaction identifier.
        // It is not the intention id returned by the initialization call.
        providerTransactionId: transactionId,
        status,
        amountMinor,
        currency,
        failureReason: success ? undefined : this.paymobFailureReason(obj),
        occurredAt: typeof obj.created_at === 'string' ? new Date(obj.created_at) : undefined,
      },
    };
  }

  private verifyHmac(obj: JsonObject, receivedHmac: string, secret: string): void {
    const order = this.objectField(obj, 'order');
    const sourceData = this.objectField(obj, 'source_data');
    // Paymob's documented transaction HMAC field order (June 2026).
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
      order.id,
      obj.owner,
      obj.pending,
      sourceData.pan,
      sourceData.sub_type,
      sourceData.type,
      obj.success,
    ];
    const concatenated = values.map((value) => this.stringValue(value)).join('');
    const expected = createHmac('sha512', secret).update(concatenated).digest('hex');
    if (!/^[0-9a-f]{128}$/i.test(receivedHmac)) {
      throw new UnauthorizedException('Invalid Paymob HMAC');
    }
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(receivedHmac, 'hex');
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid Paymob HMAC');
    }
  }

  private paymentMethodIds(): number[] {
    const raw = this.config.get<string>('PAYMOB_PAYMENT_METHOD_IDS', '');
    return raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
  }

  private objectField(object: JsonObject, key: string): JsonObject {
    const value = object[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new UnauthorizedException(`Malformed Paymob webhook field: ${key}`);
    }
    return value as JsonObject;
  }

  private stringValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }

  private integerValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private paymobFailureReason(obj: JsonObject): string | undefined {
    const data = obj.data;
    if (!data || typeof data !== 'object') return 'Paymob transaction failed';
    const message = (data as JsonObject).message;
    return typeof message === 'string' ? message.slice(0, 500) : 'Paymob transaction failed';
  }
}
