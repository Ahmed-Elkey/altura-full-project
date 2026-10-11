const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const mock=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2),s=process.env.FAKE_CLOUD_STATE;
fs.appendFileSync(path.join(s,'calls'),JSON.stringify(a)+'\\n');
const kind=a[1],action=a[2],marker=path.join(s,(kind||'none')+'-'+(a[3]||''));
if(a[0]==='services')process.exit(0);
if(action==='create'){fs.writeFileSync(marker,'created');process.exit(0);}
if(action==='describe'){
 if(!fs.existsSync(marker))process.exit(1);
 if(kind==='addresses'&&a.includes('--format=value(address)'))console.log('203.0.113.10');
 if(kind==='instances'&&a.includes('--format=value(labels.app)'))console.log(process.env.FAKE_UNRELATED?'other':'altura');
 if(kind==='instances'&&a.includes('--format=value(networkInterfaces[0].accessConfigs[0].natIP)'))console.log('203.0.113.10');
 if(kind==='instances'&&a.includes('--format=value(status)'))console.log(process.env.FAKE_STOPPED?'TERMINATED':'RUNNING');
 process.exit(0);
}
if(kind==='ssh'||kind==='scp'||action==='start')process.exit(0);
process.exit(2);
`;
test('Google deployment plan uses private transfer, persistent disk and restricted public ports',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'altura-gcloud-plan-'));
 try{
  fs.writeFileSync(path.join(dir,'gcloud'),mock,{mode:0o755});
  const env={...process.env,PATH:`${dir}:${process.env.PATH}`,FAKE_CLOUD_STATE:dir};
  const run=()=>cp.spawnSync('bash',[path.join(__dirname,'deploy.sh'),'altura-test-project'],{env,encoding:'utf8',timeout:60000});
  const result=run();assert.equal(result.status,0,result.stderr);
  const calls=fs.readFileSync(path.join(dir,'calls'),'utf8').trim().split('\n').map(JSON.parse);
  const vm=calls.find(a=>a[1]==='instances'&&a[2]==='create');
  assert(vm.includes('--no-boot-disk-auto-delete'));assert(vm.includes('--no-service-account'));assert(vm.includes('--address=203.0.113.10'));
  const rules=calls.filter(a=>a[1]==='firewall-rules'&&a[2]==='create');
  assert(rules.some(a=>a.includes('--allow=tcp:80,tcp:443')));
  assert(rules.some(a=>a.includes('--allow=tcp:22')&&a.includes('--source-ranges=35.235.240.0/20')));
  const transfer=calls.find(a=>a[1]==='scp');assert(transfer.includes('--tunnel-through-iap'));
  assert(calls.some(a=>a[1]==='ssh'&&a.some(v=>v.includes('setup-vm.sh'))));
  // An unrelated existing VM must not receive application code or commands.
  fs.writeFileSync(path.join(dir,'calls'),'');env.FAKE_UNRELATED='1';
  const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/unrelated VM/);
  const blockedCalls=fs.readFileSync(path.join(dir,'calls'),'utf8');assert(!blockedCalls.includes('setup-vm.sh'));assert(!blockedCalls.includes('"scp"'));
  fs.writeFileSync(path.join(dir,'calls'),'');delete env.FAKE_UNRELATED;env.FAKE_STOPPED='1';
  const update=run();assert.equal(update.status,0,update.stderr);
  const updated=fs.readFileSync(path.join(dir,'calls'),'utf8').trim().split('\n').map(JSON.parse);
  assert(updated.some(a=>a[1]==='instances'&&a[2]==='start'));
  assert(!updated.some(a=>a[1]==='instances'&&a[2]==='create'));
  assert(updated.some(a=>a[1]==='ssh'&&a.some(v=>v.includes('setup-vm.sh'))));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
