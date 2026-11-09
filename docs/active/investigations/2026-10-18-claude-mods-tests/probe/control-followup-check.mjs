// WHY: validate saved actual-CLI evidence without launching a process or mutating any profile.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=new URL('../evidence/control-followup/',import.meta.url);
const r=JSON.parse(fs.readFileSync(new URL('run.json',dir))),l=JSON.parse(fs.readFileSync(new URL('launch.json',dir)));
let checks=0;function check(value,label){assert.ok(value,label);checks++;}
const step=name=>r.modReport.rows.find(x=>x.name===name);
check(r.commands[0].output==='2.1.302 (Claude Code)\n','actual CLI version');
check(r.modReport.done,'all independent steps finished');
for(const name of ['baseline','mode-plan','mode-default','effort-low','rename','external-allow','external-deny'])check(step(name)?.ok,name);
for(const [name,mode]of [['mode-plan','plan'],['mode-default','default']]){
 const v=step(name).value;
 check(v.result.value===mode,name+' setter');
 check(v.state.rows.find(x=>x.key==='permissionMode').value===mode,name+' list getter');
 check(JSON.parse(v.state.settings).permissions.defaultMode===mode,name+' persisted settings');
}
check(!r.policy.permissions.allow,'no ordinary allow rule');
check(r.policy.permissions.defaultMode==='default','initial default mode');
check(r.settingsAfter.permissions.defaultMode==='default','default restored');
const model=step('effort-low').value.state.model;
check(JSON.parse(step('effort-low').value.state.settings).modelSettings[model].effortLevel==='low','effort persisted per-model');
check(r.requests.length===4&&r.requests.every(q=>q.output_config?.effort==='low'&&q.dummyAuth),'actual fake-model requests carry low effort and dummy auth');
const titleRows=r.persisted.flatMap(f=>f.text.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}));
check(titleRows.some(x=>x.type==='custom-title'&&x.customTitle===r.metadata.title&&x.sessionId===step('rename').value.id),'rename persisted with same session id');
for(const name of ['external-allow','external-deny']){
 check(step(name).value.completed,name+' turn completed');
 const event=r.modReport.events.find(x=>x.event==='underlying'&&x.input.file_path.endsWith('/'+name+'.txt'));
 check(event?.realCall&&event.underlying.decision==='ask',name+' core decision is ask');
}
check(r.files['external-allow'].content==='SYNTHETIC_external-allow\n','allowed file exact contents');
check(!r.files['external-deny'].exists,'denied file absent');
const results=r.requests.flatMap(q=>(q.messages??[]).flatMap(m=>Array.isArray(m.content)?m.content.filter(b=>b.type==='tool_result'):[]));
check(results.some(b=>!b.is_error&&String(b.content).includes('/external-allow.txt')),'model saw write success');
check(results.some(b=>b.is_error&&String(b.content).includes('Explicit synthetic external deny')),'model saw error denial');
check(r.serviceEvents.length===2&&r.serviceEvents[0].decision==='allow'&&r.serviceEvents[1].decision==='deny','explicit external responses');
check(r.serversClosed&&r.childExit!==null,'exact child and both servers stopped');
check(r.networkNamespace===r.cliNetworkNamespace,'CLI shares isolated fake-service net namespace');
check(l.command.includes('--unshare-net')&&l.command.includes('--unshare-pid')&&l.command.includes('--clearenv'),'namespace and env isolation');
check(l.exitCode===0&&l.preservation.every(p=>p.unchanged),'launch success and prior files preserved');
check(l.remainingSandboxProcesses.length===0,'no sandbox children remain');
console.log(`PASS ${checks} checks: controls, persisted settings/title, core ask → external allow/deny, model results, isolation, cleanup, preservation.`);
