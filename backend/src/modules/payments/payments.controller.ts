import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../../common/auth/auth-user';
import { OptionalJwtAuthGuard } from '../../common/auth/optional-jwt-auth.guard';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { MockPaymentOutcomeDto } from './dto/mock-payment-outcome.dto';
import { PaymentsService } from './payments.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';

interface RawWebhookRequest {
  rawBody?: Buffer;
  body: unknown;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('initialize')
  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @RateLimit('payment-initialize')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique 8-128 character key generated once per payment initialization attempt',
  })
  initialize(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: InitializePaymentDto,
  ) {
    const key = idempotencyKey?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new BadRequestException('Idempotency-Key header must be 8-128 safe characters');
    }
    return this.payments.initialize(request.user?.id, dto, key);
  }

  @Post('mock/:paymentId/complete')
  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @RateLimit('mock-payment-complete')
  completeMock(
    @Req() request: AuthenticatedRequest,
    @Param('paymentId') paymentId: string,
    @Body() dto: MockPaymentOutcomeDto,
  ) {
    return this.payments.completeMock(paymentId, dto, request.user?.id, dto.email);
  }

  @Post('webhooks/stripe')
  stripeWebhook(
    @Req() request: RawWebhookRequest,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Raw request body is required for Stripe signature verification');
    }
    return this.payments.handleStripeWebhook(request.rawBody, signature);
  }

  @Post('webhooks/paymob')
  paymobWebhook(
    @Body() body: unknown,
    @Query('hmac') hmac: string | undefined,
  ) {
    return this.payments.handlePaymobWebhook(body, hmac);
  }
}
