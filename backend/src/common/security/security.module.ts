import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { JwtTokenService } from './jwt-token.service';
import { PasswordService } from './password.service';
import { RefreshCookieService } from './refresh-cookie.service';
import { GuestSessionService } from './guest-session.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    PasswordService,
    JwtTokenService,
    RefreshCookieService,
    JwtAuthGuard,
    RolesGuard,
    OptionalJwtAuthGuard,
    RateLimitGuard,
    RateLimitService,
    GuestSessionService,
  ],
  exports: [
    PasswordService,
    JwtTokenService,
    RefreshCookieService,
    JwtAuthGuard,
    RolesGuard,
    OptionalJwtAuthGuard,
    GuestSessionService,
    RateLimitGuard,
    RateLimitService,
  ],
})
export class SecurityModule {}
