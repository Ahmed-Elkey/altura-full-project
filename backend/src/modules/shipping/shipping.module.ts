import { Module } from "@nestjs/common";
import { AdminShippingController } from "./admin-shipping.controller";
import { AdminShippingService } from "./admin-shipping.service";
import { ShippingService } from "./shipping.service";

@Module({
  controllers: [AdminShippingController],
  providers: [ShippingService, AdminShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
