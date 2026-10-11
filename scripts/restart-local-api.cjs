// Restart only the API owned by this checkout; preserve DB and private configuration.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'backend'),pidFile=path.join(root,'.hero-build/backend.pid');
(async()=>{
 const env=require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(dir,'.env'))),db=new URL(env.DATABASE_URL);
 if(db.hostname!=='127.0.0.1'||db.port!=='5434'||db.pathname!=='/altura_friend')throw Error('Unexpected database');
 if(fs.existsSync(pidFile)){const pid=Number(fs.readFileSync(pidFile,'utf8'));const cwd=cp.spawnSync('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8'});if(cwd.status===0){if(!cwd.stdout.includes('n'+dir+'\n'))throw Error('API PID belongs to a different checkout');process.kill(pid,'SIGTERM');await new Promise(r=>setTimeout(r,1000));}}
 if(cp.spawnSync('/usr/sbin/lsof',['-nP','-iTCP:4000','-sTCP:LISTEN'],{encoding:'utf8'}).status===0)throw Error('Port4000occupied; no unrelated process stopped');
 const log=fs.openSync(path.join(root,'.pg/backend.log'),'a');const child=cp.spawn(process.execPath,['dist/src/main.js'],{cwd:dir,env:{...process.env,...env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'4000',FRONTEND_ORIGIN:'http://127.0.0.1:3100,http://localhost:3100'},detached:true,stdio:['ignore',log,log]});fs.closeSync(log);fs.writeFileSync(pidFile,String(child.pid));child.unref();
 for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:4000/api/v1/health');if(r.ok){console.log('Local API ready on4000; database preserved.');return;}}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('API health unavailable');
})().catch(()=>{console.error('Local API restart failed; inspect the local log. No private configuration printed.');process.exitCode=1;});
