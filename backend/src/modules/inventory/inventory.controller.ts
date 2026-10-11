import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { SetInventoryDto } from './dto/set-inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin-inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query() query: ListInventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Get(':variantId')
  get(@Param('variantId') variantId: string) {
    return this.inventory.get(variantId);
  }

  @Patch(':variantId')
  set(@Param('variantId') variantId: string, @Body() dto: SetInventoryDto) {
    return this.inventory.set(variantId, dto);
  }

  @Post(':variantId/adjust')
  adjust(@Param('variantId') variantId: string, @Body() dto: AdjustInventoryDto) {
    return this.inventory.adjust(variantId, dto);
  }

  @Get(':variantId/movements')
  movements(@Param('variantId') variantId: string) {
    return this.inventory.movements(variantId);
  }
}
