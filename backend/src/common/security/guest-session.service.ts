import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AuthenticatedRequest } from '../auth/auth-user';
import { parseDuration } from './duration';
import { CookieResponse } from './refresh-cookie.service';

export interface GuestSessionContext {
  rawToken: string;
  sessionHash: string;
  expiresAt: Date;
  isNew: boolean;
}

@Injectable()
export class GuestSessionService {
  readonly name = 'altura_guest';
  private readonly ttlMs: number;

  constructor(private readonly config: ConfigService) {
    this.ttlMs = parseDuration(this.config.get<string>('GUEST_SESSION_TTL', '90d'));
  }

  getOrCreate(request: AuthenticatedRequest, response: CookieResponse): GuestSessionContext {
    const existing = this.read(request);
    if (existing && this.isValidToken(existing)) {
      const expiresAt = new Date(Date.now() + this.ttlMs);
      this.set(response, existing, expiresAt);
      return {
        rawToken: existing,
        sessionHash: this.hash(existing),
        expiresAt,
        isNew: false,
      };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    this.set(response, rawToken, expiresAt);
    return {
      rawToken,
      sessionHash: this.hash(rawToken),
      expiresAt,
      isNew: true,
    };
  }

  read(request: AuthenticatedRequest): string | undefined {
    const rawCookie = this.getHeader(request, 'cookie');
    if (!rawCookie) return undefined;

    for (const pair of rawCookie.split(';')) {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex < 0) continue;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (key !== this.name) continue;
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }

    return undefined;
  }

  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  clear(response: CookieResponse): void {
    response.clearCookie(this.name, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  private isValidToken(rawToken: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(rawToken);
  }

  private set(response: CookieResponse, rawToken: string, expiresAt: Date): void {
    response.cookie(this.name, rawToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  private getHeader(request: AuthenticatedRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV', 'development') === 'production';
  }
}
