import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';

export class MockPaymentOutcomeDto {
  @ApiProperty({ enum: ['paid', 'failed', 'cancelled'] })
  @IsIn(['paid', 'failed', 'cancelled'])
  outcome!: 'paid' | 'failed' | 'cancelled';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;
}
