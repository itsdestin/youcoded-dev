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
test('stop() delivers a bounded retirement receipt even when four realistic helper receipts and a huge family report exist',async()=>{
  const f=fakeSession(),notes=[];
  f.deps.persist=r=>notes.push(r);
  const big=step=>({step,cleanupConfirmed:true,error:null,survivors:[],localErrors:[],pipes:{exited:true,closed:true,code:0,signal:null,spawnedChild:{pid:1,observedIdentity:{pid:1,starttime:'2'}},gateEvidence:{kind:'k',authorizer:{a:{b:{c:1,d:2,e:3,f:4,g:5}}}}},execution:{kind:'authorized_fdexec_completed',authorizer:{a:{b:{c:1,d:2,e:3,f:4,g:5,h:6,i:7}}},capturedGate:{p:1,q:2,r:3,s:4,t:5,u:6}}});
  f.s.configuration={stop:async()=>({cleanupConfirmed:true,receipts:['initial','apply','final','wayland'].map(big)})};
  f.s.family={cleanup:async()=>({cleanupConfirmed:true,survivors:[],procFailures:{records:Array.from({length:700},(_,i)=>({i}))}})};
  f.s.gate=f.gate;
  const receipt=await f.s.stop('inspection-failed');
  assert.equal(receipt.cleanupConfirmed,true);
  assert.doesNotThrow(()=>assertProtocolEnvelope({final:receipt}));
  assert.ok(notes.some(r=>r.type==='retirement'));
  assert.equal(receipt.helpers.receipts.length,4);
});
test('race: wrapper polled mid-execve (HOME unreadable) is retried; definite mismatches still fail with field names',async()=>{
  const { wrapperPostExecDecision } = await import('../supervised-compositor-linux.mjs');
  const p=plan(), receipt={path:'/usr/bin/dbus-run-session',identity:{...identity,ino:10}};
  const leader={pid:20,starttime:'200'};
  const rec=(patch={})=>({pid:20,starttime:'200',uid:1000,home:p.home,exe:receipt.path,executableIdentity:receipt.identity,ppid:5,session:20,pgrp:20,...patch});
  const d=r=>wrapperPostExecDecision(r,leader,receipt,p,1000,5,'/usr/bin/python3');
  assert.equal(d(rec()),'ok'); assert.equal(d(rec({exe:'/usr/bin/python3'})),'gate'); assert.equal(d(null),'transient');
  assert.equal(d(rec({home:undefined})),'transient'); assert.equal(d(rec({home:null})),'transient');
  assert.throws(()=>d(rec({home:'/real'})),/\(home\)/);
  assert.throws(()=>d(rec({exe:'/usr/bin/foreign'})),/\(exe\)/);
  assert.throws(()=>d(rec({home:undefined,uid:9})),/\(uid\)/);
  assert.throws(()=>d(rec({home:undefined,ppid:1})),/\(ppid\)/);
  assert.throws(()=>d(rec({starttime:'201'})),/\(process\)/);
  assert.throws(()=>d(rec({executableIdentity:{...identity,ino:99}})),/executableIdentity/);
});

// ---- helper-hardening-3: containment must not depend on the post-exec identity proof ------------------
// Fake /proc table + injected uptime: nothing is forked, signalled or read from the real /proc.
function containmentFixture() {
  const rows = new Map([[10, row(10, 1, { session: 10, pgrp: 10 })], [20, row(20, 10)]]), signals = [];
  const state = { ticks: 250, onSignal: null };
  const owned = new OwnedProcesses({ leaderPid: 20, parentPid: 10, jobDir: plan().runDir, descendantsOnly: true,
    read: pid => rows.get(pid) ?? null, list: () => [...rows.keys()], uptimeTicks: () => state.ticks,
    signal: (pid, sig) => { signals.push([pid, sig]); state.onSignal?.(pid, sig); }, now: () => state.ticks, sleep: async () => {} });
  return { rows, signals, state, owned };
}
const cleanupFast = owned => owned.cleanup({ termWaitMs: 10, killWaitMs: 10, everyMs: 5 });
test('incident replay: kwin reparented away from a dead wrapper is retired by session lineage, with evidence', async () => {
  const f = containmentFixture();
  assert.deepEqual(f.owned.noteSpawn(20), { pid: 20, starttime: '200' });
  // kwin (start tick 210) is born into the leader's session while the leader is alive (seen at tick 300) ...
  f.rows.set(21, row(21, 20, { cmdline: 'kwin_wayland --socket perf-0123456789abcdef' }));
  f.state.ticks = 300; f.owned.pulse();
  // ... then the wrapper dies and kwin is reparented to a subreaper: no recorded parent chain remains.
  f.rows.delete(20); f.rows.get(21).ppid = 1681; f.rows.set(1681, row(1681, 1, { session: 1681, pgrp: 1681 }));
  f.rows.set(50, row(50, 1, { session: 50, pgrp: 50 }));          // real desktop process: other session
  f.state.onSignal = pid => f.rows.delete(pid);
  const receipt = await cleanupFast(f.owned);
  assert.deepEqual(f.signals, [[21, 'SIGTERM']]);
  assert.equal(receipt.cleanupConfirmed, true);
  assert.equal(receipt.containment.signalled[0].basis, 'started-while-spawned-leader-alive');
  assert.deepEqual(receipt.survivors, []);
  assert.equal(f.rows.has(50), true);
  assertProtocolEnvelope({ final: receipt });
});
test('containment: a same-session occupant born after the leader was last seen alive is never signalled and stays a survivor', async () => {
  const f = containmentFixture();
  f.owned.noteSpawn(20); f.state.ticks = 300; f.owned.pulse();
  f.rows.delete(20);
  f.rows.set(31, row(31, 1, { starttime: '5000' })); // would be a pid-reuse look-alike of session 20
  const receipt = await cleanupFast(f.owned);
  assert.deepEqual(f.signals, []);
  assert.equal(receipt.cleanupConfirmed, false);
  assert.equal(receipt.survivors.some(s => s.pid === 31), false); // not an owned identity...
  assert.equal(receipt.containment.unverified[0].pid, 31);          // ...but reported, and cleanup is not confirmed
});
test('containment: pid reuse is never signalled (leader number reused, recorded member starttime changed, fence race)', async () => {
  let f = containmentFixture();
  f.owned.noteSpawn(20); f.state.ticks = 300; f.owned.pulse();
  f.rows.set(20, row(20, 1, { starttime: '7777' })); // number 20 now a different process that is its own session
  assert.equal((await cleanupFast(f.owned)).cleanupConfirmed, false); assert.deepEqual(f.signals, []);
  // A recorded member whose pid is reused: the ORIGINAL is confirmed gone, the newcomer is never signalled.
  f = containmentFixture(); f.owned.noteSpawn(20); f.rows.set(21, row(21, 20));
  f.state.ticks = 300; f.owned.pulse(); f.owned.containmentSweep(null);
  assert.equal(f.owned.contained.has(21), true);
  f.rows.delete(20); f.rows.set(21, row(21, 1, { starttime: '99999', session: 21, pgrp: 21 }));
  const receipt = await cleanupFast(f.owned);
  assert.deepEqual(f.signals, []); assert.equal(f.owned.known.has(21), false); assert.equal(receipt.cleanupConfirmed, true);
  // Identity changes between the scan and the signal (fence): refused, no signal.
  f = containmentFixture(); f.owned.noteSpawn(20); f.rows.set(21, row(21, 20));
  let reads = 0; const realGet = f.rows.get.bind(f.rows);
  f.rows.get = pid => (pid === 21 && ++reads > 1 ? { ...realGet(21), starttime: 'swapped' } : realGet(pid));
  const sweep = f.owned.containmentSweep('SIGTERM');
  assert.deepEqual(f.signals.filter(([pid]) => pid === 21), []);
  assert.equal(sweep.refused.some(r => r.reason === 'identity-changed-before-signal'), true);
});
test('containment: processes outside the spawned session, the supervisor and its ancestors are never signalled', async () => {
  const f = containmentFixture();
  f.owned.noteSpawn(20);
  f.rows.set(21, row(21, 20));
  f.rows.set(60, row(60, 1, { session: 60, pgrp: 60 }));     // foreign
  f.rows.set(61, row(61, 20, { session: 61, pgrp: 61 }));    // child that setsid'd away: not provably ours by session
  f.state.onSignal = pid => f.rows.delete(pid);
  await cleanupFast(f.owned);
  assert.deepEqual(f.signals.map(([pid]) => pid).sort(), [20, 21]);
  assert.equal(f.rows.has(60) && f.rows.has(61) && f.rows.has(10), true);
  assert.throws(() => f.owned.protectContained(row(10, 1)), /Protected/);
});
test('containment: a member that was born after an authorised, still-present member is covered by that anchor', async () => {
  const f = containmentFixture();
  f.owned.noteSpawn(20); f.rows.set(21, row(21, 20)); f.state.ticks = 300; f.owned.pulse();
  f.owned.containmentSweep(null);                      // 21 adopted while the leader holds the pid
  f.rows.delete(20); f.rows.set(25, row(25, 21, { starttime: '9000' })); // born after the leader was last seen
  f.state.onSignal = pid => f.rows.delete(pid);
  const receipt = await cleanupFast(f.owned);
  assert.deepEqual(f.signals.map(([pid]) => pid).sort(), [21, 25]);
  assert.equal(receipt.cleanupConfirmed, true);
  // Without the anchor the same newcomer is only reported.
  const g = containmentFixture(); g.owned.noteSpawn(20); g.state.ticks = 300; g.owned.pulse(); g.rows.delete(20); g.rows.set(25, row(25, 1, { starttime: '9000' }));
  await cleanupFast(g.owned); assert.deepEqual(g.signals, []);
});
test('noteSpawn only accepts the supervisor-forked leader: right parent, own session and group', () => {
  for (const bad of [row(20, 99), row(20, 10, { session: 5 }), row(20, 10, { pgrp: 5 })]) {
    const f = containmentFixture(); f.rows.set(20, bad);
    assert.throws(() => f.owned.noteSpawn(20), /mismatch/); assert.equal(f.owned.spawned, null);
  }
  const f = containmentFixture(); assert.throws(() => f.owned.noteSpawn(21), /supervisor-forked leader/);
  f.owned.noteSpawn(20); assert.throws(() => f.owned.noteSpawn(20), /already/);
});
test('without a recorded spawn identity the legacy rule stays: no sweep, no extra signal authority', async () => {
  const f = containmentFixture(); f.rows.set(21, row(21, 1, { starttime: '210' }));
  const sweep = f.owned.containmentSweep('SIGKILL');
  assert.deepEqual(sweep.signalled, []); assert.deepEqual(f.signals, []);
});

function earlyFailureSession({ capture = async () => {}, corroborate = async () => {}, helperStop = null, bigReceipt = false } = {}) {
  let clock = 0, cleanups = 0;
  const spawned = { pid: 20, starttime: '200' };
  // Spawn-time authority only: family.leader is never set because the exec proof never succeeded.
  const family = { spawned, sample: () => ({ rssMb: 1, members: [] }),
    cleanup: async () => { cleanups++; return { cleanupConfirmed: true,
      survivors: bigReceipt ? Array.from({ length: 80 }, (_, i) => ({ pid: i + 100, starttime: String(i), cmdline: 'x'.repeat(300) })) : [],
      containment: { spawned, signalled: [{ pid: 21, starttime: '210', basis: 'started-while-spawned-leader-alive', signal: 'SIGTERM' }], unverified: [], refused: [] } }; } };
  const gate = { family, child: { pid: 20 }, capture, release() {}, corroborate, abort() {}, waitClosed: async () => ({ exited: true, closed: true }) };
  const rows = [], deps = { now: () => clock, persist: r => rows.push(r), emit() {}, spawnGate: async () => gate, inspect: () => ({ owned: true }) };
  const s = new CompositorSession(plan(), deps);
  if (helperStop) s.configuration = { stop: helperStop };
  return { s, rows, get cleanups() { return cleanups; } };
}
test('every early-failure path retires exactly the spawned family and writes retirement evidence', async () => {
  const paths = {
    'wrapper proof fails': { corroborate: async () => { throw Error('Post-exec wrapper executable/identity mismatch (exe)'); } },
    'role proof fails': { corroborate: async () => { throw Error('Unexpected compositor descendant/role executable'); } },
    'capture fails before any identity proof': { capture: async () => { throw Error('Gate exited'); } },
    'oversized receipt (IPC cap)': { bigReceipt: true, corroborate: async () => { throw Error('boom'); } },
  };
  for (const [name, options] of Object.entries(paths)) {
    const f = earlyFailureSession(options); f.s.ready();
    await assert.rejects(f.s.handle({ type: 'start' }), undefined, name);
    assert.equal(f.cleanups, 1, name);
    const rows = f.rows.filter(r => r.type === 'retirement');
    assert.equal(rows.length, 1, name); assert.equal(rows[0].cleanupConfirmed, true, name);
    assert.equal(rows[0].family.containment.signalled[0].pid, 21, name);
    assertProtocolEnvelope({ final: f.s.receipt });
    if (options.bigReceipt) { assert.match(String(f.s.receipt.truncated), /ipc-record-budget/); assert.equal(f.s.receipt.family.survivors, 80); }
  }
  // Helper failure: the helper receipts say unconfirmed, the compositor family is STILL retired and reported.
  const f = earlyFailureSession({ corroborate: async () => { throw Error('x'); }, helperStop: async () => ({ cleanupConfirmed: false, error: 'helper exploded', receipts: [] }) });
  f.s.ready(); await assert.rejects(f.s.handle({ type: 'start' }));
  assert.equal(f.cleanups, 1); assert.equal(f.s.receipt.cleanupConfirmed, false); assert.equal(f.s.receipt.helpers.cleanupConfirmed, false);
});
test('a failing retirement announcement never throws away the receipt', async () => {
  const f = earlyFailureSession({ corroborate: async () => { throw Error('x'); } });
  f.s.deps.persist = () => { throw Error('Compositor evidence cap'); };
  f.s.state = 'ready'; // ready() would itself persist; the retirement row is what is under test
  await assert.rejects(f.s.handle({ type: 'start' }), /x/);
  assert.equal(f.cleanups, 1); assert.equal(f.s.receipt.cleanupConfirmed, false); assert.match(f.s.receipt.evidenceError, /evidence cap/);
  assert.equal(f.s.receipt.family.containment.signalled[0].pid, 21);
});
test('execve race: tolerant inspector retries transient read failures within a bound and never accepts a wrong value', async () => {
  const { makeTolerantInspect } = await import('../supervised-compositor-linux.mjs');
  const codes = ['EIDENTITYCHANGED', 'ESRCH', 'ENOENT'];
  let n = 0; const flaky = makeTolerantInspect(() => { if (n++ < 3) throw Object.assign(Error('race'), { code: codes[n - 1] }); return { exe: 'x' }; });
  assert.deepEqual([flaky(1), flaky(1), flaky(1), flaky(1)], [null, null, null, { exe: 'x' }]);
  const always = makeTolerantInspect(() => { throw Object.assign(Error('stuck'), { code: 'EIDENTITYCHANGED' }); }, { maxConsecutive: 3 });
  assert.equal(always(1), null); assert.equal(always(1), null); assert.equal(always(1), null); assert.throws(() => always(1), /stuck/);
  const other = makeTolerantInspect(() => { throw Object.assign(Error('denied'), { code: 'EPERM' }); });
  assert.throws(() => other(1), /denied/);
  // A readable wrong value is returned (and then judged by the decision function), never swallowed.
  assert.deepEqual(makeTolerantInspect(() => ({ exe: '/usr/bin/foreign' }))(1), { exe: '/usr/bin/foreign' });
});
test('execve race: role proof retries daemon/kwin mid-exec states but a stable wrong role still fails at once', () => {
  const pauses = [], opts = f => ({ ...f.deps, pause: ms => pauses.push(ms) });
  // empty environ for kwin on the first attempts, then settled
  let f = socketFixture(), attempt = 0; const settled = f.deps.inspect;
  f.deps.inspect = pid => (pid === 21 && attempt < 4 && ++attempt ? { ...f.kwin, home: undefined } : settled(pid));
  f.family.sample = () => ({ rssMb: 1, members: [row(20, 10), f.kwin] });
  assert.equal(proveCompositorRoles(f.family, f.p, f.receipts, opts(f)).kwin.pid, 21); assert.equal(pauses.length, 2);
  // reads straddling the exec: exe differs between the two reads
  pauses.length = 0; f = socketFixture(); let reads = 0; const base = f.deps.inspect;
  f.deps.inspect = pid => (pid === 21 && ++reads <= 2 ? { ...f.kwin, exe: reads === 1 ? f.receipts['dbus-run-session'].path : f.kwin.exe } : base(pid));
  assert.equal(proveCompositorRoles(f.family, f.p, f.receipts, opts(f)).kwin.pid, 21); assert.equal(pauses.length, 1);
  // EIDENTITYCHANGED thrown by the reader
  pauses.length = 0; f = socketFixture(); let thrown = 0; const base2 = f.deps.inspect;
  f.deps.inspect = pid => { if (pid === 21 && thrown++ < 1) throw Object.assign(Error('Exec identity changed during inspection'), { code: 'EIDENTITYCHANGED' }); return base2(pid); };
  assert.equal(proveCompositorRoles(f.family, f.p, f.receipts, opts(f)).kwin.pid, 21); assert.equal(pauses.length, 1);
  // forked copy of the wrapper that has not exec'd yet
  pauses.length = 0; f = socketFixture(); const copy = { ...row(21, 20), uid: 1000, home: f.p.home, exe: f.receipts['dbus-run-session'].path, executableIdentity: f.receipts['dbus-run-session'].identity };
  let forks = 0; const base3 = f.deps.inspect; f.deps.inspect = pid => (pid === 21 && forks++ < 2 ? copy : base3(pid));
  assert.equal(proveCompositorRoles(f.family, f.p, f.receipts, opts(f)).kwin.pid, 21); assert.equal(pauses.length, 1);
  // stable wrong executable: no retry, original refusal
  pauses.length = 0; f = socketFixture(); f.kwin.exe = '/usr/bin/foreign';
  assert.throws(() => proveCompositorRoles(f.family, f.p, f.receipts, opts(f)), /Unexpected/); assert.equal(pauses.length, 0);
  // permanently mid-exec: bounded retries, then the error surfaces
  pauses.length = 0; f = socketFixture(); f.deps.inspect = pid => (pid === 21 ? { ...f.kwin, home: undefined } : settled(pid));
  assert.throws(() => proveCompositorRoles(f.family, f.p, f.receipts, { ...opts(f), attempts: 4 }), /Role executable changing/); assert.equal(pauses.length, 3);
});
test('controller always yields retirement evidence, even with no worker receipt, an unconfirmed stop or an oversized receipt', async () => {
  const make = () => { const w = new EventEmitter(); w.connected = true; w.send = (m, cb) => cb?.(); w.disconnect = () => { w.connected = false; w.emit('disconnect'); }; return w; };
  // 1. worker dies without any receipt
  let w = make(); let c = new CompositorController(w); c.reservation = '/tmp/perf-lab-x/reservation';
  w.emit('message', { event: { type: 'ready' } }); w.connected = false; w.emit('disconnect'); w.emit('exit', 2, null);
  let written; let receipt = await c.writeRetirement('/x/retirement.json', (p, v) => { written = { p, v }; });
  assert.equal(written.p, '/x/retirement.json'); assert.equal(written.v.cleanupConfirmed, false); assert.match(written.v.missingWorkerReceipt, /no retirement receipt/);
  assert.equal(receipt.actualRetirement.code, 2);
  // 2. worker receipt present but unconfirmed (stop() rejects): the file is still written with the survivors
  w = make(); c = new CompositorController(w);
  w.emit('message', { event: { type: 'ready' } });
  w.emit('message', { final: { reason: 'startup: x', cleanupConfirmed: false, family: { cleanupConfirmed: false, survivors: [{ pid: 721002, starttime: '1' }] }, pipes: { exited: true, closed: true }, helpers: null, descriptor: {} } });
  w.connected = false; w.emit('disconnect'); w.emit('exit', 2, null);
  written = null; await c.writeRetirement('/x/r2.json', (p, v) => { written = v; });
  assert.equal(written.cleanupConfirmed, false); assert.equal(written.workerReceipt.family.survivors[0].pid, 721002); assert.match(written.stopError, /unconfirmed/);
  // 3. the full write fails (too large): a verdict-only file is still written
  w = make(); c = new CompositorController(w); w.emit('message', { event: { type: 'ready' } });
  w.emit('message', { final: { reason: 'r', cleanupConfirmed: true, family: { cleanupConfirmed: true, survivors: [] }, pipes: { exited: true, closed: true }, helpers: null, descriptor: {} } });
  w.connected = false; w.emit('disconnect'); w.emit('exit', 0, null);
  const calls = []; await c.writeRetirement('/x/r3.json', (p, v) => { calls.push(v); if (calls.length === 1) throw Error('Protocol record budget exceeded'); });
  assert.equal(calls.length, 2); assert.equal(calls[1].workerReceipt.cleanupConfirmed, true); assert.match(calls[1].writeNote, /budget/);
});
