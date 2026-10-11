import {
  Body,
  Req,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthUser, AuthenticatedRequest } from "../../common/auth/auth-user";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/auth/optional-jwt-auth.guard";
import { Roles } from "../../common/auth/roles.decorator";
import { RolesGuard } from "../../common/auth/roles.guard";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../../common/security/rate-limit.guard";
import {
  CreateSupportDto,
  SupportAccessDto,
  SupportListDto,
  SupportRecoverDto,
  SupportReplyDto,
  SupportStatusDto,
  SupportReadDto,
} from "./dto/support.dto";
import { SupportService } from "./support.service";
@Injectable()
export class SupportPrivateInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse();
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("Referrer-Policy", "no-referrer");
    return next.handle();
  }
}
@Controller("support")
@UseInterceptors(SupportPrivateInterceptor)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Post()
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @RateLimit("support-create")
  create(@Body() dto: CreateSupportDto, @Req() request: AuthenticatedRequest) {
    return this.support.create(dto, request.user);
  }
  @Post(":id/access")
  @UseGuards(RateLimitGuard)
  @RateLimit("support-access")
  access(@Param("id") id: string, @Body() dto: SupportAccessDto) {
    return this.support.exchange(id, dto.token);
  }
  @Post(":id/recover")
  @UseGuards(RateLimitGuard)
  @RateLimit("support-recover")
  recover(@Param("id") id: string, @Body() dto: SupportRecoverDto) {
    return this.support.recover(id, dto.email);
  }
  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Query() query: SupportListDto, @CurrentUser() user: AuthUser) {
    return this.support.listCustomer(query, user);
  }
  @Get("me/:id")
  @UseGuards(JwtAuthGuard)
  customerDetail(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.support.detailCustomer(id, user);
  }
  @Post("me/:id/replies")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit("support-reply")
  customerReply(
    @Param("id") id: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.replyCustomer(id, dto, user);
  }
  @Post("me/:id/read")
  @UseGuards(JwtAuthGuard)
  customerRead(
    @Param("id") id: string,
    @Body() dto: SupportReadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.readCustomer(id, user, dto.version);
  }
  @Get("guest/:id")
  @UseGuards(RateLimitGuard)
  @RateLimit("support-read")
  guestDetail(
    @Param("id") id: string,
    @Headers("x-support-access") token: string,
  ) {
    return this.support.detailGuest(id, token);
  }
  @Post("guest/:id/replies")
  @UseGuards(RateLimitGuard)
  @RateLimit("support-reply")
  guestReply(
    @Param("id") id: string,
    @Body() dto: SupportReplyDto,
    @Headers("x-support-access") token: string,
  ) {
    return this.support.replyGuest(id, dto, token);
  }
  @Post("guest/:id/read")
  @UseGuards(RateLimitGuard)
  @RateLimit("support-read")
  guestRead(
    @Param("id") id: string,
    @Body() dto: SupportReadDto,
    @Headers("x-support-access") token: string,
  ) {
    return this.support.readGuest(id, token, dto.version);
  }
}
@Controller("admin/support")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UseInterceptors(SupportPrivateInterceptor)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}
  @Get() list(@Query() query: SupportListDto, @CurrentUser() user: AuthUser) {
    return this.support.listAdmin(query, user);
  }
  @Get(":id") detail(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.support.detailAdmin(id, user);
  }
  @Post(":id/read") read(
    @Param("id") id: string,
    @Body() dto: SupportReadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.readAdmin(id, user, dto.version);
  }
  @Post(":id/replies") reply(
    @Param("id") id: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.replyAdmin(id, dto, user);
  }
  @Patch(":id/status") status(
    @Param("id") id: string,
    @Body() dto: SupportStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.status(id, dto, user);
  }
  @Post(":id/deliveries/:deliveryId/retry") retry(
    @Param("id") id: string,
    @Param("deliveryId") deliveryId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.retry(id, deliveryId, user);
  }
}
