// Read-only audit of the explicitly selected local database. Never print credentials or rows.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const env=require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root,'backend/.env')));
const target=new URL(env.DATABASE_URL);
assert.ok(target.hostname==='127.0.0.1'&&target.port==='5434'&&target.pathname==='/altura_friend','Local QA database required');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
(async()=>{try{
const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const [identity]=await tx.$queryRawUnsafe('SELECT inet_server_port() AS port, current_database() AS name');
 assert.equal(identity.port,5434);assert.equal(identity.name,'altura_friend');
 const migrations=await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
 const applied=migrations.filter(m=>m.finished_at&&!m.rolled_back_at);
 const folder=path.join(root,'backend/prisma/migrations');const files=fs.readdirSync(folder,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);
 assert.equal(applied.length,files.length,'Applied migration inventory differs from local files');
 for(const name of files){const migration=applied.find(m=>m.migration_name===name);assert.ok(migration,'Unapplied migration: '+name);assert.equal(migration.checksum,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name,'migration.sql'))).digest('hex'),'Migration checksum differs: '+name);}
 assert.equal(migrations.filter(m=>!m.finished_at&&!m.rolled_back_at).length,0,'Failed migration pending');
 const checks={
 inventoryBounds:'SELECT count(*)::int AS n FROM "Inventory" WHERE quantity<0 OR "reservedQuantity"<0 OR "reservedQuantity">quantity OR "lowStockThreshold"<0',
 cartQuantities:'SELECT count(*)::int AS n FROM "CartItem" WHERE quantity<=0',
 orderAmounts:'SELECT count(*)::int AS n FROM "Order" WHERE subtotal<0 OR "discountTotal"<0 OR "shippingTotal"<0 OR "taxTotal"<0 OR "grandTotal"<0 OR abs("grandTotal"-(subtotal-"discountTotal"+"shippingTotal"+"taxTotal"))>0.01',
 orderSubtotalMatchesItems:'SELECT count(*)::int AS n FROM "Order" o WHERE abs(o.subtotal-COALESCE((SELECT sum(i."lineTotal") FROM "OrderItem" i WHERE i."orderId"=o.id),0))>0.01',
 orderItems:'SELECT count(*)::int AS n FROM "OrderItem" WHERE quantity<=0 OR "unitPrice"<0 OR "lineTotal"<0 OR abs("lineTotal"-quantity*"unitPrice")>0.01',
 paymentRefundBounds:'SELECT count(*)::int AS n FROM "Payment" WHERE amount<0 OR "refundedAmount"<0 OR "refundedAmount">amount',
 returnQuantities:'SELECT count(*)::int AS n FROM "ReturnItem" WHERE quantity<=0',
 invalidIndexes:'SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\' AND (NOT i.indisvalid OR NOT i.indisready)',
 unvalidatedConstraints:'SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=\'public\' AND NOT c.convalidated'
 };
 const counts={};for(const [name,sql]of Object.entries(checks)){const [row]=await tx.$queryRawUnsafe(sql);counts[name]=row.n;}
 return {appliedMigrations:applied.length,checkedMigrationFiles:files.length,violations:counts};
},{timeout:20000});
 console.log(JSON.stringify(result,null,2));for(const [name,count]of Object.entries(result.violations))assert.equal(count,0,'Integrity violation: '+name);
 console.log('PASS: read-only migration checksums, inventory, order/cart/return quantities, payment refund bounds, constraints and indexes. No records changed.');
}finally{await db.$disconnect();}})().catch(e=>{console.error('Database integrity audit failed: '+(e.name==='AssertionError'?e.message:'connection/query failure (details omitted)'));process.exitCode=1;});
