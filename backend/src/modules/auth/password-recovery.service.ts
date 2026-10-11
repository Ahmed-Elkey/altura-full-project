import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { PasswordResetMailService } from './password-reset-mail.service';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly passwords: PasswordService, private readonly mail: PasswordResetMailService) {}
  private signature(encoded: string, hash: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_REFRESH_SECRET')).update('altura-password-reset-v1:').update(JSON.stringify([encoded, hash])).digest('hex');
  }
  async request(email: string) {
    this.mail.assertConfigured();
    const origin = new URL(this.config.get<string>('PASSWORD_RESET_ORIGIN') || this.config.get<string>('FRONTEND_ORIGIN', 'http://127.0.0.1:3100').split(',')[0].trim());
    if ((origin.protocol !== 'https:' && origin.protocol !== 'http:') || (this.config.get('NODE_ENV') === 'production' && origin.protocol !== 'https:')) throw new ServiceUnavailableException('Password recovery email is unavailable');
    // Respond before any account lookup or provider request, so delivery latency
    // cannot reveal whether the account exists. Delivery errors stay server-side.
    setImmediate(() => {
      void this.deliver(email.trim().toLowerCase(), origin.origin).catch(() => {
        this.logger.error('Password reset email delivery failed. Check mail service configuration.');
      });
    });
    return { accepted: true };
  }
  private async deliver(email: string, origin: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.status === 'ACTIVE') {
      const encoded = Buffer.from(JSON.stringify({ id: user.id, version: user.authVersion, expires: Date.now() + 30 * 60_000, nonce: randomBytes(24).toString('base64url') })).toString('base64url');
      const url = new URL('/account/reset-password', origin);
      url.hash = new URLSearchParams({ token: `${encoded}.${this.signature(encoded, user.passwordHash)}` }).toString();
      await this.mail.send(user.email, url.toString());
    }
  }
  async reset(token: string, password: string) {
    const invalid = () => new BadRequestException('Reset link is invalid or expired');
    if (token.length > 2048 || !/^[\w-]+\.[a-f0-9]{64}$/.test(token)) throw invalid();
    const [encoded, signature] = token.split('.');
    let payload: { id: string; version: number; expires: number };
    try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw invalid(); }
    if (!payload || typeof payload.id !== 'string' || payload.id.length > 128 || !Number.isSafeInteger(payload.version) || !Number.isSafeInteger(payload.expires) || payload.expires <= Date.now()) throw invalid();
    const user = await this.prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.status !== 'ACTIVE' || user.authVersion !== payload.version || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(this.signature(encoded, user.passwordHash), 'hex'))) throw invalid();
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async tx => {
      const result = await tx.user.updateMany({ where: { id: user.id, status: 'ACTIVE', authVersion: payload.version, passwordHash: user.passwordHash }, data: { passwordHash, authVersion: { increment: 1 } } });
      if (result.count !== 1) throw invalid();
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { reset: true };
  }
}
