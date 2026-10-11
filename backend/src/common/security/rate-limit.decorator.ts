import { SetMetadata } from '@nestjs/common';
import { RateLimitPolicyName } from './rate-limit.service';

export const RATE_LIMIT_METADATA = 'altura:rate-limit';

export const RateLimit = (policy: RateLimitPolicyName) => SetMetadata(RATE_LIMIT_METADATA, policy);
