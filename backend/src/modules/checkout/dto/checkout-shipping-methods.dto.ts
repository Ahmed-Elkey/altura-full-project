import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class CheckoutShippingMethodsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
}
