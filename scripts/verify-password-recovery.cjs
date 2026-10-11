// Isolated local QA: fake mail transport, real API/PostgreSQL, synthetic records only.
// Never print passwords, tokens, credentials or cookies. No outbound email is sent.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const env = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
const database = new URL(env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && database.port === '5434' && database.pathname === '/altura_friend', 'Requires the selected local QA database');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { ConfigService } = require('../backend/node_modules/@nestjs/config');
const { PasswordRecoveryService } = require('../backend/dist/src/modules/auth/password-recovery.service');
const { PasswordService } = require('../backend/dist/src/common/security/password.service');
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const email = `qa-password-${randomUUID()}@example.invalid`;
const oldPassword = `Synthetic!${randomBytes(18).toString('hex')}`;
const newPassword = `Synthetic!${randomBytes(18).toString('hex')}`;
let userId;
let stage = 'create synthetic user';
async function api(endpoint, body, extra = {}) {
  const response = await fetch('http://127.0.0.1:4000/api/v1' + endpoint, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
(async () => {
 try {
  stage = 'API readiness';
  for (let attempt = 0; attempt < 20; attempt++) {
    try { const health = await fetch('http://127.0.0.1:4000/api/v1/health'); if (health.ok) break; } catch {}
    if (attempt === 19) throw new Error('API not ready');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  stage = 'create synthetic user';
  const passwords = new PasswordService();
  const user = await prisma.user.create({ data: { email, passwordHash: await passwords.hash(oldPassword), firstName: 'QA', lastName: 'Synthetic' } });
  userId = user.id;
  stage = 'initial login';
  const login = await api('/auth/login', { email, password: oldPassword });
  assert.equal(login.status, 200);
  let capture;
  const delivered = new Promise(resolve => { capture = resolve; });
  const service = new PasswordRecoveryService(prisma, new ConfigService({ ...env, PASSWORD_RESET_ORIGIN: 'http://127.0.0.1:3100' }), passwords, { assertConfigured() {}, async send(_email, url) { capture(url); } });
  assert.deepEqual(await service.request(email), { accepted: true });
  stage = 'capture synthetic reset';
  const resetURL = await delivered;
  const token = new URLSearchParams(new URL(resetURL).hash.slice(1)).get('token');
  stage = 'concurrent reset';
  const results = await Promise.all([api('/auth/reset-password', { token, password: newPassword }), api('/auth/reset-password', { token, password: newPassword })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  stage = 'replay reset';
  assert.equal((await api('/auth/reset-password', { token, password: newPassword })).status, 400);
  stage = 'old access rejected';
  assert.equal((await api('/auth/me', null, { Authorization: `Bearer ${login.data.accessToken}` })).status, 401);
  stage = 'old refresh rejected';
  assert.equal((await api('/auth/refresh', {}, { Cookie: login.cookie })).status, 401);
  stage = 'old password rejected';
  assert.equal((await api('/auth/login', { email, password: oldPassword })).status, 401);
  stage = 'new password accepted';
  assert.equal((await api('/auth/login', { email, password: newPassword })).status, 200);
  const updated = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(updated.authVersion, user.authVersion + 1);
  stage = 'recovery configuration/validation';
  assert.equal((await api('/auth/forgot-password', { email: 'invalid' })).status, 400);
  if ((env.MAIL_PROVIDER || 'resend') === 'resend' && (!env.RESEND_API_KEY || !env.PASSWORD_RESET_FROM)) {
    stage = 'recovery configuration/validation';
  assert.equal((await api('/auth/forgot-password', { email })).status, 503);
    stage = 'recovery configuration/validation';
  assert.equal((await api('/auth/forgot-password', { email: 'unknown-qa@example.invalid' })).status, 503);
  }
  console.log('PASS: real reset API, concurrent one-use links, old access/refresh revocation, old/new login, unconfigured email handling. Mail transport was mocked; no email sent.');
 } finally {
  await prisma.newsletterSubscriber.deleteMany({ where: { email } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
 }
})().catch(() => { console.error('Local recovery QA failed at:', stage, '(no sensitive response data logged)'); process.exitCode = 1; });
