import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Stripe and most PSPs accept amounts in the currency's smallest unit. ALTURA's
// current currencies (CAD/EGP) use two decimal places, but keeping the common
// zero-decimal list here prevents silent amount inflation if the catalogue expands.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX',
  'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

export function currencyExponent(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

export function toMinorUnits(amount: Prisma.Decimal, currency: string): number {
  const exponent = currencyExponent(currency);
  const factor = new Prisma.Decimal(10).pow(exponent);
  const scaled = amount.mul(factor);
  if (!scaled.isInteger()) {
    throw new BadRequestException(`Amount has too many decimal places for ${currency}`);
  }
  const value = scaled.toNumber();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException('Payment amount is outside the supported range');
  }
  return value;
}

export function fromMinorUnits(amountMinor: number, currency: string): Prisma.Decimal {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new BadRequestException('Invalid provider amount');
  }
  const exponent = currencyExponent(currency);
  const factor = new Prisma.Decimal(10).pow(exponent);
  return new Prisma.Decimal(amountMinor).div(factor).toDecimalPlaces(exponent);
}
