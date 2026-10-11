import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { SupportPrivateMiddleware } from "./support-private.middleware";
import { AuthModule } from "../auth/auth.module";
import {
  SupportController,
  AdminSupportController,
  SupportPrivateInterceptor,
} from "./support.controller";
import { SupportService } from "./support.service";
import { SupportCrypto } from "./support-email";
import { SupportDeliveryService } from "./support-delivery.service";
@Module({
  imports: [AuthModule],
  controllers: [SupportController, AdminSupportController],
  providers: [
    SupportService,
    SupportCrypto,
    SupportDeliveryService,
    SupportPrivateInterceptor,
  ],
  exports: [SupportService, SupportCrypto, SupportDeliveryService],
})
export class SupportModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SupportPrivateMiddleware)
      .forRoutes(SupportController, AdminSupportController);
  }
}
