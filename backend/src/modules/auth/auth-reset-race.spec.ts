import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('session issuance racing password reset', () => {
  const user = { id: 'qa-user', email: 'qa@example.invalid', passwordHash: 'verified-hash', authVersion: 1, status: 'ACTIVE', role: 'CUSTOMER' };
  function setup(valid: boolean) {
    const prisma: any = { user: { findUnique: jest.fn(async () => ({ ...user })), update: jest.fn(async () => ({ ...user, authVersion: 2 })), updateMany: jest.fn(async () => ({ count: valid ? 1 : 0 })) }, refreshToken: { findUnique: jest.fn(async () => ({ id: 'refresh-id', userId: user.id, user: { ...user }, expiresAt: new Date(Date.now() + 60_000), revokedAt: null })), updateMany: jest.fn(async () => ({ count: 1 })), create: jest.fn(async () => ({})) } };
    prisma.$transaction = jest.fn(async fn => fn(prisma));
    const jwt = { issue: jest.fn(() => ({ token: 'test', expiresAt: new Date(), expiresInSeconds: 900 })) };
    return { prisma, jwt, service: new AuthService(prisma, new ConfigService({ JWT_REFRESH_SECRET: 'unit-test-secret' }), { verify: async () => true } as any, jwt as any) };
  }
  it('rejects verified old credentials when reset changed the user before session issuance', async () => {
    const { prisma, service } = setup(false);
    await expect(service.login({ email: user.email, password: 'old-password' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
  it('checks the verified hash and auth version inside the session transaction', async () => {
    const { prisma, jwt, service } = setup(true);
    await service.login({ email: user.email, password: 'old-password' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: user.id, status: 'ACTIVE', authVersion: 1, passwordHash: 'verified-hash' } }));
    expect(jwt.issue).toHaveBeenCalledWith(expect.objectContaining({ ver: 1 }));
    expect(prisma.$transaction).toHaveBeenCalled();
  });
  it('rejects refreshing a snapshot invalidated by a reset before token rotation', async () => {
    const { prisma, service } = setup(false);
    await expect(service.refresh('synthetic-refresh')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
