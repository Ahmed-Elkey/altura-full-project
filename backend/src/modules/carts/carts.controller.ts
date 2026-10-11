import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../../common/auth/auth-user';
import { OptionalJwtAuthGuard } from '../../common/auth/optional-jwt-auth.guard';
import { GuestSessionService } from '../../common/security/guest-session.service';
import { CookieResponse } from '../../common/security/refresh-cookie.service';
import { CommerceOwner } from './cart.types';
import { CartsService } from './carts.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartsController {
  constructor(
    private readonly carts: CartsService,
    private readonly guestSession: GuestSessionService,
  ) {}

  @Get()
  get(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.carts.get(this.owner(request, response));
  }

  @Post('items')
  addItem(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Body() dto: AddCartItemDto,
  ) {
    return this.carts.addItem(this.owner(request, response), dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.carts.updateItem(this.owner(request, response), itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Param('itemId') itemId: string,
  ) {
    return this.carts.removeItem(this.owner(request, response), itemId);
  }

  @Delete()
  clear(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.carts.clear(this.owner(request, response));
  }

  @Post('validate')
  validate(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.carts.validate(this.owner(request, response));
  }

  private owner(request: AuthenticatedRequest, response: CookieResponse): CommerceOwner {
    if (request.user) {
      return { userId: request.user.id };
    }

    const guest = this.guestSession.getOrCreate(request, response);
    return {
      sessionId: guest.sessionHash,
      expiresAt: guest.expiresAt,
    };
  }
}
