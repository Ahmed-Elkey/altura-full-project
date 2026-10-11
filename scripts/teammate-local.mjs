// ALTURA private teammate package. All paths are repository-relative.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=path.join(root,'backend'), runtime=path.join(root,'runtime');
const pg=path.join(root,'tools/postgresql/bin'), data=path.join(runtime,'postgres-data');
const stateFile=path.join(runtime,'demo-processes.json'), clusterFile=path.join(runtime,'demo-cluster.json');
const command=process.argv[2];
if(process.platform!=='win32'||process.arch!=='x64'||Number(process.versions.node.split('.')[0])<22) throw Error('Windows x64 and Node.js 22+ x64 are required.');
if(!['setup','start','stop','check'].includes(command)) throw Error('Use setup, start, stop or check.');
const required=['backend/.env.demo','database/altura_friend.backup','PACKAGE_MANIFEST.json','package.json','package-lock.json','backend/package.json','backend/package-lock.json','backend/prisma/schema.prisma','backend/prisma/seed.ts','backend/prisma/data/altura-catalog.json','backend/prisma/migrations/20260926151126_init_local/migration.sql','tools/postgresql/bin/initdb.exe','tools/postgresql/bin/pg_ctl.exe','tools/postgresql/bin/postgres.exe','tools/postgresql/bin/psql.exe','tools/postgresql/bin/pg_restore.exe'];
for(const file of required) if(!fs.existsSync(path.join(root,file))) throw Error(`Missing demo file: ${file}`);
const profile=parseEnv(fs.readFileSync(path.join(backend,'.env.demo'),'utf8'));
const secretValues=Object.entries(profile).filter(([k])=>/PASSWORD|SECRET|DATABASE_URL/.test(k)).map(([,v])=>v);
const url=new URL(profile.DATABASE_URL);
secretValues.push(decodeURIComponent(url.password));
function redact(text){let result=String(text);for(const value of secretValues)if(value)result=result.split(value).join('[demo credential redacted]');return result.replace(/postgres(?:ql)?:\/\/[^\s@]+@/g,'postgresql://[redacted]@');}
function assertProfile(){
 if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='5434'||url.pathname!=='/altura_friend'||decodeURIComponent(url.username)!=='altura_friend_app'||!url.password||url.search!=='?schema=public') throw Error('ABORT: only 127.0.0.1:5434/altura_friend, role altura_friend_app, public schema is permitted.');
 const pins={HOST:'127.0.0.1',PORT:'4000',API_PREFIX:'api/v1',FRONTEND_ORIGIN:'http://127.0.0.1:3100',DEFAULT_COUNTRY:'EG',DEFAULT_CURRENCY:'EGP',PAYMENT_MODE:'mock',STORAGE_MODE:'local',NODE_ENV:'development',TRUST_PROXY:'false',RATE_LIMIT_ENABLED:'true',NEXT_PUBLIC_API_URL:'http://127.0.0.1:4000/api/v1',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3100',STOREFRONT_MODE:'local',ADMIN_SEED_EMAIL:'admin@altura.friend.local',CUSTOMER_SEED_EMAIL:'customer@altura.friend.local'};
 for(const[k,v]of Object.entries(pins))if(profile[k]!==v)throw Error(`ABORT: demo setting ${k} must remain ${v}.`);
 if(process.env.DATABASE_URL&&process.env.DATABASE_URL!==profile.DATABASE_URL)throw Error('ABORT: inherited DATABASE_URL conflicts with this demo. Clear it in this terminal; no external database was contacted.');
 for(const k of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','DEMO_BOOTSTRAP_PASSWORD'])if(!profile[k]||profile[k].length<32)throw Error(`Missing adequate demo ${k}.`);
 for(const k of ['ADMIN_SEED_PASSWORD','CUSTOMER_SEED_PASSWORD'])if(!profile[k]||profile[k].length<12)throw Error(`Missing adequate demo ${k}.`);
 if(!profile.DEMO_INSTANCE_ID)throw Error('Missing demo cluster identity.');
 for(const file of ['backend/.env','backend/.env.local','backend/.env.portfolio.local','.env.local','.env.production'])if(fs.existsSync(path.join(root,file)))throw Error(`ABORT: remove unrelated private configuration from this demo copy: ${file}`);
 const migrationDir=path.join(backend,'prisma/migrations');
 if(fs.readdirSync(migrationDir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort().join(',')!=='20260926151126_init_local,20261002120000_add_cash_on_delivery,20261003120000_remove_staff_role')throw Error('ABORT: unexpected migrations require review.');
 const reviewed={
  'backend/prisma/migrations/20260926151126_init_local/migration.sql':'5177a78e6925d0a5a5a06da877d5e25415bd825b9dc6b39fd137cbc3c41c1152',
  'backend/prisma/seed.ts':'c8e9c5c58c4c4280d80f49ea0fa36222435d0d9ea06fd1c8bfbaccaf7c80e5fc',
  'backend/prisma/data/altura-catalog.json':'41cfc6a26bed09320fab1bae0e38ecbc7ca2efae5b4a74fa706d81bddb7c9652'};
 for(const[file,digest]of Object.entries(reviewed))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==digest)throw Error(`ABORT: reviewed demo input changed: ${file}`);
}
assertProfile();
fs.mkdirSync(runtime,{recursive:true});
const osKeys=['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','PROGRAMFILES','ProgramData','PROGRAMDATA','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','OS'];
const cleanEnv=Object.fromEntries(osKeys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
if(['setup','start'].includes(command)){
 for(const dll of ['msvcp140.dll','vcruntime140.dll'])if(!fs.existsSync(path.join(process.env.SystemRoot,'System32',dll)))throw Error('PostgreSQL requires the free Microsoft Visual C++ x64 Redistributable. Install it from https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist then retry. This demo did not install system components.');
}
const appKeys=['DATABASE_URL','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','HOST','PORT','API_PREFIX','FRONTEND_ORIGIN','TRUST_PROXY','DEFAULT_COUNTRY','DEFAULT_CURRENCY','PAYMENT_MODE','STORAGE_MODE','RATE_LIMIT_ENABLED','NEXT_PUBLIC_API_URL','NEXT_PUBLIC_SITE_URL','STOREFRONT_MODE'];
const appEnv={...cleanEnv,...Object.fromEntries(appKeys.map(k=>[k,profile[k]])),NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1'};
function json(file){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}
function save(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2));}
function checkRoot(file){const resolved=path.resolve(file);if(!resolved.toLowerCase().startsWith((root+path.sep).toLowerCase()))throw Error('ABORT: path escapes demo folder.');return resolved;}
function processInfo(pid,exe,arg,created,action='Inspect'){
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/teammate-process.ps1'),'-Action',action,'-ProcessId',String(pid),'-ExpectedExecutable',exe,'-ExpectedArgument',arg,...(created?['-ExpectedCreated',created]:[])],{windowsHide:true,encoding:'utf8',timeout:15000,env:cleanEnv});
 if(result.status!==0)throw Error('Process ownership could not be verified. No unknown process will be stopped.');
 return action==='Inspect'?JSON.parse(result.stdout):null;
}
function alive(owner){
 if(!owner)return false;
 const argumentsAllowed=[path.join(backend,'dist/src/main.js'),path.join(root,'node_modules/next/dist/bin/next')];
 if(owner.executable!==process.execPath||!argumentsAllowed.includes(owner.argument)||!Number.isInteger(owner.pid)||owner.pid<=0||typeof owner.created!=='string')throw Error('ABORT: recorded application process is outside this demo.');
 try{process.kill(owner.pid,0);}catch{return false;}
 try{processInfo(owner.pid,owner.executable,owner.argument,owner.created);return true;}
 catch{console.log('A prior recorded PID no longer belongs to this demo; leaving that process alone.');return false;}
}
async function free(port){await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error(`Port ${port} is occupied. Stop its owning application yourself; this demo will not kill it or switch ports.`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
function clusterMarker(){const m=json(clusterFile);if(!m||m.instance!==profile.DEMO_INSTANCE_ID||path.resolve(m.data).toLowerCase()!==data.toLowerCase())throw Error('ABORT: cluster is unrecognized or moved after initialization. Fresh extraction is portable; initialized clusters must stay in their original folder.');return m;}
function pgOwner(){if(!fs.existsSync(path.join(data,'postmaster.pid')))return null;clusterMarker();const pid=Number(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split(/\r?\n/)[0]);return processInfo(pid,path.join(pg,'postgres.exe'),data);}
async function ports(setup=false){
 const state=json(stateFile)||{};
 for(const[k,port]of [['frontend',3100],['backend',4000]]){if(!setup&&alive(state[k]))continue;await free(port);}
 if(pgOwner())return;await free(5434);
}
function native(file,args=[],env=cleanEnv,input,timeout=120000){
 const result=spawnSync(file,args,{cwd:root,env,windowsHide:true,encoding:'utf8',input,timeout,maxBuffer:16*1024*1024});
 if(result.error||result.status!==0)throw Error(redact(`${path.basename(file)} failed (exit ${result.status ?? 'unavailable'}). ${result.stderr||result.stdout||result.error?.message||''}`));
 return result.stdout.trim();
}
function psql(database,sql,bootstrap=false){
 if(!['altura_friend','postgres'].includes(database)||(!bootstrap&&database!=='altura_friend'))throw Error('ABORT: SQL target outside the bundled teammate database.');
 return native(path.join(pg,'psql.exe'),['-h','127.0.0.1','-p','5434','-U',bootstrap?'altura_friend_bootstrap':'altura_friend_app','-d',database,'-w','-X','-t','-A','-v','ON_ERROR_STOP=1','-f','-'],{...cleanEnv,PGPASSWORD:bootstrap?profile.DEMO_BOOTSTRAP_PASSWORD:decodeURIComponent(url.password),PGCONNECT_TIMEOUT:'5'},sql);
}
function serverIdentity(database='altura_friend',bootstrap=false){
 clusterMarker();pgOwner();
 const sql=bootstrap?"SELECT json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'database',current_database(),'data',current_setting('data_directory'));":"SELECT json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'database',current_database(),'role',current_user);";
 const value=JSON.parse(psql(database,sql,bootstrap));
 if(value.host!=='127.0.0.1'||value.port!==5434||value.database!==database||(bootstrap&&path.resolve(value.data).toLowerCase()!==data.toLowerCase())||(!bootstrap&&value.role!=='altura_friend_app'))throw Error('ABORT: connected server is outside this bundled teammate package.');
 return value;
}
async function postgres(init=false){
 if(!fs.existsSync(path.join(data,'PG_VERSION'))){
  if(!init)throw Error('Run SETUP_FRIEND_DEMO.ps1 first.');
  if(fs.existsSync(data)&&fs.readdirSync(data).length)throw Error('ABORT: data directory is nonempty without a recognized initialized cluster. No data was removed.');
  fs.mkdirSync(checkRoot(data),{recursive:true});
  const pw=checkRoot(path.join(runtime,'initdb-password.tmp'));
  fs.writeFileSync(pw,profile.DEMO_BOOTSTRAP_PASSWORD+'\n',{flag:'wx'});
  try{native(path.join(pg,'initdb.exe'),['-D',data,'-U','altura_friend_bootstrap','--encoding=UTF8','--locale=C','--auth=scram-sha-256',`--pwfile=${pw}`]);}
  finally{if(fs.existsSync(pw))fs.unlinkSync(checkRoot(pw));}
  fs.appendFileSync(path.join(data,'postgresql.conf'),"\n# Local friend demo only\nlisten_addresses = '127.0.0.1'\nport = 5434\npassword_encryption = 'scram-sha-256'\njit = off\n");
  fs.writeFileSync(path.join(data,'pg_hba.conf'),"# Local friend demo only: no public network clients\nlocal all all scram-sha-256\nhost all all 127.0.0.1/32 scram-sha-256\n");
  save(clusterFile,{instance:profile.DEMO_INSTANCE_ID,data,version:17});
 }
 clusterMarker();
 const version=fs.readFileSync(path.join(data,'PG_VERSION'),'utf8').trim();if(version!=='17')throw Error('ABORT: PostgreSQL cluster must be version 17.');
 if(!pgOwner()){
  // A Windows daemon can inherit captured pipes after pg_ctl exits. Use a
  // real log handle so startup completion never waits for the server to exit.
  const log=fs.openSync(path.join(runtime,'postgres-start.log'),'a');
  let result;
  try{result=spawnSync(path.join(pg,'pg_ctl.exe'),['start','-D',data,'-l',path.join(runtime,'postgres.log'),'-o','-h 127.0.0.1 -p 5434','-w','-t','30'],{cwd:root,env:cleanEnv,windowsHide:true,stdio:['ignore',log,log],timeout:45000});}
  finally{fs.closeSync(log);}
  if(result.error||result.status!==0)throw Error('Bundled PostgreSQL startup failed. Check runtime/postgres-start.log and postgres.log. No system components were installed.');
 }
 const identity=serverIdentity('postgres',true);
 if(psql('postgres',"SELECT current_setting('listen_addresses')||'|'||current_setting('password_encryption');",true)!=='127.0.0.1|scram-sha-256')throw Error('ABORT: insecure PostgreSQL listener/authentication settings.');
 console.log('Bundled PostgreSQL ready on 127.0.0.1:5434 (SCRAM).');return identity;
}
function npmCli(){
 const found=spawnSync('where.exe',['npm.cmd'],{encoding:'utf8',windowsHide:true,env:cleanEnv});
 const cmd=found.stdout?.trim().split(/\r?\n/)[0];
 const candidates=[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),...(cmd?[path.join(path.dirname(cmd),'node_modules/npm/bin/npm-cli.js')]:[])];
 const cli=candidates.find(fs.existsSync);if(!cli)throw Error('npm CLI is missing. Install Node.js 22+ x64 including npm.');return cli;
}
async function run(args,cwd=backend,env=appEnv){
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr]){let pending='';stream.on('data',b=>{pending+=b.toString();const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)console.log(redact(line));});stream.on('end',()=>{if(pending)console.log(redact(pending));});}
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Command ${path.basename(args[0])} exited ${code}. No automatic reset will be attempted.`)));
 });
}
function client(){const require=createRequire(path.join(backend,'package.json'));const{PrismaClient}=require('@prisma/client');return new PrismaClient({datasources:{db:{url:profile.DATABASE_URL}}});}
async function inventory(){const db=client();try{
 const counts={};for(const model of ['user','category','collection','product','productVariant','productImage','inventory','shippingZone','shippingMethod','order','cart','wishlist','refreshToken','returnRequest'])counts[model]=await db[model].count();
 const currencies=await db.product.findMany({distinct:['currency'],select:{currency:true}});const countries=await db.shippingZone.findMany({select:{countries:true}});
 return {counts,currencies:countries.length?currencies.map(c=>c.currency):[],shippingCountries:countries.flatMap(c=>c.countries)};
 }finally{await db.$disconnect();}}
const fingerprint=()=>crypto.createHash('sha256').update(appKeys.map(k=>profile[k]).join('|')).digest('hex');
async function setup(){
 await ports(true);const npm=npmCli();console.log('Installing locked frontend/backend dependencies with npm ci. This needs internet.');
 await run([npm,'ci'],root,{...appEnv,NODE_ENV:'development'});await run([npm,'ci'],backend);
 await postgres(true);
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const exists=psql('postgres',"SELECT count(*) FROM pg_roles WHERE rolname='altura_friend_app';",true);
 if(exists==='0')psql('postgres',`CREATE ROLE altura_friend_app LOGIN PASSWORD ${quote(decodeURIComponent(url.password))} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,true);
 if(psql('postgres',"SELECT count(*) FROM pg_database WHERE datname='altura_friend';",true)==='0')psql('postgres','CREATE DATABASE altura_friend OWNER altura_friend_app;',true);
 if(psql('postgres',"SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='altura_friend_app';",true)!=='f')throw Error('ABORT: teammate app role has excessive cluster privileges.');
 if(psql('postgres',"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='altura_friend';",true)!=='altura_friend_app')throw Error('ABORT: unexpected database ownership.');
 serverIdentity();
 await run(['node_modules/prisma/build/index.js','generate']);
 const packageManifest=json(path.join(root,'PACKAGE_MANIFEST.json'));
 const backup=path.join(root,'database/altura_friend.backup');
 if(!packageManifest||packageManifest.databaseBackupSha256!==crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'))throw Error('ABORT: packaged database backup integrity check failed.');
 const restoreFile=path.join(runtime,'database-restored.json'), restored=json(restoreFile);
 if(restored){if(restored.instance!==profile.DEMO_INSTANCE_ID||restored.backupSha256!==packageManifest.databaseBackupSha256)throw Error('ABORT: restore marker belongs to another package.');console.log('Packaged database already restored; preserving current local data.');}
 else{
  const tables=Number(psql('altura_friend',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"));
  if(tables!==0)throw Error('ABORT: database is nonempty without a restore marker. No reset was attempted.');
  console.log('Restoring the packaged logical backup into altura_friend ONLY.');
  native(path.join(pg,'pg_restore.exe'),['--no-owner','--no-privileges','--exit-on-error','--role=altura_friend_app','-h','127.0.0.1','-p','5434','-U','altura_friend_bootstrap','-d','altura_friend',backup],{...cleanEnv,PGPASSWORD:profile.DEMO_BOOTSTRAP_PASSWORD,PGCONNECT_TIMEOUT:'5'},undefined,300000);
  const after=await inventory();
  if(after.counts.product!==packageManifest.databaseSummary.products||after.counts.order!==packageManifest.databaseSummary.orders||after.counts.refreshToken!==0)throw Error('Packaged database restore postcondition failed.');
  save(restoreFile,{instance:profile.DEMO_INSTANCE_ID,backupSha256:packageManifest.databaseBackupSha256,restoredAt:new Date().toISOString(),initialInventory:after});
 }
 await run(['node_modules/@nestjs/cli/bin/nest.js','build']);
 await run(['node_modules/next/dist/bin/next','build'],root,{...appEnv,NODE_ENV:'production'});
 save(path.join(runtime,'demo-build.json'),{instance:profile.DEMO_INSTANCE_ID,fingerprint:fingerprint(),buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim()});
 console.log('SETUP SUCCESS. Run START_ALTURA.ps1. Credentials: TEAMMATE_LOCAL_CREDENTIALS.md.');
}
async function health(address,predicate){
 for(let i=0;i<90;i++){try{const r=await fetch(address,{signal:AbortSignal.timeout(1500)});if(r.ok&&predicate(await r.json()))return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 throw Error(`Readiness failed for ${address}. See this demo's runtime logs.`);
}
async function launch(kind,args,cwd,env){
 const log=fs.openSync(path.join(runtime,kind+'.log'),'a');
 const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});fs.closeSync(log);
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 const owner=processInfo(child.pid,process.execPath,args[0]);const state=json(stateFile)||{};state[kind]=owner;save(stateFile,state);return owner;
}
async function stopApps(){const state=json(stateFile)||{};for(const kind of ['frontend','backend']){const owner=state[kind];if(alive(owner))processInfo(owner.pid,owner.executable,owner.argument,owner.created,'Stop');delete state[kind];}save(stateFile,state);}
async function start(){
 await ports();await postgres();serverIdentity();
 const build=json(path.join(runtime,'demo-build.json'));
 if(!build||build.instance!==profile.DEMO_INSTANCE_ID||build.fingerprint!==fingerprint()||!fs.existsSync(path.join(root,'.next/BUILD_ID'))||build.buildId!==fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim()||!fs.existsSync(path.join(backend,'dist/src/main.js')))throw Error('Run SETUP_ALTURA.ps1 to create the canonical-origin build.');
 const state=json(stateFile)||{};const created=[];
 try{
  if(!alive(state.backend)){await launch('backend',[path.join(backend,'dist/src/main.js')],backend,appEnv);created.push('backend');}
  await health('http://127.0.0.1:4000/api/v1/health',body=>body.database==='connected');
  if(!alive(state.frontend)){await launch('frontend',[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','-p','3100'],root,{...appEnv,NODE_ENV:'production'});created.push('frontend');}
  await health('http://127.0.0.1:3100/api/health',body=>body.commerceReady===true);
 }catch(error){const latest=json(stateFile)||{};for(const kind of created.reverse()){const owner=latest[kind];if(alive(owner))processInfo(owner.pid,owner.executable,owner.argument,owner.created,'Stop');delete latest[kind];}save(stateFile,latest);throw error;}
 console.log('ALTURA READY: http://127.0.0.1:3100\nAdmin: /admin/login. Credentials: TEAMMATE_LOCAL_CREDENTIALS.md.\nUse STOP_ALTURA.ps1 to stop only this copy. Normal startup never restores, migrates, or seeds.');
}
async function stop(){await stopApps();const owner=pgOwner();if(owner){serverIdentity('postgres',true);native(path.join(pg,'pg_ctl.exe'),['stop','-D',data,'-m','fast','-w','-t','30']);}console.log('ALTURA-owned frontend, backend and PostgreSQL stopped. No unrelated process was killed.');}
async function main(){if(command==='setup')await setup();else if(command==='start')await start();else if(command==='stop')await stop();else{serverIdentity();console.log(JSON.stringify(await inventory(),null,2));}}
main().catch(error=>{console.error(redact(error.message));process.exitCode=1;});
