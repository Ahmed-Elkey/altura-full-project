import { test, expect, type Page } from '@playwright/test';
test.use({trace:'off',screenshot:'off'});
const headers={'Access-Control-Allow-Origin':process.env.ALTURA_BASE_URL||'http://127.0.0.1:3100','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'};
const user={id:'qa',email:'qa@example.invalid',firstName:'QA',lastName:'Shopper',phone:'+201000000000',role:'ADMIN',status:'ACTIVE'};
async function auth(page:Page){await page.route('**/api/v1/**',r=>r.request().method()==='OPTIONS'?r.fulfill({status:204,headers}):r.fallback());await page.route('**/auth/refresh',r=>r.fulfill({headers,json:{accessToken:'synthetic',user}}));}
function inventory(){return ['A','B'].map((sku,index)=>({id:sku,variantId:sku,sku,colorName:'Bone',size:'S',variantActive:true,product:{id:sku,slug:sku,name:`Product ${sku}`,status:'ACTIVE'},quantity:10,reservedQuantity:0,availableQuantity:10,lowStockThreshold:2,lowStock:false,updatedAt:'2026-10-08T00:00:00Z'}));}
test('inventory save preserves drafts on other rows and the applied search',async({page})=>{
 await auth(page);const items=inventory();const queries:string[]=[];
 await page.route('**/api/v1/admin/inventory?*',r=>{queries.push(new URL(r.request().url()).searchParams.get('q')||'');return r.fulfill({headers,json:{items,page:1,limit:50,total:2,pages:1}})});
 await page.route('**/api/v1/admin/inventory/A',r=>{items[0].quantity=r.request().postDataJSON().quantity;return r.fulfill({headers,json:items[0]})});
 await page.goto('/admin/inventory?q=applied');await page.getByLabel('Physical stock for B').fill('17');await page.getByLabel('Physical stock for A').fill('12');await page.getByPlaceholder('Product, SKU, color or size').fill('not-applied');
 await page.locator('tbody tr').filter({hasText:'Product A'}).getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('A inventory saved');await expect(page.getByLabel('Physical stock for B')).toHaveValue('17');expect(queries.at(-1)).toBe('applied');
});
test('inventory does not claim success when refresh fails after save',async({page})=>{
 await auth(page);let saved=false;
 await page.route('**/api/v1/admin/inventory?*',r=>r.fulfill(saved?{headers,status:503,json:{}}:{headers,json:{items:inventory(),page:1,limit:50,total:2,pages:1}}));
 await page.route('**/api/v1/admin/inventory/A',r=>{saved=true;return r.fulfill({headers,json:{}})});
 await page.goto('/admin/inventory');await page.getByLabel('Physical stock for A').fill('12');await page.locator('tbody tr').filter({hasText:'Product A'}).getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.admin-error')).toBeVisible();await expect(page.locator('.admin-success')).toHaveCount(0);
});
test('profile submits an explicit empty phone when clearing the saved number',async({page})=>{
 await auth(page);let body:any;
 await page.route('**/api/v1/users/me/addresses',r=>r.fulfill({headers,json:[]}));await page.route('**/api/v1/users/me',r=>{body=r.request().postDataJSON();return r.fulfill({headers,json:{...user,phone:null}})});
 await page.goto('/account/profile');await page.getByRole('button',{name:'Edit',exact:true}).first().click();await page.getByPlaceholder('Phone (optional)').fill('');await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>body).toMatchObject({phone:''});
});
test('inventory retry after failed refresh preserves unrelated drafts',async({page})=>{
 await auth(page);const items=inventory();let saved=false,fail=true;
 await page.route('**/api/v1/admin/inventory?*',r=>r.fulfill(saved&&fail?{headers,status:503,json:{}}:{headers,json:{items,page:1,limit:50,total:2,pages:1}}));await page.route('**/api/v1/admin/inventory/A',r=>{saved=true;items[0].quantity=12;return r.fulfill({headers,json:{}})});
 await page.goto('/admin/inventory');await page.getByLabel('Physical stock for B').fill('17');await page.getByLabel('Physical stock for A').fill('12');await page.locator('tbody tr').filter({hasText:'Product A'}).getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.admin-error')).toBeVisible();fail=false;items[1].product.name='Refreshed B';await page.locator('.admin-error').getByRole('button').click();await expect(page.getByText('Refreshed B',{exact:true})).toBeVisible();await expect(page.locator('.admin-error')).toHaveCount(0);await expect(page.getByLabel('Physical stock for B')).toHaveValue('17');
});
test('inventory locks the submitted row while mutation is pending',async({page})=>{
 await auth(page);const items=inventory();let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/v1/admin/inventory?*',r=>r.fulfill({headers,json:{items,page:1,limit:50,total:2,pages:1}}));await page.route('**/api/v1/admin/inventory/A',async r=>{await gate;return r.fulfill({headers,json:{}})});
 await page.goto('/admin/inventory');await page.getByLabel('Physical stock for A').fill('12');await page.locator('tbody tr').filter({hasText:'Product A'}).getByRole('button',{name:'Save',exact:true}).click();try{await expect(page.getByLabel('Physical stock for A')).toBeDisabled({timeout:1000});}finally{release();}
});
test('admin restores its session once instead of rotating the same cookie twice',async({page})=>{
 let refreshes=0;await page.route('**/api/v1/auth/refresh',r=>{refreshes++;return r.fulfill({headers,json:{accessToken:'synthetic',user}})});await page.route('**/api/v1/admin/inventory?*',r=>r.fulfill({headers,json:{items:inventory(),page:1,limit:50,total:2,pages:1}}));
 await page.goto('/admin/inventory');await expect(page.getByLabel('Physical stock for A')).toBeVisible();expect(refreshes).toBe(1);
});
