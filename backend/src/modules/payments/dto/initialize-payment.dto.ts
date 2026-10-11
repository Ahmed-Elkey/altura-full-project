import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class InitializePaymentDto {
  @ApiProperty({ example: 'ALT-260915-ABCDEF1234' })
  @IsString()
  @Matches(/^ALT-[A-Z0-9-]{6,40}$/i)
  orderNumber!: string;

  @ApiPropertyOptional({
    description: 'Required only when paying a guest order without an authenticated account',
    example: 'customer@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
