import { PasswordRecoveryService } from './password-recovery.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-recovery.dto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser, AuthenticatedRequest } from '../../common/auth/auth-user';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CookieResponse, RefreshCookieService } from '../../common/security/refresh-cookie.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { RateLimitGuard } from '../../common/security/rate-limit.guard';
import { DemoLoginService } from './demo-login.service';
import { DemoLoginDto } from './dto/demo-login.dto';


@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recovery: PasswordRecoveryService,
    private readonly refreshCookie: RefreshCookieService,
    private readonly demo: DemoLoginService,
  ) {}

  @Get('demo')
  demoAvailability() { return this.demo.availability(); }

  @Post('demo-login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('auth-login')
  async demoLogin(@Body() dto: DemoLoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.demo.login(dto.role, this.sessionMetadata(request));
    if (result.refreshToken) this.refreshCookie.set(response, result.refreshToken, result.refreshTokenExpiresAt);
    return this.authResponseBody(result);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('password-recovery')
  forgotPassword(@Body() dto: ForgotPasswordDto) { return this.recovery.request(dto.email); }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit('password-reset')
  resetPassword(@Body() dto: ResetPasswordDto) { return this.recovery.reset(dto.token, dto.password); }

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit('auth-register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.register(dto, this.sessionMetadata(request));
    if (result.refreshToken) {
      this.refreshCookie.set(response, result.refreshToken, result.refreshTokenExpiresAt);
    }
    return this.authResponseBody(result);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit('auth-login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.login(dto, this.sessionMetadata(request));
    if (result.refreshToken) {
      this.refreshCookie.set(response, result.refreshToken, result.refreshTokenExpiresAt);
    }
    return this.authResponseBody(result);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit('auth-refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const refreshToken = dto?.refreshToken ?? this.readCookie(request, this.refreshCookie.name);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const result = await this.authService.refresh(refreshToken, this.sessionMetadata(request));
    if (result.refreshToken) {
      this.refreshCookie.set(response, result.refreshToken, result.refreshTokenExpiresAt);
    }
    return this.authResponseBody(result);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Body() dto: LogoutDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    const refreshToken = dto?.refreshToken ?? this.readCookie(request, this.refreshCookie.name);
    await this.authService.logout(refreshToken, this.getClientIp(request));
    this.refreshCookie.clear(response);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const revokedSessions = await this.authService.logoutAll(user.id, this.getClientIp(request));
    this.refreshCookie.clear(response);
    return { revokedSessions };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  private authResponseBody<T extends { refreshToken?: string }>(result: T): T | Omit<T, 'refreshToken'> {
    if (this.refreshCookie.exposeInBody) {
      return result;
    }

    const { refreshToken: _refreshToken, ...safeResult } = result;
    return safeResult;
  }

  private sessionMetadata(request: AuthenticatedRequest) {
    return {
      ipAddress: this.getClientIp(request),
      userAgent: this.getHeader(request, 'user-agent')?.slice(0, 512),
    };
  }

  private getClientIp(request: AuthenticatedRequest): string | undefined {
    return request.ip?.slice(0, 128);
  }

  private getHeader(request: AuthenticatedRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private readCookie(request: AuthenticatedRequest, name: string): string | undefined {
    const rawCookie = this.getHeader(request, 'cookie');
    if (!rawCookie) {
      return undefined;
    }

    for (const pair of rawCookie.split(';')) {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex < 0) continue;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (key === name) {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    }

    return undefined;
  }
}
