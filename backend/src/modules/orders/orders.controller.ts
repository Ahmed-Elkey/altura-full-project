import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { GuestOrderLookupDto } from './dto/guest-order-lookup.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrdersService } from './orders.service';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('guest/lookup')
  @UseGuards(RateLimitGuard)
  @RateLimit('guest-order-lookup')
  lookupGuest(@Body() dto: GuestOrderLookupDto) {
    return this.orders.lookupGuest(dto);
  }

  @Post('maintenance/release-expired')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  releaseExpired() {
    return this.orders.releaseExpiredReservations();
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQueryDto) {
    return this.orders.listForUser(user.id, query);
  }

  @Get(':orderNumber')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: AuthUser, @Param('orderNumber') orderNumber: string) {
    return this.orders.getForUser(user.id, orderNumber);
  }
}
