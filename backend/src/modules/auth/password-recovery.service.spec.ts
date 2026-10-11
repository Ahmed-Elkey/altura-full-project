import { ConfigService } from '@nestjs/config';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PasswordRecoveryService } from './password-recovery.service';
describe('password recovery', () => {
  let user: any, prisma: any, mail: any, passwords: any, service: PasswordRecoveryService;
  beforeEach(() => {
    user = { id: 'synthetic-user', email: 'runner@example.invalid', passwordHash: 'old-hash', authVersion: 2, status: 'ACTIVE' };
    prisma = { user: { findUnique: jest.fn(async () => user), updateMany: jest.fn(async ({ where, data }) => {
      if (where.authVersion !== user.authVersion || where.passwordHash !== user.passwordHash) return { count: 0 };
      user.passwordHash = data.passwordHash; user.authVersion++; return { count: 1 };
    }) }, refreshToken: { updateMany: jest.fn() }, $transaction: jest.fn(async fn => fn(prisma)) };
    mail = { assertConfigured: jest.fn(), send: jest.fn(async () => undefined) };
    passwords = { hash: jest.fn(async () => 'new-hash') };
    service = new PasswordRecoveryService(prisma, new ConfigService({ JWT_REFRESH_SECRET: 'test-secret-at-least-32-characters', PASSWORD_RESET_ORIGIN: 'http://127.0.0.1:3100' }), passwords, mail);
  });
  const request = async (email: string) => { const result = await service.request(email); await new Promise(resolve => setImmediate(resolve)); return result; };
  const tokenFrom = (mail: any) => new URLSearchParams(new URL(mail.send.mock.calls[0][1]).hash.slice(1)).get('token')!;
  it('normalizes email and sends the token only through mail', async () => {
    const result = await request(' Runner@Example.Invalid ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'runner@example.invalid' } });
    expect(mail.send).toHaveBeenCalledWith(user.email, expect.stringContaining('/account/reset-password#token='));
    expect(JSON.stringify(result)).not.toContain(tokenFrom(mail));
  });
  it('responds identically for unknown and suspended accounts', async () => {
    const known = await request(user.email); user = null;
    expect(await request('unknown@example.invalid')).toEqual(known);
    user = { status: 'SUSPENDED' }; expect(await request('suspended@example.invalid')).toEqual(known);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
  it('responds before account lookup and does not wait for delivery', async () => {
    mail.send.mockImplementation(() => new Promise(() => {}));
    expect(await service.request(user.email)).toEqual({ accepted: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await new Promise(resolve => setImmediate(resolve));
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
  it('reports missing delivery configuration for all requests', async () => {
    mail.assertConfigured.mockImplementation(() => { throw new ServiceUnavailableException(); });
    await expect(service.request('runner@example.invalid')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('changes password atomically, revokes sessions and rejects reuse', async () => {
    await request(user.email); const token = tokenFrom(mail);
    await service.reset(token, 'new-secure-password');
    expect(user.authVersion).toBe(3);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id, revokedAt: null } }));
    await expect(service.reset(token, 'other-password')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects malformed, tampered and expired links', async () => {
    await request(user.email); const token = tokenFrom(mail);
    await expect(service.reset(token + 'x', 'new-secure-password')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reset('bad-token', 'new-secure-password')).rejects.toBeInstanceOf(BadRequestException);
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    try { await expect(service.reset(token, 'new-secure-password')).rejects.toBeInstanceOf(BadRequestException); } finally { now.mockRestore(); }
    expect(passwords.hash).not.toHaveBeenCalled();
  });
  it('invalidates links when the password changes elsewhere', async () => {
    await request(user.email); const token = tokenFrom(mail); user.passwordHash = 'changed-elsewhere';
    await expect(service.reset(token, 'new-secure-password')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a concurrent loser without revoking sessions twice', async () => {
    await request(user.email); prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reset(tokenFrom(mail), 'new-secure-password')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
