import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_METADATA } from './rate-limit.decorator';
import { RateLimitPolicyName, RateLimitService } from './rate-limit.service';

interface RateLimitedRequest {
  ip?: string;
  user?: { id?: string };
}

interface RateLimitResponse {
  setHeader(name: string, value: string | number): void;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly limiter: RateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const policyName = this.reflector.getAllAndOverride<RateLimitPolicyName>(RATE_LIMIT_METADATA, [context.getHandler(), context.getClass()]);
    if (!policyName) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitedRequest>();
    const response = http.getResponse<RateLimitResponse>();
    const decision = this.limiter.consume(this.limiter.policy(policyName), this.identity(request, policyName));
    response.setHeader('X-RateLimit-Limit', decision.limit);
    response.setHeader('X-RateLimit-Remaining', decision.remaining);
    response.setHeader('X-RateLimit-Reset', Math.ceil(decision.resetAt / 1000));
    if (!decision.allowed) {
      const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      response.setHeader('Retry-After', retryAfter);
      throw new HttpException('Too many requests; retry later', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private identity(request: RateLimitedRequest, policyName: RateLimitPolicyName): string {
    const clientIp = request.ip?.trim() || 'unknown';
    if ((policyName === 'payment-initialize' || policyName === 'mock-payment-complete') && request.user?.id) {
      return `${clientIp}:user:${request.user.id}`;
    }
    return clientIp;
  }
}
