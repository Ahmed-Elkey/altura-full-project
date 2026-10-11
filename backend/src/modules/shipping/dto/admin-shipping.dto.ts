import { PartialType } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO31661Alpha2,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateShippingZoneDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsISO31661Alpha2({ each: true })
  countries!: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateShippingZoneDto extends PartialType(CreateShippingZoneDto) {}
export class CreateShippingMethodDto {
  @IsString() @MinLength(1) zoneId!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(60) code!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) price!: number;
  @IsISO4217CurrencyCode() currency!: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  freeAbove?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) estimatedMinDays?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) estimatedMaxDays?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateShippingMethodDto extends PartialType(
  CreateShippingMethodDto,
) {}
