import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  refreshToken?: string;
}
