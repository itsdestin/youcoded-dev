// WHY: verification is read-only and repeatable: it never overwrites the captured evidence or reruns the CLI.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const evidence=new URL('../evidence/approval-batch2/',import.meta.url);
const load=name=>JSON.parse(fs.readFileSync(new URL(name,evidence),'utf8'));
const run=load('approval-run.json'),launch=load('approval-launch.json');
const first=JSON.parse(fs.readFileSync(new URL('../evidence/approval-batch/approval-launch.json',import.meta.url),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(first.exitCode,1);assert.match(first.stderr,/claude not found on PATH/);assert.deepEqual(first.remainingSandboxProcesses,[]);
assert.equal(launch.exitCode,0);assert.equal(launch.signal,null);
assert(launch.command.includes('--clearenv')&&launch.command.includes('--unshare-net')&&launch.command.includes('--unshare-pid'));
assert.equal(run.networkNamespace,run.cliNetworkNamespace);
assert.equal(run.modReport.done,true);assert.equal(run.modReport.rows.length,4);assert(run.modReport.rows.every(r=>r.completed));
assert(run.commands.every(c=>c.code===0));assert.match(run.commands[0].output,/2[.]1[.]302/);
assert.equal(run.serversClosed,true);assert.deepEqual(run.childExit,{exitCode:129,signal:0});assert.equal(run.turnsUsed,8);
assert.equal(run.requests.length,8);assert(run.requests.every(r=>r.dummyAuth&&r.path==='/v1/messages?beta=true'));
assert.match(run.environment.ANTHROPIC_BASE_URL,/^http:\/\/127[.]0[.]0[.]1:\d+$/);
assert.equal(run.environment.ANTHROPIC_AUTH_TOKEN,'fake-token-for-local-capture');
const envKeys=['PATH','TERM','LANG','LC_ALL','HOME','CLAUDE_CONFIG_DIR','TMPDIR','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_RUNTIME_DIR','DISABLE_AUTOUPDATER','DISABLE_TELEMETRY','DISABLE_ERROR_REPORTING','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC','ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN'];
assert.deepEqual(Object.keys(run.environment).sort(),envKeys.sort());
for(const k of envKeys.filter(k=>k==='HOME'||k==='TMPDIR'||k==='CLAUDE_CONFIG_DIR'||k.startsWith('XDG_')))assert(run.environment[k].startsWith(run.root+'/')||run.environment[k]===run.root);
assert.deepEqual(run.policy,{permissions:{defaultMode:'default',allow:['Write']}});assert.deepEqual(run.settingsAfter,run.policy);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run.environment.CLAUDE_CONFIG_DIR,'settings.json'),'utf8')),run.policy);
assert(!run.cliCommand.some(s=>/bypass|dangerously|permission-mode/.test(s)));
const events=run.modReport.events;
const underlying=events.filter(e=>e.event==='underlying');assert.equal(underlying.length,4);
for(const row of underlying){assert.deepEqual(row.underlying,{decision:'allow',rule:'Write'});assert(row.realCall);assert.equal(row.budget,10000);}
const allowed=events.find(e=>e.event==='returned'&&e.name==='approval-allow12');assert.equal(allowed.returned.decision,'allow');assert(allowed.elapsedMs>=12000&&allowed.elapsedMs<30000);assert(allowed.remaining>9000);
assert.equal(events.find(e=>e.event==='returned'&&e.name==='approval-deny').returned.decision,'deny');
for(const name of ['approval-unreachable','approval-disconnect']){const e=events.find(e=>e.event==='catch-deny'&&e.name===name);assert.equal(e.error.kind,'throw');assert.equal(e.error.budget,1000);assert.equal(e.called,true);assert.equal(e.returned.decision,'deny');assert.match(e.error.message,name==='approval-unreachable'?/ECONNREFUSED/:/ECONNRESET/);}
assert.equal(events.filter(e=>e.event==='turn.complete'&&e.reason==='answer').length,4);
const config=events.find(e=>e.event==='config-permission-inspection').rows.find(r=>r.key==='permissionMode');assert.equal(config.value,'default');assert.equal(config.isLocked,false);
assert.equal(run.serviceEvents.find(e=>e.path==='/approval-allow12').durationMs,12000);
assert(run.serviceEvents.find(e=>e.path==='/approval-disconnect').disconnected);
const results=new Map();
for(const req of run.requests)for(const message of req.messages??[])for(const block of Array.isArray(message.content)?message.content:[])if(block.type==='tool_result')results.set(block.tool_use_id,block);
assert.equal(results.size,4);
for(const [name,file]of Object.entries(run.files)){
 assert.equal(path.dirname(file.path),run.project);
 if(name==='approval-allow12'){assert.equal(file.exists,true);const bytes=fs.readFileSync(file.path);assert.equal(bytes.toString('hex'),file.hex);assert.equal(bytes.toString(),'SYNTHETIC_approval-allow12\n');assert([...results.values()].some(r=>!r.is_error&&r.content.includes(file.path)));}
 else{assert.equal(file.exists,false);assert(!fs.existsSync(file.path));assert([...results.values()].some(r=>r.is_error&&r.content.includes(name)&&r.content.includes('denied by plugin isolated-approval-probe')));}
}
const postLaunchDocChanges=[];
for(const record of launch.preservation){
 assert(record.unchanged);assert.equal(record.before,record.after);
 // WHY: the parent owns lifecycle docs and can update them after this child finishes its launch; prior probes/evidence remain immutable.
 if(['PLAN.md','RESULTS.md','LIVE-HISTORY.md'].includes(path.basename(record.file))){if(sha(record.file)!==record.before)postLaunchDocChanges.push(path.basename(record.file));}
 else assert.equal(sha(record.file),record.before);
}
assert.equal(sha(fs.realpathSync(run.binary)),run.binarySha256);
assert.deepEqual(launch.remainingSandboxProcesses,[]);
// WHY: this verifier's parent shell can name a temp path while reviewing a diff; ancestors cannot be children of the completed, separate CLI launch.
const ancestors=new Set();let ancestor=process.pid;
while(ancestor>0&&!ancestors.has(ancestor)){ancestors.add(ancestor);try{ancestor=Number(fs.readFileSync('/proc/'+ancestor+'/status','utf8').match(/^PPid:\s+(\d+)/m)[1]);}catch{break;}}
for(const id of fs.readdirSync('/proc').filter(s=>/^\d+$/.test(s))){if(ancestors.has(Number(id)))continue;let cmd;try{cmd=fs.readFileSync('/proc/'+id+'/cmdline','utf8');}catch{continue;}assert(!cmd.includes(launch.sandbox),'remaining owned process '+id);}
console.log('PASS real CLI 2.1.302: allow after 12000ms service wait; hook elapsed '+allowed.elapsedMs+'ms, own budget remaining '+allowed.remaining+'ms; exact temporary file bytes confirmed.');
console.log('PASS deny/refused/disconnect: underlying allow(Write) overridden by deny; all three files absent; four distinct model-facing tool results verified.');
console.log('PASS isolation/cleanup: 8 dummy-auth local requests, same network namespace, both servers closed, CLI deliberately stopped (129), no owned children; '+launch.preservation.length+' prior files unchanged during launch; immutable probes/evidence still match.');
console.log('PASS config inspection: permissionMode=default, unlocked, options='+config.options.join(',')+'; no config set or effort/rename executed.');
console.log('PASS failed attempt preserved: allowlisted PATH lacked CLI; explicit observed binary path used on second launch. Checker performed no writes.');
if(postLaunchDocChanges.length)console.log('NOTE lifecycle docs changed after completed launch (not immutable evidence): '+postLaunchDocChanges.join(',')+'. Before/after-launch hashes remain equal.');
