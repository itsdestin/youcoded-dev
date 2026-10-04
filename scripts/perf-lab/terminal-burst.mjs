// Private, single-producer terminal burst. No app source changes or network/model calls.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { assetsReady, buildFixture } from './fixture.mjs';
import { validateOutputPath } from './gpu-theme.mjs';
import { startXvfb, launchApp, readCmdline, readPpid } from './launch.mjs';
import { cpuSnapshot, findFamily } from './procs.mjs';
import { glyphCommand, GLYPH_SENTINEL, installTerminalHelpers } from './scenario-terminal.mjs';
import { installProbe, readProbeWindow, stopProbe } from './scenario-workload.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const SUPPORTED_LINES = [200, 2000];
const TUI = '─│╭╮╰╯├┤●○✓✗⏺▶◆…';
const ASCII = Array.from({length:95}, (_, i) => String.fromCharCode(32+i)).join('');

// WHY: reproduce the fixture's exact byte sequence, including SGR, numbering and
// completion line; a visible sentinel alone could mask dropped or mangled output.
export function glyphBody(n) {
  if (!SUPPORTED_LINES.includes(n)) throw Error(`unsupported terminal burst size ${n}`);
  const rows = Array.from({length:n}, (_, i) => {
    const offset = (i*7)%ASCII.length;
    return `\x1b[${i%5===0?'1;':''}3${1+(i%7)}m${String(i+1).padStart(5,'0')} ${(ASCII+ASCII).slice(offset,offset+64)} ${TUI}\x1b[0m`;
  });
  return `\r\n${rows.join('\r\n')}\r\n${GLYPH_SENTINEL(n)}\r\n> `;
}

export function parseOptions(argv, root = ROOT) {
  const o = { checkout:join(root,'youcoded'), out:join(root,'scratch/perf-lab/terminal-burst.json'), maxMinutes:5, display:':99' };
  for (let i=0;i<argv.length;i+=2) {
    const k=argv[i], v=argv[i+1];
    if (!['--checkout','--app-dir','--out','--max-minutes','--real-display'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k==='--real-display'?'display':k.slice(2).replace(/-([a-z])/g, (_,c)=>c.toUpperCase())]=v;
  }
  if (!/^[1-9]\d*$/.test(String(o.maxMinutes)) || !Number.isSafeInteger(Number(o.maxMinutes)) || Number(o.maxMinutes)>10) throw Error('--max-minutes must be an integer 1..10');
  o.maxMinutes=Number(o.maxMinutes);
  for (const k of ['checkout','appDir','out']) if (o[k]!==undefined && !isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  if (!/^:\d+$/.test(o.display)) throw Error('--real-display must be an X display :N');
  return o;
}

// WHY: xterm may wrap a logical glyph line into multiple buffer rows. A
// conservative upper bound keeps the last twenty lines without a full scan;
// unsupported widths are not reported as dropped output.
export function requiredTailRows(cols) {
  if (!Number.isInteger(cols) || cols < 1) return null;
  const rows = 20 * Math.ceil(110 / cols) + 12;
  return rows <= 100 ? rows : null;
}
export function rawDrainComplete(raw, lines) {
  return typeof raw === 'string' && raw.replace(/\r\r\n/g, '\r\n').includes(`${GLYPH_SENTINEL(lines)}\r\n> `);
}
// A reply that completed before output started (or after readiness) is not
// evidence of IPC responsiveness DURING the burst. No samples is unmeasured.
export function ipcDuringBurst(source, from, to) {
  const samples = Array.isArray(source?.samples) && finite(source?.t0EpochMs) && finite(source?.everyMs) && source.everyMs>0 && finite(from) && finite(to) && to >= from
    ? source.samples.filter(s => Array.isArray(s) && finite(s[0]) && finite(s[1]) && source.t0EpochMs+s[0] >= from && source.t0EpochMs+s[0]+s[1] <= to) : [];
  const accepted = samples.filter(s => s[2] === 0);
  return { status: accepted.length ? 'measured':'unmeasured', reason:accepted.length?null:'no successful IPC ping completed within producer emission → xterm readiness', sampleCount:accepted.length, rejectedSamples:samples.length-accepted.length, intervalMs:source?.everyMs??null, maxMs:accepted.length?Math.max(...accepted.map(s=>s[1])):null, totalStallMs:accepted.length?accepted.reduce((sum,s)=>sum+Math.max(0,s[1]-source.everyMs),0):null };
}
// launchApp's safety sweep matches appDir, not only our HOME. Decline a shared
// package already in use BEFORE calling it; never let its sweep stop a peer rig.
export function refuseForeignPackage(appDir, {find=findFamily,read=readCmdline}={}) {
  const pids=find([appDir]).filter(pid=>pid!==process.pid && read(pid).includes(appDir));
  if(pids.length) throw Error(`package already running (PIDs ${pids.join(', ')}); refusing launcher sweep against another worker`);
}

export function assessBurst(row) {
  if (!SUPPORTED_LINES.includes(row?.lines)) throw Error(`unsupported terminal burst size ${row?.lines}`);
  const reasons=[];
  const expected=glyphBody(row.lines);
  // PTY may add CR before LF. Count actual captured bytes independently; only
  // canonicalize that line discipline conversion when comparing the payload.
  const raw=typeof row.raw==='string' ? row.raw : '';
  const canonical=raw.replace(/\r\r\n/g,'\r\n');
  const first=canonical.indexOf('\x1b[1;31m00001');
  const last=canonical.indexOf(GLYPH_SENTINEL(row.lines),first);
  const body=first>=0 && last>=0 ? canonical.slice(first,last+GLYPH_SENTINEL(row.lines).length) : '';
  const expectedBody=expected.slice(expected.indexOf('\x1b[1;31m00001'),expected.indexOf(GLYPH_SENTINEL(row.lines))+GLYPH_SENTINEL(row.lines).length);
  if (!body || body!==expectedBody || canonical.slice(first)!==expected.slice(expected.indexOf('\x1b[1;31m00001')) || canonical.indexOf(GLYPH_SENTINEL(row.lines),last+1)>=0) reasons.push('raw PTY IPC output differs from exact numbered/ANSI payload or sentinel');
  const numbered=body.match(/\x1b\[[\d;]+m\d{5} /g) ?? [];
  if (numbered.length!==row.lines) reasons.push('numbered raw output count differs');
  // A narrow grid can wrap the suffix out of 100 buffer rows: unsupported,
  // not a renderer output loss. Geometry is checked once before the burst.
  const tailRows=requiredTailRows(row.terminal?.cols);
  if (tailRows===null || row.terminal?.tailRows!==tailRows) return {...row,status:'unsupported',reasons:['terminal geometry cannot retain verified suffix within 100 buffer rows'],coverage:'raw IPC and xterm suffix not assessed at this width'};
  // xterm's scrollback evicts older lines by design: inspect only a bounded tail.
  const visible=typeof row.tail==='string'?row.tail:'';
  const suffix=Array.from({length:20}, (_,i)=>String(row.lines-19+i).padStart(5,'0'));
  let pos=0;
  for (const number of suffix) { const at=visible.indexOf(number+' ',pos); if (at<0) { reasons.push(`xterm tail lacks numbered suffix ${number}`); break; } pos=at+6; }
  if (!visible.includes(GLYPH_SENTINEL(row.lines)) || row.marker!==GLYPH_SENTINEL(row.lines)) reasons.push('xterm completion marker absent');
  if (!finite(row.emission?.startedAt) || !finite(row.emission?.finishedAt) || row.emission.finishedAt<row.emission.startedAt || !finite(row.firstRawAt) || row.firstRawAt<row.emission.startedAt || !finite(row.readyAt) || row.readyAt<row.firstRawAt) reasons.push('producer emission / renderer receipt / xterm readiness timestamps missing or out of order');
  // Overall pings before/after emission are diagnostic context only. The
  // interval-filtered submetric explicitly says unmeasured if none overlapped.
  const during = row.ipcDuring?.status==='measured' && row.ipcDuring.sampleCount>0 && finite(row.ipcDuring.maxMs) ? row.ipcDuring : {status:'unmeasured',reason:row.ipcDuring?.reason??'missing IPC interval probe',sampleCount:0,maxMs:null,totalStallMs:null};
  if (!finite(row.probe?.windowMs) || row.probe.windowMs<=0 || row.probe.longtaskSupported!==true || !['longtaskTotalMs','longtaskMaxMs','longtaskCount'].every(k=>finite(row.probe[k]))) reasons.push('renderer longtask window unsupported or incomplete');
  if (!finite(row.cpu?.totalSeconds) || !Number.isInteger(row.cpu.pidsBefore) || row.cpu.pidsBefore<1 || row.cpu.pidsAfter<1) reasons.push('process-family CPU samples missing');
  return { ...row, ipcDuring:during, status:reasons.length?'incomplete':'measured', reasons, coverage:'raw IPC payload exact; xterm bounded tail only (not full scrollback)', integrity:{rawBytes:Buffer.byteLength(raw),rawLines:numbered.length,rawExact:body===expectedBody,tailSuffix:pos>0 && suffix.at(-1)+' '===visible.slice(pos-6,pos)}, emissionToReadyMs:finite(row.readyAt)&&finite(row.emission?.startedAt)?row.readyAt-row.emission.startedAt:null, emissionToFirstRawMs:finite(row.firstRawAt)&&finite(row.emission?.startedAt)?row.firstRawAt-row.emission.startedAt:null };
}

function bounder(minutes) {
  const end=Date.now()+minutes*60_000-12000;
  return (promise,label,cap=30000) => {
    const ms=Math.min(cap,end-Date.now());
    if(ms<=0) return Promise.reject(Error(`deadline: ${label}`));
    let timer;
    return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`timeout: ${label}`)),ms);})]).finally(()=>clearTimeout(timer));
  };
}
async function owned(start,close,bound,label,cap=30000) {
  const pending=Promise.resolve().then(start);
  try { return await bound(pending,label,cap); }
  catch(e) { pending.then(close).catch(()=>{}); throw e; }
}
async function buildBounded(checkout,bound) {
  const code=`import { buildApp } from ${JSON.stringify(new URL('./build.mjs',import.meta.url).href)}; console.log('TERMINAL_BUILD='+JSON.stringify(await buildApp(${JSON.stringify(checkout)}, {skipIfFresh:true})));`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{detached:true,stdio:['ignore','pipe','pipe']});
  let out='',err=''; child.stdout.on('data',b=>{out+=b;}); child.stderr.on('data',b=>{err+=b;});
  const done=new Promise((ok,fail)=>{child.on('error',fail);child.on('close',code=>{const line=out.split('\n').findLast(s=>s.startsWith('TERMINAL_BUILD='));if(code!==0||!line) fail(Error(`build failed: ${err.slice(-1200)}`));else {try {ok(JSON.parse(line.slice('TERMINAL_BUILD='.length)));}catch(e){fail(e);}}});});
  try {return await bound(done,'packaged build',240000);} catch(e){if(child.pid) {try{process.kill(-child.pid,'SIGKILL');}catch{}} await Promise.race([done.catch(()=>{}),sleep(2000)]);throw e;}
}

async function refuseOccupiedPort(port) {
  // WHY: no DevTools attach to a foreign browser. Bind-check without sending a
  // request; launchApp repeats its own ownership checks just before connect.
  const server=createServer();
  try { await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);}); }
  finally { if(server.listening) await new Promise(ok=>server.close(ok)); }
}

function emissionRows(home) {
  try { return readFileSync(join(home,'.claude','perf-terminal-emissions.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)); }
  catch { return []; }
}
function ownedCpuPids(app) {
  // Main's argv need not mention HOME; include only its descendants from the
  // launcher family, not another rig using the very same package path.
  return app.family().filter(pid=>{
    let p=pid;
    for(let depth=0;depth<32 && p>1;depth++) {
      if(p===app.pid) return true;
      const parent=readPpid(p);
      if(parent===p) break;
      p=parent;
    }
    return false;
  });
}
async function measure(app,fixture,lines,bound,hz,terminal) {
  const cdp=app.cdp, id=await bound(cdp.evaluate('window.__terminalBurstId'),'fixture session id');
  const marker=GLYPH_SENTINEL(lines);
  // WHY: subscribe before sending, so neither the first byte nor a fast burst is
  // dropped. This listener is independent of xterm.write and does no layout work.
  await bound(cdp.evaluate(`(() => { const p={chunks:[],firstRawAt:null}; p.off=window.claude.on.ptyOutputForSession(${JSON.stringify(id)},data=>{if(p.firstRawAt===null && (p.chunks.at(-1)??'').slice(-8).concat(data).includes('00001')) p.firstRawAt=Date.now();p.chunks.push(data);});window.__terminalBurst=p;return true;})()`),'raw output subscription');
  const startCpu=cpuSnapshot(ownedCpuPids(app)), started=Date.now();
  await bound(installProbe(cdp),'renderer observer');
  await bound(installIpcStallProbe(cdp,{everyMs:50}),'main IPC observer');
  await bound(cdp.evaluate(`window.__perfProbe.mark('burst:start');window.claude.session.sendInput(${JSON.stringify(id)},${JSON.stringify(glyphCommand(lines)+'\r')});true`),'send glyph command');
  let readyAt=null, tail=null, raw=null, firstRawAt=null, ipc=null, probe=null, ipcSamples=null;
  try {
    // Bounded tail only, at 100ms cadence; this does not read the full screen
    // or call getComputedStyle/offsetWidth in the hot path.
    while(Date.now()-started<45000) {
      tail=await bound(cdp.evaluate(`window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, ${terminal.tailRows}) ?? null`),'bounded xterm tail',5000);
      if(tail?.includes(marker)) {readyAt=Date.now();break;}
      await bound(sleep(100),'xterm readiness');
    }
    if(!readyAt) throw Error(`xterm did not parse completion marker for ${lines} lines`);
    await bound(cdp.evaluate(`window.__perfProbe.mark('burst:end');true`),'end marker');
    // The sentinel may be parsed before the final prompt bytes arrive over IPC.
    // Never let a truncated capture masquerade as an xterm throughput win.
    let drained=false;
    for(let i=0;i<40;i++) {
      drained=rawDrainComplete(await bound(cdp.evaluate(`window.__terminalBurst?.chunks.join('') ?? ''`),'raw drain',5000),lines);
      if(drained) break;
      await bound(sleep(50),'raw drain wait');
    }
    if(!drained) throw Error('raw PTY capture did not receive complete final prompt');
    try {
      ipc=await bound(readIpcStallProbe(cdp),'IPC result');
      ipcSamples=await bound(cdp.evaluate(`(() => {const p=window.__ipcStall;return p?{t0EpochMs:performance.timeOrigin+p.t0,everyMs:p.everyMs,samples:p.samples}:null;})()`),'timestamped IPC samples');
    } catch(e) { ipc={error:e.message}; }
    probe=await bound(readProbeWindow(cdp,'burst:start','burst:end'),'renderer result');
    const capture=await bound(cdp.evaluate(`(() => { const p=window.__terminalBurst; return {raw:p.chunks.join(''),firstRawAt:p.firstRawAt};})()`),'raw output result');
    raw=capture.raw; firstRawAt=capture.firstRawAt;
  } finally {
    await bound(cdp.evaluate(`(() => {window.__terminalBurst?.off?.();return true;})()`),'raw subscription cleanup').catch(()=>{});
    await stopIpcStallProbe(cdp).catch(()=>{});
    await stopProbe(cdp).catch(()=>{});
  }
  const endCpu=cpuSnapshot(ownedCpuPids(app)); let ticks=0;
  for(const [pid,a] of startCpu) if(endCpu.has(pid)) ticks+=Math.max(0,endCpu.get(pid)-a);
  const marks=emissionRows(fixture.home).filter(r=>r.n===lines);
  const emission={startedAt:marks.find(r=>finite(r.startedAt))?.startedAt,finishedAt:marks.findLast(r=>finite(r.finishedAt))?.finishedAt};
  return assessBurst({lines,terminal,marker,tail,raw,firstRawAt,readyAt,emission,ipc,ipcDuring:ipcDuringBurst(ipcSamples,emission.startedAt,readyAt),probe,cpu:{totalSeconds:ticks/hz,ticksPerSecond:hz,pidsBefore:startCpu.size,pidsAfter:endCpu.size,elapsedMs:Date.now()-started,coverage:'matched surviving PIDs; exited/new PIDs excluded'}});
}

export async function main(argv=process.argv.slice(2)) {
  const opts=parseOptions(argv), bound=bounder(opts.maxMinutes);
  // WHY: reject outside/symlinked or existing report AND screenshot before
  // fixture creation; no private measurement may replace an earlier receipt.
  validateOutputPath(opts.out);
  mkdirSync(dirname(opts.out),{recursive:true});
  const report={status:'incomplete',options:opts,scope:'private packaged desktop fake CC; one visible xterm; small 200 then large 2000 lines (size and warming confounded), no terminal switches; xterm tail proves suffix only; raw IPC capture independent of xterm.write; CPU totals matched surviving PIDs only; producer timestamp precedes synchronous fixture marker append, not pure stdout.write time',bursts:[]};
  let app,x;
  try {
    if(!assetsReady()) throw Error('perf-lab assets not cached; no download authorized');
    if(opts.appDir) refuseForeignPackage(opts.appDir);
    // Refuse foreign port before any launcher sweep; serial runs only. A process
    // starting between the checks and launch is still a race (documented).
    await bound(refuseOccupiedPort(9573),'CDP port preflight',2000);
    const build=opts.appDir?{...JSON.parse(readFileSync(join(opts.appDir,'.perf-lab-build.json'),'utf8')),appDir:opts.appDir,binary:join(opts.appDir,'youcoded')}:await buildBounded(opts.checkout,bound);
    if(!build.sha||!statSync(build.binary).isFile()) throw Error('package missing build stamp or executable');
    report.build={sha:build.sha,dirty:build.dirty,builtAt:build.builtAt,appDir:build.appDir};
    refuseForeignPackage(build.appDir);
    const hz=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim());
    if(!Number.isSafeInteger(hz)||hz<=0) throw Error('CPU tick rate unavailable');
    // Unique root: fixture.buildFixture removes home before seeding it, and a
    // fixed path could erase a previous rig's currently running private HOME.
    const fixtureRoot=mkdtempSync(join(ROOT,'scratch/perf-lab/terminal-burst-'));
    const fixture=buildFixture(fixtureRoot,{log:()=>{}});
    x=opts.display===':99'?await owned(()=>startXvfb(':99'),v=>v.proc?.kill('SIGTERM'),bound,'Xvfb'):{display:opts.display,proc:null};
    refuseForeignPackage(build.appDir);
    await bound(refuseOccupiedPort(9573),'CDP port before launch',2000);
    app=await owned(()=>launchApp({binary:build.binary,appDir:build.appDir,fixture,display:x.display,cdpPort:9573,refuseExisting:true}),a=>a.kill(),bound,'packaged app',90000);
    const cdp=app.cdp;
    // Fixed test viewport before any terminal output; resizing DURING output
    // would reflow the PTY and invalidate integrity/readiness observations.
    await bound(cdp.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false}),'fixed test viewport');
    report.viewport={width:1600,height:900,deviceScaleFactor:1};
    await bound(installTerminalHelpers(cdp),'terminal helpers');
    const session=await bound(cdp.evaluate(`window.claude.session.create(${JSON.stringify({name:'terminal-burst',cwd:fixture.projects.alpha,provider:'claude',skipPermissions:false})})`),'fake CC session');
    if(!session?.id || session.provider!=='claude') throw Error('fake CC session not created');
    await bound(cdp.evaluate(`window.__terminalBurstId=${JSON.stringify(session.id)};true`),'store owned ID');
    // A true visible xterm, not a text mock or the chat pane.
    for(let i=0;i<100;i++) {
      const visible=await bound(cdp.evaluate(`(() => {const p=[...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(e=>e.getAttribute('data-session-id')===${JSON.stringify(session.id)});p?.click();return !!p;})()`),'session pill');
      if(visible) break;
      await bound(sleep(100),'session mount');
    }
    await bound(cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',modifiers:2,key:'`',code:'Backquote',windowsVirtualKeyCode:192,nativeVirtualKeyCode:192}),'terminal toggle');
    await bound(cdp.send('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'`',code:'Backquote',windowsVirtualKeyCode:192,nativeVirtualKeyCode:192}),'terminal toggle release');
    let visible=false;
    for(let i=0;i<100;i++) {
      visible=await bound(cdp.evaluate(`(() => {const w=document.querySelector('.terminal-overlay-scroll:not(.terminal-hidden)');return !!w && !!w.querySelector('.xterm-screen') && document.documentElement.dataset.viewMode==='terminal';})()`),'visible xterm');
      if(visible) break;
      await bound(sleep(100),'terminal mount');
    }
    if(!visible) throw Error('real visible xterm screen not mounted');
    report.renderer=await bound(cdp.evaluate('window.__perfTerm.rendererOf(0)'),'xterm renderer');
    // WHY: derive a conservative grid width ONCE before output. A wrapped
    // suffix must not be labelled missing just because a 100-row tail was too
    // short. No style/layout reads run in the timed polling loop.
    const geometry=await bound(cdp.evaluate(`(() => {const screen=document.querySelector('.terminal-overlay-scroll:not(.terminal-hidden) .xterm-screen');if(!screen) return null;const style=getComputedStyle(screen.closest('.xterm'));const c=document.createElement('canvas').getContext('2d');if(!c)return null;c.font=style.font || style.fontSize+' '+style.fontFamily;const charWidth=c.measureText('M').width;return {screenWidth:screen.clientWidth,charWidth,cols:Math.floor(screen.clientWidth/(charWidth*1.5))};})()`),'terminal geometry');
    const tailRows=requiredTailRows(geometry?.cols);
    report.terminal={...geometry,tailRows,method:'conservative canvas mono cell width * 1.5; measured once before output'};
    if(tailRows===null) {report.status='unsupported';report.reason='terminal too narrow or font geometry unavailable to verify suffix in <=100 buffer rows';}
    else for(const lines of SUPPORTED_LINES) report.bursts.push(await measure(app,fixture,lines,bound,hz,report.terminal));
    if(report.status!=='unsupported') report.status=report.bursts.length===2&&report.bursts.every(r=>r.status==='measured')?'measured':'incomplete';
    // After the clocks stop, capture the real window as visual proof.
    const shot=await bound(cdp.send('Page.captureScreenshot',{format:'png'}),'terminal screenshot');
    report.screenshot=opts.out+'.png';
    writeFileSync(report.screenshot,Buffer.from(shot.data,'base64'),{flag:'wx',mode:0o600});
  } catch(e) {report.status='incomplete';report.error=String(e?.message??e);}
  finally {
    try {if(app) await Promise.race([app.kill(),sleep(8000).then(()=>{throw Error('app cleanup timeout');})]);}catch(e){report.status='incomplete';report.cleanupError=e.message;}
    try {x?.proc?.kill('SIGTERM');}catch(e){report.status='incomplete';report.displayCleanupError=e.message;}
    writeFileSync(opts.out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  return report;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().then(r=>{console.log(`terminal-burst: ${r.status} — ${r.options.out}`);if(r.status!=='measured') {console.error(r.error??r.bursts.flatMap(b=>b.reasons).join('; '));process.exitCode=2;}}).catch(e=>{console.error(e);process.exitCode=2;});
