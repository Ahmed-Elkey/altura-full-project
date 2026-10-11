import { expect, test } from '@playwright/test';
test.use({ trace: 'off', screenshot: 'off' });
test.beforeEach(async ({ page }) => {
  await page.route('**/auth/refresh', route => route.fulfill({ json: { accessToken: 'synthetic', user: { id: 'admin', email: 'admin@example.invalid', firstName: 'QA', role: 'ADMIN', status: 'ACTIVE' } } }));
});
test('shipping creates zone and validates method estimates without sending invalid mutations', async ({ page }) => {
  let zones: any[] = []; let calls = 0;
  await page.route('**/admin/shipping', route => route.request().resourceType() === 'document' ? route.continue() : route.fulfill({ json: zones }));
  await page.route('**/admin/shipping/zones', route => {
    expect(route.request().postDataJSON()).toMatchObject({ name: 'Egypt', countries: ['EG'] });
    zones = [{ id: 'zone', name: 'Egypt', countries: ['EG'], active: true, methods: [] }];
    return route.fulfill({ json: zones[0] });
  });
  await page.route('**/admin/shipping/methods', route => { calls++; return route.fulfill({ json: {} }); });
  await page.goto('/admin/shipping');
  await page.getByRole('button', { name: 'Add zone', exact: true }).click();
  await page.getByLabel('Zone name', { exact: true }).fill('Egypt');
  await page.getByLabel('Country codes', { exact: true }).fill('eg');
  await page.getByRole('button', { name: 'Save zone', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Zone saved');
  await page.getByRole('button', { name: 'Add method', exact: true }).click();
  await page.getByLabel('Method name', { exact: true }).fill('Standard');
  await page.getByLabel('Code', { exact: true }).fill('STANDARD');
  await page.getByLabel('Minimum days', { exact: true }).fill('8');
  await page.getByLabel('Maximum days', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save method', exact: true }).click();
  await expect(page.locator('.admin-error')).toContainText('Minimum delivery');
  expect(calls).toBe(0);
});
test('taxonomy keeps edited values after server rejection and saves position and parent', async ({ page }) => {
  let failure = true;
  await page.route('**/admin/catalog/categories', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    expect(route.request().postDataJSON()).toMatchObject({ name: 'Tops', slug: 'tops', position: 2, parentSlug: '' });
    return route.fulfill(failure ? { status: 409, json: { message: 'Slug already exists' } } : { json: { id: 'tops' } });
  });
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Tops');
  await page.getByLabel('Slug', { exact: true }).fill('tops');
  await page.getByLabel('Position', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.locator('.admin-error')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Tops');
  failure = false;
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Category saved');
});
test('product saves taxonomy selections and image metadata through catalog APIs', async ({ page }) => {
  const product = { id: 'product', name: 'Test top', slug: 'test-top', shortDescription: '', description: 'Test product description', basePrice: 100, status: 'DRAFT', currency: 'EGP', featured: false, categories: [], collections: [], variants: [], images: [{ id: 'image', url: '/icon.svg', altText: 'Old text', colorName: '', view: '', position: 0, isPrimary: false }] };
  let assignmentSaved = false; let imageSaved = false;
  await page.route('**/admin/catalog/categories', route => route.fulfill({ json: [{ id: 'cat', slug: 'tops', name: 'Tops' }] }));
  await page.route('**/admin/catalog/collections', route => route.fulfill({ json: [{ id: 'col', slug: 'summer', name: 'Summer' }] }));
  await page.route('**/admin/catalog/products/product', route => {
    if (route.request().method() === 'PATCH') { expect(route.request().postDataJSON()).toMatchObject({ categorySlugs: ['tops'], collectionSlugs: ['summer'] }); assignmentSaved = true; }
    return route.fulfill({ json: product });
  });
  await page.route('**/admin/catalog/images/image', route => { expect(route.request().postDataJSON()).toMatchObject({ altText: 'New description', position: 2, isPrimary: true }); imageSaved = true; return route.fulfill({ json: {} }); });
  await page.goto('/admin/products/product');
  await page.getByLabel('Category: Tops', { exact: true }).check();
  await page.getByLabel('Collection: Summer', { exact: true }).check();
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Product saved'); expect(assignmentSaved).toBe(true);
  const image = page.getByRole('group', { name: 'Edit image 1' });
  await image.getByLabel('Alt text', { exact: true }).fill('New description');
  await image.getByLabel('Position', { exact: true }).fill('2');
  await image.getByLabel('Primary image', { exact: true }).check();
  await image.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Image saved'); expect(imageSaved).toBe(true);
});
test('product does not claim success when the saved record cannot be refreshed', async ({ page }) => {
  let saved = false;
  await page.route('**/admin/catalog/categories', route => route.fulfill({ json: [] }));
  await page.route('**/admin/catalog/collections', route => route.fulfill({ json: [] }));
  await page.route('**/admin/catalog/products/product', route => {
    if (route.request().method() === 'PATCH') { saved = true; return route.fulfill({ json: {} }); }
    if (saved) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: { id: 'product', name: 'Test top', slug: 'test-top', shortDescription: '', description: 'Test product description', basePrice: 100, status: 'DRAFT', currency: 'EGP', featured: false, categories: [], collections: [], variants: [], images: [] } });
  });
  await page.goto('/admin/products/product');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.locator('.admin-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save product', exact: true })).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Product saved' })).toHaveCount(0);
});
for (const width of [390, 768, 1440]) {
  test(`collection publishing remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let saved = false;
    await page.route('**/admin/catalog/collections', route => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toMatchObject({ name: 'Summer', slug: 'summer', status: 'ACTIVE', position: 1 }); saved = true;
        return route.fulfill({ json: { id: 'summer' } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto('/admin/collections');
    await page.getByRole('button', { name: 'Add collection', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Summer');
    await page.getByLabel('Slug', { exact: true }).fill('summer');
    await page.getByLabel('Position', { exact: true }).fill('1');
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('ACTIVE');
    await page.getByRole('button', { name: 'Save collection', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Collection saved'); expect(saved).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
test('image save preserves unsaved product and variant drafts', async ({page})=>{
 const product={id:'product',name:'Test top',slug:'test-top',description:'Original product description',basePrice:100,status:'DRAFT',currency:'EGP',featured:false,categories:[],collections:[],variants:[{id:'variant',sku:'TEST',colorName:'Bone',colorHex:null,size:'S',price:100,active:true,inventory:null}],images:[{id:'image',url:'/icon.svg',altText:'Original',position:0,isPrimary:false}]};
 await page.route('**/admin/catalog/categories',r=>r.fulfill({json:[]}));await page.route('**/admin/catalog/collections',r=>r.fulfill({json:[]}));await page.route('**/admin/catalog/products/product',r=>r.fulfill({json:product}));await page.route('**/admin/catalog/images/image',r=>r.fulfill({json:{}}));
 await page.goto('/admin/products/product');await page.getByLabel('Name',{exact:true}).fill('Unsaved new name');await page.locator('.admin-variant-card').getByLabel('SKU',{exact:true}).fill('UNSAVED-SKU');await page.getByRole('group',{name:'Edit image 1'}).getByRole('button',{name:'Save image',exact:true}).click();await expect(page.getByRole('status')).toContainText('Image saved');await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Unsaved new name');await expect(page.locator('.admin-variant-card').getByLabel('SKU',{exact:true})).toHaveValue('UNSAVED-SKU');
});
test('taxonomy prevents switching editors and changing fields while saving', async ({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
 await page.route('**/admin/catalog/categories',async r=>{if(r.request().method()==='GET')return r.fulfill({json:[{id:'cat',name:'Existing',slug:'existing',position:0,description:''}]});await gate;return r.fulfill({json:{id:'new'}});});
 await page.goto('/admin/categories');await page.getByRole('button',{name:'Add category',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('New');await page.getByLabel('Slug',{exact:true}).fill('new');await page.getByRole('button',{name:'Save category',exact:true}).click();
 try{await expect(page.getByRole('button',{name:'Add category',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Edit Existing',exact:true})).toBeDisabled();await expect(page.getByLabel('Name',{exact:true})).toBeDisabled();}finally{release();}
 await expect(page.getByRole('status')).toContainText('Category saved');
});
test('saving a new primary image updates the previous primary without discarding other metadata drafts',async({page})=>{
 const product={id:'product',name:'Test top',slug:'test-top',description:'Original product description',basePrice:100,status:'DRAFT',currency:'EGP',featured:false,categories:[],collections:[],variants:[],images:[{id:'old',url:'/icon.svg',altText:'Original',position:0,isPrimary:true},{id:'new',url:'/icon.svg',altText:'Second',position:1,isPrimary:false}]};
 await page.route('**/admin/catalog/categories',r=>r.fulfill({json:[]}));await page.route('**/admin/catalog/collections',r=>r.fulfill({json:[]}));await page.route('**/admin/catalog/products/product',r=>r.fulfill({json:product}));await page.route('**/admin/catalog/images/new',r=>{product.images[0].isPrimary=false;product.images[1].isPrimary=true;return r.fulfill({json:{}});});
 await page.goto('/admin/products/product');const old=page.getByRole('group',{name:'Edit image 1'});const next=page.getByRole('group',{name:'Edit image 2'});await old.getByLabel('Alt text',{exact:true}).fill('Unsaved metadata');await next.getByLabel('Primary image',{exact:true}).check();await next.getByRole('button',{name:'Save image',exact:true}).click();await expect(page.getByRole('status')).toContainText('Image saved');await expect(old.getByLabel('Alt text',{exact:true})).toHaveValue('Unsaved metadata');await expect(old.getByLabel('Primary image',{exact:true})).not.toBeChecked();
});
test('a deactivated variant can be reactivated without losing product drafts', async ({page})=>{
 const product={id:'product',name:'Test top',slug:'test-top',description:'Original product description',basePrice:100,status:'ACTIVE',currency:'EGP',featured:false,categories:[],collections:[],variants:[{id:'variant',sku:'TEST',colorName:'Bone',colorHex:null,size:'S',price:100,active:false,inventory:null}],images:[]};
 await page.route('**/api/v1/admin/catalog/categories',r=>r.fulfill({json:[]}));await page.route('**/api/v1/admin/catalog/collections',r=>r.fulfill({json:[]}));await page.route('**/api/v1/admin/catalog/products/product',r=>r.fulfill({json:product}));await page.route('**/api/v1/admin/catalog/variants/variant',r=>{expect(r.request().postDataJSON()).toEqual({active:true});product.variants[0].active=true;return r.fulfill({json:{}})});
 await page.goto('/admin/products/product');await page.getByLabel('Name',{exact:true}).fill('Unsaved title');await page.locator('.admin-variant-card').getByLabel('SKU',{exact:true}).fill('UNSAVED');await page.getByRole('button',{name:'Reactivate',exact:true}).click({timeout:2000});await expect(page.getByRole('status')).toContainText('Variant reactivated');await expect(page.locator('.admin-variant-card').getByLabel('SKU',{exact:true})).toHaveValue('UNSAVED');await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Unsaved title');await expect(page.locator('.admin-variant-card').getByRole('button',{name:'Deactivate',exact:true})).toBeVisible();
});

test('product SEO fields persist, survive image saves and can be cleared for automatic metadata', async ({ page }) => {
  const product = { id: 'product', name: 'Test top', slug: 'test-top', description: 'Product details', basePrice: 100, status: 'DRAFT', currency: 'EGP', featured: false, categories: [], collections: [], variants: [], images: [{ id: 'image', url: '/icon.svg', altText: 'Test', position: 0, isPrimary: true }], seoTitle: 'Existing title', seoDescription: 'Existing description' };
  await page.route('**/admin/catalog/categories', r => r.fulfill({ json: [] }));
  await page.route('**/admin/catalog/collections', r => r.fulfill({ json: [] }));
  await page.route('**/admin/catalog/images/image', r => r.fulfill({ json: {} }));
  await page.route('**/admin/catalog/products/product', r => {
    if (r.request().method() === 'PATCH') Object.assign(product, r.request().postDataJSON());
    return r.fulfill({ json: product });
  });
  await page.goto('/admin/products/product');
  await expect(page.getByLabel('SEO title', { exact: true })).toHaveValue('Existing title');
  await page.getByLabel('SEO title', { exact: true }).fill('Running top');
  await page.getByLabel('SEO description', { exact: true }).fill('Explore available running top sizes and colors.');
  await page.getByRole('group', { name: 'Edit image 1' }).getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Image saved');
  await expect(page.getByLabel('SEO title', { exact: true })).toHaveValue('Running top');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Product saved');
  expect(product.seoTitle).toBe('Running top');
  expect(product.seoDescription).toBe('Explore available running top sizes and colors.');
  await page.getByLabel('SEO title', { exact: true }).fill('');
  await page.getByLabel('SEO description', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Product saved');
  expect(product.seoTitle).toBe(''); expect(product.seoDescription).toBe('');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByLabel('SEO title', { exact: true })).toBeVisible();
    await expect(page.getByLabel('SEO description', { exact: true })).toBeVisible();
  }
});
