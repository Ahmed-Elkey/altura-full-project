import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DemoLoginDto } from './dto/demo-login.dto';
import { DemoLoginService } from './demo-login.service';

const profile = { NODE_ENV: 'development', DEMO_LOGIN_ENABLED: true, PAYMENT_MODE: 'mock', DATABASE_URL: 'postgresql://test:test@127.0.0.1:5434/altura_friend?schema=public', ADMIN_SEED_EMAIL: 'admin@altura.friend.local', ADMIN_SEED_PASSWORD: 'synthetic-admin-password', CUSTOMER_SEED_EMAIL: 'customer@altura.friend.local', CUSTOMER_SEED_PASSWORD: 'synthetic-customer-password' };
function setup(overrides = {}) {
  const auth = { login: jest.fn().mockResolvedValue({ user: { role: 'CUSTOMER' }, accessToken: 'synthetic-token' }) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'CUSTOMER', status: 'ACTIVE' }) } };
  return { service: new DemoLoginService(new ConfigService({ ...profile, ...overrides }), auth as never, prisma as never), auth, prisma };
}
describe('explicit demo login', () => {
  test.each([{ role: 'STAFF' }, { role: 'ADMIN', email: 'owner@example.invalid' }, { role: 'ADMIN', password: 'injected' }, {}])('rejects unsupported demo input %j', async body => {
    await expect(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }).transform(body, { type: 'body', metatype: DemoLoginDto })).rejects.toMatchObject({ status: 400 });
  });
  test.each([{ DEMO_LOGIN_ENABLED: false }, { DEMO_LOGIN_ENABLED: undefined }, { NODE_ENV: 'production' }, { PAYMENT_MODE: 'paymob' }, { DATABASE_URL: 'postgresql://test:test@example.invalid:5434/altura_friend' }])('disabled profile does not issue a session: %j', async overrides => {
    const { service, auth } = setup(overrides);
    expect(service.availability()).toEqual({ roles: [] });
    await expect(service.login('ADMIN', {})).rejects.toMatchObject({ status: 404 });
    expect(auth.login).not.toHaveBeenCalled();
  });
  const hosted = { NODE_ENV: 'production', DEMO_LOGIN_MODE: 'hosted', DATABASE_URL: 'postgresql://test:test@demo-db.example.invalid:5432/altura_demo?sslmode=require' };
  test('explicit hosted demo exposes both roles in a production build', async () => {
    const { service, auth, prisma } = setup(hosted);
    expect(service.availability()).toEqual({ roles: ['CUSTOMER', 'ADMIN'] });
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', status: 'ACTIVE' });
    await service.login('ADMIN', {});
    expect(auth.login).toHaveBeenCalledTimes(1);
  });
  test.each([
    { DEMO_LOGIN_ENABLED: false }, { DATABASE_URL: 'postgresql://test:test@demo-db.example.invalid:5432/altura_live' },
    { DATABASE_URL: 'malformed' }, { PAYMENT_MODE: 'stripe' }, { DEMO_LOGIN_MODE: 'local' },
  ])('hosted shortcut remains blocked for incompatible profile: %j', override => {
    expect(setup({ ...hosted, ...override }).service.availability()).toEqual({ roles: [] });
  });
  test('availability exposes only roles, never account credentials', () => {
    expect(setup().service.availability()).toEqual({ roles: ['CUSTOMER', 'ADMIN'] });
    expect(setup({ ADMIN_SEED_PASSWORD: '' }).service.availability()).toEqual({ roles: ['CUSTOMER'] });
    expect(setup({ ADMIN_SEED_EMAIL: 'owner@example.com' }).service.availability()).toEqual({ roles: ['CUSTOMER'] });
  });
  test.each(['CUSTOMER', 'ADMIN'] as const)('uses fixed configured %s credentials and ordinary session metadata', async role => {
    const { service, auth, prisma } = setup();prisma.user.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
    const metadata = { ipAddress: '127.0.0.1', userAgent: 'synthetic-browser' };
    await service.login(role, metadata);
    expect(auth.login).toHaveBeenCalledWith({ email: profile[`${role}_SEED_EMAIL`], password: profile[`${role}_SEED_PASSWORD`] }, metadata);
  });
  test('wrong role or inactive account cannot issue a session', async () => {
    const { service, auth } = setup();
    await expect(service.login('ADMIN', {})).rejects.toMatchObject({ status: 503 });expect(auth.login).not.toHaveBeenCalled();
  });
  test('credential mismatch has a retryable generic error', async () => {
    const { service, auth } = setup();auth.login.mockRejectedValue(new Error('private credential details'));
    await expect(service.login('CUSTOMER', {})).rejects.toMatchObject({ status: 503, message: 'Demo account is temporarily unavailable' });
  });
});
