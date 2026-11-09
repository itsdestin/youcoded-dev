// Read-only replay of recorded actual CLI evidence, not another runtime repetition.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=new URL('../evidence/lifecycle-batch/',import.meta.url),load=n=>JSON.parse(fs.readFileSync(new URL(n+'.json',base),'utf8'));
const launch=load('launch');assert.equal(launch.exitCode,0);assert.equal(launch.signal,null);assert(launch.preservation.every(x=>x.unchanged&&x.before===x.after));assert.deepEqual(launch.remainingSandboxProcesses,[]);
for(const flag of ['--clearenv','--unshare-net','--unshare-pid','--ro-bind'])assert(launch.command.includes(flag));
const all=['stall','recovery','poll','resume','absent','empty'].map(load);
for(const r of all){
 assert.match(r.version,/2\.1\.302/);assert(r.serversClosed);assert.deepEqual(r.policy,{permissions:{defaultMode:'default'}});
 assert(r.home.startsWith(launch.sandbox+'/'));assert(r.environment.CLAUDE_CONFIG_DIR.startsWith(r.home+'/'));assert.equal(r.environment.ANTHROPIC_AUTH_TOKEN,'fake-token-for-local-capture');assert(r.environment.ANTHROPIC_BASE_URL.startsWith('http://127.0.0.1:'));
 assert(r.requests.every(x=>x.dummyAuth));
 for(const p of r.phases){assert.equal(p.networkNamespace,p.cliNetworkNamespace);assert.deepEqual(p.exit,{exitCode:129,signal:0});}
 for(const p of r.phases.filter(p=>p.modReport)){assert(p.modReport.handshake);assert(p.modReport.done);assert(p.modReport.rows.filter(x=>x.prompt).every(x=>x.completed));assert(!p.modReport.rows.some(x=>x.error));}
}
const [stall,recovery,poll,resume,absent,empty]=all,events=r=>r.phases[0].modReport.events;
const deniedResult=r=>r.requests.some(q=>q.body.messages?.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='tool_result'&&c.is_error&&c.content.includes('Explicit lifecycle catch denial'))));
assert.equal(stall.files.stall.exists,false);assert(deniedResult(stall));assert.equal(stall.serviceEvents.length,1);assert(stall.serviceEvents[0].closedAt-stall.serviceEvents[0].at>=29500);assert.match(events(stall).find(x=>x.event==='catch-deny').error.message,/no complete answer within 30000ms/);
assert.equal(recovery.files.malformed.exists,false);assert(deniedResult(recovery));assert.match(events(recovery).find(x=>x.event==='catch-deny').error.message,/Missing valid explicit decision/);assert.equal(recovery.files.recovered.content,'SYNTHETIC lifecycle recovered\n');
assert.deepEqual(recovery.serviceEvents.filter(x=>x.path).map(x=>[x.path,x.generation]),[['/malformed.txt?attempt=0',1],['/recovered.txt?attempt=0',2]]);assert(recovery.serviceEvents.some(x=>x.event==='service-restarted'));
const replies=events(poll).filter(x=>x.event==='response');assert.deepEqual(replies.map(x=>x.reply),[{pending:true},{pending:true},{pending:true},{decision:'allow'}]);assert(replies[3].elapsedMs>36000);assert(replies[3].remaining>9000);assert.equal(poll.files.poll.content,'SYNTHETIC lifecycle poll\n');assert.equal(poll.serviceEvents.length,4);
for(const r of [stall,recovery,poll])assert(events(r).filter(x=>x.event==='underlying').every(x=>x.underlying.decision==='ask'&&x.toolUseId));
assert.equal(resume.phases.length,2);assert.equal(resume.phases[0].modReport.id,resume.phases[1].modReport.id);assert(resume.phases[1].command.includes('--resume'));assert(resume.phases.every(p=>p.command.includes('--plugin-dir')));
const markers=['SYNTHETIC lifecycle before resume','SYNTHETIC lifecycle after resume'];
const userRows=p=>p.transcripts.flatMap(t=>t.text.split('\n').filter(Boolean).map(JSON.parse)).filter(x=>x.type==='user'&&typeof x.message?.content==='string').map(x=>x.message.content);
assert.deepEqual(userRows(resume.phases[0]),[markers[0]]);assert.deepEqual(userRows(resume.phases[1]),markers);assert.equal(resume.requests.length,2);
for(const marker of markers)assert.equal(JSON.stringify(resume.requests[1].body.messages).split(marker).length-1,1);
for(const r of [absent,empty]){assert.equal(r.phases[0].modReport,null);assert.equal(r.requests.length,0);assert(r.phases[0].durationMs>=6500);}
assert(!absent.phases[0].command.includes('--plugin-dir'));assert(empty.phases[0].command.includes('--plugin-dir'));
const emptyLog=fs.readFileSync(new URL('empty-first-debug.log',base),'utf8');assert.match(emptyLog,/isolated-lifecycle@inline loaded .*events: none/);assert.match(emptyLog,/isolated-lifecycle .*admitted/);
console.log('PASS: isolation, preservation, cleanup; 30s ceiling deny; malformed deny + distinct restart recovery; bounded 36s polling allow; same-ID resume without duplicate users; absent/empty handshake controls. Worker unload remains unverified.');
