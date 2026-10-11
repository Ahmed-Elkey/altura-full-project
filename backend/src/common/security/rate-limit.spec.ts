import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_METADATA } from './rate-limit.decorator';

function contextFor(ip: string, handler: object, headers: Record<string, string> = {}) {
  const response = { setHeader: jest.fn() };
  const context = {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers }),
      getResponse: () => response,
    }),
  } as any;
  return { context, response };
}

describe('bounded endpoint rate limits', () => {
  const service = new RateLimitService(new ConfigService({ RATE_LIMIT_ENABLED: true }));
  const policy = { name: 'auth-login' as const, limit: 3, windowMs: 1_000 };

  beforeEach(() => service.reset());

  it('allows normal attempts, throttles excessive attempts, isolates clients, and resets deterministically', () => {
    expect(service.consume(policy, '10.0.0.1', 10).allowed).toBe(true);
    expect(service.consume(policy, '10.0.0.1', 20).allowed).toBe(true);
    expect(service.consume(policy, '10.0.0.1', 30).allowed).toBe(true);
    const throttled = service.consume(policy, '10.0.0.1', 40);
    expect(throttled).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 970 });
    expect(service.consume(policy, '10.0.0.2', 40).allowed).toBe(true);
    expect(service.consume(policy, '10.0.0.1', 1_010).allowed).toBe(true);
    service.reset();
    expect(service.consume(policy, '10.0.0.1', 40).allowed).toBe(true);
  });

  it('can be disabled for an isolated local test process without changing endpoint wiring', () => {
    const disabled = new RateLimitService(new ConfigService({ RATE_LIMIT_ENABLED: false }));
    for (let index = 0; index < 10; index += 1) {
      expect(disabled.consume(policy, '10.0.0.1', index).allowed).toBe(true);
    }
  });

  it('returns HTTP 429 with retry metadata through the Nest guard', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RATE_LIMIT_METADATA, 'guest-order-lookup', handler);
    const guard = new RateLimitGuard(new Reflector(), service);
    const first = contextFor('10.0.0.3', handler);
    expect(guard.canActivate(first.context)).toBe(true);
    const policyLimit = service.policy('guest-order-lookup').limit;
    for (let index = 1; index < policyLimit; index += 1) {
      expect(guard.canActivate(contextFor('10.0.0.3', handler).context)).toBe(true);
    }
    const last = contextFor('10.0.0.3', handler);
    expect(() => guard.canActivate(last.context)).toThrow(HttpException);
    try {
      guard.canActivate(last.context);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
    expect(last.response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  it('uses the trusted Express request IP and does not parse forwarded headers itself', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RATE_LIMIT_METADATA, 'auth-login', handler);
    const guard = new RateLimitGuard(new Reflector(), service);
    const first = contextFor('10.0.0.4', handler, { 'x-forwarded-for': '198.51.100.44' });
    expect(guard.canActivate(first.context)).toBe(true);
    const second = contextFor('10.0.0.4', handler, { 'x-forwarded-for': '203.0.113.55' });
    expect(guard.canActivate(second.context)).toBe(true);
  });
});
