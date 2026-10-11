import {
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser, AuthenticatedRequest } from '../../common/auth/auth-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { GuestSessionService } from '../../common/security/guest-session.service';
import { CookieResponse } from '../../common/security/refresh-cookie.service';
import { CommerceSessionService } from './commerce-session.service';

@ApiTags('commerce-session')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('commerce-session')
export class CommerceSessionController {
  constructor(
    private readonly sessions: CommerceSessionService,
    private readonly guestSession: GuestSessionService,
  ) {}

  @Post('merge')
  async merge(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const rawGuestToken = this.guestSession.read(request);
    if (!rawGuestToken) {
      return {
        merged: false,
        cart: { hadGuestCart: false, mergedLines: 0, adjustedLines: 0, skippedLines: 0 },
        wishlist: { hadGuestWishlist: false, addedItems: 0, skippedItems: 0 },
      };
    }

    const result = await this.sessions.merge(user.id, this.guestSession.hash(rawGuestToken));
    if (!result.cart.currencyConflict) {
      this.guestSession.clear(response);
    }
    return result;
  }
}
