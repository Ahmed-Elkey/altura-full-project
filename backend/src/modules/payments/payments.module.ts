import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PaymobPaymentProvider } from './providers/paymob-payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPaymentProvider,
    StripePaymentProvider,
    PaymobPaymentProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
