import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CommerceOwner } from '../carts/cart.types';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@UseGuards(OptionalJwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(
    private readonly wishlist: WishlistService,
    private readonly guestSession: GuestSessionService,
  ) {}

  @Get()
  get(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    return this.wishlist.get(this.owner(request, response));
  }

  @Post('items')
  add(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Body() dto: AddWishlistItemDto,
  ) {
    return this.wishlist.add(this.owner(request, response), dto);
  }

  @Delete('items/:productId')
  remove(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.remove(this.owner(request, response), productId);
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
