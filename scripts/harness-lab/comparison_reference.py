"""Real reference implementations: controller-only, never exported to an agent."""
import json
from pathlib import Path
import subprocess

VALIDATION=r'''// WHY: validate before signing and again after signature verification.
export function validateReleaseManifest(value: unknown): {version:string;assets:{name:string;sha256:string;size:number}[]} {
 if(!value || typeof value!=='object' || Array.isArray(value))throw Error('manifest');
 const obj=value as Record<string,unknown>;
 if(typeof obj.version!=='string'||!obj.version.trim())throw Error('version');
 const version=obj.version.trim().replace(/^v/i,'');if(!version)throw Error('version');
 if(!Array.isArray(obj.assets)||!obj.assets.length)throw Error('assets');
 const seen=new Set<string>();const assets=obj.assets.map(candidate=>{
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw Error('asset');
  const a=candidate as Record<string,unknown>;
  if(typeof a.name!=='string'||!a.name||a.name==='.'||a.name==='..'||/[\\/]/.test(a.name)||seen.has(a.name))throw Error('name');
  seen.add(a.name);
  if(typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(a.sha256))throw Error('hash');
  if(typeof a.size!=='number'||!Number.isSafeInteger(a.size) || a.size<0)throw Error('size');
  return {name:a.name,sha256:a.sha256.toLowerCase(),size:a.size};
 }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 return {version,assets};
}
'''
MIGRATION=r'''import type {ContextPreferences} from './context-preferences';
// WHY: a single compatibility decoder prevents stale storage/provider consumers.
function object(v:unknown): v is Record<string,unknown> {return v!==null&&typeof v==='object'&&!Array.isArray(v);}
export function preferences(value:unknown): ContextPreferences {
 const c=object(value)?value:{};
 if(Object.hasOwn(c,'version')&&c.version!==2)throw TypeError('unsupported context version');
 const p=c.version===2?(object(c.providers)?c.providers:{}):c;
 return {openrouter:p.openrouter==='long'?'long':'standard',chatgpt:p.chatgpt==='long'?'long':'standard'};
}
export function migrateConfig(config:unknown):Record<string,unknown> {
 if(!object(config))throw TypeError('config object required');
 const native=object(config.native)?config.native:{};
 return {...config,native:{...native,context:{version:2,providers:preferences(native.context)}}};
}
'''
CLI=r'''const fs=require('node:fs');
const {migrateConfig}=require('../src/shared/context-migration.mts');
const [input,output]=process.argv.slice(2);
try {
 if(!input||!output||fs.existsSync(output))throw Error('fresh output required');
 const configs=JSON.parse(fs.readFileSync(input,'utf8'));
 if(!Array.isArray(configs))throw Error('batch array required');
 // WHY: finish validation before exclusive create, so invalid batches leave no output.
 const bytes=JSON.stringify(configs.map(migrateConfig),null,2)+'\n';
 fs.writeFileSync(output,bytes,{flag:'wx'});
}catch(e){console.error('Migration refused');process.exitCode=1;}
'''
PLANNER=r'''const fs=require('node:fs');
// Retrieved catalog-current v2; see evidence.json for body quotations.
const skus=[['east-small','east',80,4,22,30,17,3],['west-small','west',70,4,22,45,13,3],['east-large','east',160,8,24,30,29,2],['west-large','west',150,8,24,45,27,2]];
function solve(w){
 let best=null;const hours=Math.ceil(w.durationMinutes/60);
 function visit(i,counts){
  if(i<skus.length){const s=skus[i],cap=s[3]>=w.minMemoryGiB&&s[4]>=w.runtime&&s[5]<=w.maxLatencyMs?s[7]:0;for(let n=0;n<=cap;n++)visit(i+1,[...counts,n]);return;}
  const capacity=counts.reduce((a,n,j)=>a+n*skus[j][2],0),cost=counts.reduce((a,n,j)=>a+n*skus[j][6]*hours,0),instances=counts.reduce((a,n)=>a+n,0);
  if(capacity<w.demandRps||cost>w.budgetCents)return;
  for(const region of ['east','west'])if(counts.reduce((a,n,j)=>a+(skus[j][1]===region?0:n*skus[j][2]),0)<w.failoverRps)return;
  if(best&&(best.costCents<cost||best.costCents===cost&&best.instances<=instances))return;
  best={allocations:counts.flatMap((n,j)=>n?[{sku:skus[j][0],count:n}]:[]),costCents:cost,capacityRps:capacity,instances};
 }
 visit(0,[]);if(!best)return {infeasible:true};delete best.instances;return best;
}
if(require.main===module)console.log(JSON.stringify(solve(JSON.parse(fs.readFileSync(0,'utf8')))));
module.exports={solve};
'''
TEST_A=r'''const assert=require('node:assert/strict'),path=require('node:path');
const {load}=require('../comparison-loader.cjs');
const {parseReleaseManifest}=load(path.join(__dirname,'../desktop/src/main/update-manifest-verify.ts'),{'./update-installer':{UpdateInstallError:class extends Error {constructor(code,message){super(message);this.code=code;}}}});
assert.throws(()=>parseReleaseManifest(JSON.stringify({version:'1',assets:[{name:'bad.exe',sha256:'a'.repeat(64),size:-1}]})));
assert.throws(()=>parseReleaseManifest(JSON.stringify({version:'1',assets:[{name:'../bad.exe',sha256:'a'.repeat(64),size:1}]})));
assert.equal(parseReleaseManifest(JSON.stringify({version:'v2',assets:[{name:'ok.exe',sha256:'A'.repeat(64),size:1}]})).version,'2');
'''
TEST_B=r'''const assert=require('node:assert/strict'),path=require('node:path');const {load}=require('../comparison-loader.cjs');
const {ContextSettingsStore}=load(path.join(__dirname,'../desktop/src/main/harness/context-settings-store.ts'),{'../native-home':{NativeHome:class {}}});
let config={native:{context:{version:2,providers:{openrouter:'long',chatgpt:'standard'}}}};
const home={readJson:()=>config,mutateJson:async(_n,fn)=>{config=fn(config);}};
(async()=>{const store=new ContextSettingsStore(home);assert.equal(store.read().openrouter,'long');await store.update({chatgpt:'long'});assert.equal(config.native.context.version,2);assert.equal(config.native.context.providers.openrouter,'long');})().catch(()=>process.exit(1));
'''
TEST_C=r'''const assert=require('node:assert/strict');const {solve}=require('./planner.cjs');
const base={demandRps:210,failoverRps:100,minMemoryGiB:4,runtime:22,maxLatencyMs:50,durationMinutes:61,budgetCents:180};
assert.equal(solve({...base,budgetCents:0}).infeasible,true);
const a=solve(base);assert.ok(a.costCents<=180);assert.ok(a.capacityRps>=210);
'''

def write(root,name,text):
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)

def apply(root,task):
    write(root,'submission/README.md','Compatibility, constraints and executable regression coverage. Run node submission/test.cjs. Source flow: release generator → signed bytes → update verifier; context migration → lock-protected store → cloud resolver. Frozen corpus only, not live web. Preserve the original input for rollback.\n')
    if task=='repo-release-integrity':
        write(root,'desktop/src/shared/release-validation.mts',VALIDATION)
        p=root/'desktop/scripts/generate-release-manifest.mjs';s=p.read_text().replace("import fs from 'fs';","import * as validation from '../src/shared/release-validation.mts';\nimport fs from 'fs';")
        s=s.replace("return { version: String(version).replace(/^v/i, ''), assets };","return validation.validateReleaseManifest({version,assets});")
        p.write_text(s)
        p=root/'desktop/src/main/update-manifest-verify.ts';s=p.read_text();start=s.index('export function parseReleaseManifest(');end=s.index('\n/**',start)
        s=s[:start]+'''export function parseReleaseManifest(bytes: Buffer | string): ReleaseManifest {
  try { return validateReleaseManifest(JSON.parse(bytes.toString())); }
  catch { throw new UpdateInstallError('verify-failed', 'malformed release manifest'); }
}
'''+s[end:]
        s="import {validateReleaseManifest} from '../shared/release-validation.mjs';\n"+s;p.write_text(s)
        write(root,'submission/test.cjs',TEST_A)
        write(root,'submission/README.md','Release integrity: desktop/scripts/generate-release-manifest.mjs calls buildManifest, which validates/canonicalizes via desktop/src/shared/release-validation.mts before serializeManifest and detached signing. desktop/src/main/update-manifest-verify.ts verifies the raw-byte signature first, then parseReleaseManifest uses the same validator; downloaded-update checks retain tag, downgrade, size and streamed hash gates. No production signing key changes. Run node submission/test.cjs. The .mts helper emits .mjs for the compiled main-process import; the standalone signing script imports source .mts using the declared modern Node runtime.\n')
    elif task=='repo-context-migration':
        write(root,'desktop/src/shared/context-migration.mts',MIGRATION);write(root,'desktop/scripts/migrate-context.cjs',CLI)
        p=root/'desktop/src/main/harness/context-settings-store.ts';s=p.read_text();start=s.index('function normalize(');end=s.index('\nexport class',start)
        s=s[:start]+'function normalize(value: unknown): ContextPreferences { return readPreferences(value); }\n'+s[end:]
        s=s.replace("return { ...config, native: { ...native, context: committed } };","return migrateConfig({ ...config, native: { ...native, context: committed } });")
        p.write_text("import {preferences as readPreferences,migrateConfig} from '../../shared/context-migration.mjs';\n"+s)
        p=root/'desktop/src/main/providers/cloud-context.ts';s=p.read_text().replace("const isLong = preferences[type] === 'long';","const isLong = readPreferences(preferences)[type] === 'long';").replace('preferences: ContextPreferences','preferences: unknown');p.write_text("import {preferences as readPreferences,migrateConfig} from '../../shared/context-migration.mjs';\n"+s)
        write(root,'submission/test.cjs',TEST_B)
        write(root,'submission/README.md','Context v2 compatibility: context-migration.mts reads both the legacy provider preferences and version:2 providers envelope, preserving the existing API shape. context-settings-store.ts validates/copies patches before awaiting the lock, merges inside it and persists v2; cloud-context.ts decodes either representation before applying capability ceilings. Example input: [{"theme":"dark","native":{"context":{"openrouter":"long"}}}]. Run node desktop/scripts/migrate-context.cjs INPUT OUTPUT with a fresh output; a bad/future-version config rejects the whole batch without creating it. Duplicate entries and ordering survive, unrelated fields survive, and repeated conversion is idempotent. Keep the unchanged original INPUT for rollback; do not replace live configuration during evaluation. Run node submission/test.cjs.\n')
    elif task=='research-failover-planner':
        write(root,'submission/planner.cjs',PLANNER);write(root,'submission/test.cjs',TEST_C)
        docs=[]
        for name in ('catalog-current','billing-current','runtime-current','deprecation'):
            subprocess.run(['node',str(root/'research.cjs'),'search',name],check=True,capture_output=True)
            fetched=subprocess.check_output(['node',str(root/'research.cjs'),'fetch',name]);d=json.loads(fetched);docs.append(dict(document=name,quote=d['body']))
        write(root,'submission/evidence.json',json.dumps(docs,indent=2)+'\n')
        result=subprocess.check_output(['node',str(root/'submission/planner.cjs')],input=(root/'workload.json').read_bytes());write(root,'submission/plan.json',result.decode())
        plan=json.loads(result)
        write(root,'submission/README.md','Recommendation for the supplied workload: '+json.dumps(plan,sort_keys=True)+'. The planner enumerates feasible bounded SKU counts, minimizes exact whole-hour cost, then instance count, and checks each complete region loss independently. catalog-current and billing-current supersede the cheaper v1 snippets per deprecation; runtime-current requires per-instance memory and runtime compatibility. Evidence includes exact archived quotations. Run node submission/planner.cjs < workload.json and node submission/test.cjs. This is a synthetic frozen controlled-retrieval decision exercise, not a live-web/provider search qualification. CLI receipts show document/hash consistency, not authenticated native-tool observations.\n')
    else:raise ValueError('Unknown reference task')
