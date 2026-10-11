// Actual local API/DB/browser round trip. Email transport is captured, never delivered externally.
const fs = require('fs'), assert = require('assert/strict'), { randomUUID, randomBytes } = require('crypto');
const env = require('../backend/node_modules/dotenv').parse(fs.readFileSync('backend/.env'));
const target = new URL(env.DATABASE_URL); assert.ok(target.hostname === '127.0.0.1' && target.port === '5434' && target.pathname === '/altura_friend');
const { PrismaClient } = require('../backend/node_modules/@prisma/client'), { ConfigService } = require('../backend/node_modules/@nestjs/config'), { JwtService } = require('../backend/node_modules/@nestjs/jwt');
const { PasswordService } = require('../backend/dist/src/common/security/password.service'), { JwtTokenService } = require('../backend/dist/src/common/security/jwt-token.service');
const { SupportCrypto, supportHash } = require('../backend/dist/src/modules/support/support-email'), { SupportDeliveryService } = require('../backend/dist/src/modules/support/support-delivery.service');
const { chromium, expect } = require('@playwright/test');
const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const config = new ConfigService({ ...env, SUPPORT_EMAIL_WORKER_ENABLED: false, SUPPORT_EMAIL_MAX_ATTEMPTS: 5 });
const crypto = new SupportCrypto(config), issuer = new JwtTokenService(config, new JwtService());
const base = 'http://127.0.0.1:3100', api = 'http://127.0.0.1:4000/api/v1', prefix = 'support-qa-' + randomUUID();
const emails = [0,1,2,3].map(i => `${prefix}-${i}@example.invalid`), users = [], tickets = [], captures = [];
let browser, lastUiErrors = [], stage = 'setup';
async function request(path, method = 'GET', body, token, access, status = method === 'POST' ? 201 : 200) {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(access ? { 'X-Support-Access': access } : {}) };
  const response = await fetch(api + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status); const data = await response.text(); return data ? JSON.parse(data) : null;
}
async function login(page, user, password, next) {
  await page.goto(base + '/account/login?next=' + encodeURIComponent(next));
  await page.getByLabel('Email', { exact: true }).fill(user.email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(base + next);
}
(async () => {
  try {
    // The verifier must run while the local API worker is disabled; otherwise it could send synthetic mail.
    const pid = Number(fs.readFileSync('.hero-build/backend.pid', 'utf8'));
    const processEnv = require('child_process').execFileSync('ps', ['eww', '-p', String(pid)], { encoding: 'utf8' });
    assert.ok(processEnv.includes('SUPPORT_EMAIL_WORKER_ENABLED=false'), 'Disable local support worker during verification');
    const password = 'Synthetic!' + randomBytes(18).toString('hex'), passwordHash = await new PasswordService().hash(password);
    for (let i = 0; i < 3; i++) { const user = await db.user.create({ data: { email: emails[i], passwordHash, role: i === 2 ? 'ADMIN' : 'CUSTOMER', firstName: 'Support QA', lastName: String(i) } }); users.push(user); }
    const tokens = users.map(user => issuer.issue({ sub: user.id, email: user.email, role: user.role, ver: user.authVersion }).token);
    browser = await chromium.launch(); const guestContext = await browser.newContext(), customerContext = await browser.newContext(), adminContext = await browser.newContext();
    const guest = await guestContext.newPage(), customer = await customerContext.newPage(), admin = await adminContext.newPage();
    stage = 'guest contact form'; await guest.goto(base + '/info/contact');
    await guest.getByLabel('Name', { exact: true }).fill('Synthetic guest'); await guest.getByLabel('Email', { exact: true }).fill(emails[3]); await guest.getByLabel('Subject', { exact: true }).fill('Guest order question'); await guest.getByLabel('Message', { exact: true }).fill('Please help with this synthetic support request.');
    const creationResponse = guest.waitForResponse(r => r.url() === api + '/support' && r.request().method() === 'POST');
    await guest.getByRole('button', { name: 'Send message', exact: true }).click(); const created = await creationResponse; assert.equal(created.status(), 201); const guestResult = await created.json(); tickets.push(guestResult.ticket.id);
    await guest.getByRole('link', { name: 'View conversation', exact: true }).click(); await expect(guest.getByRole('heading', { name: 'Guest order question', exact: true })).toBeVisible();
    stage = 'customer contact and ownership'; await login(customer, users[0], password, '/account/support'); await customer.goto(base + '/info/contact'); await expect(customer.getByLabel('Email', { exact: true })).toHaveValue(users[0].email);
    await customer.getByLabel('Subject', { exact: true }).fill('Customer delivery question'); await customer.getByLabel('Message', { exact: true }).fill('Please help with another synthetic customer request.');
    const customerResponse = customer.waitForResponse(r => r.url() === api + '/support' && r.request().method() === 'POST'); await customer.getByRole('button', { name: 'Send message', exact: true }).click(); const customerResult = await (await customerResponse).json(); assert.ok(!customerResult.accessToken); tickets.push(customerResult.ticket.id);
    await customer.getByRole('link', { name: 'View conversation', exact: true }).click(); await expect(customer).toHaveURL(base + '/account/support/' + customerResult.ticket.id);
    await request('/support/me/' + customerResult.ticket.id, 'GET', undefined, tokens[1], undefined, 404);
    await request('/admin/support', 'GET', undefined, tokens[0], undefined, 403);
    const ownList = await request('/support/me', 'GET', undefined, tokens[0]); assert.ok(ownList.items.some(row => row.id === customerResult.ticket.id));
    const otherList = await request('/support/me', 'GET', undefined, tokens[1]); assert.equal(otherList.items.length, 0);
    stage = 'admin inbox and reply'; stage = 'admin login'; await login(admin, users[2], password, '/admin/support'); stage = 'admin inbox search'; await admin.getByLabel('Search support', { exact: true }).fill(guestResult.ticket.reference); await admin.getByRole('button', { name: 'Search', exact: true }).click(); stage = 'admin inbox result'; await admin.getByRole('link', { name: 'Guest order question', exact: true }).click(); stage = 'admin compose reply';
    await admin.getByLabel('Your reply', { exact: true }).fill('We can help with your synthetic order question.'); stage = 'admin reply persistence'; await admin.getByRole('button', { name: 'Send reply', exact: true }).click(); await expect(admin.locator('.support-timeline').getByText('We can help with your synthetic order question.', { exact: true })).toBeVisible();
    stage = 'guest sees admin reply'; await guest.getByRole('button', { name: 'Refresh conversation', exact: true }).click(); await expect(guest.locator('.support-timeline').getByText('We can help with your synthetic order question.', { exact: true })).toBeVisible();
    stage = 'guest follows up'; await guest.getByLabel('Your reply', { exact: true }).fill('Thank you, here is another synthetic detail.'); await guest.getByRole('button', { name: 'Send reply', exact: true }).click(); await expect(guest.locator('.support-timeline').getByText('Thank you, here is another synthetic detail.', { exact: true })).toBeVisible();
    stage = 'admin receives followup'; await admin.getByRole('button', { name: 'Refresh conversation', exact: true }).click(); await expect(admin.locator('.support-timeline').getByText('Thank you, here is another synthetic detail.', { exact: true })).toBeVisible(); stage = 'admin resolves request'; await admin.getByLabel('Ticket status', { exact: true }).selectOption('RESOLVED'); await admin.getByRole('button', { name: 'Save status', exact: true }).click(); await expect(admin.getByRole('status').filter({ hasText: 'Status updated' })).toBeVisible();
    await guest.getByRole('button', { name: 'Refresh conversation', exact: true }).click(); stage = 'guest sees resolved notice'; await expect(guest.getByText('Sending a reply reopens this request.', { exact: true })).toBeVisible(); stage = 'guest composes reopening reply'; await guest.getByLabel('Your reply', { exact: true }).fill('Please reopen this synthetic support request.'); await guest.getByRole('button', { name: 'Send reply', exact: true }).click();
    stage = 'guest reopening reply persistence'; await expect(guest.locator('.support-timeline').getByText('Please reopen this synthetic support request.', { exact: true })).toBeVisible(); stage = 'server reopening status'; assert.equal((await request('/support/guest/' + guestResult.ticket.id, 'GET', undefined, undefined, guestResult.accessToken)).status, 'OPEN');
    stage = 'idempotency, validation, conflict and scoped isolation';
    let detail = await request('/support/me/' + customerResult.ticket.id, 'GET', undefined, tokens[0]);
    const reply = { message: 'A safely retried customer message.', submissionKey: randomUUID(), version: detail.version };
    const first = await request('/support/me/' + detail.id + '/replies', 'POST', reply, tokens[0]); const repeated = await request('/support/me/' + detail.id + '/replies', 'POST', reply, tokens[0]); assert.equal(first.messages.length, repeated.messages.length);
    await request('/support/me/' + detail.id + '/replies', 'POST', { ...reply, message: 'A competing stale customer draft.', submissionKey: randomUUID() }, tokens[0], undefined, 409);
    await request('/support/guest/' + detail.id, 'GET', undefined, undefined, guestResult.accessToken, 401);
    await request('/support/' + guestResult.ticket.id + '/access', 'POST', { token: 'A'.repeat(43) }, undefined, undefined, 401);
    await request('/support', 'POST', { name: 'Spam', email: emails[3], subject: 'Blocked honeypot', message: 'This must not be persisted.', submissionKey: randomUUID(), website: 'spam' }, undefined, undefined, 400);
    await request('/support', 'POST', { name: 'Validation', email: emails[3], subject: 'Invalid message', message: 'short', submissionKey: randomUUID() }, undefined, undefined, 400);
    stage = 'captured durable mail, link exchange and retry';
    const worker = new SupportDeliveryService(db, config, { sendMessage: async (recipient, message) => { captures.push({ recipient, ...message }); } }, crypto);
    for (const id of tickets) await worker.processPending(id);
    assert.ok(captures.length >= 3); assert.ok(captures.every(mail => mail.html.includes('font-family:Inter,Arial,Helvetica,sans-serif') && mail.html.includes('Open conversation') && mail.text.includes('Replies to this email are not imported')));
    const sent = await db.supportEmailDelivery.findFirst({ where: { ticketId: guestResult.ticket.id, recipient: emails[3] }, orderBy: { createdAt: 'asc' } }); assert.equal(sent.status, 'SENT'); const payload = crypto.decrypt(sent.payloadEncrypted); const linkToken = new URLSearchParams(new URL(payload.url).hash.slice(1)).get('token'); assert.ok(linkToken);
    const exchanged = await request('/support/' + guestResult.ticket.id + '/access', 'POST', { token: linkToken }); assert.ok(exchanged.accessToken);
    const linkedContext = await browser.newContext(), linkedPage = await linkedContext.newPage(); await linkedPage.goto(base + '/support/' + guestResult.ticket.id + '#token=' + linkToken); await expect(linkedPage.getByRole('heading', { name: 'Guest order question', exact: true })).toBeVisible(); assert.equal(new URL(linkedPage.url()).hash, ''); await linkedContext.close();
    await db.supportEmailDelivery.update({ where: { id: sent.id }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() } });
    const failedWorker = new SupportDeliveryService(db, config, { sendMessage: async () => { throw new Error('Synthetic transport failure'); } }, crypto); await failedWorker.processPending(guestResult.ticket.id); assert.equal((await db.supportEmailDelivery.findUnique({ where: { id: sent.id } })).status, 'FAILED');
    await request(`/admin/support/${guestResult.ticket.id}/deliveries/${sent.id}/retry`, 'POST', {}, tokens[2]); await worker.processPending(guestResult.ticket.id); assert.equal((await db.supportEmailDelivery.findUnique({ where: { id: sent.id } })).status, 'SENT');
    await db.supportGuestAccess.updateMany({ where: { tokenHash: supportHash(exchanged.accessToken) }, data: { expiresAt: new Date(0) } }); await request('/support/guest/' + guestResult.ticket.id, 'GET', undefined, undefined, exchanged.accessToken, 401);
    assert.deepEqual(await request('/support/' + guestResult.ticket.id + '/recover', 'POST', { email: 'wrong@example.invalid' }), { accepted: true });
    stage = 'responsive visuals and private headers';
    await admin.getByRole('button', { name: 'Refresh conversation', exact: true }).click();
    for (const width of [390,768,1440]) for (const [label, page] of [['guest',guest],['customer',customer],['admin',admin]]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: `/tmp/altura-support-${label}-${width}.png`, fullPage: true }); }
    const header = await fetch(base + '/support/' + guestResult.ticket.id); assert.ok(header.headers.get('x-robots-tag').includes('noindex')); assert.equal(header.headers.get('referrer-policy'), 'no-referrer'); assert.ok(header.headers.get('cache-control').includes('no-store'));
    const denied = await fetch(api + '/support/guest/' + guestResult.ticket.id); assert.equal(denied.status,401); assert.ok(denied.headers.get('cache-control').includes('no-store'));
  } catch (error) { if (browser) { for (const context of browser.contexts()) for (const page of context.pages()) lastUiErrors.push(...await page.locator('.support-error').allTextContents().catch(() => [])); } throw error; } finally {
    try { if (browser) await browser.close(); } finally {
      try { const owned = await db.supportTicket.findMany({ where: { email: { in: emails } }, select: { id: true } }); const ids = owned.map(row => row.id); if (ids.length) { await db.auditLog.deleteMany({ where: { entityType: 'SupportTicket', entityId: { in: ids } } }); await db.supportTicket.deleteMany({ where: { id: { in: ids } } }); } if (users.length) await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); } finally { await db.$disconnect(); }
    }
  }
  console.log('PASS: real guest/customer Contact submissions, admin inbox/reply/status, guest continuation/reopen, customer ownership, guest expiry, idempotency/conflicts, captured durable email/retry and responsive private pages. Synthetic records cleaned; no outbound email.');
})().catch(error => { console.error('Support verification failed at:', stage, error.name, '(private data omitted)'); if (error.name === 'AssertionError' && typeof error.actual === 'number' && typeof error.expected === 'number') console.error('HTTP status actual/expected:', error.actual, error.expected); for (const message of lastUiErrors) console.error('UI:', message);  process.exitCode = 1; });
