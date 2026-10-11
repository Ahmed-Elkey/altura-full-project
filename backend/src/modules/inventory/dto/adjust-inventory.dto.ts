import { InventoryReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

export class AdjustInventoryDto {
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  delta!: number;

  @IsEnum(InventoryReason)
  reason!: InventoryReason;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
