import { expect, test } from '@playwright/test';
test.beforeEach(async ({page})=>{await page.route('**/api/v1/admin/catalog/products?*',r=>r.fulfill({json:{items:[{id:'p',name:'Training tee'}],pages:1,total:1,page:1}}));await page.route('**/api/v1/catalog/categories',r=>r.fulfill({json:[{id:'c',name:'Training'}]}));});
const config = { enabled:true,type:'FREE_SHIPPING',value:0,currency:'EGP',validityDays:14,usageLimit:1,minimumSubtotal:null,maximumDiscount:null,buyQuantity:2,giftQuantity:1,maxGiftUnits:null,eligibleProductIds:[],eligibleCategoryIds:[],title:'Welcome to ALTURA',welcomeText:'Move higher, together.' };
const offer = { version:2,config,headline:'Free shipping for newsletter members',description:'Your personal free shipping reward.',terms:'Use once within 14 days.',updatedAt:null };
const reward = { code:'FREE-SYNTHETIC',type:'FREE_SHIPPING',value:0,expiresAt:'2030-01-01T00:00:00Z',offer:config,description:offer.description,terms:offer.terms };
async function auth(page:any,role='CUSTOMER') { await page.route('**/auth/refresh', (route:any)=>route.fulfill({json:{accessToken:'synthetic',user:{id:'synthetic',email:'reader@example.invalid',firstName:'Reader',role,status:'ACTIVE'}}})); }
test('public copy and issued reward use authoritative dynamic terms',async({page})=>{
 await page.route('**/api/v1/newsletter/offer',r=>r.fulfill({json:offer})); await page.route('**/auth/refresh',r=>r.fulfill({status:401,json:{}}));
 await page.goto('/'); await expect(page.locator('.site-footer__newsletterForm')).toContainText(offer.headline);
 await page.route('**/api/v1/newsletter/confirm',r=>r.fulfill({json:{confirmed:true,reward}}));
 await page.goto('/newsletter/confirm#token=synthetic'); await page.getByRole('button',{name:'Confirm subscription',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:reward.code})).toContainText(offer.terms); await expect(page.getByRole('status').filter({hasText:reward.code})).not.toContainText('10%');
});
test('admin previews safely and preserves draft on version conflict',async({page})=>{
 await auth(page,'ADMIN'); await page.route('**/api/v1/admin/newsletter?*',r=>r.fulfill({json:{items:[],total:0,page:1,limit:25,counts:{total:0,pending:0,subscribed:0,unsubscribed:0,deliveryFailed:0}}}));
 await page.route('**/api/v1/admin/newsletter/offer',r=>r.fulfill(r.request().method()==='PATCH'?{status:409,json:{message:'Offer changed'}}:{json:offer}));
 await page.route('**/api/v1/admin/newsletter/offer/preview',r=>r.fulfill({json:{...offer,subject:'Preview',html:'<h1>Email preview</h1>',text:'Preview'}}));
 await page.goto('/admin/newsletter'); await page.getByLabel('Offer type').selectOption('BUY_X_GET_Y'); await page.getByLabel('Paid units').fill('3');
 await page.getByRole('button',{name:'Preview offer',exact:true}).click(); await expect(page.locator('iframe[title="Welcome email preview"]')).toHaveAttribute('sandbox','');
 await page.getByRole('button',{name:'Save offer',exact:true}).click(); await expect(page.getByRole('alert').filter({hasText:'another administrator'})).toBeVisible(); await expect(page.getByLabel('Paid units')).toHaveValue('3');
});
test('account owns preference mutations and exposes return history/detail',async({page})=>{
 await auth(page); let unsub=false; await page.route('**/api/v1/newsletter/me',r=>r.fulfill({json:{status:unsub?'UNSUBSCRIBED':'SUBSCRIBED',confirmedAt:'2026-10-08',reward}}));
 await page.route('**/api/v1/newsletter/me/unsubscribe',r=>{expect(r.request().postDataJSON()).toEqual({});unsub=true;return r.fulfill({json:{unsubscribed:true}});});
 await page.goto('/account/rewards'); await expect(page.getByText(reward.code,{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Unsubscribe',exact:true}).click(); await expect(page.getByText('Unsubscribed',{exact:true})).toBeVisible();
 const item={id:'return-synthetic',status:'REQUESTED',reason:'Wrong size',notes:null,refundAmount:null,createdAt:'2026-10-08',updatedAt:'2026-10-08',order:{orderNumber:'ALT-SYNTHETIC',currency:'EGP'},items:[{id:'i',quantity:1,productName:'Training tee',colorName:'Black',size:'M',unitPrice:200}]};
 await page.route('**/api/v1/returns',r=>r.fulfill({json:[item]})); await page.route('**/api/v1/returns/return-synthetic',r=>r.fulfill({json:item}));
 await page.getByRole('link',{name:'Returns',exact:true}).click(); await page.getByRole('link',{name:'View return',exact:true}).click(); await expect(page.getByText('Training tee',{exact:true})).toBeVisible(); await expect(page.getByRole('link',{name:'ALT-SYNTHETIC',exact:true})).toHaveAttribute('href','/account/orders/ALT-SYNTHETIC');
});
test('discount register separates subscriber codes and submits buy/get rules',async({page})=>{
 await auth(page,'ADMIN'); const queries:string[]=[]; await page.route('**/api/v1/admin/discounts?*',r=>{queries.push(r.request().url());return r.fulfill({json:{items:[],total:30,page:1,limit:25}});});
 let body:any;await page.route('**/api/v1/admin/discounts',r=>{body=r.request().postDataJSON();return r.fulfill({json:{id:'new'}});});
 await page.goto('/admin/discounts');await page.getByLabel('Code source').selectOption('NEWSLETTER');await page.getByRole('button',{name:'Search',exact:true}).click();await expect.poll(()=>queries.some(q=>q.includes('source=NEWSLETTER'))).toBe(true);
 await page.getByRole('button',{name:'Create code',exact:true}).click();await page.getByLabel('Code', {exact:true}).fill('BUY-SYNTHETIC');await page.getByRole('combobox',{name:'Type',exact:true}).selectOption('BUY_X_GET_Y');await page.getByLabel('Paid units').fill('2');await page.getByLabel('Free units',{exact:true}).fill('1');await page.getByRole('button',{name:'Create discount',exact:true}).click();await expect.poll(()=>body?.buyQuantity).toBe(2);await expect.poll(()=>body?.giftQuantity).toBe(1);
});
test('no incentive signup avoids coupon promises and old snapshots keep old terms',async({page})=>{
 await page.route('**/auth/refresh',r=>r.fulfill({status:401,json:{}}));await page.route('**/api/v1/newsletter/offer',r=>r.fulfill({json:{...offer,config:{...config,type:'NONE'},headline:'Join the ALTURA community',terms:'Confirm your email to receive ALTURA updates.'}}));
 await page.goto('/');await expect(page.locator('.site-footer__newsletterForm')).toContainText('Join the ALTURA community');await expect(page.locator('.site-footer__newsletterForm')).not.toContainText('10%');
 await page.route('**/api/v1/newsletter/confirm',r=>r.fulfill({json:{confirmed:true,reward:{...reward,type:'PERCENTAGE',value:15,offer:{...config,type:'PERCENTAGE',value:15,validityDays:21},description:'15% off products.',terms:'One use within 21 days from issue.'}}}));
 await page.goto('/newsletter/confirm#token=synthetic-old');await page.getByRole('button',{name:'Confirm subscription',exact:true}).click();await expect(page.getByRole('status').filter({hasText:reward.code})).toContainText('21 days');await expect(page.getByRole('status').filter({hasText:reward.code})).toContainText('15%');
});
test('another account return is unavailable and personal coupons retain immutable fields',async({page})=>{
 await auth(page);await page.route('**/api/v1/returns/private-return',r=>r.fulfill({status:404,json:{}}));await page.goto('/account/returns/private-return');await expect(page.getByRole('alert').filter({hasText:'unavailable'})).toContainText('unavailable');
 await auth(page,'ADMIN');await page.route('**/api/v1/admin/discounts?*',r=>r.fulfill({json:{items:[{id:'personal',source:'NEWSLETTER',code:'NL-PERSONAL',type:'PERCENTAGE',value:10,currency:null,minimumSubtotal:null,maximumDiscount:null,startsAt:null,endsAt:'2030-01-01',usageLimit:1,perCustomerLimit:1,active:true,usageCount:0}],total:1,page:1,limit:25}}));
 await page.goto('/admin/discounts');await page.getByRole('button',{name:'Manage',exact:true}).click();await expect(page.getByLabel('Code',{exact:true})).toBeDisabled();await expect(page.getByLabel('Total uses',{exact:true})).toBeDisabled();await expect(page.getByLabel('Active',{exact:true})).toBeEnabled();
});
for(const width of [390,768,1440])test(`offer and account layouts fit ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await auth(page);await page.route('**/api/v1/newsletter/me',r=>r.fulfill({json:{status:'SUBSCRIBED',confirmedAt:'2026-10-08',reward}}));await page.goto('/account/rewards');await expect(page.getByText(reward.code,{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/altura-task4-account-${width}.png`,fullPage:true});
 await auth(page,'ADMIN');await page.route('**/api/v1/admin/newsletter/offer',r=>r.fulfill({json:offer}));await page.route('**/api/v1/admin/newsletter?*',r=>r.fulfill({json:{items:[],total:0,page:1,limit:25,counts:{total:0,pending:0,subscribed:0,unsubscribed:0,deliveryFailed:0}}}));await page.goto('/admin/newsletter');await expect(page.getByLabel('Offer type')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`/tmp/altura-task4-offer-${width}.png`,fullPage:true});
});
test('account reward distinguishes used codes from available rewards',async({page})=>{
 await auth(page);await page.route('**/api/v1/newsletter/me',r=>r.fulfill({json:{status:'SUBSCRIBED',confirmedAt:'2026-10-08',reward:{...reward,active:true,usageCount:1,usageLimit:1}}}));await page.goto('/account/rewards');await expect(page.getByText('Used',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Copy code',exact:true})).toBeDisabled();
});
