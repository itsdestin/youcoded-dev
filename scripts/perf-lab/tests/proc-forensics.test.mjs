import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProtocolEnvelope } from '../supervised-protocol.mjs';
import { createProcFailureRing, procFailureSnapshot } from '../proc-forensics.mjs';
import { readProc, OwnedProcesses } from '../owned-processes.mjs';
import { readProcessStart, captureCheckpoint, RESOURCE_METRICS } from '../resource-checkpoint.mjs';

const stat=(state='S',start='2000')=>`20 (secret-user-title) ${[state,'10','20','20',...Array(15).fill('0'),start].join(' ')}`;
const status=(state='S',rss='VmRSS:\t2048 kB\n')=>`Name:\tsecret-user-title\nUmask:\t0022\nState:\t${state} (sleeping)\nTgid:\t20\nPid:\t20\nPPid:\t10\nThreads:\t3\n${rss}PrivateThing:\tsecret-user-content\n`;
function readFixture({ body=status(), states=[stat(),stat()], denied=false }={}) {
 let n=0;
 return path=>{if(path.endsWith('/stat')){const value=states[Math.min(n++,states.length-1)];if(value instanceof Error)throw value;return value;}
 if(path.endsWith('/status')){if(denied)throw Object.assign(Error('permission denied'),{code:'EACCES'});return body;}
 if(path.endsWith('/cmdline'))return 'SECRET-ARGV\0';throw Error('unexpected path '+path);};
}

test('empty/truncated/malformed status remains fatal and yields bounded raw structural evidence before/after identities',()=>{
 for(const body of ['', 'Name:\tsecret-user-title\n', status('S','VmRSS:\tbad kB\n')]) {
  const ring=createProcFailureRing();
  assert.throws(()=>readProc(20,{read:readFixture({body}),onFailure:ring.record,now:()=>123,phase:'cleanup',intentionalTeardown:true}),/status/);
  const row=ring.snapshot().records[0];
  assert.equal(row.pid,20);assert.equal(row.operation,'parse-status');assert.equal(row.path,'/proc/20/status');
  assert.equal(row.phase,'cleanup');assert.equal(row.intentionalTeardown,true);assert.equal(row.at,123);
  assert.equal(row.before.starttime,'2000');assert.equal(row.after.starttime,'2000');
  assert.ok(Buffer.byteLength(JSON.stringify(row))<=8192);
  assert.doesNotMatch(JSON.stringify(row),/secret-user|SECRET-ARGV/);
 }
});

test('empty/truncated stat remains a parse failure with redacted excerpt, not disappearance',()=>{
 for(const body of ['', '20 (secret-user-title) S 10']){
  const ring=createProcFailureRing();assert.throws(()=>readProc(20,{read:()=>body,onFailure:ring.record}),/stat identity/);
  const record=ring.snapshot().records[0];assert.equal(record.operation,'parse-stat-before');assert.equal(record.errno,null);assert.equal(record.before,null);
  assert.doesNotMatch(JSON.stringify(record),/secret-user-title/);
 }
});

test('valid Linux whitespace/order/threads layouts do not depend on line order or Threads presence',()=>{
 const variants=[status(), 'Threads:\t1\nVmRSS:    2048 kB\nState:  S (sleeping)\nName:  worker\n', 'Name:\tworker\nState:\tS (sleeping)\nVmRSS:\t2048 kB\n'];
 for(const body of variants){const rows=[];const r=readProc(20,{read:readFixture({body}),onFailure:x=>rows.push(x)});assert.equal(r.rssMb,2);assert.deepEqual(rows,[]);}
});

test('Z/X/dead status missing RSS retains availability gap; identity disappearance and reuse are distinguishable, never parser-failure disappearance',()=>{
 for(const state of ['Z','X']){const ring=createProcFailureRing();const r=readProc(20,{read:readFixture({body:status(state,''),states:[stat(state),stat(state)]}),onFailure:ring.record});assert.equal(r.rssMb,null);assert.equal(r.state,state);assert.equal(ring.snapshot().records[0].reason,'missing-rss');}
 const gone=Object.assign(Error('gone'),{code:'ENOENT'}),ring=createProcFailureRing();
 assert.equal(readProc(20,{read:readFixture({states:[stat(),gone]}),onFailure:ring.record}),null);
 assert.equal(ring.snapshot().records[0].errno,'ENOENT');assert.equal(ring.snapshot().records[0].after,null);
 const reuse=createProcFailureRing();assert.throws(()=>readProc(20,{read:readFixture({states:[stat(),stat('S','9999')]}),onFailure:reuse.record}),/identity/);
 assert.equal(reuse.snapshot().records[0].before.starttime,'2000');assert.equal(reuse.snapshot().records[0].after.starttime,'9999');
 const malformedGone=createProcFailureRing();assert.throws(()=>readProc(20,{read:readFixture({body:'',states:[stat(),gone]}),onFailure:malformedGone.record}),/status/);
 assert.equal(malformedGone.snapshot().records[0].reason,'parse-status');
});

test('permission and initial ENOENT record errno/op without leaking exception or cmdline; forensic callback cannot change verdict',()=>{
 const ring=createProcFailureRing();assert.throws(()=>readProc(20,{read:readFixture({denied:true}),onFailure:ring.record}),/permission/);
 assert.equal(ring.snapshot().records[0].errno,'EACCES');assert.equal(ring.snapshot().records[0].operation,'read-status');
 const gone=Object.assign(Error('secret path'),{code:'ENOENT'}),r=createProcFailureRing();assert.equal(readProc(20,{read:()=>{throw gone;},onFailure:r.record}),null);assert.equal(r.snapshot().records[0].operation,'read-stat-before');
 assert.throws(()=>readProc(20,{read:readFixture({body:''}),onFailure:()=>{throw Error('collector failed');}}),/Malformed proc status/);
});

test('ring caps record count/bytes/excerpts and preserves dropped/truncated evidence; raw stat comm and arbitrary status text redacted',()=>{
 const ring=createProcFailureRing();
 for(let i=0;i<100;i++)ring.record(procFailureSnapshot({pid:20,operation:'read-status',phase:'measurement',at:i,rawStat:stat(),rawStatus:status()+('PrivateThing: SECRET'.repeat(10000)),reason:'failure'}));
 const out=ring.snapshot();assert.ok(out.records.length<=4);assert.ok(out.bytes<=24576);assert.ok(out.dropped>0);
 assert.ok(out.records.every(r=>r.statusExcerpt.length<=4096&&r.statExcerpt.length<=4096));
 assert.doesNotMatch(JSON.stringify(out),/secret-user|SECRET|PrivateThing/);
});

test('shaped snapshot ignores throwing extra getters and a property flood without enumerating or retaining them',()=>{
 const supplied=procFailureSnapshot({pid:20,operation:'parse-status',rawStat:stat(),rawStatus:status(),before:{pid:20,starttime:'2000',state:'S',ppid:10}});
 supplied.statBytes=9000;supplied.statTruncated=true;
 const ring=createProcFailureRing();ring.record(supplied);const expected=ring.snapshot();
 let reads=0;
 const getter=()=>{reads++;throw Error('unknown getter executed');};
 Object.defineProperty(supplied,'unknown',{enumerable:true,get:getter});
 for(let i=0;i<20000;i++)Object.defineProperty(supplied,'extra'+i,{enumerable:true,get:getter});
 Object.defineProperty(supplied.before,'unknown',{enumerable:true,get:getter});
 Object.defineProperty(supplied,'toJSON',{get:getter});
 const flooded=createProcFailureRing();assert.doesNotThrow(()=>flooded.record(supplied));
 assert.equal(reads,0);assert.deepEqual(flooded.snapshot(),expected);
});

test('allowlisted accessors and proxies are dropped without invoking code or replacing the primary failure',()=>{
 let calls=0;
 const getter=()=>{calls++;throw Error('accessor executed');};
 const proxy=new Proxy({},Object.fromEntries(['get','ownKeys','getOwnPropertyDescriptor','getPrototypeOf'].map(key=>[key,getter])));
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const ring=createProcFailureRing();
 const fields=['revision','pid','operation','phase','intentionalTeardown','at','reason','errno','rawStat','rawStatus','before','after','afterError','statExcerpt','statusExcerpt','statBytes','statusBytes','statTruncated','statusTruncated'];
 const invalid=[proxy,revoked.proxy,{before:proxy},{after:revoked.proxy}];
 for(const field of fields){const row={};Object.defineProperty(row,field,{get:getter});invalid.push(row);}
 for(const side of ['before','after'])for(const field of ['pid','starttime','state','ppid']){
  const row={[side]:{}};Object.defineProperty(row[side],field,{get:getter});invalid.push(row);
 }
 for(const row of invalid)assert.doesNotThrow(()=>ring.record(row));
 assert.equal(calls,0);assert.equal(ring.snapshot().dropped,invalid.length);assert.deepEqual(ring.snapshot().records,[]);
 const inherited=Object.create(Object.defineProperty({},'pid',{get:getter}));ring.record(inherited);
 assert.equal(ring.snapshot().records[0].pid,null);assert.equal(calls,0);
 assert.throws(()=>readProc(20,{read:readFixture({body:''}),onFailure:()=>ring.record(proxy)}),/Malformed proc status/);
 assert.equal(calls,0);assert.equal(ring.snapshot().dropped,invalid.length+1);
});

test('default tracker readProc producer persists cleanup-stage parse failure ring in unconfirmed receipt',async()=>{
 let bad=false,time=0;
 const parent=`10 (parent) ${['S','1','10','10',...Array(15).fill('0'),'1000'].join(' ')}`;
 const procRead=path=>{const pid=Number(path.split('/')[2]);if(path.endsWith('/stat'))return pid===20?stat():parent;if(path.endsWith('/status'))return bad&&pid===20?'':status();if(path.endsWith('/cmdline'))return pid===20?'/tmp/perf-lab/forensic-private/job\0':'parent\0';throw Error('unexpected');};
 const tracker=new OwnedProcesses({leaderPid:20,parentPid:10,jobDir:'/tmp/perf-lab/forensic-private',procRead,list:()=>[10,20],signal:()=>{},now:()=>time,sleep:async ms=>{time+=ms;}});
 tracker.capture();bad=true;
 const result=await tracker.cleanup({termWaitMs:5,killWaitMs:5,everyMs:5});assert.equal(result.cleanupConfirmed,false);
 assert.ok(result.procFailures.records.length>0);assert.ok(result.procFailures.records.every(r=>r.intentionalTeardown===true&&r.phase.startsWith('cleanup')));
 assert.ok(result.procFailures.dropped>0);assert.doesNotThrow(()=>assertProtocolEnvelope({final:{family:result}}));assert.doesNotMatch(JSON.stringify(result.procFailures),/secret-user|SECRET-ARGV/);
});

test('forensic malformed structure never stores arbitrary stat tail/state description/argv or changes parser verdict',()=>{
 const row=procFailureSnapshot({pid:20,operation:'parse-status',rawStat:'20 (user text) S 10 SECRET',rawStatus:'Name: user\nState: S (SECRET)\nVmRSS: SECRET\nPath: /home/secret\n'});
 assert.doesNotMatch(JSON.stringify(row),/SECRET|\/home\/secret|user text/);assert.match(row.statExcerpt,/unparseable/);assert.equal(row.statusBytes,Buffer.byteLength('Name: user\nState: S (SECRET)\nVmRSS: SECRET\nPath: /home/secret\n'));
});

test('resource per-PID start read failure retains checkpoint phase and raw stat without granting validity',async()=>{
 const ring=createProcFailureRing();assert.throws(()=>readProcessStart(20,{read:()=> '20 (secret-user-title) S 10',onFailure:ring.record,phase:'before',now:()=>10}),/unavailable/);
 assert.equal(ring.snapshot().records[0].operation,'parse-starttime');assert.equal(ring.snapshot().records[0].phase,'before');
 const row=await captureCheckpoint({phase:'before',identity:{source:'source',run:'run',target:'target'},readEpoch:async()=>({documentEpoch:'100',url:'file://test'}),family:()=>[20],
 cdp:{send:async()=>({metrics:RESOURCE_METRICS.map(name=>({name,value:1}))})},readProcessStart:()=>{throw Object.assign(Error('gone'),{code:'ENOENT'});},readPss:()=>({perPid:[],totalMb:0}),now:()=>10});
 assert.equal(row.status,'incomplete');assert.ok(row.procFailures.records.length>0);assert.equal(row.pss.totalMb,null);
});
