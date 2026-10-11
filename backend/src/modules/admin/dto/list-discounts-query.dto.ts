import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { DiscountType } from "@prisma/client";
export class ListDiscountsQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
  @IsOptional() @IsIn(["GENERAL", "NEWSLETTER"]) source?:
    "GENERAL" | "NEWSLETTER";
  @IsOptional() @IsEnum(DiscountType) type?: DiscountType;
}
