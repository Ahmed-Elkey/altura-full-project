import { Injectable } from '@nestjs/common';
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  PaymentProviderAdapter,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
} from '../payment.types';

@Injectable()
export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.MOCK;

  async createPayment(
    input: ProviderCreatePaymentInput,
  ): Promise<ProviderCreatePaymentResult> {
    return {
      providerPaymentId: `mock_pi_${input.paymentId}`,
      checkoutSecret: `mock_secret_${randomBytes(20).toString('hex')}`,
      status: PaymentStatus.REQUIRES_ACTION,
      metadata: {
        localOnly: true,
        orderNumber: input.order.orderNumber,
      },
    };
  }
}
