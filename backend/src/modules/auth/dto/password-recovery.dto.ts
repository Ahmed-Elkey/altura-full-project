import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
export class ForgotPasswordDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) email!: string;
}
export class ResetPasswordDto {
  @IsString() @MinLength(1) @MaxLength(2048) token!: string;
  @IsString() @MinLength(10) @MaxLength(128) password!: string;
}
