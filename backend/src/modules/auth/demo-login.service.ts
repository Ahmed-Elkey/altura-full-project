import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from './auth.service';

export type DemoRole = 'CUSTOMER' | 'ADMIN';

@Injectable()
export class DemoLoginService {
  constructor(private readonly config: ConfigService, private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  private enabled() {
    if (this.config.get('DEMO_LOGIN_ENABLED') !== true || this.config.get('PAYMENT_MODE') !== 'mock') return false;
    try {
      const database = new URL(this.config.get<string>('DATABASE_URL', ''));
      if (database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') return false;
      if (this.config.get('DEMO_LOGIN_MODE', 'local') === 'hosted') {
        // Hosted demos must use their dedicated database, never the live store.
        return database.pathname === '/altura_demo';
      }
      return this.config.get('NODE_ENV') !== 'production' && database.hostname === '127.0.0.1' && database.port === '5434' && database.pathname === '/altura_friend';
    } catch { return false; }
  }

  private credentials(role: DemoRole) {
    const email = this.config.get<string>(`${role}_SEED_EMAIL`, '').trim().toLowerCase();
    const password = this.config.get<string>(`${role}_SEED_PASSWORD`, '');
    // Only the named demo identities can be exposed through this shortcut.
    return email === `${role === 'ADMIN' ? 'admin' : 'customer'}@altura.friend.local` && password.length >= 12 ? { email, password } : null;
  }

  availability(): { roles: DemoRole[] } {
    return { roles: this.enabled() ? (['CUSTOMER', 'ADMIN'] as const).filter(role => this.credentials(role)) : [] };
  }

  async login(role: DemoRole, metadata: { ipAddress?: string; userAgent?: string }) {
    if (!this.availability().roles.includes(role)) throw new NotFoundException('Demo login is unavailable');
    const credentials = this.credentials(role)!;
    const user = await this.prisma.user.findUnique({ where: { email: credentials.email }, select: { role: true, status: true } });
    if (!user || user.role !== role || user.status !== 'ACTIVE') throw new ServiceUnavailableException('Demo account is temporarily unavailable');
    try { return await this.auth.login(credentials, metadata); }
    catch { throw new ServiceUnavailableException('Demo account is temporarily unavailable'); }
  }
}
