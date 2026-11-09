// WHY: a blocked native menu and a deferred reload are expected LIMITS, not structured-interaction successes. This checker reads evidence only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).pathname;
const load=(batch,name)=>JSON.parse(fs.readFileSync(path.join(base,'evidence',batch,name+'.json'),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let count=0;const check=(v,label)=>{assert.ok(v,label);count++;};
const old=load('interaction-batch','launch'),launch=load('interaction-batch2','launch'),follow=load('interaction-followup','launch');
check(old.exitCode===1&&/not a function declared at the top/.test(old.stderr),'initial validation refusal retained');
const ancestors=new Set();let pid=process.pid;
while(pid>0&&!ancestors.has(pid)){ancestors.add(pid);try{pid=Number(fs.readFileSync('/proc/'+pid+'/status','utf8').match(/^PPid:\s+(\d+)/m)[1]);}catch{break;}}
for(const l of [old,launch,follow]){
  check(l.signal===null&&l.remainingSandboxProcesses.length===0,'launch cleanup');
  check(l.command.includes('--clearenv')&&l.command.includes('--unshare-net')&&l.command.includes('--unshare-pid')&&l.command.includes('--ro-bind'),'sandbox isolation');
  for(const row of l.preservation){
    check(row.unchanged&&row.before===row.after,'file preserved during launch: '+row.file);
    // WHY: interaction sources were corrected between captured launches; parent-owned lifecycle docs may also advance. Older probe/evidence files remain immutable.
    if(!path.basename(row.file).startsWith('interaction-')&&!row.file.includes('/evidence/interaction-')&&!['PLAN.md','RESULTS.md','LIVE-HISTORY.md'].includes(path.basename(row.file)))check(sha(row.file)===row.after,'prior immutable evidence hash: '+row.file);
  }
  for(const p of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))){if(ancestors.has(Number(p)))continue;let cmd;try{cmd=fs.readFileSync('/proc/'+p+'/cmdline','utf8');}catch{continue;}check(!cmd.includes(l.sandbox),'no currently owned sandbox process '+p);}
}
check(launch.exitCode===0&&follow.exitCode===0,'both bounded batches exited successfully');
const names=['question-allow','question-replace','question-deny','plan-allow','plan-deny','plan-replace','cancel-late','reload-pending'];
const all=[...names.map(n=>load('interaction-batch2',n)),...['question-structured','question-free','plan-deny'].map(n=>load('interaction-followup',n))];
const r=name=>all.find(x=>x.name===name),events=x=>x.modReport.events;
const results=x=>[...new Map(x.requests.flatMap(q=>(q.body.messages??[]).flatMap(m=>Array.isArray(m.content)?m.content.filter(b=>b.type==='tool_result'):[])).map(b=>[b.tool_use_id,b])).values()];
const records=x=>x.persisted.flatMap(f=>f.text.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}));
const envKeys=['PATH','TERM','LANG','LC_ALL','HOME','CLAUDE_CONFIG_DIR','TMPDIR','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_RUNTIME_DIR','DISABLE_AUTOUPDATER','DISABLE_TELEMETRY','DISABLE_ERROR_REPORTING','CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC','ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN'];
for(const x of all){
  check(x.commands.every(c=>c.exitCode===0)&&x.commands[0].output==='2.1.302 (Claude Code)\n','installed unmodified CLI version');
  check(sha(fs.realpathSync(x.binary))===x.binarySha256,'binary hash unchanged');
  assert.deepEqual(Object.keys(x.environment).sort(),[...envKeys].sort());count++;
  for(const key of envKeys.filter(k=>['HOME','TMPDIR','CLAUDE_CONFIG_DIR'].includes(k)||k.startsWith('XDG_')))check(x.environment[key]===x.root||x.environment[key].startsWith(x.root+'/'),'fresh profile '+key);
  check(/^http:\/\/127\.0\.0\.1:\d+$/.test(x.environment.ANTHROPIC_BASE_URL)&&x.environment.ANTHROPIC_AUTH_TOKEN==='fake-token-for-local-capture','localhost dummy auth');
  check(x.requests.length===x.turnsUsed&&x.requests.every(q=>q.dummyAuth&&q.path==='/v1/messages?beta=true'),'exact API count and local auth');
  check(x.networkNamespace===x.cliNetworkNamespace,'same isolated network namespace');
  check(x.serversClosed&&x.childExit?.exitCode===129,'exact CLI stopped and servers closed');
  check(x.modReport.done&&!events(x).some(e=>e.event==='fixture-error'),'bounded observation completed without fixture error');
  const identity=events(x).filter(e=>e.id).map(e=>e.id);check(identity.length>0&&identity.every(id=>id===x.modReport.id),'no session identity change');
  for(const f of Object.values(x.files)){check(f.exists===fs.existsSync(f.path),'actual file presence');if(f.exists)check(fs.readFileSync(f.path,'utf8')===f.content,'exact actual bytes');}
  check(!x.files['new-turn.txt'].exists&&!x.files['post-plan.txt'].exists,'no unintended new-turn or post-plan file');
}
const qa=r('question-allow');
check(qa.modReport.completed===0&&qa.requests.length===1,'allow did not complete native question');
check(events(qa).some(e=>e.event==='external-check'&&e.reply.decision==='allow')&&!events(qa).some(e=>e.event==='call-after'),'allow received but native call remains pending');
check(qa.raw.includes('Choose a synthetic color?')&&qa.raw.includes('Type something')&&qa.raw.includes('Submit'),'native question menu actually drawn');
for(const name of ['question-replace','question-structured','question-free']){
  const x=r(name),replacement=events(x).find(e=>e.event==='replacement');
  check(x.modReport.completed===1&&replacement.reply.synthetic===true,'explicit synthetic replacement completed');
  assert.deepEqual(replacement.result.answers,x.expectedSyntheticAnswers);count++;
  check(records(x).some(row=>JSON.stringify(row.toolUseResult)===JSON.stringify(replacement.result)),'exact replacement record saved in transcript');
  const model=results(x);check(model.length===1&&!model[0].is_error,'one actual model-facing result');
  const expected=name==='question-structured'?'The user answered: "Choose a synthetic color?"="Blue", "Choose synthetic features?"="Red, Blue", "Supply synthetic free text?"="SYNTHETIC custom text π\nsecond line". Read the answers carefully — they may request clarification, changes, or that you not proceed — and follow what they actually say.':'The user responded: SYNTHETIC explicit freeform response';
  check(model[0].content===expected,'exact built-in mapped answer text');
}
check(results(r('question-deny')).some(b=>b.is_error&&b.content==='Permission to use AskUserQuestion denied by plugin isolated-interaction: Explicit synthetic deny'),'question explicit denial reached model');
const pa=r('plan-allow'),pr=r('plan-replace'),pd=all.at(-1);
for(const x of [pa,pr,pd]){
  check(events(x).some(e=>e.event==='call-after'&&e.tool==='EnterPlanMode'&&!e.result.isError),'actual engine EnterPlanMode ran');
  check(x.planPath?.startsWith(x.environment.CLAUDE_CONFIG_DIR+'/plans/')&&x.files[x.planPath]?.exists,'engine-advertised plan path created');
  check(events(x).some(e=>e.event==='call-after'&&e.tool==='Read'&&e.result.result.file.content===x.files[x.planPath].content),'actual engine Read plan verified');
  check(x.raw.includes('plan mode on'),'actual runtime mode indicator, not default config');
}
check(pa.modReport.completed===0&&pa.requests.length===4&&pa.raw.includes('Ready to code?')&&pa.raw.includes('Would you like to proceed?'),'allow leaves native plan approval menu pending');
check(!events(pa).some(e=>e.event==='call-after'&&e.tool==='ExitPlanMode'),'no claimed exit transition');
for(const x of [pr,pd])check(events(x).some(e=>e.event==='check'&&e.input.tool==='Write'&&e.input.input.file_path.endsWith('/post-plan.txt')&&e.base.decision==='ask'&&e.base.reason.includes('while in plan mode')),'subsequent policy proves engine remains in plan mode');
check(results(pr).some(b=>b.content.startsWith('User has approved your plan. You can now start coding.')),'replacement told model approved despite no engine transition');
check(records(pr).some(row=>row.toolUseResult?.isAgent===false&&row.toolUseResult?.plan),'plan replacement saved');
check(results(pd).some(b=>b.is_error&&b.content==='Permission to use ExitPlanMode denied by plugin isolated-interaction: Explicit synthetic deny'),'actual ExitPlanMode external deny');
check(!events(pd).some(e=>e.event==='replacement'),'plan deny not replaced');
const c=r('cancel-late'),ce=events(c),turns=ce.filter(e=>e.event==='turn.start');
check(turns.length===2&&turns[0].input.turnId!==turns[1].input.turnId&&ce.find(e=>e.event==='aborted').addressed===turns[0].input.turnId,'abort addressed original actual turn id');
check(c.serviceEvents[0].reply.decision==='allow'&&c.serviceEvents[0].destroyedBeforeResponse,'late allow attempted after request aborted');
check(c.serviceEvents[1].at<c.serviceEvents[0].respondedAt&&c.serviceEvents[0].respondedAt<c.serviceEvents[1].respondedAt,'late allow overlaps distinct new pending request');
check(c.serviceEvents[1].reply.decision==='deny'&&!c.files['pending.txt'].exists&&!c.files['new-turn.txt'].exists,'late allow writes neither original nor new-turn file');
check(results(c).length===2&&results(c).every(b=>b.is_error)&&results(c)[0].content.includes('turn was ended'),'both actual tool results errors, interruption retained');
const re=r('reload-pending'),ee=events(re),index=name=>ee.findIndex(e=>e.event===name);
check(index('reload-requested')<index('external-check')&&index('reload-returned')>index('turn.complete'),'reload command deferred until after original turn completes');
check(ee[index('reload-returned')].reload.text.includes('Reloaded: 1 plugin'),'supported reload command returned');
check(re.files['pending.txt'].content==='SYNTHETIC reload pending\n'&&results(re).some(b=>!b.is_error&&b.content.includes('/pending.txt')),'original call continued under explicit external allow');
console.log(`PASS ${count} read-only assertions; ${all.length} actual CLI sessions; ${all.reduce((n,x)=>n+x.requests.length,0)} localhost dummy-auth model requests.`);
console.log('QUESTION: check allow blocked at native menu; synthetic structured single/multi/custom text and response-only mapper text plus saved records verified; explicit deny verified.');
console.log('PLAN: actual engine entry + plan Write/Read verified; check allow blocked at native menu; ExitPlanMode deny retained plan policy; replacement falsely says approved while engine stays in plan mode. No successful external engine approval claimed.');
console.log('PENDING: addressed abort canceled old request; late allow overlapped new denied request; neither file exists. Reload command queued until turn completion; original explicitly allowed write completed. Mid-flight unload/removal remains UNVERIFIED.');
console.log('ISOLATION: prior evidence hashes preserved, binary unchanged, exact children/servers stopped, no owned processes remain. Initial validation refusal and first plan-deny/response-precedence limitations retained.');
