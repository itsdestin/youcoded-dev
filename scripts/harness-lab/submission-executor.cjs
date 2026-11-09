// Public invocation adapter, never an oracle. Runs ONLY inside the Docker boundary.
// WHY: submitted JS shares this process and can patch JSON.stringify/fs/anything.
// ALL fields (including unchanged, mutations, config, status and errors) can be
// forged. This adapter provides NO trusted side-effect observations. Acceptance
// is BLOCKED until a genuinely independent observation/enforcement boundary exists.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {load}=require('/adapter/comparison-loader.cjs');
const root='/work';process.chdir(root);
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const file=n=>path.join(root,n);
const invoke=(args,input)=>{const r=cp.spawnSync(process.execPath,args,{input,encoding:'utf8',timeout:5000,maxBuffer:262144,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',NODE_NO_WARNINGS:'1'}});return {status:r.status,stdout:r.stdout,stderr:r.stderr};};
const installer={'./update-installer':{UpdateInstallError:class extends Error{constructor(code,message){super(message);this.code=code;}}}};
async function run(r){
 if(r.op==='isolation'){
  const writes={};for(const target of ['/input/.tamper','/adapter/.tamper','/etc/.tamper']){try{fs.writeFileSync(target,'bad');writes[target]='writable';}catch(e){writes[target]=e.code;}}
  return {uid:process.getuid(),env:Object.keys(process.env).sort(),writes,oraclePresent:fs.existsSync('/tests/comparison-verify.cjs'),socketPresent:fs.existsSync('/var/run/docker.sock')};
 }
 if(r.op==='test')return invoke([file('submission/test.cjs')]);
 if(r.op==='parse')return load(file('desktop/src/main/update-manifest-verify.ts'),installer).parseReleaseManifest(JSON.stringify(r.value));
 if(r.op==='build'){
  const dir='/tmp/assets';fs.mkdirSync(dir);for(const [n,b] of Object.entries(r.assets))fs.writeFileSync(path.join(dir,n),Buffer.from(b,'base64'));
  const m=await import(file('desktop/scripts/generate-release-manifest.mjs'));return m.buildManifest(dir,r.version);
 }
 if(r.op==='verify'){
  const input={...r.input,filePath:'/tmp/asset',manifestBytes:Buffer.from(r.input.manifestBytes,'base64'),signatureBytes:Buffer.from(r.input.signatureBytes,'base64')};fs.writeFileSync(input.filePath,Buffer.from(r.bytes,'base64'));
  await load(file('desktop/src/main/update-manifest-verify.ts'),installer).verifyDownloadedUpdate(input);return null;
 }
 if(r.op==='sign'){
  const dir='/tmp/assets';fs.mkdirSync(dir);for(const [n,b] of Object.entries(r.assets))fs.writeFileSync(path.join(dir,n),Buffer.from(b,'base64'));
  fs.writeFileSync('/tmp/key',r.key);const result=invoke([file('desktop/scripts/generate-release-manifest.mjs'),'--dir',dir,'--version',r.version,'--key','/tmp/key']);
  return {result,manifest:fs.readFileSync(dir+'/youcoded-release.json').toString('base64'),signature:fs.readFileSync(dir+'/youcoded-release.json.sig').toString('base64')};
 }
 if(r.op==='migrate'){
  const value=r.value,before=JSON.stringify(value);const result=load(file('desktop/src/shared/context-migration.mts')).migrateConfig(value);return {result,unchanged:JSON.stringify(value)===before};
 }
 if(r.op==='cloud')return load(file('desktop/src/main/providers/cloud-context.ts')).cloudContextLength(...r.args);
 if(r.op==='store'){
  let config=r.config,queue=Promise.resolve(),mutations=0;
  const home={readJson:()=>config,mutateJson:(_n,fn)=>{mutations++;queue=queue.then(()=>{config=fn(config);});return queue;}};
  const {ContextSettingsStore}=load(file('desktop/src/main/harness/context-settings-store.ts'),{'../native-home':{NativeHome:class{}}});
  const store=new ContextSettingsStore(home),initial=store.read();const patches=r.patches;
  const results=await Promise.all(patches.map(p=>{const v=store.update(p);if(r.mutatePatch&&p)p.chatgpt='standard';return v.then(value=>({ok:true,value}),()=>({ok:false}));}));
  return {initial,config,mutations,results,final:store.read()};
 }
 if(r.op==='batch'){
  fs.writeFileSync('/tmp/input.json',JSON.stringify(r.value));const before=fs.readFileSync('/tmp/input.json','utf8');
  if(r.existing)fs.writeFileSync('/tmp/output.json','keep');
  const result=invoke([file('desktop/scripts/migrate-context.cjs'),'/tmp/input.json','/tmp/output.json']);
  return {result,inputUnchanged:fs.readFileSync('/tmp/input.json','utf8')===before,output:fs.existsSync('/tmp/output.json')?fs.readFileSync('/tmp/output.json','utf8'):null};
 }
 if(r.op==='planner')return invoke([file('submission/planner.cjs')],JSON.stringify(r.value));
 throw Error('Unknown invocation');
}
run(request).then(value=>process.stdout.write(JSON.stringify({id:request.id,ok:true,value})),e=>process.stdout.write(JSON.stringify({id:request.id,ok:false,error:{name:String(e.name),code:e.code===undefined?null:String(e.code)}})));
