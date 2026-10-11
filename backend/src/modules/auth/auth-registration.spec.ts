import 'reflect-metadata';
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

const input = { email: 'synthetic@example.invalid', password: 'Synthetic-password-123!', firstName: 'Synthetic', lastName: 'Customer' };

describe('public customer registration contract', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: RegisterDto });

  it('accepts the required fields without phone or marketing consent', async () => {
    expect(await validate({ ...input, email: ' Synthetic@example.invalid ', firstName: ' Synthetic ' })).toMatchObject(input);
  });

  it.each(['ADMIN', 'CUSTOMER'])('rejects a public role field containing %s', async (role) => {
    await expect(validate({ ...input, role })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { email: 'invalid' }, { password: 'short' }, { password: 'x'.repeat(129) },
    { firstName: ' ' }, { lastName: 'x'.repeat(81) }, { confirmPassword: input.password },
  ])('rejects invalid or unsupported fields: %j', async (changes) => {
    await expect(validate({ ...input, ...changes })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses only customer fields and the database default role, even if an unvalidated caller supplies a role', async () => {
    const user = { id: 'synthetic-user', ...input, passwordHash: 'synthetic-hash', role: 'CUSTOMER', status: 'ACTIVE', phone: null, emailVerifiedAt: null, lastLoginAt: null, authVersion: 0, createdAt: new Date(), updatedAt: new Date() };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(user), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, refreshToken: { create: jest.fn().mockResolvedValue({}) } };
    (prisma as any).$transaction = jest.fn(async fn => fn(prisma));
    const passwords = { hash: jest.fn().mockResolvedValue('synthetic-hash') };
    const jwt = { issue: jest.fn().mockReturnValue({ token: 'synthetic-token', expiresAt: new Date(), expiresInSeconds: 900 }) };
    const service = new AuthService(prisma as any, new ConfigService({ JWT_REFRESH_SECRET: 'unit-test-only-secret', JWT_REFRESH_TTL: '30d' }), passwords as any, jwt as any);
    const result = await service.register({ ...input, role: 'ADMIN' } as RegisterDto);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('role');
    expect(data).not.toHaveProperty('password');
    expect(data).toMatchObject({ email: input.email, firstName: input.firstName, lastName: input.lastName, passwordHash: 'synthetic-hash', wishlist: { create: {} } });
    expect(result.user.role).toBe('CUSTOMER');
    expect(jwt.issue).toHaveBeenCalledWith(expect.objectContaining({ role: 'CUSTOMER' }));
  });

  it('rejects an existing email without creating another account or session', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }), create: jest.fn() } };
    const service = new AuthService(prisma as any, new ConfigService({ JWT_REFRESH_SECRET: 'unit-test-only-secret' }), {} as any, {} as any);
    await expect(service.register(input)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
