import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';
import { CreateReturnDto } from './dto/create-return.dto';
import { GuestCreateReturnDto } from './dto/guest-create-return.dto';
import { ReturnsService } from './returns.service';

@ApiTags('returns')
@ApiBearerAuth()
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser) {
    return this.returns.listForUser(user.id);
  }

  @Get(':returnId')
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: AuthUser, @Param('returnId') returnId: string) {
    return this.returns.getForUser(user.id, returnId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user.id, dto);
  }

  @Post('guest')
  @UseGuards(RateLimitGuard)
  @RateLimit('guest-order-lookup')
  createGuest(@Body() dto: GuestCreateReturnDto) {
    return this.returns.createForGuest(dto);
  }
}
