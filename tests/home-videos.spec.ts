import {test,expect} from '@playwright/test';
const playing = (videos: ReturnType<import('@playwright/test').Page['locator']>) => videos.evaluateAll(v=>v.some(x=>!(x as HTMLVideoElement).paused && (x as HTMLVideoElement).currentTime>0));
test('reduced motion keeps films still without playback buttons',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.locator('.home-film--hero video').first()).toBeVisible();
  await expect.poll(()=>page.locator('.home-film--hero video').evaluateAll(v=>v.every(x=>(x as HTMLVideoElement).paused))).toBe(true);
  await expect(page.locator('.home-film button')).toHaveCount(0);
});
test('hero autoplays without playback buttons or the removed poster',async({page})=>{
  await page.goto('/');await expect.poll(()=>playing(page.locator('.home-film--hero video'))).toBe(true);
  await expect(page.locator('.home-film button')).toHaveCount(0);await expect(page.locator('video[poster]')).toHaveCount(0);
});
for(const width of [390,768,1440])test(`homepage film framing remains readable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/');const hero=page.locator('#pb-row-hero-home:visible');
  await expect(hero).toBeVisible();if(width===390)expect((await hero.boundingBox())!.height).toBeLessThan(650);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('about film retains the outro and blends at the full duration',async({page})=>{
  await page.goto('/');const film=page.locator('.home-film--about');const videos=film.locator('video');await expect(videos).toHaveCount(2);
  expect(await videos.evaluateAll(v=>v.every(x=>(x as HTMLVideoElement).paused))).toBe(true);
  await film.scrollIntoViewIfNeeded();await expect.poll(()=>playing(videos)).toBe(true);
  const old=await videos.evaluateAll(v=>v.findIndex(x=>getComputedStyle(x).opacity==='1'));
  await videos.nth(old).evaluate(v=>{(v as HTMLVideoElement).currentTime=8.65;});
  await expect.poll(()=>videos.nth(old).evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(9);
  expect(await videos.nth(old).evaluate(v=>getComputedStyle(v).opacity)).toBe('1');
  await videos.nth(old).evaluate(v=>{const video=v as HTMLVideoElement;video.currentTime=video.duration-0.65;});
  await expect.poll(()=>videos.evaluateAll(v=>v.some(x=>{const opacity=Number(getComputedStyle(x).opacity);return opacity>0&&opacity<1;})),{intervals:[25]}).toBe(true);
  await expect.poll(()=>videos.evaluateAll(v=>v.findIndex(x=>getComputedStyle(x).opacity==='1'))).toBe(1-old);
});
test('scrolling away pauses decoding and returning resumes',async({page})=>{
  await page.goto('/');const film=page.locator('.home-film--hero');const videos=film.locator('video');await expect.poll(()=>playing(videos)).toBe(true);
  await page.locator('.site-footer').scrollIntoViewIfNeeded();await expect.poll(()=>videos.evaluateAll(v=>v.every(x=>(x as HTMLVideoElement).paused))).toBe(true);
  await film.scrollIntoViewIfNeeded();await expect.poll(()=>playing(videos)).toBe(true);
});
test('a failed film gives a readable fallback without playback controls',async({page})=>{
  await page.route('**/video/altura-hero-home.mp4',r=>r.abort());await page.goto('/');
  await expect(page.locator('.home-film--hero').getByText('Video unavailable')).toBeVisible();await expect(page.locator('.home-film button')).toHaveCount(0);
});
test('visibility changes pause decoding and resume',async({page})=>{
  await page.goto('/');const videos=page.locator('.home-film--hero video');await expect.poll(()=>playing(videos)).toBe(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>videos.evaluateAll(v=>v.every(x=>(x as HTMLVideoElement).paused))).toBe(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>playing(videos)).toBe(true);
});
