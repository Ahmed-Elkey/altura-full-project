const fs=require('fs'),{chromium,expect}=require('@playwright/test');
(async()=>{fs.mkdirSync('qa/full-stack',{recursive:true});const browser=await chromium.launch();try{
 const errors=[];for(const width of [390,768,1440]){const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.name));
 for(const [name,route]of [['home','/'],['collection','/collections/shopall'],['product','/products/meridian-tee'],['cart','/cart'],['checkout','/checkout'],['contact','/info/contact'],['return','/start-a-return'],['search','/search?q=meridian']]){
 const response=await page.goto('http://127.0.0.1:3100'+route);expect(response.status()).toBe(200);if(name!=='home')await expect(page.locator('h1:visible').first()).toBeVisible();await expect(page.locator('.loading-state')).toHaveCount(0);if(name==='product')await expect(page.getByRole('button',{name:'Add to cart',exact:true}).first()).toBeVisible();await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(name==='home'){await page.locator('.home-film--hero video').first().evaluate(async v=>{if(v.readyState<1)await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));await new Promise(r=>{v.addEventListener('seeked',r,{once:true});v.currentTime=1;});});}
 await page.screenshot({path:`qa/full-stack/public-${name}-${width}.png`,fullPage:name!=='home',animations:'disabled'});
 }await page.close();}expect(errors).toEqual([]);console.log('PASS: 24 public captures at 390/768/1440; HTTP200, no root overflow or page runtime errors.');
}finally{await browser.close();}})().catch(e=>{console.error(e.name+': public visual capture failed');process.exitCode=1;});
