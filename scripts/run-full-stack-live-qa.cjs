// Bounded local integration audit. Temporary QA limits and captured support mail;
// always restore the normal API profile, never print private configuration.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend'),pidFile=path.join(root,'.hero-build/backend.pid');
const env=require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(backend,'.env')));
const db=new URL(env.DATABASE_URL);assert.ok(db.hostname==='127.0.0.1'&&db.port==='5434'&&db.pathname==='/altura_friend');
async function stopOwned(){
 if(!fs.existsSync(pidFile))throw Error('API ownership record missing');
 const pid=Number(fs.readFileSync(pidFile,'utf8'));
 const cwd=cp.spawnSync('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8'});
 if(cwd.status!==0)throw Error('API process unavailable');
 if(!cwd.stdout.includes('n'+backend+'\n'))throw Error('API owner differs; no process stopped');
 process.kill(pid,'SIGTERM');
 for(let i=0;i<40;i++){if(cp.spawnSync('/usr/sbin/lsof',['-nP','-iTCP:4000','-sTCP:LISTEN'],{encoding:'utf8'}).status!==0)return;await new Promise(r=>setTimeout(r,100));}
 throw Error('API stop did not finish');
}
async function qaApi(){
 await stopOwned();const log=fs.openSync(path.join(root,'.hero-build/full-audit-api.log'),'a');
 const child=cp.spawn(process.execPath,['dist/src/main.js'],{cwd:backend,detached:true,stdio:['ignore',log,log],env:{...process.env,...env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'4000',FRONTEND_ORIGIN:'http://127.0.0.1:3100,http://localhost:3100',SUPPORT_EMAIL_WORKER_ENABLED:'false',RATE_LIMIT_LOGIN_LIMIT:'100',RATE_LIMIT_REGISTER_LIMIT:'30',RATE_LIMIT_REFRESH_LIMIT:'500',RATE_LIMIT_GUEST_LOOKUP_LIMIT:'100',RATE_LIMIT_RECOVERY_LIMIT:'100',RATE_LIMIT_RESET_LIMIT:'100'}});
 fs.closeSync(log);fs.writeFileSync(pidFile,String(child.pid));child.unref();
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:4000/api/v1/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('QA API readiness failed');
}
function run(args,name,extra={}){return new Promise((resolve,reject)=>{
 const log=fs.openSync(path.join(root,'.hero-build/full-audit-'+name+'.log'),'w');
 const child=cp.spawn(process.execPath,args,{cwd:root,env:{...process.env,...extra},stdio:['ignore',log,log]});fs.closeSync(log);
 child.once('error',reject);child.once('exit',code=>code===0?(console.log('PASS: '+name),resolve()):reject(Error(name+' failed; inspect its local QA log')));
});}
(async()=>{let switched=false;try{
 switched=true;await qaApi();
 await run(['node_modules/@playwright/test/cli.js','test','tests/customer-registration-ux.spec.ts','--grep','new customer:|rejects injected ADMIN'], 'live-registration',{DATABASE_URL:env.DATABASE_URL,ALTURA_PACKAGE_QA:'1',ALTURA_BASE_URL:'http://127.0.0.1:3100'});
 await run(['scripts/verify-account-admin.cjs'],'live-account');
 await run(['scripts/verify-returns.cjs'],'live-returns');
 await run(['scripts/verify-password-recovery.cjs'],'live-recovery');
 await run(['scripts/verify-signout.cjs'],'live-signout');
 await run(['scripts/verify-address-concurrency.cjs'],'live-address-concurrency');
 await run(['scripts/verify-support.cjs'],'live-support');
 await run(['scripts/verify-configurable-offers.cjs'],'live-offers');
 await run(['scripts/verify-catalog-sync.cjs'],'live-catalog-sync');
 await run(['scripts/verify-database-integrity.cjs'],'database-final');
}finally{if(switched){await run(['scripts/restart-local-api.cjs'],'api-restored');console.log('Normal API limits and mail worker configuration restored.');}}})().catch(e=>{console.error(e.message);process.exitCode=1;});
