import { UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('changing password after a concurrent reset', () => {
  it.each([0, 1])('checks the verified snapshot atomically (matching users: %s)', async count => {
    const user = { id: 'qa-user', passwordHash: 'old-hash', authVersion: 1, status: 'ACTIVE' };
    const tx = { user: { updateMany: jest.fn(async () => ({ count })) }, refreshToken: { updateMany: jest.fn() } };
    const prisma = { user: { findUnique: jest.fn(async () => user) }, $transaction: async (fn: any) => fn(tx) };
    const passwords = { verify: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false), hash: async () => 'new-hash' };
    const service = new UsersService(prisma as any, passwords as any);
    const result = service.changePassword(user.id, { currentPassword: 'old-password', newPassword: 'new-password' });
    if (count) await expect(result).resolves.toBeUndefined();
    else { await expect(result).rejects.toBeInstanceOf(UnauthorizedException); expect(tx.refreshToken.updateMany).not.toHaveBeenCalled(); }
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: user.id, passwordHash: user.passwordHash, authVersion: user.authVersion, status: 'ACTIVE' } }));
  });
});
