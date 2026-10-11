import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RateLimitPolicyName =
  | 'support-read'
  | 'support-create'
  | 'support-access'
  | 'support-reply'
  | 'support-recover'
  | 'auth-login'
  | 'auth-register'
  | 'auth-refresh'
  | 'password-recovery'
  | 'password-reset'
  | 'newsletter-subscribe'
  | 'guest-order-lookup'
  | 'payment-initialize'
  | 'mock-payment-complete';

export interface RateLimitPolicy {
  name: RateLimitPolicyName;
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision extends RateLimitPolicy {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const POLICY_CONFIG: Record<RateLimitPolicyName, { limit: string; windowMs: string; defaults: [number, number] }> = {
  'support-read': { limit: 'RATE_LIMIT_SUPPORT_READ_LIMIT', windowMs: 'RATE_LIMIT_SUPPORT_READ_WINDOW_MS', defaults: [180, 15 * 60_000] },
  'support-create': { limit: 'RATE_LIMIT_SUPPORT_CREATE_LIMIT', windowMs: 'RATE_LIMIT_SUPPORT_CREATE_WINDOW_MS', defaults: [5, 15 * 60_000] },
  'support-access': { limit: 'RATE_LIMIT_SUPPORT_ACCESS_LIMIT', windowMs: 'RATE_LIMIT_SUPPORT_ACCESS_WINDOW_MS', defaults: [20, 15 * 60_000] },
  'support-reply': { limit: 'RATE_LIMIT_SUPPORT_REPLY_LIMIT', windowMs: 'RATE_LIMIT_SUPPORT_REPLY_WINDOW_MS', defaults: [20, 15 * 60_000] },
  'support-recover': { limit: 'RATE_LIMIT_SUPPORT_RECOVER_LIMIT', windowMs: 'RATE_LIMIT_SUPPORT_RECOVER_WINDOW_MS', defaults: [5, 15 * 60_000] },
  'password-recovery': { limit: 'RATE_LIMIT_RECOVERY_LIMIT', windowMs: 'RATE_LIMIT_RECOVERY_WINDOW_MS', defaults: [5, 15 * 60_000] },
  'password-reset': { limit: 'RATE_LIMIT_RESET_LIMIT', windowMs: 'RATE_LIMIT_RESET_WINDOW_MS', defaults: [10, 15 * 60_000] },
  'newsletter-subscribe': { limit: 'RATE_LIMIT_NEWSLETTER_LIMIT', windowMs: 'RATE_LIMIT_NEWSLETTER_WINDOW_MS', defaults: [10, 15 * 60_000] },
  'auth-login': { limit: 'RATE_LIMIT_LOGIN_LIMIT', windowMs: 'RATE_LIMIT_LOGIN_WINDOW_MS', defaults: [5, 5 * 60_000] },
  'auth-register': { limit: 'RATE_LIMIT_REGISTER_LIMIT', windowMs: 'RATE_LIMIT_REGISTER_WINDOW_MS', defaults: [3, 60 * 60_000] },
  'auth-refresh': { limit: 'RATE_LIMIT_REFRESH_LIMIT', windowMs: 'RATE_LIMIT_REFRESH_WINDOW_MS', defaults: [20, 10 * 60_000] },
  'guest-order-lookup': { limit: 'RATE_LIMIT_GUEST_LOOKUP_LIMIT', windowMs: 'RATE_LIMIT_GUEST_LOOKUP_WINDOW_MS', defaults: [5, 5 * 60_000] },
  'payment-initialize': { limit: 'RATE_LIMIT_PAYMENT_INIT_LIMIT', windowMs: 'RATE_LIMIT_PAYMENT_INIT_WINDOW_MS', defaults: [20, 10 * 60_000] },
  'mock-payment-complete': { limit: 'RATE_LIMIT_MOCK_COMPLETE_LIMIT', windowMs: 'RATE_LIMIT_MOCK_COMPLETE_WINDOW_MS', defaults: [10, 10 * 60_000] },
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: ConfigService) {}

  policy(name: RateLimitPolicyName): RateLimitPolicy {
    const definition = POLICY_CONFIG[name];
    const [defaultLimit, defaultWindowMs] = definition.defaults;
    return {
      name,
      limit: this.positiveInteger(this.config.get<number>(definition.limit), defaultLimit),
      windowMs: this.positiveInteger(this.config.get<number>(definition.windowMs), defaultWindowMs),
    };
  }

  consume(policy: RateLimitPolicy, identity: string, now = Date.now()): RateLimitDecision {
    if (!this.isEnabled()) {
      return { ...policy, allowed: true, remaining: policy.limit, resetAt: now + policy.windowMs, retryAfterMs: 0 };
    }

    const key = `${policy.name}:${identity || 'unknown'}`;
    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : current;

    if (bucket.count >= policy.limit) {
      this.buckets.set(key, bucket);
      return { ...policy, allowed: false, remaining: 0, resetAt: bucket.resetAt, retryAfterMs: Math.max(0, bucket.resetAt - now) };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    this.pruneIfNeeded(now);
    return { ...policy, allowed: true, remaining: Math.max(0, policy.limit - bucket.count), resetAt: bucket.resetAt, retryAfterMs: 0 };
  }

  reset(): void {
    this.buckets.clear();
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>('RATE_LIMIT_ENABLED', true) !== false;
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;
  }

  private pruneIfNeeded(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}
