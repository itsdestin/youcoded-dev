import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, chmod, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BudgetLedger} from './budget-ledger.mjs';

async function fixture(t, options={}) {
  const dir=await mkdtemp(join(tmpdir(),'yc-budget-ledger-'));
  await chmod(dir,0o700);
  const path=join(dir,'ledger.json');
  t.after(async()=>rm(dir,{recursive:true,force:true,maxRetries:5}));
  const ledger=await BudgetLedger.open({path,limitUsd:options.limitUsd??4,priorUpperUsd:options.priorUpperUsd??0});
  t.after(()=>ledger.close());
  return {dir,path,ledger};
}

test('scope admission is serialized, immutable and never mutates on refusal',async t=>{
 const {ledger,path}=await fixture(t,{limitUsd:4,priorUpperUsd:1});
 const budgetScope={id:'paired-experiment',limitUsd:1};
 const results=await Promise.allSettled(['a','b','c'].map(trialId=>ledger.reserve({trialId,reservationUsd:0.5,maxRequests:5,budgetScope})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
 const before=ledger.snapshot(),stored=await readFile(path,'utf8');
 assert.deepEqual(before.budgetScopes,{'paired-experiment':1});assert.equal(before.chargedUsd,1);assert.equal(before.reservedUsd,1);
 for(const args of [{trialId:'a'}, {trialId:'a',budgetScope:{id:'other',limitUsd:2}}, {trialId:'new',budgetScope:{id:budgetScope.id,limitUsd:2}}, {trialId:'new',budgetScope:{id:'fresh',limitUsd:0.1}}]){
  await assert.rejects(ledger.reserve({reservationUsd:0.5,maxRequests:5,...args}),/scope/i);
  assert.deepEqual(ledger.snapshot(),before);assert.equal(await readFile(path,'utf8'),stored);
 }
 const unscoped=await ledger.reserve({trialId:'old',reservationUsd:0.2,maxRequests:3});await ledger.settle(unscoped,0.1);
 await assert.rejects(ledger.reserve({trialId:'old',reservationUsd:0.1,maxRequests:3,budgetScope:{id:'fresh',limitUsd:1}}),/scope/i);
 assert.equal(ledger.snapshot().chargedUsd,1.1);
});

test('scoped reservations still obey the historical global gate without registering rejected scopes',async t=>{
 const {ledger,path}=await fixture(t,{limitUsd:4,priorUpperUsd:3.5});
 const before=ledger.snapshot(),raw=await readFile(path,'utf8');
 await assert.rejects(ledger.reserve({trialId:'new',reservationUsd:0.6,maxRequests:1,budgetScope:{id:'not-admitted',limitUsd:2}}),/Budget limit/);
 assert.deepEqual(ledger.snapshot(),before);assert.equal(await readFile(path,'utf8'),raw);
 const id=await ledger.reserve({trialId:'old',reservationUsd:0.2,maxRequests:2});await ledger.retain(id);await ledger.close();
 const legacyRaw=JSON.stringify(JSON.parse(await readFile(path,'utf8')),null,2)+'\n';await writeFile(path,legacyRaw,{mode:0o600});
 const reopened=await BudgetLedger.open({path,limitUsd:4,priorUpperUsd:3.5});t.after(()=>reopened.close());
 assert.equal(await readFile(path,'utf8'),legacyRaw);assert.equal(reopened.snapshot().budgetScopes,undefined);
 await assert.rejects(reopened.reserve({trialId:'old',reservationUsd:0.1,maxRequests:2,budgetScope:{id:'new',limitUsd:1}}),/scope/i);
});

test('scope unknown and restart holds survive with immutable trial bindings',async t=>{
 const {ledger,path}=await fixture(t);const budgetScope={id:'restart-scope',limitUsd:1};
 const id=await ledger.reserve({trialId:'unknown',reservationUsd:0.4,maxRequests:4,budgetScope});await ledger.retain(id);
 await ledger.reserve({trialId:'inflight',reservationUsd:0.6,maxRequests:4,budgetScope});await ledger.close();
 const reopened=await BudgetLedger.open({path,limitUsd:4,priorUpperUsd:0});t.after(()=>reopened.close());
 assert.equal(reopened.snapshot().chargedUsd,1);assert.equal(reopened.snapshot().requests[1].status,'restart-charged');
 await assert.rejects(reopened.reserve({trialId:'new',reservationUsd:0.01,maxRequests:1,budgetScope}),/scope/i);
 await assert.rejects(reopened.reserve({trialId:'unknown',reservationUsd:0.01,maxRequests:4}),/scope/i);
 await assert.rejects(reopened.reserve({trialId:'inflight',reservationUsd:0.01,maxRequests:4,budgetScope:{...budgetScope,limitUsd:2}}),/scope/i);
});

test('estimated scope overruns block only that scope, preserving global historical floor',async t=>{
 const {ledger,path}=await fixture(t);await ledger.close();
 const estimated=await BudgetLedger.open({path:join(path+'-estimated'),limitUsd:10,priorUpperUsd:3,accountingMode:'estimated',externalPriorUsd:2});t.after(()=>estimated.close());
 const reserve=(trialId,budgetScope)=>estimated.reserve({trialId,budgetScope,reservationUsd:0.5,maxRequests:5,estimateUsd:0.5,estimateBasis:{inputTokens:1}});
 const budgetScope={id:'underestimated',limitUsd:1};await estimated.settle(await reserve('one',budgetScope),1.2);
 assert.equal(estimated.snapshot().closed,false);assert.equal(estimated.snapshot().chargedUsd,4.2);
 await assert.rejects(reserve('two',budgetScope),/scope/i);
 await reserve('other',{id:'other',limitUsd:1});await reserve('legacy');await estimated.close();
 const reopened=await BudgetLedger.open({path:path+'-estimated',limitUsd:10,priorUpperUsd:3,accountingMode:'estimated',externalPriorUsd:2});t.after(()=>reopened.close());
 await assert.rejects(reopened.reserve({trialId:'new',budgetScope,reservationUsd:0.1,maxRequests:1,estimateUsd:0.1,estimateBasis:{inputTokens:1}}),/scope/i);
 assert.equal(reopened.snapshot().closed,false);
});

test('reopening refuses malformed scope metadata or rebinding without rewriting ledger',async t=>{
 const {ledger,path}=await fixture(t);const budgetScope={id:'valid',limitUsd:1};
 const id=await ledger.reserve({trialId:'trial',budgetScope,reservationUsd:0.2,maxRequests:4});await ledger.retain(id);await ledger.close();
 const valid=JSON.parse(await readFile(path,'utf8'));
 const mutations=[s=>s.budgetScopes.valid=-1,s=>s.budgetScopes.valid=0.1,s=>s.requests[0].budgetScopeId=null,s=>s.budgetScopes=[],s=>s.budgetScopes={'bad scope':1},s=>delete s.budgetScopes,s=>s.requests[0].budgetScopeId='missing',s=>s.requests.push({...s.requests[0],id:'different',budgetScopeId:undefined})];
 for(const mutate of mutations){const state=structuredClone(valid);mutate(state);const raw=JSON.stringify(state);await writeFile(path,raw,{mode:0o600});await assert.rejects(BudgetLedger.open({path,limitUsd:4,priorUpperUsd:0}),/scope|ledger/i);assert.equal(await readFile(path,'utf8'),raw);}
});

test('scope exposure uses settled actual cost and releases only the observed remainder',async t=>{
 const {ledger,path}=await fixture(t);const budgetScope={id:'actual-cost',limitUsd:1};
 const reserve=trialId=>ledger.reserve({trialId,budgetScope,reservationUsd:0.6,maxRequests:2});
 await ledger.settle(await reserve('first'),0.2);
 const second=await reserve('second');await ledger.retain(second);
 await assert.rejects(reserve('third'),/scope/i);
 assert.equal(ledger.snapshot().chargedUsd,0.8);await ledger.close();
 const raw=await readFile(path,'utf8');const reopened=await BudgetLedger.open({path,limitUsd:4,priorUpperUsd:0});t.after(()=>reopened.close());
 assert.equal(await readFile(path,'utf8'),raw);assert.equal(reopened.snapshot().budgetScopes['actual-cost'],1);
 await assert.rejects(reopened.reserve({trialId:'fresh',budgetScope:{...budgetScope,limitUsd:2},reservationUsd:0.1,maxRequests:1}),/scope/i);
});

test('scope input accepts only bounded primitive slug and positive finite limit',async t=>{
 const {ledger}=await fixture(t);
 for(const budgetScope of [null,{},[],{id:'bad scope',limitUsd:1},{id:'a'.repeat(129),limitUsd:1},{id:'__proto__',limitUsd:1},{id:'valid',limitUsd:0},{id:'valid',limitUsd:Infinity},{id:'valid',limitUsd:1,tags:'private'}])assert.throws(()=>ledger.reserve({trialId:'trial',reservationUsd:0.1,maxRequests:1,budgetScope}),/scope/i);
 assert.equal(ledger.snapshot().budgetScopes,undefined);
});

test('retained diagnostics are primitive allowlisted additions; legacy rows still reopen unchanged',async t=>{
 const {path,ledger}=await fixture(t);
 const id=await ledger.reserve({trialId:'future',reservationUsd:0.1,maxRequests:2});
 for(const extra of [{failureReason:'secret error'},{failureReason:{message:'secret'}},{responseStarted:'yes'},{durationMs:-1},{durationMs:Infinity},{durationMs:'secret'}])assert.throws(()=>ledger.retain(id,'unknown',extra),/Invalid failure/);
 await ledger.retain(id,'unknown',{failureReason:'upstream-read-error',responseStarted:true,durationMs:12,error:new Error('never persist'),headers:{secret:'never persist'}});
 const old=await ledger.reserve({trialId:'legacy',reservationUsd:0.1,maxRequests:1});await ledger.retain(old);
 const state=ledger.snapshot();assert.equal(state.schemaVersion,1);assert.equal(state.requests[1].failureReason,undefined);
 assert.equal(state.requests[0].failureReason,'upstream-read-error');assert.equal(state.requests[0].responseStarted,true);assert.equal(state.requests[0].durationMs,12);
 assert.equal(JSON.stringify(state).includes('never persist'),false);
 await ledger.close();const reopened=await BudgetLedger.open({path,limitUsd:4,priorUpperUsd:0});
 try{assert.deepEqual(reopened.snapshot(),state);}finally{await reopened.close();}
});

test('estimated mode admits against provider floor and keeps estimates distinct',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'yc-estimated-ledger-'));await chmod(dir,0o700);t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:5}));
 const path=join(dir,'ledger.json');
 const ledger=await BudgetLedger.open({path,limitUsd:15,priorUpperUsd:2,accountingMode:'estimated',externalPriorUsd:1});t.after(()=>ledger.close());
 await ledger.recordBillingSnapshot({providerUsageUsd:3,checkedAt:'2026-10-18T00:00:00.000Z'});
 const id=await ledger.reserve({trialId:'trial',reservationUsd:1,maxRequests:2,estimateUsd:1,estimateBasis:{promptTokens:5}});
 await ledger.settle(id,1.2);
 assert.equal(ledger.snapshot().closed,false);
 assert.equal(ledger.snapshot().requests[0].estimateUsd,1);
 assert.equal(ledger.snapshot().externalPriorUsd,1);
 await ledger.close();
 await assert.rejects(BudgetLedger.open({path,limitUsd:15,priorUpperUsd:2}),/configuration|mode/i);
});

test('estimated billing snapshots are valid, monotonic, audited, and configuration bounded',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'yc-estimated-audit-'));await chmod(dir,0o700);t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:5}));const path=join(dir,'ledger.json');
 const ledger=await BudgetLedger.open({path,limitUsd:15,priorUpperUsd:2,accountingMode:'estimated',externalPriorUsd:1});
 assert.throws(()=>ledger.recordBillingSnapshot({providerUsageUsd:2,checkedAt:'not-a-date'}),/snapshot/i);
 await ledger.recordBillingSnapshot({providerUsageUsd:3,checkedAt:'2026-10-18T00:00:00.000Z'});
 await ledger.recordBillingSnapshot({providerUsageUsd:2,checkedAt:'2026-10-18T00:00:01.000Z'});
 assert.equal(ledger.snapshot().providerUsageUsd,3);assert.equal(ledger.snapshot().billingSnapshots.length,2);
 await ledger.close();const stored=JSON.parse(await readFile(path,'utf8'));stored.providerUsageUsd='NaN';await writeFile(path,JSON.stringify(stored),{mode:0o600});
 await assert.rejects(BudgetLedger.open({path,limitUsd:15,priorUpperUsd:2,accountingMode:'estimated',externalPriorUsd:1}),/malformed/i);
 await assert.rejects(BudgetLedger.open({path:join(dir,'other.json'),limitUsd:15,priorUpperUsd:2,accountingMode:'estimated',externalPriorUsd:3}),/invalid/i);
});

test('settled concurrent decimal reservations leave exact zero and reopen safely',async t=>{
 const {path,ledger}=await fixture(t);const ids=[];
 for(const reservationUsd of [0.1,0.7,0.2])ids.push(await ledger.reserve({trialId:'decimal',reservationUsd,maxRequests:3}));
 await ledger.settle(ids[0],0.01);await ledger.retain(ids[1]);await ledger.settle(ids[2],0.01);
 assert.equal(ledger.snapshot().reservedUsd,0);
 await ledger.authorizeLimit(5,'Test authorization after every request finished');await ledger.close();
 const restored=await BudgetLedger.open({path,limitUsd:5,priorUpperUsd:0});t.after(()=>restored.close());assert.equal(restored.snapshot().reservedUsd,0);
});

test('explicit budget amendment preserves charged holds and persists authorization',async t=>{
 const {path,ledger}=await fixture(t,{limitUsd:10,priorUpperUsd:5});
 const id=await ledger.reserve({trialId:'failed',reservationUsd:3,maxRequests:1});await ledger.retain(id);
 await ledger.authorizeLimit(15,'User explicitly approved USD15 in this conversation');
 assert.equal(ledger.snapshot().chargedUsd,8);assert.equal(ledger.snapshot().requests.length,1);
 assert.equal(ledger.snapshot().limitUsd,15);assert.equal(ledger.snapshot().authorizations[0].previousLimitUsd,10);
 await assert.rejects(ledger.authorizeLimit(20,''),/authorization/i);
 await ledger.close();
 const restored=await BudgetLedger.open({path,limitUsd:15,priorUpperUsd:5});t.after(()=>restored.close());
 assert.equal(restored.snapshot().chargedUsd,8);
});

test('exclusive ledger admits concurrent reservations atomically under cap and request count',async t=>{
  const {path,ledger}=await fixture(t,{limitUsd:2});
  const other=await assert.rejects(BudgetLedger.open({path,limitUsd:2,priorUpperUsd:0}),/already in use/i);
  assert.equal(other,undefined);
  const results=await Promise.allSettled([
    Promise.resolve().then(()=>ledger.reserve({trialId:'trial-a',reservationUsd:1,maxRequests:1})),
    Promise.resolve().then(()=>ledger.reserve({trialId:'trial-a',reservationUsd:1,maxRequests:1})),
    Promise.resolve().then(()=>ledger.reserve({trialId:'trial-b',reservationUsd:1,maxRequests:2})),
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
  assert.equal(ledger.snapshot().reservedUsd,2);
  assert.equal(ledger.snapshot().requests.length,2);
});

test('stale lock is refused rather than racing another startup to reclaim it',async t=>{
 const {path,ledger}=await fixture(t,{limitUsd:3});await ledger.close();
 await writeFile(path+'.lock',JSON.stringify({pid:2147483647}),{mode:0o600});
 await assert.rejects(BudgetLedger.open({path,limitUsd:3,priorUpperUsd:0}),/already in use|manual/i);
 assert.equal(JSON.parse(await readFile(path+'.lock','utf8')).pid,2147483647);
});

test('restart permanently charges outstanding reservations and does not retry them',async t=>{
  const {path,ledger}=await fixture(t,{limitUsd:3,priorUpperUsd:0.5});
  await ledger.reserve({trialId:'trial-a',reservationUsd:1.25,maxRequests:4});
  await ledger.close();
  const restarted=await BudgetLedger.open({path,limitUsd:3,priorUpperUsd:0.5});
  t.after(()=>restarted.close());
  assert.equal(restarted.snapshot().reservedUsd,0);
  assert.equal(restarted.snapshot().chargedUsd,1.75);
  assert.equal(restarted.snapshot().requests[0].status,'restart-charged');
  await assert.rejects(restarted.settle(restarted.snapshot().requests[0].id,0.01),/not reserv/i);
});

test('settlement is exactly once, releases remainder, and anomaly closes ledger',async t=>{
  const {ledger}=await fixture(t,{limitUsd:5});
  const id=await ledger.reserve({trialId:'trial-a',reservationUsd:1,maxRequests:2});
  await ledger.settle(id,0.2);
  assert.equal(ledger.snapshot().chargedUsd,0.2);
  assert.equal(ledger.snapshot().reservedUsd,0);
  await assert.rejects(ledger.settle(id,0.2),/not reserv/i);
  const second=await ledger.reserve({trialId:'trial-a',reservationUsd:1,maxRequests:2});
  await ledger.settle(second,1.1);
  assert.equal(ledger.snapshot().closed,true);
  await assert.rejects(ledger.reserve({trialId:'trial-b',reservationUsd:0.1,maxRequests:2}),/closed/i);
});

test('missing or failed accounting retains the full reservation without inventing zero',async t=>{
  const {ledger,path}=await fixture(t,{limitUsd:3});
  const id=await ledger.reserve({trialId:'trial-a',reservationUsd:0.75,maxRequests:2});
  await ledger.retain(id,'unknown');
  assert.equal(ledger.snapshot().chargedUsd,0.75);
  assert.equal(ledger.snapshot().requests[0].actualCostUsd,null);
  assert.equal(ledger.snapshot().requests[0].status,'unknown');
  const persisted=JSON.parse(await readFile(path,'utf8'));
  assert.equal(persisted.requests[0].actualCostUsd,null);
});

test('refuses ledger config mismatch, insecure directory, and malformed state',async t=>{
  const {dir,path,ledger}=await fixture(t,{limitUsd:3});
  await ledger.close();
  await assert.rejects(BudgetLedger.open({path,limitUsd:4,priorUpperUsd:0}),/configuration/i);
  const bad=join(dir,'bad'); await mkdir(bad,{mode:0o755}); await chmod(bad,0o755);
  await assert.rejects(BudgetLedger.open({path:join(bad,'ledger.json'),limitUsd:1,priorUpperUsd:0}),/private/i);
});
