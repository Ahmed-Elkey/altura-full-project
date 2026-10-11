import { test, expect } from '@playwright/test';
test.use({ trace: 'off', screenshot: 'off' });
const user = { id: 'demo-display', email: 'synthetic@example.invalid', firstName: 'Demo', lastName: 'Tester', role: 'CUSTOMER', status: 'ACTIVE' };
test.beforeEach(async ({ page }, info) => {
 if (info.title.startsWith('real demo')) return;
 await page.route('**/api/v1/auth/refresh',r=>r.fulfill({status:401,json:{}}));
 await page.route('**/api/v1/auth/demo',r=>r.fulfill({json:{roles:['CUSTOMER','ADMIN']}}));
 await page.route('**/api/v1/commerce-session/merge',r=>r.fulfill({json:{}}));
});
for(const width of [390,768,1440])test(`demo options match account design at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/account/login');await expect(page.getByRole('button',{name:'Customer demo',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Admin demo',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await page.locator('.customer-auth__demo').evaluate(el=>getComputedStyle(el).fontFamily)).toMatch(/Inter/);
 await page.goto('/account/register');await expect(page.getByRole('button',{name:'Customer demo',exact:true})).toHaveCount(0);
});
test('disabled demo has no buttons and leaves ordinary login usable',async({page})=>{
 await page.route('**/api/v1/auth/demo',r=>r.fulfill({json:{roles:[]}}));await page.goto('/account/login');await expect(page.getByRole('button',{name:/demo$/i})).toHaveCount(0);await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
});
test('failed demo preserves normal fields and allows retry without duplicate submissions',async({page})=>{
 let calls=0;await page.route('**/api/v1/auth/demo-login',async r=>{calls++;expect(r.request().postDataJSON()).toEqual({role:'CUSTOMER'});await new Promise(resolve=>setTimeout(resolve,300));await r.fulfill({status:503,json:{}});});
 await page.goto('/account/login');await page.getByLabel('Email',{exact:true}).fill('typed@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-input');await page.getByRole('button',{name:'Customer demo',exact:true}).click();await expect(page.getByRole('button',{name:'Admin demo',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeDisabled();await expect(page.getByRole('alert').filter({hasText: /.+/}).first()).toBeVisible();await expect(page.getByLabel('Email',{exact:true})).toHaveValue('typed@example.invalid');await expect(page.getByRole('button',{name:'Customer demo',exact:true})).toBeEnabled();expect(calls).toBe(1);
});
for(const [role,next,target]of [['CUSTOMER','/admin/newsletter','/account'],['ADMIN','/account/profile','/admin'],['ADMIN','/admin/newsletter','/admin/newsletter']] as const)test(`${role} demo redirects safely from ${next}`,async({page})=>{
 await page.route('**/api/v1/auth/demo-login',r=>{expect(r.request().postDataJSON()).toEqual({role});return r.fulfill({json:{user:{...user,role},accessToken:'synthetic-token'}});});
 // Route roots may create their own provider; restore the same synthetic session.
 await page.route('**/api/v1/auth/refresh',r=>r.fulfill({json:{user:{...user,role},accessToken:'synthetic-token'}}));
 await page.route('**/api/v1/admin/**',r=>r.fulfill({json:{items:[],total:0}}));
 await page.route('**/api/v1/orders',r=>r.fulfill({json:{items:[],total:0}}));
 await page.goto('/account/login?next='+encodeURIComponent(next));await page.getByRole('button',{name:role==='ADMIN'?'Admin demo':'Customer demo',exact:true}).click();await expect(page).toHaveURL(new RegExp(target+'$'));
});

test('demo entry follows theme surface colors', async ({page}) => {
 await page.goto('/account/login');await expect(page.getByRole('button',{name:'Customer demo',exact:true})).toBeVisible();
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 const colors=await page.getByRole('button',{name:'Customer demo',exact:true}).evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
 expect(colors).toEqual({text:'rgb(242, 240, 233)',background:'rgb(23, 23, 21)'});
});
test('demo waits for pending session restoration before starting login',async({page})=>{
 let restored=false;await page.route('**/api/v1/auth/refresh',async r=>{await new Promise(resolve=>setTimeout(resolve,1000));restored=true;await r.fulfill({status:401,json:{}});});
 let calls=0;await page.route('**/api/v1/auth/demo-login',r=>{expect(restored).toBe(true);calls++;return r.fulfill({status:503,json:{}});});
 await page.goto('/account/login');await page.getByRole('button',{name:'Customer demo',exact:true}).click();await expect(page.getByRole('alert').filter({hasText: /.+/}).first()).toBeVisible();expect(calls).toBe(1);
});
for(const role of ['CUSTOMER','ADMIN'] as const)test(`real demo ${role} opens, restores its session and signs out`,async({page})=>{
 test.skip(process.env.ALTURA_TEST_DEMO!=='1','Only the explicitly enabled local demo');
 const target=role==='ADMIN'?'/admin':'/account/profile';await page.goto('/account/login?next='+encodeURIComponent(target));
 const login=page.waitForResponse(r=>r.url().endsWith('/auth/demo-login')&&r.request().method()==='POST');await page.getByRole('button',{name:role==='ADMIN'?'Admin demo':'Customer demo',exact:true}).click();
 const response=await login;expect(response.status()).toBe(200);const payload=await response.json();expect(payload.user.role).toBe(role);expect(payload).not.toHaveProperty('refreshToken');expect(payload.user).not.toHaveProperty('passwordHash');
 await expect(page).toHaveURL(new RegExp(target+'$'));await expect(page.getByRole('navigation',{name:role==='ADMIN'?'ALTURA Studio':'Account',exact:true})).toBeVisible();
 const cookie=(await page.context().cookies('http://127.0.0.1:4000/api/v1/auth')).find(c=>c.name==='altura_refresh');expect(cookie?.httpOnly).toBe(true);
 await page.reload();await expect(page).toHaveURL(new RegExp(target+'$'));await expect(page.getByRole('navigation',{name:role==='ADMIN'?'ALTURA Studio':'Account',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/account\/login/);
});
