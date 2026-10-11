import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export enum SupportStatus {
  OPEN = "OPEN",
  AWAITING_CUSTOMER = "AWAITING_CUSTOMER",
  RESOLVED = "RESOLVED",
}
export class CreateSupportDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @Transform(trim)
  @IsEmail({ allow_ip_domain: false }, { message: "A valid email is required" })
  @MaxLength(254)
  email!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) subject!: string;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderReference?: string;
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(5000) message!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,128}$/) submissionKey!: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
export class SupportReplyDto {
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(5000) message!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,128}$/) submissionKey!: string;
  @IsInt() @Min(0) version!: number;
}
export class SupportStatusDto {
  @IsEnum(SupportStatus) status!: SupportStatus;
  @IsInt() @Min(0) version!: number;
}
export class SupportListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 25;
  @IsOptional() @IsEnum(SupportStatus) status?: SupportStatus;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(160) q?: string;
  // Explicit type prevents implicit conversion from turning the string "false" into true.
  @Type(() => String)
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsOptional()
  @IsBoolean()
  unread?: boolean;
}
export class SupportAccessDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class SupportRecoverDto {
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;
}

export class SupportReadDto {
  @IsInt() @Min(0) version!: number;
}
