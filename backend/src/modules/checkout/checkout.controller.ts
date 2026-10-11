import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../../common/auth/auth-user';
import { OptionalJwtAuthGuard } from '../../common/auth/optional-jwt-auth.guard';
import { GuestSessionService } from '../../common/security/guest-session.service';
import { CookieResponse } from '../../common/security/refresh-cookie.service';
import { CommerceOwner } from '../carts/cart.types';
import { CheckoutService } from './checkout.service';
import { CheckoutQuoteDto } from './dto/checkout-quote.dto';
import { CheckoutShippingMethodsDto } from './dto/checkout-shipping-methods.dto';
import { PlaceOrderDto } from './dto/place-order.dto';

@ApiTags('checkout')
@ApiBearerAuth()
@UseGuards(OptionalJwtAuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly guestSession: GuestSessionService,
  ) {}

  @Post('shipping-methods')
  shippingMethods(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Body() dto: CheckoutShippingMethodsDto,
  ) {
    return this.checkout.shippingMethods(this.owner(request, response), dto.countryCode);
  }

  @Post('quote')
  quote(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Body() dto: CheckoutQuoteDto,
  ) {
    return this.checkout.quote(this.owner(request, response), dto);
  }

  @Post('place-order')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique 8-128 character key generated once per checkout submission',
  })
  placeOrder(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PlaceOrderDto,
  ) {
    const key = idempotencyKey?.trim();
    if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new BadRequestException('Idempotency-Key header must be 8-128 safe characters');
    }
    return this.checkout.placeOrder(this.owner(request, response), dto, key);
  }

  private owner(request: AuthenticatedRequest, response: CookieResponse): CommerceOwner {
    if (request.user) return { userId: request.user.id };
    const guest = this.guestSession.getOrCreate(request, response);
    return { sessionId: guest.sessionHash, expiresAt: guest.expiresAt };
  }
}
