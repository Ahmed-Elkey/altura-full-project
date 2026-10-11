// Exercise the two actual buttons with a temporary account, never print cookies/tokens.
const fs=require('fs'),assert=require('assert/strict'),{randomUUID,randomBytes}=require('crypto');
const env=require('../backend/node_modules/dotenv').parse(fs.readFileSync('backend/.env'));
const target=new URL(env.DATABASE_URL);assert.ok(target.hostname==='127.0.0.1'&&target.port==='5434'&&target.pathname==='/altura_friend');
const {PrismaClient}=require('../backend/node_modules/@prisma/client'),{PasswordService}=require('../backend/dist/src/common/security/password.service'),{chromium,expect}=require('@playwright/test');
const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}}),origin='http://127.0.0.1:3100',api='http://127.0.0.1:4000/api/v1';
let userId,browser,stage='setup';
(async()=>{try{
 const password='Synthetic!'+randomBytes(18).toString('hex');const user=await db.user.create({data:{email:`signout-qa-${randomUUID()}@example.invalid`,passwordHash:await new PasswordService().hash(password),role:'CUSTOMER',firstName:'Signout',lastName:'QA'}});userId=user.id;
 browser=await chromium.launch();
 for(const path of ['/checkout','/account/profile']){
  stage=path+' login';const context=await browser.newContext(),page=await context.newPage();
  try{
   await page.goto(origin+'/account/login?next='+encodeURIComponent(path));await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(password);
   const login=page.waitForResponse(r=>r.url()===api+'/auth/login'&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign in',exact:true}).click();const response=await login;assert.equal(response.status(),200);const token=(await response.json()).accessToken;
   await expect(page).toHaveURL(origin+path);
   if(path==='/checkout'){
    const listing=await (await fetch(api+'/catalog/products?limit=100')).json();let variant;
    for(const item of listing.items){const product=await (await fetch(api+'/catalog/products/'+item.slug)).json();variant=product.colorways.flatMap(c=>c.variants).find(v=>v.inStock);if(variant)break;}
    assert.ok(variant);const add=await fetch(api+'/cart/items',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({variantId:variant.id,quantity:1})});assert.equal(add.status,201);await page.reload();
   }
   await expect(page.locator('body')).toContainText(user.email);
   const cookie=(await context.cookies(api+'/auth')).find(c=>c.name==='altura_refresh');assert.ok(cookie);
   stage=path+' button';const logout=page.waitForResponse(r=>r.url()===api+'/auth/logout'&&r.request().method()==='POST');
   if(path==='/checkout'){await page.getByRole('button',{name:'Email options'}).click();await page.getByRole('menuitem',{name:'Sign out'}).click();}
   else await page.getByRole('button',{name:'Sign out',exact:true}).click();
   assert.equal((await logout).status(),204);
   await expect.poll(async()=> (await context.cookies(api+'/auth')).some(c=>c.name==='altura_refresh')).toBe(false);
   if(path==='/checkout'){await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByPlaceholder('Email',{exact:true})).toHaveValue('');}
   else await expect(page).toHaveURL(/\/account\/login\?next=/);
   stage=path+' revoked refresh and protected navigation';const old=await fetch(api+'/auth/refresh',{method:'POST',headers:{Cookie:'altura_refresh='+cookie.value,'Content-Type':'application/json'},body:'{}'});assert.equal(old.status,401);
   await page.goto(origin+'/account/profile');await expect(page).toHaveURL(/\/account\/login\?next=/);
  }finally{await context.close();}
 }
}finally{try{if(browser)await browser.close();}finally{try{if(userId)await db.user.deleteMany({where:{id:userId}});}finally{await db.$disconnect();}}}
console.log('PASS: checkout menu and profile Sign out buttons returned204, removed refresh cookies, rejected old refresh and protected navigation; checkout email cleared. Temporary account/cart cleaned. No outbound email.');
})().catch(()=>{console.error('Signout verification failed at:',stage,'(private data omitted)');process.exitCode=1});
