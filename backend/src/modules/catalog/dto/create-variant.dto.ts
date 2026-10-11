import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  colorName!: string;

  @IsOptional()
  @IsHexColor()
  colorHex?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  size!: string;

  @Type(() => Number)
  @Min(0)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  position?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  initialStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
