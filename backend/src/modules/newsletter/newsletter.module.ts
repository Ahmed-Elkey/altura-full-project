import { NewsletterOfferService } from "./newsletter-offer.service";
import { Module } from "@nestjs/common";
import { NewsletterController } from "./newsletter.controller";
import { NewsletterService } from "./newsletter.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [NewsletterController],
  providers: [NewsletterService, NewsletterOfferService],
  exports: [NewsletterService, NewsletterOfferService],
})
export class NewsletterModule {}
