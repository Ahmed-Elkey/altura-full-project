import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parseDuration } from './duration';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  ver: number;
  iat: number;
  exp: number;
  iss: 'altura-commerce-api';
  aud: 'altura-storefront';
}

@Injectable()
export class JwtTokenService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.ttlMs = parseDuration(this.config.get<string>('JWT_ACCESS_TTL', '15m'));
  }

  issue(input: Pick<AccessTokenPayload, 'sub' | 'email' | 'role' | 'ver'>): {
    token: string;
    expiresInSeconds: number;
    expiresAt: Date;
  } {
    const expiresInSeconds = Math.floor(this.ttlMs / 1_000);
    const token = this.jwtService.sign(input, {
      secret: this.secret,
      algorithm: 'HS256',
      issuer: 'altura-commerce-api',
      audience: 'altura-storefront',
      expiresIn: expiresInSeconds,
    });

    return {
      token,
      expiresInSeconds,
      expiresAt: new Date(Date.now() + this.ttlMs),
    };
  }

  verify(token: string): AccessTokenPayload {
    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
        issuer: 'altura-commerce-api',
        audience: 'altura-storefront',
      });

      if (
        !payload.sub ||
        !payload.email ||
        !payload.role ||
        !Number.isInteger(payload.ver) ||
        payload.ver < 0
      ) {
        throw new UnauthorizedException('Invalid access token payload');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Access token is expired or invalid');
    }
  }
}
