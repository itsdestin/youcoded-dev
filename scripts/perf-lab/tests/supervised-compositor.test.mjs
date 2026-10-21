import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { compositorPlan, compositorEnvironment, compositorCommand, compositorBusConfiguration, COMPOSITOR_DESCRIPTOR } from '../supervised-compositor-policy.mjs';
import { CompositorSession } from '../supervised-compositor-core.mjs';
import { proveCompositorSocket, proveCompositorRoles, verifySystemExecutable, assertFreshCompositorSocket, disposeCompositorChildResources, verifyCompositorBusConfiguration, verifyCompositorKwinConfiguration } from '../supervised-compositor-linux.mjs';
import { CompositorController, startCompositorSupervisor } from '../supervised-compositor-controller.mjs';
import { bindSupervisorProtocol } from '../supervised-launch-worker.mjs';
import { OwnedProcesses } from '../owned-processes.mjs';
import { compositorOutputBudget, finishCompositorWorker } from '../supervised-compositor-worker.mjs';
import { sendFinalAndDisconnect, assertProtocolEnvelope } from '../supervised-protocol.mjs';
import { observeChildRetirement } from '../supervised-retirement.mjs';

test('private output tails survive failure finalization without overflowing evidence or final IPC', async () => {
  const f = fakeSession(), rows = [];
  const output = compositorOutputBudget(() => {});
  output('stdout', Buffer.alloc(10000, 0));
  output('stderr', Buffer.from('synthetic private failure\n'.repeat(1000)));
  output.retainHelper('stderr', Buffer.from('helper private stderr\n'));
  f.deps.outputSnapshot = output.snapshot;
  const receipt = await finishCompositorWorker({ session: f.s, reason: 'failure',
    channel: { connected: false }, send: () => false,
    persist: row => { assertProtocolEnvelope(row); rows.push(row); },
    closeEvidence: () => {}, detach: () => {} });
  const tails = rows.filter(row => row.type === 'compositor-output-tail');
  assert.equal(tails.length, 2);
  assert.equal(tails[0].text, '\0'.repeat(4096));
  assert.ok(tails[1].text.endsWith('synthetic private failure\nhelper private stderr\n'));
  assert.equal(receipt.output.helperBytes, Buffer.byteLength('helper private stderr\n'));
  assert.ok(receipt.output.retainedBytes <= 8192);
  assert.equal(receipt.output.bytes, 10000 + Buffer.byteLength('synthetic private failure\n'.repeat(1000)));
  assert.equal('stdout' in receipt.output, false);
  assertProtocolEnvelope({ final: receipt });
});

const plan = () => compositorPlan('/tmp/perf-lab-test/reservation', 'perf-0123456789abcdef');
const identity = { dev: 1, ino: 2, uid: 1000, mode: 0o100755 };
const executables = () => Object.fromEntries(['dbus-run-session','kwin_wayland','dbus-daemon','kscreen-doctor','wayland-info'].map((name,i) => [name, { path: `/usr/bin/${name}`, identity: { ...identity, ino: i + 10 } }]));
const row = (pid, ppid, extra={}) => ({ pid, ppid, starttime: String(pid*10), session: 20, pgrp: 20, state:'S', rssMb: 10, cmdline:'private', ...extra });
function fakeSession({ captureError=false, uncertain=false, pipes=true, execError=false }={}) {
  let clock=0, rss=10, alive=true, cleanups=0, releases=0;
  const family={ leader:row(20,10), sample:()=>({rssMb:rss,members:alive?[row(20,10)]:[]}), cleanup:async()=>{cleanups++;alive=false;return {cleanupConfirmed:!uncertain,survivors:[]};} };
  const gate={ family, child:{pid:20}, capture:async()=>{if(captureError)throw Error('partial capture');}, release:()=>{releases++;}, corroborate:async()=>{if(execError)throw Error('wrapper replacement');}, abort:()=>{}, waitClosed:async()=>({exited:pipes,closed:pipes}) };
  const deps={now:()=>clock,persist:()=>{},emit:()=>{},spawnGate:async()=>gate,inspect:()=>({owned:true,filesystemInode:40,kernelInode:'80'})};
  const s=new CompositorSession(plan(),deps);
  return {s,deps,gate, setClock:n=>clock=n,setRss:n=>rss=n,setAlive:n=>alive=n,get cleanups(){return cleanups;},get releases(){return releases;}};
}
test('purpose policy fixes arguments, isolated environment and explicitly incomplete descriptor',()=>{
  const p=plan(), env=compositorEnvironment(p), command=compositorCommand(executables(),p);
  assert.deepEqual(command.argv.slice(5),['--virtual','--width','2560','--height','1600','--socket',p.socketName,'--no-lockscreen','--no-global-shortcuts']);
  assert.equal(env.HOME,p.home);assert.equal(env.XDG_RUNTIME_DIR,p.runtime);
  for(const k of ['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','QT_PLUGIN_PATH','LD_PRELOAD','NODE_OPTIONS'])assert.equal(env[k],undefined);
  assert.equal(COMPOSITOR_DESCRIPTOR.modeVerified,false);assert.equal(COMPOSITOR_DESCRIPTOR.gpuRuntime,'blocked');
  assert.throws(()=>compositorPlan('/tmp/'+'a'.repeat(110),'perf-0123456789abcdef'),/path|socket/);
  assert.throws(()=>compositorPlan('/tmp/../unsafe','perf-0123456789abcdef'),/path/);
  for(const options of [{binary:'/usr/bin/sh'},{argv:['bad']},{env:{DISPLAY:':0'}},{pid:20},{signal:'SIGKILL'}])assert.throws(()=>startCompositorSupervisor(options),/accepts no/);
});
test('single start captures before release and inspection never claims mode readiness',async()=>{
  const f=fakeSession();f.s.ready();const result=await f.s.handle({type:'start'});
  assert.equal(result.status,'started-not-ready');assert.equal(f.releases,1);
  const proof=await f.s.handle({type:'inspect'});assert.equal(proof.owned,true);assert.equal(proof.modeVerified,false);
  await f.s.stop('test');assert.equal(f.cleanups,1);
  await assert.rejects(f.s.handle({type:'start'}),/retired|one/);
});
test('partial gate capture retains cleanup authority and wrapper replacement never retries',async()=>{
  for(const options of [{captureError:true},{execError:true}]){
    const f=fakeSession(options);f.s.ready();await assert.rejects(f.s.handle({type:'start'}));
    assert.equal(f.cleanups,1);assert.equal(f.s.receipt.cleanupConfirmed,true);
    if(options.captureError)assert.equal(f.releases,0);
    await assert.rejects(f.s.handle({type:'start'}),/retired|one/);
  }
});
test('cleanup uncertainty or open pipes cannot be repaired by fallback or retry',async()=>{
  for(const options of [{uncertain:true},{pipes:false}]){
    const f=fakeSession(options);f.s.ready();await f.s.handle({type:'start'});
    assert.equal((await f.s.stop('disconnect')).cleanupConfirmed,false);
    await f.s.stop('again');assert.equal(f.cleanups,1);
    await assert.rejects(f.s.handle({type:'start'}));
  }
});
test('worker deadline, memory and dead wrapper stop independently of controller',async()=>{
  for(const reason of ['deadline-reserve','memory-limit','dead-wrapper']){
    const f=fakeSession();f.s.ready();await f.s.handle({type:'start'});
    if(reason==='deadline-reserve')f.setClock(55000);
    if(reason==='memory-limit')f.setRss(2049);
    if(reason==='dead-wrapper')f.setAlive(false);
    await f.s.tick();assert.equal(f.s.receipt.reason,reason);
  }
});
function socketFixture(){
  const p=plan(), receipts=executables(), kwin={...row(21,20),uid:1000,home:p.home,exe:receipts.kwin_wayland.path,executableIdentity:receipts.kwin_wayland.identity};
  const family={leader:row(20,10),known:new Map([[20,row(20,10)],[21,kwin]]),sample:()=>({rssMb:20,members:[row(20,10),kwin]}),protect:()=>{}};
  const st={uid:1000,dev:3,ino:40,isSocket:()=>true,isSymbolicLink:()=>false};
  const wrapper={...row(20,10),uid:1000,home:p.home,exe:receipts['dbus-run-session'].path,executableIdentity:receipts['dbus-run-session'].identity};
  const deps={uid:1000,canonical:x=>x,lstat:()=>st,table:()=>`Num RefCount Protocol Flags Type St Inode Path\n0000: 00000002 00000000 00010000 0001 01 80 ${p.socketPath}\n`,fds:()=>['socket:[80]'],inspect:pid=>pid===20?wrapper:kwin};
  return {p,receipts,kwin,family,deps,st};
}
test('pre-exec socket reservation rejects existing entries including dangling symlinks and locks',()=>{
  const absent=()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});};
  assert.doesNotThrow(()=>assertFreshCompositorSocket(plan(),{lstat:absent}));
  for(const occupied of [plan().socketPath,`${plan().socketPath}.lock`,`${plan().runtime}/bus`,`${plan().runtime}/no-system-bus`]){
    assert.throws(()=>assertFreshCompositorSocket(plan(),{lstat:path=>path===occupied?{isSymbolicLink:()=>true}:absent()}),/Existing/);
  }
});
test('Unix listener proof retains distinct filesystem and kernel inode identities',()=>{
  const f=socketFixture();const proof=proveCompositorSocket(f.family,f.p,f.receipts,f.deps);
  assert.equal(proof.owned,true);assert.equal(proof.filesystemInode,40);assert.equal(proof.kernelInode,'80');assert.equal(proof.owners[0].pid,21);
});
// WHY: runtime attempt inferred-kwin-ready-2 refused a healthy compositor because the kernel lists
// every ACCEPTED connection under the listener's path too (flags 0, state 03 CONNECTED).
test('Unix listener proof ignores accepted client connections but still refuses ambiguous or odd rows',()=>{
  const head='Num RefCount Protocol Flags Type St Inode Path\n';
  const listen=p=>`0000: 00000002 00000000 00010000 0001 01 80 ${p}\n`;
  const accepted=(p,inode)=>`0000: 00000003 00000000 00000000 0001 03 ${inode} ${p}\n`;
  const ok=socketFixture();ok.deps.table=()=>head+accepted(ok.p.socketPath,91)+listen(ok.p.socketPath)+accepted(ok.p.socketPath,92);
  const proof=proveCompositorSocket(ok.family,ok.p,ok.receipts,ok.deps);
  assert.equal(proof.owned,true);assert.equal(proof.kernelInode,'80');
  const bad=[
    p=>head+listen(p)+`0000: 00000002 00000000 00010000 0001 01 81 ${p}\n`, // second listener
    p=>head+accepted(p,91), // only connections, no listener
    p=>head+listen(p)+`0000: 00000003 00000000 00000000 0002 03 93 ${p}\n`, // datagram row
    p=>head+listen(p)+`0000: 00000003 00000000 00010000 0001 03 94 ${p}\n`, // connected row claiming accept flag
    p=>head+listen(p)+`0000: 00000003 00000000 00000000 0001 01 95 ${p}\n`, // unconnected non-listener
  ];
  for(const t of bad){const f=socketFixture();f.deps.table=()=>t(f.p.socketPath);assert.throws(()=>proveCompositorSocket(f.family,f.p,f.receipts,f.deps));}
});
test('foreign UID, symlink, substitution, reused owner, missing FD and table floods fail closed',()=>{
  const cases=[f=>{f.st.uid=9;},f=>{f.st.isSymbolicLink=()=>true;},f=>{let n=0;f.deps.lstat=()=>({...f.st,ino:++n});},f=>{let n=0;f.deps.inspect=()=>({...f.kwin,starttime:String(++n)});},f=>{f.deps.fds=()=>[];},f=>{f.deps.table=()=> 'x'.repeat(262145);},f=>{f.family.protect=()=>{throw Error('protected ancestry');};}];
  for(const change of cases){const f=socketFixture();change(f);assert.throws(()=>proveCompositorSocket(f.family,f.p,f.receipts,f.deps));}
});
test('role proof requires exact post-exec wrapper and expected KWin device/inode',()=>{
  const f=socketFixture(), wrapper={...row(20,10),uid:1000,home:f.p.home,exe:f.receipts['dbus-run-session'].path,executableIdentity:f.receipts['dbus-run-session'].identity};
  const inspect=pid=>pid===20?wrapper:f.kwin;
  assert.equal(proveCompositorRoles(f.family,f.p,f.receipts,{inspect,uid:1000}).kwin.pid,21);
  wrapper.exe='/usr/bin/sh';assert.throws(()=>proveCompositorRoles(f.family,f.p,f.receipts,{inspect,uid:1000}));
  wrapper.exe=f.receipts['dbus-run-session'].path;f.kwin.executableIdentity={...identity,ino:999};assert.throws(()=>proveCompositorRoles(f.family,f.p,f.receipts,{inspect,uid:1000}));
});
test('known D-Bus and KWin roles survive reparenting but never executable replacement',()=>{
  const f=socketFixture(),originalInspect=f.deps.inspect;
  const daemon={...row(22,1),uid:1000,home:f.p.home,exe:f.receipts['dbus-daemon'].path,executableIdentity:f.receipts['dbus-daemon'].identity};
  f.kwin.ppid=1;f.family.known.set(22,daemon);
  f.family.sample=()=>({rssMb:30,members:[row(20,10),f.kwin,daemon]});
  const inspect=pid=>pid===22?daemon:originalInspect(pid);
  const roles=proveCompositorRoles(f.family,f.p,f.receipts,{inspect,uid:1000});
  assert.deepEqual(roles.daemon,{pid:22,starttime:'220'});assert.deepEqual(roles.kwin,{pid:21,starttime:'210'});
  daemon.exe='/usr/bin/foreign';assert.throws(()=>proveCompositorRoles(f.family,f.p,f.receipts,{inspect,uid:1000}),/Unexpected/);
});
test('system executable policy rejects scripts, writable, privileged, foreign or substituted files',()=>{
  const st={...identity,isFile:()=>true}, io={canonical:x=>x,lstat:()=>st,open:()=>3,fstat:()=>st,head:()=>Buffer.from([127,69,76,70]),close:()=>{}};
  assert.equal(verifySystemExecutable('kwin_wayland',1000,io).path,'/usr/bin/kwin_wayland');
  for(const patch of [{mode:0o100777},{mode:0o104755},{uid:12}]){
    Object.assign(st,identity,patch);assert.throws(()=>verifySystemExecutable('kwin_wayland',1000,io));
  }
  Object.assign(st,identity);io.fstat=()=>({...st,ino:999});assert.throws(()=>verifySystemExecutable('kwin_wayland',1000,io));
  io.fstat=()=>st;st.uid=0;assert.equal(verifySystemExecutable('kwin_wayland',1000,io).identity.uid,0);
  Object.assign(st,identity);io.head=()=>Buffer.from('#!sh');assert.throws(()=>verifySystemExecutable('kwin_wayland',1000,io));
  assert.throws(()=>verifySystemExecutable('sh',1000,io));
});
test('private protocol disconnects into real session cleanup; arbitrary commands and packet floods cannot execute',async()=>{
  const f=fakeSession();f.s.ready();await f.s.handle({type:'start'});
  const channel=new EventEmitter(), finishes=[];
  const detach=bindSupervisorProtocol(channel,f.s,{finish:async reason=>{finishes.push(reason);await f.s.stop(reason);},send:()=>{},isStopping:()=>!!f.s.stopping});
  channel.emit('disconnect');await f.s.stopping;assert.equal(f.cleanups,1);assert.deepEqual(finishes,['controller-disconnect']);detach();
  for(const message of [{id:1,type:'configure',argv:['bad']},{id:1,type:'inspect',padding:'x'.repeat(65537)}]){
    const g=fakeSession();g.s.ready();const c=new EventEmitter();let why;
    const off=bindSupervisorProtocol(c,g.s,{finish:r=>{why=r;},send:()=>{},isStopping:()=>false});c.emit('message',message);assert.ok(why);assert.equal(g.releases,0);off();
  }
});
test('controller handle exists before acknowledgement; disconnect invalidates requests without fallback signal',async()=>{
  const worker=new EventEmitter();let firstSend;
  const sent=new Promise(resolve=>{firstSend=resolve;});
  worker.connected=true;worker.send=(m,cb)=>{worker.last=m;firstSend(m);cb?.();};worker.disconnect=()=>{worker.connected=false;worker.emit('disconnect');};
  const handle=new CompositorController(worker);assert.equal(typeof handle.stop,'function');
  worker.emit('message',{event:{type:'ready'}});const message=await sent;
  worker.emit('message',{id:message.id,result:{status:'started-not-ready'}});await handle.ready;
  const inspect=handle.inspect();worker.disconnect();await assert.rejects(inspect,/disconnect/);
  worker.emit('exit',2,null);await assert.rejects(handle.stop(),/unconfirmed|retirement|disconnect/);
});
test('missing socket has a fixed startup deadline and previously proved substitution retires',async()=>{
  for(const kind of ['timeout','filesystem','kernel','owner','disappeared']) {
    const f=fakeSession();f.s.ready();await f.s.handle({type:'start'});
    if(kind==='timeout') {f.deps.inspect=()=>({owned:false,pending:true});f.setClock(2001);}
    else {
      const original={owned:true,filesystemDevice:3,filesystemInode:40,kernelInode:'80',socketPath:plan().socketPath,owners:[{pid:21,starttime:'210'}]};
      f.deps.inspect=()=>original;await f.s.handle({type:'inspect'});
      const next={...original};
      if(kind==='filesystem')next.filesystemInode=41;
      if(kind==='kernel')next.kernelInode='81';
      if(kind==='owner')next.owners=[{pid:21,starttime:'211'}];
      if(kind==='disappeared')next.owned=false;
      f.deps.inspect=()=>next;
    }
    await f.s.tick();assert.equal(f.s.receipt.cleanupConfirmed,true);assert.match(f.s.receipt.reason,/timeout|substituted/);assert.equal(f.cleanups,1);
  }
});
test('disconnect during gate acquisition cannot retire ahead of the late child',async()=>{
  const f=fakeSession();let deliver;f.deps.spawnGate=()=>new Promise(resolve=>{deliver=resolve;});
  f.s.ready();const started=f.s.handle({type:'start'}),assertStarted=assert.rejects(started,/Retired/);
  const stopped=f.s.stop('controller-disconnect');assert.equal(f.s.receipt,null);
  deliver(f.gate);const result=await stopped;await assertStarted;
  assert.equal(f.releases,0);assert.equal(result.cleanupConfirmed,false);
  // No captured family means NO cleanup authority, even if we know child.pid.
  assert.equal(f.cleanups,0);
});
test('worker stdio flood stops once through session retirement without forwarding bytes',async()=>{
  const f=fakeSession();f.s.ready();await f.s.handle({type:'start'});
  let finishes=0;
  const output=compositorOutputBudget(reason=>{finishes++;return f.s.stop(reason);});
  output('stdout',Buffer.alloc(262144));assert.equal(finishes,0);
  output('stderr',Buffer.from('!'));output('stdout',Buffer.alloc(262144));
  await f.s.stopping;assert.equal(finishes,1);assert.equal(f.cleanups,1);assert.equal(f.s.receipt.reason,'stdio-byte-cap');
});
test('unknown fixed helper/configuration commands and caller environment never reach gate',async()=>{
  for(const message of [{type:'configure'},{type:'kscreen-doctor'},{type:'exec'},{type:'signal',pid:20},{type:'start',env:{DISPLAY:':0'}}]){
    const f=fakeSession();f.s.ready();await assert.rejects(f.s.handle(message),/Unsupported/);assert.equal(f.releases,0);
  }
});
test('bounded final send disconnects even when callback is withheld',()=>{
  const channel={connected:true,disconnect(){this.connected=false;}},timers=[];
  sendFinalAndDisconnect(channel,()=>true,{final:{cleanupConfirmed:false}},{setTimer:(fn,ms)=>{assert.equal(ms,250);timers.push(fn);return 1;},clearTimer:()=>{}});
  assert.equal(channel.connected,true);timers[0]();assert.equal(channel.connected,false);
});
test('stop handle before readiness never launches and waits for actual worker retirement',async()=>{
  const worker=new EventEmitter(),messages=[];worker.connected=true;
  worker.send=(message,cb)=>{messages.push(message);cb?.();};worker.disconnect=()=>{worker.connected=false;worker.emit('disconnect');};
  const handle=new CompositorController(worker),stopped=handle.stop();
  worker.emit('message',{event:{type:'ready'}});
  worker.emit('message',{final:{cleanupConfirmed:true}});
  const stopRequest=messages.find(m=>m.type==='stop');worker.emit('message',{id:stopRequest.id,result:{cleanupConfirmed:true}});
  worker.disconnect();worker.emit('exit',0,null);
  assert.equal((await stopped).cleanupConfirmed,true);await assert.rejects(handle.ready,/stopped|disconnect/);
  assert.equal(messages.some(m=>m.type==='start'),false);
});
test('descendant-only terminal scan records same-session strangers as uncertainty, never signal authority',async()=>{
  const rows=new Map([[10,row(10,1,{session:10,pgrp:10})],[20,row(20,10)]]),signals=[];let clock=0;
  const owned=new OwnedProcesses({leaderPid:20,parentPid:10,jobDir:plan().runDir,descendantsOnly:true,read:pid=>rows.get(pid)??null,list:()=>rows.keys(),signal:(pid,sig)=>signals.push([pid,sig]),now:()=>clock,sleep:async ms=>{clock+=ms;}});
  owned.captureExecGate({expectedExe:'/usr/bin/python3',expectedUid:1000,expectedHome:plan().home,inspect:pid=>({...rows.get(pid),exe:'/usr/bin/python3',uid:1000,home:plan().home})});
  rows.delete(20);rows.set(31,row(31,1));
  const receipt=await owned.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5});
  assert.equal(receipt.cleanupConfirmed,false);assert.equal(owned.known.has(31),false);
  assert.equal(owned.uncertain.get(31).verified,false);assert.equal(receipt.survivors[0].pid,31);assert.deepEqual(signals,[]);
  rows.delete(31);assert.equal((await owned.cleanup({termWaitMs:10,killWaitMs:10,everyMs:5})).cleanupConfirmed,false);
});
test('private bus command selects exact no-activation config instead of default session configuration',()=>{
  const p=plan(),receipt=executables(),command=compositorCommand(receipt,p),xml=compositorBusConfiguration(p),env=compositorEnvironment(p);
  assert.deepEqual(command.argv,[receipt['dbus-run-session'].path,`--dbus-daemon=${receipt['dbus-daemon'].path}`,`--config-file=${p.runDir}/bus.conf`,'--',receipt.kwin_wayland.path,'--virtual','--width','2560','--height','1600','--socket',p.socketName,'--no-lockscreen','--no-global-shortcuts']);
  assert.equal(env.DBUS_SYSTEM_BUS_ADDRESS,`unix:path=${p.runtime}/no-system-bus`);
  assert.match(xml,new RegExp(`<listen>unix:path=${p.runtime}/bus</listen>`));assert.match(xml,/<auth>EXTERNAL<\/auth>/);
  assert.doesNotMatch(xml,/<(?:include|includedir|servicedir|standard_session_servicedirs|standard_system_servicedirs|servicehelper|fork|allow_anonymous)\b/);
  // Contract regression, not a replacement D-Bus parser: the actual daemon
  // rejected member-only rules. Keep both denials path-qualified and mandatory.
  const mandatory = /<policy context="mandatory">([\s\S]*?)<\/policy>/.exec(xml);
  assert.ok(mandatory, 'Mandatory activation policy must exist');
  assert.equal(mandatory[1].trim(), [
    '<deny send_destination="org.freedesktop.DBus" send_path="/org/freedesktop/DBus" send_member="StartServiceByName"/>',
    '<deny send_destination="org.freedesktop.DBus" send_path="/org/freedesktop/DBus" send_member="UpdateActivationEnvironment"/>',
  ].join('\n    '));
  assert.doesNotMatch(mandatory[1], /send_interface=/);
  assert.doesNotMatch(xml,/systemd|\/usr\/share|\/etc\//);
  assert.match(COMPOSITOR_DESCRIPTOR.limits,/not a.*sandbox/i);
});
test('private bus config verification refuses replacement, unsafe permissions and activation-bearing content',()=>{
  const p=plan(),st={...identity,mode:0o100600,isFile:()=>true},expected={...st};
  const io={uid:1000,lstat:()=>st,canonical:x=>x,read:()=>compositorBusConfiguration(p)};
  assert.doesNotThrow(()=>verifyCompositorBusConfiguration(p,expected,io));
  io.read=()=>compositorBusConfiguration(p).replace('</busconfig>','<standard_session_servicedirs/></busconfig>');
  assert.throws(()=>verifyCompositorBusConfiguration(p,expected,io),/configuration/);
  io.read=()=>compositorBusConfiguration(p);st.ino=999;assert.throws(()=>verifyCompositorBusConfiguration(p,expected,io),/configuration/);
  st.ino=identity.ino;st.mode=0o100666;assert.throws(()=>verifyCompositorBusConfiguration(p,expected,io),/configuration/);
  st.mode=expected.mode;io.canonical=()=>'/foreign';assert.throws(()=>verifyCompositorBusConfiguration(p,expected,io),/configuration/);
});
// WHY: the private kwinrc is what keeps the host's plasma-keyboard input method out of our compositor.
test('private kwinrc disables the input method and verification refuses edits, swaps and unsafe modes',async()=>{
  const {COMPOSITOR_KWINRC}=await import('../supervised-compositor-policy.mjs');
  assert.match(COMPOSITOR_KWINRC,/^\[Wayland\]\nInputMethod=\n/);assert.match(COMPOSITOR_KWINRC,/VirtualKeyboardEnabled=false/);
  const p=plan(),st={...identity,mode:0o100600,isFile:()=>true},expected={...st};
  const io={uid:1000,lstat:()=>st,canonical:x=>x,read:()=>COMPOSITOR_KWINRC};
  assert.doesNotThrow(()=>verifyCompositorKwinConfiguration(p,expected,io));
  io.read=()=>COMPOSITOR_KWINRC.replace('InputMethod=','InputMethod=/usr/share/applications/org.kde.plasma.keyboard.desktop');
  assert.throws(()=>verifyCompositorKwinConfiguration(p,expected,io),/kwin configuration/);
  io.read=()=>COMPOSITOR_KWINRC;st.ino=999;assert.throws(()=>verifyCompositorKwinConfiguration(p,expected,io),/kwin configuration/);
  st.ino=identity.ino;st.mode=0o100644;assert.throws(()=>verifyCompositorKwinConfiguration(p,expected,io),/kwin configuration/);
  st.mode=expected.mode;io.uid=1001;assert.throws(()=>verifyCompositorKwinConfiguration(p,expected,io),/kwin configuration/);
});
test('worker finalizer releases local child handles after retained failure, before bounded final disconnect',async()=>{
  for(const kind of ['never-close','capture-failure','capture-unowned','cleanup-throw']) {
    const f=fakeSession({pipes:false});let localRefs=5,unrefs=0,closed=false;const order=[];
    const child=new EventEmitter();child.unref=()=>{unrefs++;};
    child.stdio=Array.from({length:5},()=>{const pipe=new EventEmitter();pipe.destroy=()=>{order.push('destroy');queueMicrotask(()=>{localRefs--;pipe.emit('close');});};return pipe;});
    child.stdout=child.stdio[1];child.stderr=child.stdio[2];
    f.gate.disposeLocal=()=>{assert.equal(f.s.receipt.cleanupConfirmed,false);order.push('dispose');return disposeCompositorChildResources(child);};
    if(kind.startsWith('capture-'))f.gate.capture=async()=>{throw Error('capture failure');};
    if(kind==='capture-unowned')f.gate.family=null;
    if(kind==='cleanup-throw')f.gate.family.cleanup=async()=>{throw Error('cleanup exploded');};
    f.s.ready();if(kind.startsWith('capture-'))await assert.rejects(f.s.handle({type:'start'}));else await f.s.handle({type:'start'});
    const channel=new EventEmitter(),timers=[];
    channel.connected=true;channel.disconnect=()=>{order.push('disconnect');channel.connected=false;closed=true;channel.emit('disconnect');};
    const observed=observeChildRetirement(channel);
    const receipt=await finishCompositorWorker({session:f.s,reason:'test-disconnect',channel,send:()=>{order.push('send-final');return true;},persist:row=>{order.push(row.type);},closeEvidence:()=>order.push('close-evidence'),detach:()=>{},finalOptions:{setTimer:fn=>{timers.push(fn);return 1;},clearTimer:()=>{}}});
    assert.equal(channel.exitCode,2);assert.equal(receipt.cleanupConfirmed,false);assert.equal(receipt.pipes.exited,false);assert.equal(receipt.pipes.closed,false);
    if(kind==='cleanup-throw')assert.match(receipt.family.error,/cleanup exploded/);
    if(kind==='capture-unowned')assert.equal(f.cleanups,0);
    assert.equal(receipt.localResources.childUnrefRequested,true);assert.equal(receipt.localResources.pipeDestroyRequests,5);
    assert.equal(unrefs,1);assert.equal(localRefs,0);assert.equal(closed,false);
    assert.ok(order.indexOf('dispose')<order.indexOf('send-final'));assert.ok(order.indexOf('retirement-local-resources')<order.indexOf('close-evidence'));
    timers[0]();assert.equal(closed,true);assert.ok(order.indexOf('send-final')<order.indexOf('disconnect'));
    assert.equal(observed.snapshot().complete,false); // IPC loss is NOT worker exit.
    channel.emit('exit',channel.exitCode,null);const actual=await observed.done;
    assert.equal(actual.complete,true);assert.equal(actual.code,2);assert.equal(receipt.pipes.exited,false);
  }
});
test('local disposal errors never erase unconfirmed child or cleanup errors',async()=>{
  const f=fakeSession({pipes:false});f.s.ready();await f.s.handle({type:'start'});
  f.gate.disposeLocal=()=>{throw Error('pipe disposal failed');};
  const channel={connected:false};
  const receipt=await finishCompositorWorker({session:f.s,reason:'test',channel,send:()=>false,persist:()=>{},closeEvidence:()=>{},detach:()=>{},finalOptions:{setTimer:()=>1,clearTimer:()=>{}}});
  assert.equal(channel.exitCode,2);assert.equal(receipt.cleanupConfirmed,false);assert.match(receipt.localResources.errors[0],/disposal failed/);assert.equal(receipt.pipes.closed,false);
});
test('descendant-only OwnedProcesses refuses same-session strangers but retains known reparented descendants',()=>{
  const rows=new Map([[10,row(10,1,{session:10,pgrp:10})],[20,row(20,10)],[21,row(21,20)],[30,row(30,1)]]);
  const owned=new OwnedProcesses({leaderPid:20,parentPid:10,jobDir:plan().runDir,descendantsOnly:true,read:pid=>rows.get(pid)??null,list:()=>rows.keys(),signal:()=>{}});
  owned.captureExecGate({expectedExe:'/usr/bin/python3',expectedUid:1000,expectedHome:plan().home,inspect:pid=>({...rows.get(pid),exe:'/usr/bin/python3',uid:1000,home:plan().home})});
  assert.equal(owned.known.has(21),true);assert.equal(owned.known.has(30),false);
  rows.set(21,row(21,1));assert.ok(owned.sample().members.some(r=>r.pid===21));
  rows.set(21,row(21,1,{starttime:'replacement'}));assert.throws(()=>owned.sample(),/reuse/);
});
