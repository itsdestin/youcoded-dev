// WHY: saved-evidence assertions only: no CLI launch, service, writes or output regeneration.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const load=(batch,name)=>JSON.parse(fs.readFileSync(base+'evidence/'+batch+'/'+name+'.json','utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let checks=0;function check(value,label){assert.ok(value,label);checks++;}
const modes=['control','submit','context','observer','installed','mcp','broken','abort'];
const all=modes.map(n=>load('scoped-batch',n)).concat(['context','installed'].map(n=>load('scoped-context-followup',n)));
const marker=(r,s)=>r.requests.some(q=>JSON.stringify(q.body.messages).includes(s));
for(const batch of ['scoped-batch','scoped-context-followup']){
 const r=load(batch,'launch');check(r.exit===0,'driver exit');check(r.remaining.length===0,'no sandbox processes at namespace exit');check(r.preservation.every(p=>p.unchanged),'launch preservation');
 for(const flag of ['--clearenv','--unshare-net','--unshare-pid','--ro-bind'])check(r.command.includes(flag),'isolation '+flag);
 // New scoped source was intentionally revised once after measuring eager context caching; all pre-existing evidence/source remains pinned.
 for(const p of r.preservation.filter(p=>!p.path.includes('/probe/scoped-')))check(hash(p.path)===p.before,'preserved '+p.path);
}
for(const r of all){
 check(r.mod?.handshake&&r.mod.done,'handshake and completion '+r.mode);check(r.serverClosed&&r.exit?.exitCode===129,'owned CLI/services stopped '+r.mode);
 check(r.netns===r.childNetns,'same isolated namespace '+r.mode);check(r.version.stdout.includes('2.1.302'),'CLI build '+r.mode);
 check(r.commands.every(c=>c.exit===0),'official commands succeeded '+r.mode);check(r.requests.every(q=>q.dummyAuth),'dummy auth only '+r.mode);
 check(r.mod.rows.find(x=>x.submitted)?.submitted==='SYNTHETIC original user text 73','unchanged submitted text');
 check(r.mod.events.find(e=>e.event==='start').data.text==='SYNTHETIC original user text 73','unchanged turn text');
 check(r.mod.rows.at(-1).messages[0].text==='SYNTHETIC original user text 73','unchanged history text');
 const start=r.mod.events.find(e=>e.event==='start').data,end=r.mod.events.find(e=>e.event==='complete').data,after=r.mod.rows.at(-1).usage;
 check(start.turnId===end.turnId,'addressed start/end '+r.mode);check(after.rateLimits.length===0,'account limits unavailable '+r.mode);
 check(!JSON.stringify(r.before).includes('statusLine'),'no custom/app statusline needed');
 if(r.mode==='abort'){
  check(end.reason==='aborted'&&end.isAborted&&end.usage===undefined,'abort has no invented usage');check(after.context.tokens===undefined&&after.cost.usd===0,'pre-response abort ledger/context');
 }else{
  const times=r.mode==='mcp'?2:1;check(end.reason==='answer'&&!end.isAborted,'completed state');
  for(const [k,v]of Object.entries({input_tokens:37,output_tokens:11,cache_read_input_tokens:7,cache_creation_input_tokens:3}))check(end.usage[k]===v*times,'known fake usage '+k);
  check(after.context.tokens===47,'latest context is input+cache read+cache create, not total turn output');
  const measure=r.mod.events.find(e=>e.event==='measure').data;check(measure.context.tokens===after.context.tokens&&measure.cost.usd===after.cost.usd,'measure agrees with usage');
 }
 check(r.mod.events.every(e=>e.event!=='submit-hook'),'same-mod submit interceptor was skipped');
 check(!marker(r,'SCOPED_SUBMIT_CONTEXT_73'),'same-mod submit context absent');
 if(r.mode==='installed')check(!r.command.includes('--plugin-dir')&&r.commands.some(c=>c.command.includes('install')),'official install, no inline directory');
}
const control=load('scoped-batch','control'),observer=load('scoped-batch','observer'),mcp=load('scoped-batch','mcp'),broken=load('scoped-batch','broken');
check(!marker(control,'SCOPED_APP_CONTEXT_73')&&!marker(control,'SCOPED_OBSERVER_CONTEXT_73'),'no-context control');
check(marker(observer,'SCOPED_OBSERVER_CONTEXT_73'),'second observer context reached API');
for(const n of ['context','installed'])check(marker(load('scoped-context-followup',n),'SCOPED_APP_CONTEXT_73'),'eager-safe context reached API '+n);
check(!marker(load('scoped-batch','context'),'SCOPED_APP_CONTEXT_73'),'initial eager-cache negative preserved');
check(mcp.discovered.name==='mcp__scopedSession__echo','exact discovered MCP tool');
check(mcp.requests[1].body.messages.some(m=>m.content?.some?.(b=>b.type==='tool_result'&&JSON.stringify(b).includes('SCOPED_MCP_session:echo-73')&&!b.is_error)),'actual MCP result returned to model');
check(mcp.requests[0].body.tools.some(t=>t.name==='mcp__scopedGlobal__echo'),'additive global server discovery');
check(mcp.mcpLogs.session.includes('tools/call')&&mcp.mcpLogs.session.includes('SCOPED_MCP_session:echo-73'),'stdio actual call/reply');
const cfg=mcp.configDir+'/.claude.json';check(JSON.stringify(JSON.parse(mcp.before[cfg]).mcpServers)===JSON.stringify(JSON.parse(mcp.after[cfg]).mcpServers),'global server config intact');
check(!JSON.stringify(mcp.after).includes('mcp__scopedSession')&&!JSON.parse(mcp.after[cfg]).mcpServers.scopedSession,'no global session server entry');
check(!broken.requests[0].body.tools.some(t=>t.name.startsWith('mcp__scopedSession')),'broken server absent');
check(fs.readFileSync(base+'evidence/scoped-batch/broken-debug.log','utf8').includes('Connection failed (ENOENT)'),'broken server failure logged');
check(broken.mod.events.some(e=>e.event==='complete'&&e.data.reason==='answer'),'chat works despite missing server');
const inputs=JSON.parse(fs.readFileSync(base+'evidence/scoped-audit/inputs-context.json','utf8'));
check(inputs.length===10,'source/context audit covers each session');
for(const row of inputs){
 check(!row.instructionFileExists,'no temp global CLAUDE.md created');
 const fixture=row.files.find(f=>f.path.endsWith('/scoped-probe/hooks/register.ts'));
 const expected=load(row.batch,'launch').preservation.find(p=>p.path.endsWith('/probe/scoped-fixture.ts')).before;
 check(fixture.sha256===expected,'saved runtime fixture matches launch revision');
 for(const file of row.files)check(crypto.createHash('sha256').update(file.text).digest('hex')===file.sha256,'saved synthetic source hash');
}
const requests=all.reduce((n,r)=>n+r.requests.length,0);
console.log(`PASS ${checks} saved-evidence assertions; ${all.length} actual CLI sessions; ${requests} local scripted API requests; no evidence rewritten.`);
