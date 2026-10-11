import { test, expect, type Page } from '@playwright/test';
test.use({ trace: 'off', screenshot: 'off' });
const ticket = { id: 'support-test', reference: 'SUP-TEST123', name: 'Test customer', email: 'support@example.invalid', subject: 'Order question', orderReference: null, status: 'OPEN', version: 1, unread: true, createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:00:00Z', lastMessageAt: '2026-10-09T10:00:00Z', messages: [{ id: 'message1', authorType: 'CUSTOMER', body: 'I need help with my order.', createdAt: '2026-10-09T10:00:00Z' }], deliveries: [{ id: 'delivery1', messageId: 'message1', status: 'FAILED', attempts: 1, sentAt: null }] };
async function setup(page: Page, role?: 'ADMIN' | 'CUSTOMER') {
  const current = structuredClone(ticket); let fail = false, expired = false, loseReply = false; const replyKeys = new Set<string>(); const calls: Array<{ path: string; body: any; access?: string }> = [];
  const headers = { 'Access-Control-Allow-Origin': process.env.ALTURA_BASE_URL || 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Support-Access', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '');
    if (request.method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    if (path === '/auth/refresh') return route.fulfill({ headers, status: role ? 200 : 401, json: role ? { accessToken: 'synthetic', user: { id: 'support-user', email: 'support@example.invalid', firstName: 'Test', role, status: 'ACTIVE' } } : {} });
    if (path === '/newsletter/offer') return route.fulfill({ headers, json: { enabled: false } });
    if (path.includes('support')) {
      const body = request.postDataJSON(); calls.push({ path, body, access: request.headers()['x-support-access'] });
      if (fail && request.method() !== 'GET') return route.fulfill({ headers, status: 503, json: {} });
      if (path.endsWith('/recover')) return route.fulfill({ headers, json: { accepted: true } });
      if (expired) return route.fulfill({ headers, status: 401, json: {} });
      if (path.endsWith('/access')) return route.fulfill({ headers, json: { accessToken: 'guest-scoped', expiresAt: '2030-01-01T00:00:00Z' } });
      if (path === '/support' && request.method() === 'POST') return route.fulfill({ headers, status: 201, json: { ticket: current, accessToken: 'guest-scoped' } });
      if (path.endsWith('/read')) return route.fulfill({ headers, json: { read: true } });
      if (path.endsWith('/retry')) { current.deliveries[0].status = 'PENDING'; return route.fulfill({ headers, json: { queued: true } }); }
      if (path.endsWith('/replies')) { if (replyKeys.has(body.submissionKey)) return route.fulfill({ headers, json: current }); replyKeys.add(body.submissionKey); current.messages.push({ id: 'message2', authorType: role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER', body: body.message, createdAt: '2026-10-09T11:00:00Z' }); current.version++; current.status = role === 'ADMIN' ? 'AWAITING_CUSTOMER' : 'OPEN'; if (loseReply) { loseReply = false; return route.fulfill({ headers, status: 503, json: {} }); } return route.fulfill({ headers, json: current }); }
      if (path.endsWith('/status')) { current.status = body.status; current.version++; return route.fulfill({ headers, json: current }); }
      if (path === '/admin/support' || path === '/support/me') return route.fulfill({ headers, json: { items: [current], total: 1, page: Number(url.searchParams.get('page') || 1), limit: 25 } });
      return route.fulfill({ headers, json: current });
    }
    return route.fulfill({ headers, json: {} });
  });
  return { calls, loseReply: () => { loseReply = true; }, fail: (value: boolean) => { fail = value; }, expire: () => { expired = true; } };
}
async function fillContact(page: Page) {
  await page.getByLabel('Name', { exact: true }).fill('Test customer'); await page.getByLabel('Email', { exact: true }).fill('support@example.invalid');
  await page.getByLabel('Subject', { exact: true }).fill('Order question'); await page.getByRole('textbox', { name: 'Message', exact: true }).fill('I need help with my order.');
}
test('contact persists a request and opens its scoped guest conversation', async ({ page }) => {
  const api = await setup(page); await page.goto('/info/contact'); await fillContact(page); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('SUP-TEST123');
  await page.getByRole('link', { name: 'View conversation', exact: true }).click(); await expect(page).toHaveURL(/\/support\/support-test$/);
  await expect(page.getByText('I need help with my order.', { exact: true })).toBeVisible();
  expect(api.calls.some(c => c.path === '/support/guest/support-test' && c.access === 'guest-scoped')).toBe(true);
});
test('failed contact submission preserves inputs and retries the same submission key', async ({ page }) => {
  const api = await setup(page); api.fail(true); await page.goto('/info/contact'); await fillContact(page); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.support-error[role=alert]')).toBeVisible(); await expect(page.getByLabel('Message', { exact: true })).toHaveValue('I need help with my order.');
  api.fail(false); await page.getByRole('button', { name: 'Send message', exact: true }).click(); await expect(page.getByRole('status')).toContainText('SUP-TEST123');
  const requests = api.calls.filter(c => c.path === '/support'); expect(requests).toHaveLength(2); expect(requests[0].body.submissionKey).toBe(requests[1].body.submissionKey);
});
test('guest fragment is removed and exchanged before reading or replying', async ({ page }) => {
  const api = await setup(page); await page.goto('/support/support-test#token=guest-link');
  await expect(page.getByRole('heading', { name: 'Order question', exact: true })).toBeVisible(); await expect(page).toHaveURL(/\/support\/support-test$/);
  expect(api.calls.find(c => c.path.endsWith('/access'))?.body.token).toBe('guest-link');
  await page.getByLabel('Your reply', { exact: true }).fill('Thanks, I have another question.'); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByText('Thanks, I have another question.', { exact: true })).toBeVisible();
  expect(api.calls.find(c => c.path.endsWith('/replies'))?.access).toBe('guest-scoped');
});
test('expired guest access offers a generic email recovery flow', async ({ page }) => {
  const api = await setup(page); api.expire(); await page.goto('/support/support-test#token=expired');
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible(); await page.getByLabel('Email address', { exact: true }).fill('support@example.invalid');
  await page.getByRole('button', { name: 'Send secure link', exact: true }).click(); await expect(page.getByRole('status')).toContainText('If the details match');
  await expect(page.getByText('I need help with my order.', { exact: true })).toHaveCount(0);
});
test('admin searches, replies, changes status and retries failed notification', async ({ page }) => {
  const api = await setup(page, 'ADMIN'); await page.goto('/admin/support');
  await page.getByLabel('Search support', { exact: true }).fill('SUP-TEST123'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: 'Order question', exact: true }).click();
  await page.getByLabel('Your reply', { exact: true }).fill('We are checking this for you.'); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByText('We are checking this for you.', { exact: true })).toBeVisible();
  await page.getByLabel('Ticket status', { exact: true }).selectOption('RESOLVED'); await page.getByRole('button', { name: 'Save status', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Status updated' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry email', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Email retry queued' })).toBeVisible();
  expect(api.calls.find(c => c.path.endsWith('/status'))?.body.version).toBe(2);
});
test('customer sees own list and failed reply preserves draft', async ({ page }) => {
  const api = await setup(page, 'CUSTOMER'); await page.goto('/account/support'); await page.getByRole('link', { name: 'Order question', exact: true }).click();
  await page.getByLabel('Your reply', { exact: true }).fill('Please help with delivery.'); api.fail(true); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.locator('.support-error[role=alert]')).toBeVisible(); await expect(page.getByLabel('Your reply', { exact: true })).toHaveValue('Please help with delivery.');
});
for (const width of [390, 768, 1440]) test(`support forms and timelines fit ${width}px using customer typography`, async ({ page }) => {
  await setup(page, 'CUSTOMER'); await page.setViewportSize({ width, height: 900 });
  for (const path of ['/info/contact', '/account/support', '/account/support/support-test']) {
    await page.goto(path); await expect(page.getByRole('heading', { name: path === '/info/contact' ? 'Contact' : path.endsWith('support-test') ? 'Order question' : 'Your support requests', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const font = await page.getByRole('heading').first().evaluate(el => getComputedStyle(el).fontFamily); expect(font).not.toMatch(/Times|Georgia/i);
  }
});
test('a guest can open the saved conversation when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('altura-support')) throw new Error('Storage blocked'); return original.call(this, key, value); }; });
  await setup(page); await page.goto('/info/contact'); await fillContact(page); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('link', { name: 'View conversation', exact: true }).click(); await expect(page.getByText('I need help with my order.', { exact: true })).toBeVisible();
});
test('guest session expiry preserves the unsent reply during recovery', async ({ page }) => {
  const api = await setup(page); await page.goto('/support/support-test#token=guest-link');
  await page.getByLabel('Your reply', { exact: true }).fill('Please keep this draft for me.'); api.expire(); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible(); await expect(page.getByLabel('Unsent reply', { exact: true })).toHaveValue('Please keep this draft for me.');
});
test('an old saved guest submission opens recovery without minting fresh access', async ({ page }) => {
  await setup(page); await page.route('**/api/v1/support', route => route.fulfill({ status: 201, json: { ticket } }));
  await page.goto('/info/contact'); await fillContact(page); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('SUP-TEST123'); await page.getByRole('link', { name: 'View conversation', exact: true }).click();
  await expect(page).toHaveURL(/\/support\/support-test$/); await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
});
test('admin sign-in returns to the requested Support page', async ({ page }) => {
  await setup(page, 'ADMIN'); await page.route('**/api/v1/auth/login', route => route.fulfill({ json: { accessToken: 'synthetic', user: { id: 'support-user', email: 'support@example.invalid', firstName: 'Test', role: 'ADMIN', status: 'ACTIVE' } } }));
  await page.goto('/account/login?next=%2Fadmin%2Fsupport'); await page.getByLabel('Email', { exact: true }).fill('support@example.invalid'); await page.getByLabel('Password', { exact: true }).fill('SyntheticPassword123!'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/support$/); await expect(page.getByRole('heading', { name: 'Support inbox', exact: true })).toBeVisible();
});

for (const [kind, message] of [['short', 'This reply must be saved once.'], ['escaped maximum length', '"'.repeat(5000)]]) test(`guest ${kind} reply retry after lost response and reload stays unique`, async ({ page }) => {
  const api = await setup(page); await page.goto('/support/support-test#token=guest-link');
  await page.getByLabel('Your reply', { exact: true }).fill(message); api.loseReply(); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.locator('.support-error[role=alert]')).toBeVisible(); await page.reload();
  await expect(page.getByLabel('Your reply', { exact: true })).toHaveValue(message); await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your reply is saved' })).toBeVisible();
  await expect.poll(() => page.locator('.support-message p').evaluateAll((elements, value) => elements.filter(element => element.textContent === value).length, message)).toBe(1);
  const replies = api.calls.filter(call => call.path.endsWith('/replies')); expect(replies).toHaveLength(2); expect(replies[0].body.submissionKey).toBe(replies[1].body.submissionKey);
});
