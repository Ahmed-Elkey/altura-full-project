import { ConfigService } from '@nestjs/config';

/** The validated DEFAULT_CURRENCY setting is the single market-currency source. */
export function getMarketCurrency(config: Pick<ConfigService, 'getOrThrow'>): string {
  return config.getOrThrow<string>('DEFAULT_CURRENCY').trim().toUpperCase();
}
