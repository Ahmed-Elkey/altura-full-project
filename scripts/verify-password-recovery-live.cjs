// Explicit live QA only. Requires sender address NOT to be an existing customer.
// reads only that test message with BODY.PEEK, and deletes its temporary account.
// Tokens/passwords/cookies/message bodies never leave process memory or appear in logs.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { chromium } = require('@playwright/test');
if (!process.argv.includes('--send-live')) throw Error('Explicit --send-live is required');
const env = require('../backend/node_modules/dotenv').parse(fs.readFileSync(require('node:path').join(__dirname, '../backend/.env')));
const db = new URL(env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.port === '5434' && db.pathname === '/altura_friend', 'Wrong QA database');
assert.equal(env.MAIL_PROVIDER, 'smtp');
assert.equal(env.SMTP_HOST, 'smtp.gmail.com');
const [local, domain] = env.SMTP_USER.split('@');
assert.equal(domain.toLowerCase(), 'gmail.com');
const email = env.SMTP_USER.trim().toLowerCase();
let mailboxBaseline = {};
const oldPassword = 'Synthetic!' + randomBytes(20).toString('hex');
const newPassword = 'Synthetic!' + randomBytes(20).toString('hex');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
let stage = 'local health', browser, userId;
const imapCode = String.raw`
import sys,json,imaplib,email,time,re,html,base64
from urllib.parse import urlsplit,parse_qs
from email.policy import default
from datetime import datetime,timezone
settings=json.load(sys.stdin)
client=None
try:
 client=imaplib.IMAP4_SSL('imap.gmail.com',993,timeout=15)
 client.login(settings['user'],settings['password'])
 folders=['INBOX']
 status,listed=client.list()
 if status=='OK':
  for item in listed or []:
   name=item.decode('utf8','replace')
   if 'Junk' in name or 'All' in name:
    match=re.search(r'\) "[^"]*" (.*)$',name)
    if match: folders.append(match.group(1).strip('"'))
 if settings['mode']=='check':
  baselines={}
  for folder in folders:
   status,data=client.status('"'+folder+'"','(UIDNEXT)')
   match=re.search(rb'UIDNEXT\s+(\d+)',data[0] or b'') if status=='OK' else None
   if match: baselines[folder]=int(match.group(1))
  print(json.dumps({'ready':True,'baselines':baselines}))
 else:
  deadline=time.monotonic()+45
  found=None
  while time.monotonic()<deadline and found is None:
   for folder in folders:
    if folder not in settings['baselines']: continue
    client.select('"'+folder+'"',readonly=True)
    status,ids=client.uid('search',None,'UID',str(settings['baselines'].get(folder,1))+':*','HEADER','To','"'+settings['recipient']+'"','HEADER','Subject','"Reset your ALTURA password"')
    if status=='OK' and ids and ids[0]:
     for uid in reversed(ids[0].split()):
      if int(uid)<settings['baselines'][folder]: continue
      status,parts=client.uid('fetch',uid,'(BODY.PEEK[])')
      if status!='OK': continue
      raw=next((p[1] for p in parts if isinstance(p,tuple)),None)
      if not raw: continue
      message=email.message_from_bytes(raw,policy=default)
      if settings['recipient'].lower() not in str(message['To']).lower(): continue
      if str(message['To']).strip().lower() not in [settings['recipient'].lower(), '<'+settings['recipient'].lower()+'>']: continue
      if str(message['Subject'])!='Reset your ALTURA password': continue
      body_html='';body_text=''
      for part in message.walk():
       if part.get_content_type()=='text/html': body_html=part.get_content()
       elif part.get_content_type()=='text/plain': body_text=part.get_content()
      urls=re.findall(r'https?://[^\s<>]+',body_text)
      url=next((u for u in urls if '/account/reset-password#token=' in u),None)
      if url:
       token=parse_qs(urlsplit(url).fragment).get('token',[''])[0]
       try:
        payload=json.loads(base64.urlsafe_b64decode(token.split('.')[0]+'=='))
       except Exception: continue
       if payload.get('id')!=settings['userId']: continue
       found={'url':url,'html':body_html,'hasText':bool(body_text),'folder':folder}
       break
    if found is not None: break
   if found is None: time.sleep(2)
  print(json.dumps(found or {'found':False}))
except Exception:
 print(json.dumps({'error':'MAILBOX_CHECK_UNAVAILABLE'}))
finally:
 if client:
  try: client.logout()
  except Exception: pass
`;
function mailbox(mode) {
 return new Promise((resolve, reject) => {
  const child = execFile('/usr/bin/python3', ['-c', imapCode], { timeout: 65000, maxBuffer: 256000 }, (error, output) => {
   if (error) return reject(Error('Mailbox verification failed'));
   try { const result = JSON.parse(output); if (result.error) reject(Error('Mailbox unavailable')); else resolve(result); } catch { reject(Error('Invalid mailbox response')); }
  });
  child.stdin.end(JSON.stringify({ user: env.SMTP_USER, password: env.SMTP_PASSWORD, mode, recipient: email, baselines: mailboxBaseline, userId }));
 });
}
async function request(path, body, headers = {}) {
 const response = await fetch('http://127.0.0.1:4000/api/v1' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
 return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
(async () => {
 try {
  assert.equal((await fetch('http://127.0.0.1:3100/api/health')).status, 200);
  stage = 'Gmail IMAP authentication'; const ready = await mailbox('check'); assert.equal(ready.ready, true); mailboxBaseline = ready.baselines;
  browser = await chromium.launch();
  const context = await browser.newContext(); const page = await context.newPage();
  stage = 'prepare temporary customer without changing existing accounts';
  assert.equal(await prisma.user.count({ where: { email } }), 0, 'Test cannot use an existing customer account');
  const { PasswordService } = require('../backend/dist/src/common/security/password.service');
  const fixture = await prisma.user.create({ data: { email, firstName: 'QA', lastName: 'Recovery', passwordHash: await new PasswordService().hash(oldPassword) } });
  userId = fixture.id;
  const initial = await request('/auth/login', { email, password: oldPassword }); assert.equal(initial.status, 200);
  const session = initial.body;
  const oldCookie = initial.cookie;
  stage = 'request reset through UI';
  await page.goto('http://127.0.0.1:3100/account/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  const requested = page.waitForResponse(r => r.url().endsWith('/auth/forgot-password') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  assert.equal((await requested).status(), 200);
  await page.locator('.customer-auth__success').waitFor();
  stage = 'receive real reset email in Gmail'; console.log('Reset requested; checking only new matching reset mail after the UID baseline.');
  const delivered = await mailbox('read'); assert.ok(delivered.url && delivered.html && delivered.hasText); assert.ok(delivered.folder);
  console.log('Delivery folder:', delivered.folder === 'INBOX' ? 'INBOX' : 'other Gmail delivery folder');
  const url = new URL(delivered.url); assert.equal(url.origin, 'http://127.0.0.1:3100');
  const payload = JSON.parse(Buffer.from(new URLSearchParams(url.hash.slice(1)).get('token').split('.')[0], 'base64url').toString('utf8')); assert.equal(payload.id, userId);
  const mailPage = await context.newPage(); await mailPage.setContent(delivered.html);
  assert.equal(await mailPage.getByRole('link', { name: 'Reset password', exact: true }).getAttribute('href'), delivered.url);
  assert.equal(await mailPage.getByRole('heading', { name: 'Reset your password' }).count(), 1);
  await mailPage.close();
  console.log('PASS: registered customer, UI reset request, actual styled email received in Gmail with working reset URL.');
  stage = 'reset page from emailed URL';
  await page.goto(delivered.url);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill(newPassword);
  const reset = page.waitForResponse(r => r.url().endsWith('/auth/reset-password') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save new password' }).click();
  assert.equal((await reset).status(), 200); await page.locator('.customer-auth__success').waitFor();
  assert.equal(new URL(page.url()).hash, '');
  stage = 'revoke old access and refresh sessions';
  assert.equal((await request('/auth/me', null, { Authorization: `Bearer ${session.accessToken}` })).status, 401);
  assert.ok(oldCookie);
  assert.equal((await request('/auth/refresh', {}, { Cookie: oldCookie })).status, 401);
  stage = 'old password rejected, new password accepted through UI';
  const loginContext = await browser.newContext(); const loginPage = await loginContext.newPage();
  await loginPage.goto('http://127.0.0.1:3100/account/login');
  await loginPage.getByLabel('Email', { exact: true }).fill(email);
  await loginPage.getByLabel('Password', { exact: true }).fill(oldPassword);
  let login = loginPage.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await loginPage.getByRole('button', { name: 'Sign in', exact: true }).click(); assert.equal((await login).status(), 401);
  await loginPage.locator('.balmoral-auth__error').waitFor();
  await loginPage.getByLabel('Password', { exact: true }).fill(newPassword);
  login = loginPage.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await loginPage.getByRole('button', { name: 'Sign in', exact: true }).click(); assert.equal((await login).status(), 200);
  stage = 'used email link rejected through UI';
  await page.goto(delivered.url);
  await page.getByLabel('New password', { exact: true }).fill(oldPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill(oldPassword);
  const replay = page.waitForResponse(r => r.url().endsWith('/auth/reset-password') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save new password' }).click(); assert.equal((await replay).status(), 400);
  await page.locator('.balmoral-auth__error').waitFor();
  console.log('PASS: emailed link changed password; old password/access sessions rejected; new password signs in; token cleared; used link rejected.');
 } finally {
  if (browser) await browser.close();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (userId && user?.id === userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
  console.log('Temporary test account cleaned up; no existing customer password changed.');
 }
})().catch(() => { console.error('Live recovery QA failed at:', stage, '(sensitive values not logged)'); process.exitCode = 1; });
