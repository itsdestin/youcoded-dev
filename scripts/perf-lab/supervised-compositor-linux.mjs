// Linux fixed-purpose adapter. No shell, configurable command or public PID API.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, writeSync, readSync, realpathSync, lstatSync, fstatSync, opendirSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnedProcesses, boundedProcPids } from './owned-processes.mjs';
import { inspectExecIdentity, sleep } from './supervised-launch-linux.mjs';
import {
  CompositorConfiguration, helperCommand, helperEnvironment, verifyHelperIdentity, createHelperOutputCollector, HelperExecEvidence, HELPER_CAPS,
} from './supervised-compositor-helpers.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { assertProtocolEnvelope } from './supervised-protocol.mjs';
import { compositorCommand, compositorBusConfiguration, compositorEnvironment, validateCompositorPlan, SYSTEM_EXECUTABLES, COMPOSITOR_CAPS as CAPS } from './supervised-compositor-policy.mjs';
const GATE=fileURLToPath(new URL('./supervised-exec-gate.py',import.meta.url));
const identity=st=>({dev:st.dev,ino:st.ino,uid:st.uid,mode:st.mode});
const sameIdentity=(a,b)=>a && b && ['dev','ino','uid','mode'].every(k=>a[k]===b[k]);
const sameProcess=(a,b)=>a && b && a.pid===b.pid && a.starttime===b.starttime;
const executableIO={canonical:realpathSync,lstat:lstatSync,open:path=>openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),fstat:fstatSync,head:fd=>{const b=Buffer.alloc(4);readSync(fd,b,0,4,0);return b;},close:closeSync};
export function verifySystemExecutable(name,uid=process.getuid(),io=executableIO) {
  if(!SYSTEM_EXECUTABLES.includes(name))throw Error('Unsupported system executable purpose');
  const path=io.canonical(`/usr/bin/${name}`);
  if(path!==`/usr/bin/${name}`)throw Error('Noncanonical system executable substitution');
  const st=io.lstat(path),fd=io.open(path);
  try {
    const opened=io.fstat(fd);
    if(!st.isFile() || !sameIdentity(st,opened) || ![0,uid].includes(opened.uid) || (opened.mode&0o6022)!==0 || !(opened.mode&0o100) || !io.head(fd).equals(Buffer.from([127,69,76,70])))throw Error('Untrusted system ELF identity/permissions');
    if(io.canonical(path)!==path || !sameIdentity(io.lstat(path),opened))throw Error('System executable replaced during verification');
    return {path,identity:identity(opened)};
  } finally {io.close(fd);}
}
export function authorizeCompositorExecutables() {
  // WHY: PATH resolution and writable directory ancestry are not executable
  // authority. The fixed /usr/bin names are independently rechecked in worker.
  for(const path of ['/','/usr','/usr/bin']) {
    const st=lstatSync(path);
    if(!st.isDirectory() || st.isSymbolicLink() || ![0,process.getuid()].includes(st.uid) || (st.mode&0o022))throw Error('Untrusted system directory');
  }
  return Object.fromEntries(SYSTEM_EXECUTABLES.map(name=>[name,verifySystemExecutable(name)]));
}
export function reauthorizeCompositorExecutables(receipts) {
  assertProtocolEnvelope(receipts);const actual=authorizeCompositorExecutables();
  if(Object.keys(receipts).length!==SYSTEM_EXECUTABLES.length || SYSTEM_EXECUTABLES.some(name=>actual[name].path!==receipts[name]?.path || !sameIdentity(actual[name].identity,receipts[name]?.identity)))throw Error('System ELF receipt changed');
  return actual;
}
function matchesRole(record,receipt,plan,uid) {
  return record && record.uid===uid && record.home===plan.home && record.exe===receipt.path && sameIdentity(record.executableIdentity,receipt.identity);
}
export function proveCompositorRoles(family,plan,receipts,{inspect=inspectExecIdentity,uid=process.getuid()}={}) {
  const snapshot=family.sample();
  if(snapshot.members.length>CAPS.members)throw Error('Compositor role member cap');
  const roles={wrapper:null,kwin:null,daemon:null};
  for(const member of snapshot.members) {
    if(['Z','X'].includes(member.state))throw Error('Compositor role exited; ownership incomplete');
    family.protect(member);
    const a=inspect(member.pid),b=inspect(member.pid);
    if(!sameProcess(a,member) || !sameProcess(b,a) || a.exe!==b.exe || !sameIdentity(a.executableIdentity,b.executableIdentity))throw Error('Role PID/executable substitution');
    const role=member.pid===family.leader.pid?'wrapper':matchesRole(b,receipts.kwin_wayland,plan,uid)?'kwin':matchesRole(b,receipts['dbus-daemon'],plan,uid)?'daemon':null;
    const receipt=role==='wrapper'?receipts['dbus-run-session']:role==='kwin'?receipts.kwin_wayland:receipts['dbus-daemon'];
    if(!role || roles[role] || !matchesRole(b,receipt,plan,uid))throw Error('Unexpected compositor descendant/role executable');
    if(role==='wrapper' && (!sameProcess(b,family.leader) || b.ppid!==family.leader.ppid || b.pgrp!==b.pid || b.session!==b.pid))throw Error('Post-exec wrapper identity mismatch');
    roles[role]={pid:b.pid,starttime:b.starttime};
  }
  if(!roles.wrapper)throw Error('Missing verified wrapper');
  return roles;
}
function boundedFds(pid) {
  const dir=opendirSync(`/proc/${pid}/fd`,{bufferSize:16}),result=[];
  try {
    for(let n=0;n<CAPS.fdEntries;n++) {
      const entry=dir.readSync();if(!entry)return result;
      try {result.push(readlinkSync(`/proc/${pid}/fd/${entry.name}`));}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    throw Error('Compositor FD enumeration cap');
  } finally {dir.closeSync();}
}
function proveCompositorListener(family,plan,receipts,role,{canonical=realpathSync,lstat=lstatSync,table=()=>readBoundedText('/proc/net/unix',{maxBytes:CAPS.procUnixBytes}),fds=boundedFds,inspect=inspectExecIdentity,uid=process.getuid()}={}) {
  let st;
  try {st=lstat(plan.socketPath);} catch(error){if(error.code==='ENOENT')return {owned:false,pending:true};throw error;}
  const valid=s=>s.isSocket() && !s.isSymbolicLink() && s.uid===uid;
  if(!valid(st) || canonical(plan.socketPath)!==plan.socketPath)throw Error('Foreign/noncanonical compositor socket');
  const text=table();if(typeof text!=='string' || Buffer.byteLength(text)>CAPS.procUnixBytes)throw Error('Unix table byte cap');
  const listeners=[];
  for(const line of text.split('\n').slice(1)) {
    const fields=line.trim().split(/\s+/);
    if(fields[7]!==plan.socketPath)continue;
    if(fields.length!==8 || fields[3]!=='00010000' || fields[4]!=='0001' || fields[5]!=='01' || !/^[1-9]\d*$/.test(fields[6]))throw Error('Unexpected Unix socket listener state');
    listeners.push(fields[6]);
  }
  if(listeners.length!==1)throw Error('Missing/ambiguous Unix listener');
  const roles=proveCompositorRoles(family,plan,receipts,{inspect,uid});
  const owner = roles[role];
  const expected = receipts[role === 'kwin' ? 'kwin_wayland' : 'dbus-daemon'];
  if(!owner || !family.known.has(owner.pid))throw Error('Listener lacks tracked fixed-role descendant');
  const a=inspect(owner.pid);
  if(!sameProcess(a,owner) || !matchesRole(a,expected,plan,uid))throw Error('Listener role identity changed');
  const links=fds(a.pid);if(!Array.isArray(links) || links.length>CAPS.fdEntries)throw Error('Listener FD cap');
  if(!links.includes(`socket:[${listeners[0]}]`))throw Error('Unknown/foreign socket owner');
  const b=inspect(a.pid),after=lstat(plan.socketPath);
  if(!sameProcess(a,b) || !matchesRole(b,expected,plan,uid) || !valid(after) || st.dev!==after.dev || st.ino!==after.ino || canonical(plan.socketPath)!==plan.socketPath)throw Error('Socket/owner substituted during proof');
  family.protect(b);
  // WHY: stat's filesystem inode is NOT the kernel socket inode from proc/net.
  return {owned:true,pending:false,socketPath:plan.socketPath,filesystemDevice:st.dev,filesystemInode:st.ino,kernelInode:listeners[0],owners:[{pid:b.pid,starttime:b.starttime}]};
}
export function proveCompositorSocket(family, plan, receipts, options) {
  return proveCompositorListener(family, plan, receipts, 'kwin', options);
}

export function proveCompositorBusSocket(family, plan, receipts, options) {
  // Fixed private daemon listener only; no caller-selected paths or role names.
  return proveCompositorListener(family, { ...plan, socketPath: join(plan.runtime, 'bus') }, receipts, 'daemon', options);
}

function writePrivateText(path,text) {
  if(Buffer.byteLength(text)>65536)throw Error('Private text byte cap');
  const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {const bytes=Buffer.from(text);for(let offset=0;offset<bytes.length;){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)throw Error('Short private plan write');offset+=n;}} finally {closeSync(fd);}
}
export function writeCompositorJson(path,value) {
  assertProtocolEnvelope(value);writePrivateText(path,JSON.stringify(value));
}
export function verifyCompositorBusConfiguration(plan,expectedIdentity,{lstat=lstatSync,canonical=realpathSync,read=path=>readBoundedText(path,{maxBytes:4096}),uid=process.getuid()}={}) {
  plan=validateCompositorPlan(plan);
  const path=join(plan.runDir,'bus.conf'),before=lstat(path);
  if(!before.isFile() || before.uid!==uid || (before.mode&0o777)!==0o600 || canonical(path)!==path || !sameIdentity(before,expectedIdentity) || read(path)!==compositorBusConfiguration(plan) || !sameIdentity(lstat(path),before))throw Error('Private bus configuration identity/content changed');
}
export function disposeCompositorChildResources(child) {
  // WHY: process.exitCode + IPC disconnect cannot drain a referenced child or
  // inherited output pipe whose writer survived unconfirmed cleanup. Detach only
  // OUR local handles; this never signals a process or fabricates exit/close.
  const errors=[],pipes=[...new Set([...(child.stdio??[]),child.stdin,child.stdout,child.stderr].filter(Boolean))];
  let pipeDestroyRequests=0,childUnrefRequested=false;
  for(const pipe of pipes) {
    try {pipe.destroy();pipeDestroyRequests++;}catch(error){errors.push(String(error.message).slice(0,256));}
    try {pipe.unref?.();}catch(error){errors.push(String(error.message).slice(0,256));}
  }
  try {child.unref();childUnrefRequested=true;}catch(error){errors.push(String(error.message).slice(0,256));}
  return {status:'local-handles-detached-not-child-retirement',pipeDestroyRequests,childUnrefRequested,errors};
}
export function verifyCompositorDirectories(plan) {
  plan=validateCompositorPlan(plan);
  for(const path of [dirname(plan.runDir),plan.runDir,plan.home,plan.config,plan.data,plan.cache,plan.runtime]) {
    const st=lstatSync(path);
    if(!st.isDirectory() || st.isSymbolicLink() || st.uid!==process.getuid() || (st.mode&0o777)!==0o700 || realpathSync(path)!==path)throw Error('Compositor directory must be fresh canonical private 0700');
  }
  // These directories are new, not copied profiles or reused compositor state.
  // Called only before exec; post-exec KWin may legitimately write private files.
  for(const path of [plan.home,plan.config,plan.data,plan.cache,plan.runtime]) {
    const directory=opendirSync(path,{bufferSize:1});
    try {if(directory.readSync())throw Error('Compositor HOME/config/data/cache/runtime must be fresh and empty');}
    finally {directory.closeSync();}
  }
}
async function waitFor(test,label,ms=CAPS.startupMs) {
  const end=performance.now()+ms;
  for(let n=0;n<Math.ceil(ms/10) && performance.now()<end;n++){const value=test();if(value)return value;await sleep(10);}
  throw Error(`Compositor ${label} timeout`);
}
export function assertFreshCompositorSocket(plan,{lstat=lstatSync}={}) {
  validateCompositorPlan(plan);
  // lstat, not exists/access: dangling symlinks also count as occupied paths.
  for(const path of [plan.socketPath,`${plan.socketPath}.lock`,join(plan.runtime,'bus'),join(plan.runtime,'no-system-bus')]) {
    try {lstat(path);throw Error('Existing compositor socket/lock rejected');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
export function prepareCompositorOwnership(plan, readers = {}, helper = false) {
  validateCompositorPlan(plan);
  // WHY: constructor validates the needle AND complete supervisor ancestry.
  // Do this before spawn, not after a child exists awaiting release authority.
  return new OwnedProcesses({ ...readers, jobDir: plan.runDir,
    maxMembers: helper ? HELPER_CAPS.members : CAPS.members, descendantsOnly: true,
    list: readers.list ?? (() => boundedProcPids({ maxEntries: CAPS.procEntries })) });
}
export function makeCompositorLinuxAdapters(plan, receipts, { persist, emit, output }) {
  validateCompositorPlan(plan);
  let busIdentity;
  const inspect = family => {
    proveCompositorRoles(family, plan, receipts);
    return proveCompositorSocket(family, plan, receipts);
  };

  // WHY: wrapper and helpers use one captured exec-gate implementation. This
  // closure is private: helper purpose/selection are minted by the fixed sequence,
  // never accepted as worker protocol commands or caller binary/argv/env.
  function spawnGateForPurpose(helper = null) {
      const family = prepareCompositorOwnership(plan, {}, helper !== null);
      reauthorizeCompositorExecutables(receipts);
      if (helper) {
        verifyCompositorBusConfiguration(plan, busIdentity);
        helper.proveSocket();
      } else {
        verifyCompositorDirectories(plan);
        assertFreshCompositorSocket(plan);
      }
      const python=realpathSync('/usr/bin/python3'),ps=lstatSync(python),gs=lstatSync(GATE);
      if(dirname(python)!=='/usr/bin' || !/^python3(?:\.\d+)?$/.test(python.slice(9)) || !ps.isFile() || ps.uid!==0 || (ps.mode&0o6022) || !gs.isFile() || gs.uid!==process.getuid() || (gs.mode&0o6022) || realpathSync(GATE)!==GATE)throw Error('Trusted Python/exec gate unavailable');
      if (!helper) {
        const busPath = join(plan.runDir, 'bus.conf');
        writePrivateText(busPath, compositorBusConfiguration(plan));
        busIdentity = identity(lstatSync(busPath));
      }
      verifyCompositorBusConfiguration(plan, busIdentity);
      const env = helper ? helperEnvironment(plan) : compositorEnvironment(plan);
      const command = helper ? helperCommand(receipts, helper.step, helper.selection) : compositorCommand(receipts, plan);
      const path = join(plan.runDir, helper ? `helper-${helper.step}-exec.json` : 'exec-plan.json');
      const execPlan = { ...command, env, ...(helper ? {
        helperProof: { purpose: helper.step, uid: process.getuid(), home: plan.home },
      } : {}) };
      writeCompositorJson(path, execPlan);
      const planDigest = createHash('sha256').update(JSON.stringify(execPlan)).digest('hex');
      const child=spawn(python,['-I','-S',GATE,path],{cwd:plan.home,env,detached:true,stdio:['ignore','pipe','pipe','pipe','pipe']});
      // A spawned PID alone is evidence, never ownership or signal authority.
      family.leaderPid = child.pid;
      const spawnedChild = { pid: child.pid ?? null, identityVerified: false };
      let ready=false,exited=false,closed=false,failure=null,released=false,disposed=false;
      let code = null, signal = null, completedExecution = null;
      const collector = createHelperOutputCollector(), started = performance.now();
      const remainingStartup = () => helper
        ? Math.max(1, Math.min(CAPS.startupMs, started + HELPER_CAPS.wallMs - performance.now()))
        : CAPS.startupMs;
      child.on('error',e=>{failure=e;});
      child.on('exit', (exitCode, exitSignal) => { exited = true; code = exitCode; signal = exitSignal; });
      child.on('close',()=>{closed=true;});
      const execEvidence = helper ? new HelperExecEvidence({ pid: child.pid, uid: process.getuid(),
        home: plan.home, purpose: helper.step, identity: command.identity, planDigest }) : null;
      child.stdio[4].on('data', bytes => {
        if (helper) {
          try { execEvidence.append(bytes); ready = execEvidence.ready; }
          catch (error) { failure = error; }
        } else if (!ready && bytes.equals(Buffer.from('G'))) ready = true;
        else failure = Error('Invalid exec gate packet');
      });
      child.stdio[4].on('end', () => { execEvidence?.end(); });
      for(const pipe of [child.stdout,child.stderr,child.stdio[3],child.stdio[4]])pipe.on('error',e=>{failure=e;});
      for (const name of ['stdout', 'stderr']) child[name].on('data', bytes => {
        if (!helper) { output(name, bytes); return; }
        output.retainHelper?.(name, bytes);
        if (failure) return;
        collector.append(name, bytes);
        try { collector.check(); } catch (error) { failure = error; }
      });
      return {child,get family(){return family;},
        disposeLocal: () => {
          disposed = true; // pending bounded output polls stop on their next turn
          return disposeCompositorChildResources(child);
        },
        async capture(){
          await waitFor(()=>{if(failure)throw failure;if(exited)throw Error('Gate exited');return ready;},'gate ready', remainingStartup());
          const observed = inspectExecIdentity(child.pid);
          if (observed) spawnedChild.observedIdentity = { pid: observed.pid, starttime: observed.starttime };
          // Observation is retained if the separate ownership proof fails below;
          // only family.leader/known can ever confer cleanup signal authority.
          family.captureExecGate({expectedExe:python,expectedUid:process.getuid(),expectedHome:plan.home,inspect:inspectExecIdentity});
        },
        release() {
          if (released || !family?.leader || failure || exited) throw Error('Gate release without captured identity');
          if (helper && performance.now() >= started + HELPER_CAPS.wallMs) throw Error('Helper startup deadline');
          reauthorizeCompositorExecutables(receipts);
          verifyCompositorBusConfiguration(plan, busIdentity);
          if (helper) helper.proveSocket();
          else assertFreshCompositorSocket(plan);
          released = true;
          child.stdio[3].end('R');
        },
        abort(){if(!released)child.stdio[3].destroy();},
        async corroborate(){await waitFor(()=>{
          if (failure) throw failure;
          if (helper) {
            return execEvidence.corroborate({ disposed, released, connected: process.connected,
              exited, closed, code, signal }, () => inspectExecIdentity(child.pid), family.leader,
              { path: command.binary, identity: command.identity }, plan, process.getuid(), python);
          }
          if(exited)throw Error('Wrapper exited');
          const r=inspectExecIdentity(child.pid);
          if(r?.exe===python)return false;
          if(!sameProcess(r,family.leader) || !matchesRole(r,receipts['dbus-run-session'],plan,process.getuid()) || r.ppid!==process.pid || r.session!==r.pid || r.pgrp!==r.pid)throw Error('Post-exec wrapper executable/identity mismatch');
          proveCompositorRoles(family,plan,receipts);return true;
        }, helper ? 'helper exec proof' : 'wrapper exec proof', remainingStartup());},
        async waitResult() {
          if (!helper) throw Error('Wrapper is not an output helper');
          await waitFor(() => {
            if (disposed || !process.connected) throw Error('Helper local resources retired/controller disconnected');
            if (failure) throw failure;
            if (performance.now() >= started + HELPER_CAPS.wallMs) throw Error('Helper wall timeout');
            const members = family.sample();
            const compositor = helper.compositorFamily.sample();
            if (members.members.length + compositor.members.length > CAPS.members) throw Error('Combined compositor/helper member cap');
            if (members.rssMb + compositor.rssMb > CAPS.maxRssMb) throw Error('Combined compositor/helper RSS cap');
            // Only the exact approved helper executable is expected. Additional
            // observed descendants remain owned for cleanup but fail inspection.
            for (const member of members.members) {
              if (['Z', 'X'].includes(member.state)) continue;
              if (member.pid !== child.pid) throw Error('Unexpected helper descendant');
              family.protect(member);
              let record;
              try { record = inspectExecIdentity(member.pid); }
              catch (error) {
                if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
                continue; // await exit/close; proc disappearance alone is not proof
              }
              if (!record) continue; // await independently observed exit/close below
              if (execEvidence.observe(record, family.leader,
                { path: command.binary, identity: command.identity }, plan, process.getuid(), python) !== true) {
                throw Error('Helper unexpectedly reverted to gate executable');
              }
            }
            return exited && closed;
          }, 'helper output', HELPER_CAPS.wallMs);
          if (failure || code !== 0 || signal) throw failure ?? Error('Helper exited nonzero');
          const execution = execEvidence.completed({ released, connected: process.connected,
            exited, closed, code, signal });
          completedExecution = { ...execution,
            capturedGate: { pid: family.leader.pid, starttime: family.leader.starttime,
              ppid: family.leader.ppid, expectedExe: python, uid: process.getuid(), home: plan.home } };
          return { ...collector.result(), code, signal, execution: completedExecution };
        },
        async waitClosed(ms) {
          try { await waitFor(() => exited && closed, 'pipe close', ms); }
          catch { /* Unconfirmed remains false; never signal by bare PID. */ }
          return { exited, closed, spawnedChild: { ...spawnedChild,
            identityVerified: !!family.leader, ...(family.leader ? { starttime: family.leader.starttime } : {}) },
            error: failure?.message ?? null, ...(helper ? { code, signal,
            ...(!completedExecution ? { gateEvidence: {
              kind: 'incomplete_helper_execution', authorizer: execEvidence.receipt,
              receiptPipeEOF: execEvidence.eof, runtimeExeObserved: execEvidence.observed !== null,
              observed: execEvidence.observed,
            } } : {}),
          } : {}) };
        }
      };
  }

  return {
    now: () => performance.now(), persist, emit, inspect, outputSnapshot: output.snapshot,
    spawnGate: () => spawnGateForPurpose(),
    createConfiguration(compositorFamily, proveSocket, deadline) {
      let busKey;
      const proveConnections = () => {
        verifyCompositorBusConfiguration(plan, busIdentity);
        const socket = proveSocket();
        const bus = proveCompositorBusSocket(compositorFamily, plan, receipts);
        if (bus.owned !== true) throw Error('Helper private bus listener not verified');
        const key = JSON.stringify(bus);
        if (busKey && key !== busKey) throw Error('Private bus listener substituted');
        busKey = key;
        const system = join(plan.runtime, 'no-system-bus');
        try { lstatSync(system); throw Error('Private nonexistent system-bus endpoint replaced'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        return socket;
      };
      return new CompositorConfiguration(plan, receipts, {
        now: () => performance.now(),
        note: (type, fields) => {
          const row = { revision: 1, type, ...fields };
          persist(row);
          emit(row);
        },
        proveSocket: proveConnections,
        spawnHelper: (step, selection) => spawnGateForPurpose({ step, selection, compositorFamily, proveSocket: proveConnections }),
      }, deadline);
    },
  };
}
