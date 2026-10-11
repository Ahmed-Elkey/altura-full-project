import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

@Injectable()
export class RefreshCookieService {
  readonly name = 'altura_refresh';
  readonly path: string;

  constructor(private readonly config: ConfigService) {
    const apiPrefix = this.config.get<string>('API_PREFIX', 'api/v1').replace(/^\/+|\/+$/g, '');
    this.path = `/${apiPrefix}/auth`;
  }

  get exposeInBody(): boolean {
    // Browser sessions never expose the raw refresh token to JavaScript.
    // Swagger/local browser testing can rely on the same-origin HttpOnly cookie.
    return false;
  }

  set(response: CookieResponse, token: string, expiresAt: Date): void {
    response.cookie(this.name, token, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: this.path,
      expires: expiresAt,
    });
  }

  clear(response: CookieResponse): void {
    response.clearCookie(this.name, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: this.path,
    });
  }

  private get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV', 'development') === 'production';
  }
}
