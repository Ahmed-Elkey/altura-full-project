import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { RolesGuard } from "../../common/auth/roles.guard";
import { Roles } from "../../common/auth/roles.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { AuthUser } from "../../common/auth/auth-user";
import { AdminShippingService } from "./admin-shipping.service";
import {
  CreateShippingMethodDto,
  CreateShippingZoneDto,
  UpdateShippingMethodDto,
  UpdateShippingZoneDto,
} from "./dto/admin-shipping.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/shipping")
export class AdminShippingController {
  constructor(private readonly shipping: AdminShippingService) {}
  @Post("zones") createZone(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateShippingZoneDto,
  ) {
    return this.shipping.createZone(user.id, dto);
  }
  @Patch("zones/:id") updateZone(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateShippingZoneDto,
  ) {
    return this.shipping.updateZone(user.id, id, dto);
  }
  @Post("zones/:id/deactivate") deactivateZone(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.shipping.deactivateZone(user.id, id);
  }
  @Post("methods") createMethod(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateShippingMethodDto,
  ) {
    return this.shipping.createMethod(user.id, dto);
  }
  @Patch("methods/:id") updateMethod(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateShippingMethodDto,
  ) {
    return this.shipping.updateMethod(user.id, id, dto);
  }
  @Post("methods/:id/deactivate") deactivateMethod(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.shipping.deactivateMethod(user.id, id);
  }
}
