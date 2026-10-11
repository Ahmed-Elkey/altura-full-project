import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CheckoutQuoteDto } from './checkout-quote.dto';

export class PlaceOrderDto extends CheckoutQuoteDto {
  @IsOptional()
  @IsIn(['CARD', 'CASH_ON_DELIVERY'])
  paymentMethod?: 'CARD' | 'CASH_ON_DELIVERY';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
