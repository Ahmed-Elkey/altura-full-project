import { NewsletterOfferService } from "./newsletter-offer.service";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { AuthUser } from "../../common/auth/auth-user";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../../common/security/rate-limit.guard";
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SubscribeNewsletterDto } from "./dto/subscribe-newsletter.dto";
import { NewsletterTokenDto } from "./dto/newsletter-token.dto";
import { NewsletterService } from "./newsletter.service";

@ApiTags("newsletter")
@Controller("newsletter")
export class NewsletterController {
  constructor(
    private readonly newsletter: NewsletterService,
    private readonly offers: NewsletterOfferService,
  ) {}
  @Get("offer")
  offer() {
    return this.offers.get();
  }
  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.newsletter.me(user.email);
  }
  @Post("me/subscribe")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit("newsletter-subscribe")
  subscribeMe(@CurrentUser() user: AuthUser) {
    return this.newsletter.subscribe(user.email);
  }
  @Post("me/unsubscribe")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit("newsletter-subscribe")
  unsubscribeMe(@CurrentUser() user: AuthUser) {
    return this.newsletter.unsubscribeMe(user.email);
  }

  @Post("subscribe")
  @UseGuards(RateLimitGuard)
  @RateLimit("newsletter-subscribe")
  @ApiOperation({ summary: "Subscribe an email address to storefront updates" })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletter.subscribe(dto.email);
  }
  @Post("confirm")
  @UseGuards(RateLimitGuard)
  @RateLimit("newsletter-subscribe")
  confirm(@Body() dto: NewsletterTokenDto) {
    return this.newsletter.confirm(dto.token);
  }

  @Post("unsubscribe")
  @UseGuards(RateLimitGuard)
  @RateLimit("newsletter-subscribe")
  unsubscribe(@Body() dto: NewsletterTokenDto) {
    return this.newsletter.unsubscribe(dto.token);
  }
}
