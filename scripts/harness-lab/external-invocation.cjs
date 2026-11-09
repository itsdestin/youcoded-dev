// Public v2 API driver, NOT a trusted observer. The host grades external results.
// WHY: no unchanged/mutation-count/concurrency claims cross this boundary.
const fs=require('node:fs');
const {load}=require('/adapter/comparison-loader.cjs');
const r=JSON.parse(fs.readFileSync(0,'utf8'));
const file=n=>'/work/'+n;
const installer={'./update-installer':{UpdateInstallError:class extends Error{constructor(code,message){super(message);this.code=code;}}}};
async function run(){
 if(r.op==='parse')return load(file('desktop/src/main/update-manifest-verify.ts'),installer).parseReleaseManifest(JSON.stringify(r.value));
 if(r.op==='build'){
  const m=await import(file('desktop/scripts/generate-release-manifest.mjs'));
  return m.buildManifest('/inputs/assets',r.version);
 }
 if(r.op==='verify'){
  const input={...r.input,filePath:'/inputs/asset',manifestBytes:Buffer.from(r.input.manifestBytes,'base64'),signatureBytes:Buffer.from(r.input.signatureBytes,'base64')};
  await load(file('desktop/src/main/update-manifest-verify.ts'),installer).verifyDownloadedUpdate(input);return null;
 }
 if(r.op==='migrate')return load(file('desktop/src/shared/context-migration.mts')).migrateConfig(r.value);
 if(r.op==='cloud')return load(file('desktop/src/main/providers/cloud-context.ts')).cloudContextLength(...r.args);
 if(r.op==='store'){
  // Persist each committed transaction. The host reads config.json independently
  // after exit; this code and every serialized return value are untrusted.
  fs.copyFileSync('/inputs/config.json','/output/config.json');
  const home={readJson:()=>JSON.parse(fs.readFileSync('/output/config.json','utf8')),mutateJson:async(_n,fn)=>{
   const config=fn(JSON.parse(fs.readFileSync('/output/config.json','utf8')));
   fs.writeFileSync('/output/config.json',JSON.stringify(config));
  }};
  const {ContextSettingsStore}=load(file('desktop/src/main/harness/context-settings-store.ts'),{'../native-home':{NativeHome:class{}}});
  const store=new ContextSettingsStore(home);const results=[];
  for(const patch of r.patches){try{results.push({ok:true,value:await store.update(patch)});}catch{results.push({ok:false});}}
  return {results,final:store.read()};
 }
 throw Error('Unknown invocation');
}
run().then(value=>process.stdout.write(JSON.stringify({ok:true,value})),e=>process.stdout.write(JSON.stringify({ok:false,error:{name:String(e.name),code:e.code===undefined?null:String(e.code)}})));
