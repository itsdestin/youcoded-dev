// LEGACY TRUSTED FIXTURE QUALIFICATION ONLY. This process loads code with Node privileges;
// it is NOT a security boundary for agent submissions. Default invocation fails closed.
// Real submissions use secure_evaluation.py / comparison_tasks.verify_against with
// an explicit DockerExecutor: the independent oracle never imports submitted JS.
if (!process.argv.includes('--trusted-fixture-qualification')) {
 console.error(JSON.stringify({passed:false,category:'infrastructure-error',reason:'untrusted-submission-verification-blocked: isolated acceptance boundary is not implemented'}));
 process.exit(1);
}
// Controller-only behavioral verifier. Never COPY this file into environment/fixtures.
// WHY: assertions use independent inputs/constraints, never compare submitted source to a reference.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {load}=require('./comparison-loader.cjs');
const root=path.resolve(process.argv[2]),task=process.argv[3];
const originalRoot=process.argv.includes('--original-root')?process.argv[process.argv.indexOf('--original-root')+1]:path.join(__dirname,'original');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yc-functional-'));
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function invoke(args,input){return cp.spawnSync(process.execPath,args,{input,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'},maxBuffer:1024*1024});}
function testsAt(directory){const r=invoke([path.join(directory,'submission/test.cjs')]);assert.equal(r.status,0,'submitted regression tests must pass');}
function protectedState(){
 if(!process.argv.includes('--protected'))return;
 const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'baseline-manifest.json'))),contract=JSON.parse(fs.readFileSync(path.join(__dirname,'contract.json')));
 const current={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);assert.ok(!entry.isSymbolicLink(),'no symlinks');if(entry.isDirectory())walk(p);else{assert.ok(entry.isFile(),'ordinary files');current[path.relative(root,p).split(path.sep).join('/')]={sha256:hash(fs.readFileSync(p)),mode:fs.statSync(p).mode&0o777};}}}walk(root);
 const allowed=n=>contract.allowed.some(a=>n===a||a.endsWith('/')&&n.startsWith(a));
 for(const n of new Set([...Object.keys(baseline),...Object.keys(current)]))if(JSON.stringify(baseline[n])!==JSON.stringify(current[n]))assert.ok(allowed(n),'protected input changed');
}
function mutationTests(filename,transform){
 const copy=path.join(tmp,'regression');
 // Only source slice needed by public tests, no hidden oracle in this copy.
 fs.cpSync(root,copy,{recursive:true});
 const p=path.join(copy,filename);fs.writeFileSync(p,transform(fs.readFileSync(p,'utf8')));
 const result=invoke([path.join(copy,'submission/test.cjs')]);assert.notEqual(result.status,0,'submitted tests must detect a meaningful mutation');
 fs.rmSync(copy,{recursive:true,force:true,maxRetries:3});
}
async function release(){
 class UpdateInstallError extends Error{constructor(code,message){super(message);this.code=code;}}
 const v=load(path.join(root,'desktop/src/main/update-manifest-verify.ts'),{'./update-installer':{UpdateInstallError}});
 const generator=await import(pathToFileURL(path.join(root,'desktop/scripts/generate-release-manifest.mjs')).href);
 const good={version:' v9.2.0 ',assets:[{name:'z.exe',sha256:'A'.repeat(64),size:0},{name:'a.deb',sha256:'b'.repeat(64),size:42}]};
 assert.deepEqual(v.parseReleaseManifest(JSON.stringify(good)),{version:'9.2.0',assets:[good.assets[1],{...good.assets[0],sha256:'a'.repeat(64)}]});
 const invalid=[null,[],{}, {...good,version:''},{...good,assets:[]},...[-1,1.5,9007199254740992,'2',null].map(size=>({...good,assets:[{...good.assets[0],size}]})),...['','..','.','../x','a/b','a\\b'].map(name=>({...good,assets:[{...good.assets[0],name}]})),{...good,assets:[good.assets[0],good.assets[0]]},{...good,assets:[{...good.assets[0],sha256:'bad'}]}];
 for(const x of invalid)assert.throws(()=>v.parseReleaseManifest(JSON.stringify(x)),e=>e.code==='verify-failed');
 const assets=path.join(tmp,'assets');fs.mkdirSync(assets);fs.writeFileSync(path.join(assets,'z.exe'),'release-z');fs.writeFileSync(path.join(assets,'a.deb'),'release-a');
 const m=generator.buildManifest(assets,'v9.2.0');assert.deepEqual(m.assets.map(a=>a.name),['a.deb','z.exe']);assert.equal(m.version,'9.2.0');
 for(const version of [null,4,'','   '])assert.throws(()=>generator.buildManifest(assets,version));
 const keys=crypto.generateKeyPairSync('ed25519'),pub=keys.publicKey.export({type:'spki',format:'pem'}),priv=keys.privateKey.export({type:'pkcs8',format:'pem'});
 const key=path.join(tmp,'throwaway.pem');fs.writeFileSync(key,priv);
 const cli=invoke([path.join(root,'desktop/scripts/generate-release-manifest.mjs'),'--dir',assets,'--version','v9.2.0','--key',key]);assert.equal(cli.status,0);
 const manifestBytes=fs.readFileSync(path.join(assets,'youcoded-release.json')),signatureBytes=fs.readFileSync(path.join(assets,'youcoded-release.json.sig'));
 const input={filePath:path.join(assets,'a.deb'),fileName:'a.deb',manifestBytes,signatureBytes,tag:'v9.2.0',currentVersion:'9.1.0',publicKeyPem:pub};
 await v.verifyDownloadedUpdate(input);
 for(const variant of [{tag:'v9.2.1'},{currentVersion:'9.2.0'},{signatureBytes:Buffer.alloc(64)},{manifestBytes:Buffer.from(manifestBytes.toString()+' ')}])await assert.rejects(v.verifyDownloadedUpdate({...input,...variant}));
 // WHY: changing both digest and length lets either gate mask a missing other gate.
 // A genuine signature with correct digest but wrong declared size isolates size.
 const wrongSize=JSON.parse(manifestBytes);wrongSize.assets.find(a=>a.name===input.fileName).size+=1;
 const wrongSizeBytes=Buffer.from(JSON.stringify(wrongSize));
 await assert.rejects(v.verifyDownloadedUpdate({...input,manifestBytes:wrongSizeBytes,
   signatureBytes:crypto.sign(null,wrongSizeBytes,keys.privateKey)}), 'signed wrong-size / correct-digest asset must reject');
 // Same-length bytes isolate digest verification from the file-size check.
 const original=fs.readFileSync(input.filePath),tampered=Buffer.from(original);tampered[0]^=1;
 assert.equal(tampered.length,original.length);fs.writeFileSync(input.filePath,tampered);
 await assert.rejects(v.verifyDownloadedUpdate(input),'same-length tamper must reject');
 mutationTests('desktop/src/main/update-manifest-verify.ts',()=>fs.readFileSync(path.join(originalRoot,'desktop/src/main/update-manifest-verify.ts'),'utf8'));
}
async function context(){
 const shared=load(path.join(root,'desktop/src/shared/context-migration.mts'));
 const {ContextSettingsStore}=load(path.join(root,'desktop/src/main/harness/context-settings-store.ts'),{'../native-home':{NativeHome:class {}}});
 const {cloudContextLength}=load(path.join(root,'desktop/src/main/providers/cloud-context.ts'));
 const legacy={theme:'keep',native:{other:7,context:{openrouter:'long',chatgpt:'bad'}}};const pristine=JSON.stringify(legacy);
 const migrated=shared.migrateConfig(legacy);
 assert.equal(JSON.stringify(legacy),pristine);assert.deepEqual(migrated,{theme:'keep',native:{other:7,context:{version:2,providers:{openrouter:'long',chatgpt:'standard'}}}});
 assert.deepEqual(shared.migrateConfig(migrated),migrated);
 for(const c of [null,[],3,{native:{context:{version:3}}}])assert.throws(()=>shared.migrateConfig(c));
 let config=JSON.parse(JSON.stringify(migrated)),queue=Promise.resolve();let mutations=0;
 const home={readJson:()=>config,mutateJson:(_n,fn)=>{mutations++;queue=queue.then(()=>{config=fn(config);});return queue;}};
 const store=new ContextSettingsStore(home);assert.deepEqual(store.read(),{openrouter:'long',chatgpt:'standard'});
 const before=mutations;for(const patch of [null,[],{other:'long'},{chatgpt:'bogus'}])await assert.rejects(store.update(patch));assert.equal(mutations,before);
 config={extra:44,native:{other:5,context:{chatgpt:'long'}}};
 await Promise.all([store.update({openrouter:'long'}),store.update({chatgpt:'standard'})]);
 assert.deepEqual(config,{extra:44,native:{other:5,context:{version:2,providers:{openrouter:'long',chatgpt:'standard'}}}});
 const patch={chatgpt:'long'};const p=store.update(patch);patch.chatgpt='standard';await p;assert.equal(store.read().chatgpt,'long');
 const model={contextLength:272000,maxContextLength:1100000};
 assert.equal(cloudContextLength('chatgpt',model,{version:2,providers:{chatgpt:'long'}}),1100000);
 assert.equal(cloudContextLength('chatgpt',model,{version:2,providers:{chatgpt:'standard'}}),272000);
 assert.equal(cloudContextLength('local',model,{version:2,providers:{chatgpt:'long'}}),272000);
 assert.equal(cloudContextLength('openrouter',{contextLength:2000000},{version:2,providers:{openrouter:'long'}}),1200000);
 assert.equal(cloudContextLength('chatgpt',undefined,{chatgpt:'long'}),null);
 const cli=path.join(root,'desktop/scripts/migrate-context.cjs'),input=path.join(tmp,'batch.json'),output=path.join(tmp,'converted.json'),again=path.join(tmp,'again.json');
 const batch=[legacy,migrated,{}, {id:'duplicate',native:{context:{chatgpt:'long'}}},{id:'duplicate',native:{context:{version:2,providers:{openrouter:'long'}}}}];
 fs.writeFileSync(input,JSON.stringify(batch));const inputHash=hash(fs.readFileSync(input));assert.equal(invoke([cli,input,output]).status,0);assert.equal(hash(fs.readFileSync(input)),inputHash);assert.deepEqual(JSON.parse(fs.readFileSync(output)),[
  {theme:'keep',native:{other:7,context:{version:2,providers:{openrouter:'long',chatgpt:'standard'}}}},
  {theme:'keep',native:{other:7,context:{version:2,providers:{openrouter:'long',chatgpt:'standard'}}}},
  {native:{context:{version:2,providers:{openrouter:'standard',chatgpt:'standard'}}}},
  {id:'duplicate',native:{context:{version:2,providers:{openrouter:'standard',chatgpt:'long'}}}},
  {id:'duplicate',native:{context:{version:2,providers:{openrouter:'long',chatgpt:'standard'}}}}
 ]);
 assert.equal(invoke([cli,output,again]).status,0);assert.equal(fs.readFileSync(output,'utf8'),fs.readFileSync(again,'utf8'));
 assert.notEqual(invoke([cli,input,output]).status,0);
 fs.writeFileSync(input,JSON.stringify([legacy,{native:{context:{version:9}}}]));const bad=path.join(tmp,'bad.json');assert.notEqual(invoke([cli,input,bad]).status,0);assert.ok(!fs.existsSync(bad));
 mutationTests('desktop/src/main/harness/context-settings-store.ts',()=>fs.readFileSync(path.join(originalRoot,'desktop/src/main/harness/context-settings-store.ts'),'utf8'));
}
function research(){
 const evidence=read('submission/evidence.json');assert.ok(Array.isArray(evidence));
 for(const id of ['catalog-current','billing-current','runtime-current','deprecation'])assert.ok(evidence.some(e=>e.document===id&&typeof e.quote==='string'&&e.quote.length>=30&&read('corpus/'+id+'.json').body.includes(e.quote)),'independent archived quote required');
 for(const e of evidence){assert.ok(!e.document.endsWith('v1'));assert.ok(read('corpus/'+e.document+'.json').body.includes(e.quote));}
 const receipts=fs.readFileSync(path.join(root,'research-receipts.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.ok(receipts.some(r=>r.action==='search'));assert.ok(receipts.some(r=>r.action==='fetch'));
 for(const r of receipts){assert.equal(r.track,'synthetic-controlled-retrieval-v1');assert.ok(typeof r.query==='string'&&r.query.length);for(const d of r.results)assert.equal(d.bodySha256,hash(read('corpus/'+d.id+'.json').body));}
 // Independently expressed catalog/objective; submitted facts never define correctness.
 const products={ 'east-small':{region:'east',capacity:80,memory:4,runtime:22,latency:30,cents:17,cap:3},'west-small':{region:'west',capacity:70,memory:4,runtime:22,latency:45,cents:13,cap:3},'east-large':{region:'east',capacity:160,memory:8,runtime:24,latency:30,cents:29,cap:2},'west-large':{region:'west',capacity:150,memory:8,runtime:24,latency:45,cents:27,cap:2}};
 function measure(allocations,w){let cost=0,capacity=0,count=0,regions={east:0,west:0};const seen=new Set();for(const a of allocations){const s=products[a.sku];if(!s||seen.has(a.sku)||!Number.isInteger(a.count)||a.count<1||a.count>s.cap||s.memory<w.minMemoryGiB||s.runtime<w.runtime||s.latency>w.maxLatencyMs)return null;seen.add(a.sku);cost+=a.count*s.cents*Math.ceil(w.durationMinutes/60);capacity+=a.count*s.capacity;regions[s.region]+=a.count*s.capacity;count+=a.count;}if(cost>w.budgetCents||capacity<w.demandRps||Object.values(regions).some(c=>capacity-c<w.failoverRps))return null;return {cost,capacity,count};}
 function optimum(w){let best=null;const names=Object.keys(products);function walk(i,alloc){if(i<names.length){const sku=names[i];for(let count=0;count<=products[sku].cap;count++)walk(i+1,count?[...alloc,{sku,count}]:alloc);return;}const m=measure(alloc,w);if(m&&(!best||m.cost<best.cost||m.cost===best.cost&&m.count<best.count))best=m;}walk(0,[]);return best;}
 const visible=read('workload.json');const variants=[visible,...[0,45,80,170,320,650,1000].map(demandRps=>({...visible,demandRps,failoverRps:Math.floor(demandRps/3)})),...['budgetCents','minMemoryGiB','runtime','maxLatencyMs','durationMinutes'].flatMap(key=>(key==='budgetCents'?[0,90,500]:key==='minMemoryGiB'?[8,16]:key==='runtime'?[24,26]:key==='maxLatencyMs'?[29,35]:[1,60,120,121]).map(value=>({...visible,[key]:value})))];
 function checkPlan(p,w){const best=optimum(w);if(!best){assert.deepEqual(p,{infeasible:true});return;}assert.ok(Array.isArray(p.allocations));const got=measure(p.allocations,w);assert.ok(got,'allocation infeasible');assert.equal(p.costCents,got.cost);assert.equal(p.capacityRps,got.capacity);assert.equal(got.cost,best.cost,'cost is not optimal');assert.equal(got.count,best.count,'instance tie break');}
 checkPlan(read('submission/plan.json'),visible);
 for(const w of variants){const r=invoke([path.join(root,'submission/planner.cjs')],JSON.stringify(w));assert.equal(r.status,0);checkPlan(JSON.parse(r.stdout),w);}
 mutationTests('submission/planner.cjs',()=>"module.exports={solve:()=>({infeasible:true})};console.log(JSON.stringify({infeasible:true}));");
}
(async()=>{protectedState();assert.ok(fs.statSync(path.join(root,'submission/README.md')).size>40);testsAt(root);if(task==='repo-release-integrity')await release();else if(task==='repo-context-migration')await context();else if(task==='research-failover-planner')research();else throw Error('unknown task');protectedState();console.log(JSON.stringify({passed:true,task,checks:'protected-state, functional public boundaries, submitted-test mutation control'}));})().catch(error=>{if(process.env.YC_VERIFY_DEBUG==='1')console.error(error.stack);const category=error.code==='ENOENT'?'missing-output':/protected input|no symlinks|ordinary files/.test(error.message)?'protected-state':/submitted regression tests|submitted tests must/.test(error.message)?'regression-test':'functional';console.error(JSON.stringify({passed:false,task,category}));process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3}));
