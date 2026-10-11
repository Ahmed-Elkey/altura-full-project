// Real local API/DB integration, captured mail only. Temporary records are cleaned.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const env=require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(__dirname,'../backend/.env'))),db=new URL(env.DATABASE_URL);
assert.ok(db.hostname==='127.0.0.1'&&db.port==='5434'&&db.pathname==='/altura_friend','Selected local database required');
const {PrismaClient}=require('../backend/node_modules/@prisma/client'),{ConfigService}=require('../backend/node_modules/@nestjs/config'),{JwtService}=require('../backend/node_modules/@nestjs/jwt');
const {JwtTokenService}=require('../backend/dist/src/common/security/jwt-token.service'),{NewsletterOfferService}=require('../backend/dist/src/modules/newsletter/newsletter-offer.service'),{NewsletterService}=require('../backend/dist/src/modules/newsletter/newsletter.service'),{DEFAULT_OFFER}=require('../backend/dist/src/modules/newsletter/offer-config');
const prisma=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}}),config=new ConfigService(env),jwt=new JwtTokenService(config,new JwtService()),offers=new NewsletterOfferService(prisma);
const ids={users:[],subscribers:[],rewards:[],carts:[],orders:[],products:[],zones:[],methods:[],returns:[]},tag=randomUUID();let stage='setup',original,lastVersion,admin,lastResponseStatus;
const auth=user=>({Authorization:'Bearer '+jwt.issue({sub:user.id,email:user.email,role:user.role,ver:user.authVersion}).token});
async function api(endpoint,method='GET',body,user=admin,extra={}){const r=await fetch('http://127.0.0.1:4000/api/v1'+endpoint,{method,headers:{...(user?auth(user):{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});lastResponseStatus=r.status;return {status:r.status,data:await r.json()};}
async function ok(endpoint,method,body,user,expected=200,extra){const r=await api(endpoint,method,body,user,extra);assert.equal(r.status,expected,`Unexpected response at ${stage}`);return r.data;}
async function user(role='CUSTOMER'){const u=await prisma.user.create({data:{email:`qa-offer-${role.toLowerCase()}-${randomUUID()}@example.invalid`,passwordHash:'synthetic-unusable-password',role}});ids.users.push(u.id);return u;}
(async()=>{try{
 admin=await user('ADMIN');original=await offers.get();lastVersion=original.version;
 stage='admin/public permissions';assert.equal((await api('/admin/newsletter/offer','GET',null,null)).status,401);const stranger=await user();assert.equal((await api('/admin/newsletter/offer','GET',null,stranger)).status,403);
 stage='shipping mutations';const zones=await prisma.shippingZone.findMany({where:{active:true}});const country=['AQ','TF','BV','UM'].find(c=>!zones.some(z=>z.countries.includes(c)));assert.ok(country);
 const zone=await ok('/admin/shipping/zones','POST',{name:'Synthetic QA '+tag,countries:[country],active:true},admin,201);ids.zones.push(zone.id);
 const method=await ok('/admin/shipping/methods','POST',{zoneId:zone.id,name:'Synthetic delivery',code:('QA_'+tag.replaceAll('-','')).toUpperCase(),price:12,currency:'EGP',estimatedMinDays:2,estimatedMaxDays:5},admin,201);ids.methods.push(method.id);
 await ok('/admin/shipping/methods/'+method.id,'PATCH',{price:15},admin);await ok('/admin/shipping/methods/'+method.id,'PATCH',{price:12},admin);
 stage='synthetic purchasable product';const product=await prisma.product.create({data:{slug:'qa-offer-'+tag,name:'Synthetic offer QA',description:'Temporary integration product',status:'ACTIVE',basePrice:100,variants:{create:{sku:'QA-'+tag,colorName:'QA',size:'M',price:100,inventory:{create:{quantity:20}}}}},include:{variants:true}});ids.products.push(product.id);const variant=product.variants[0];let captured=[];
 const newsletter=new NewsletterService(prisma,config,{assertConfigured(){},async sendMessage(email,message){captured.push({email,message});}},offers);
 let oldReward;
 for(const type of ['PERCENTAGE','FIXED_AMOUNT','FREE_SHIPPING','BUY_X_GET_Y','NONE']){
  stage='configure '+type;const offer={...DEFAULT_OFFER,type,value:type==='PERCENTAGE'?20:type==='FIXED_AMOUNT'?50:0};const saved=await ok('/admin/newsletter/offer','PATCH',{version:lastVersion,config:offer},admin);lastVersion=saved.version;
  assert.equal((await api('/admin/newsletter/offer','PATCH',{version:lastVersion-1,config:offer},admin)).status,409);
  const shown=await ok('/newsletter/offer','GET',null,null);assert.equal(shown.config.type,type);
  const preview=await ok('/admin/newsletter/offer/preview','POST',{config:offer},admin,201);assert.equal(preview.description,shown.description);assert.ok(preview.html.includes('ALTURA'));
  const shopper=await user();const before=captured.length;await newsletter.subscribe(shopper.email);
  for(let n=0;n<40&&captured.length===before;n++)await new Promise(r=>setTimeout(r,50));assert.equal(captured.length,before+1);
  const subscriber=await prisma.newsletterSubscriber.findUnique({where:{email:shopper.email}});ids.subscribers.push(subscriber.id);if(subscriber.rewardDiscountId)ids.rewards.push(subscriber.rewardDiscountId);
  const text=captured.at(-1).message.text;assert.ok(text.includes(shown.description));const link=text.match(/http[^\s]+\/newsletter\/confirm#token=[^\s]+/)[0],token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');
  const confirmed=await ok('/newsletter/confirm','POST',{token},null,201);const code=confirmed.reward?.code;
  const me=await ok('/newsletter/me','GET',null,shopper);assert.equal(me.status,'SUBSCRIBED');if(type==='NONE'){assert.equal(me.reward,null);continue;}
  assert.equal(me.reward.offer.type,type);if(type==='PERCENTAGE')oldReward={id:subscriber.rewardDiscountId,config:me.reward.offer};
  await newsletter.subscribe(shopper.email);await new Promise(r=>setTimeout(r,60));assert.equal(captured.length,before+1);
  const cart=await prisma.cart.create({data:{userId:shopper.id,items:{create:{variantId:variant.id,quantity:3}}}});ids.carts.push(cart.id);
  const payload={email:shopper.email,shippingAddress:{recipientName:'Synthetic QA',line1:'17 Test Street',city:'QA',countryCode:country},shippingMethodId:method.id,discountCode:code};
  stage='actual quote '+type;const quote=await ok('/checkout/quote','POST',payload,shopper,201);assert.equal(quote.totals.subtotal,300);
  assert.equal(quote.discount.itemDiscount,type==='PERCENTAGE'?60:type==='FIXED_AMOUNT'?50:type==='BUY_X_GET_Y'?100:0);assert.equal(quote.discount.shippingDiscount,type==='FREE_SHIPPING'?12:0);
  if(type==='BUY_X_GET_Y'){
   assert.equal(quote.discount.promotion.freeUnits,1);stage='gift order and stock';const orderResponse=await ok('/checkout/place-order','POST',{...payload,paymentMethod:'CASH_ON_DELIVERY'},shopper,201,{'Idempotency-Key':'qa-'+randomUUID()});const order=orderResponse.order;ids.orders.push(order.id);assert.equal(order.totals.grandTotal,212);assert.equal(order.promotion.freeUnits,1);
   const stock=await prisma.inventory.findUnique({where:{variantId:variant.id}});assert.equal(stock.quantity,17);assert.equal(stock.reservedQuantity,0);assert.equal(await prisma.discountUsage.count({where:{discountId:subscriber.rewardDiscountId}}),1);
   stage='single redemption';await prisma.cart.create({data:{userId:shopper.id,items:{create:{variantId:variant.id,quantity:3}}}}).then(c=>ids.carts.push(c.id));assert.equal((await api('/checkout/quote','POST',payload,shopper)).status,400);
   stage='process gift order';await ok('/admin/orders/'+order.orderNumber+'/workflow','PATCH',{status:'PROCESSING'},admin);stage='mark gift shipped';await ok('/admin/orders/'+order.orderNumber+'/workflow','PATCH',{status:'SHIPPED',trackingNumber:'QA-TRACK-'+tag},admin);stage='collect cash for delivered gift order';await ok('/admin/orders/'+order.orderNumber+'/collect-cash','POST',{},admin,201);stage='mark gift delivered';await ok('/admin/orders/'+order.orderNumber+'/workflow','PATCH',{status:'DELIVERED'},admin);
   stage='partial bundle rejection';assert.equal((await api('/returns','POST',{orderNumber:order.orderNumber,reason:'QA bundle return',items:[{orderItemId:order.items[0].id,quantity:1}]},shopper)).status,409);
   stage='complete bundle return';const returned=await ok('/returns','POST',{orderNumber:order.orderNumber,reason:'QA bundle return',items:[{orderItemId:order.items[0].id,quantity:3}]},shopper,201);ids.returns.push(returned.id);
   stage='return ownership';assert.equal((await api('/returns/'+returned.id,'GET',null,stranger)).status,404);stage='return history';const history=await ok('/returns','GET',null,shopper);assert.ok(history.items?history.items.some(r=>r.id===returned.id):history.some(r=>r.id===returned.id));
   stage='gift return paid-value accounting';for(const status of ['APPROVED','IN_TRANSIT','RECEIVED']){const updated=await ok('/admin/returns/'+returned.id,'PATCH',{status},admin);if(status==='RECEIVED')assert.equal(updated.refundAmount,200);}
   stage='cash repayment is not falsely marked complete';assert.equal((await api('/admin/returns/'+returned.id,'PATCH',{status:'REFUNDED'},admin)).status,409);
  }
  stage='earned coupon immutability';assert.equal((await api('/admin/discounts/'+subscriber.rewardDiscountId,'PATCH',{value:99},admin)).status,409);
  await ok('/newsletter/me/unsubscribe','POST',{},shopper,201);assert.equal((await ok('/newsletter/me','GET',null,shopper)).status,'UNSUBSCRIBED');
 }
 stage='old issued terms survive later campaign';assert.deepEqual((await prisma.discount.findUnique({where:{id:oldReward.id}})).offerSnapshot,oldReward.config);
 stage='discount pagination';const register=await ok('/admin/discounts?page=1&limit=2&source=NEWSLETTER','GET',null,admin);assert.equal(register.items.length,2);assert.ok(register.items.every(d=>d.source==='NEWSLETTER'));
 console.log('PASS: live admin/public settings and version conflicts, captured dynamic emails, all five incentive modes, real checkout quotes, gift COD order/stock/one-use, frozen terms, owned rewards/returns, bundle rejection, shipping edits and discount pagination. No outbound email.');
 }finally{
  if(original&&admin){const current=await offers.get();assert.equal(current.version,lastVersion,'Settings changed outside QA; refuse overwrite');await offers.update(admin.id,current.version,original.config);}
  if(ids.returns.length)await prisma.returnRequest.deleteMany({where:{id:{in:ids.returns}}});
  if(ids.orders.length){const where={orderId:{in:ids.orders}};await prisma.discountUsage.deleteMany({where});await prisma.shipment.deleteMany({where});await prisma.payment.deleteMany({where});await prisma.orderAddress.deleteMany({where});await prisma.orderItem.deleteMany({where});await prisma.order.deleteMany({where:{id:{in:ids.orders}}});}
  if(ids.subscribers.length)await prisma.newsletterSubscriber.deleteMany({where:{id:{in:ids.subscribers}}});if(ids.rewards.length)await prisma.discount.deleteMany({where:{id:{in:ids.rewards}}});
  if(ids.carts.length)await prisma.cart.deleteMany({where:{id:{in:ids.carts}}});if(ids.products.length)await prisma.product.deleteMany({where:{id:{in:ids.products}}});if(ids.methods.length)await prisma.shippingMethod.deleteMany({where:{id:{in:ids.methods}}});if(ids.zones.length)await prisma.shippingZone.deleteMany({where:{id:{in:ids.zones}}});
  if(ids.users.length){await prisma.auditLog.deleteMany({where:{actorUserId:{in:ids.users}}});await prisma.user.deleteMany({where:{id:{in:ids.users}}});}await prisma.$disconnect();
 }
})().catch(()=>{console.error('Configurable offer QA failed at:',stage,'last HTTP status:',lastResponseStatus,'(sensitive details omitted)');process.exitCode=1;});
