// Linux fixed-purpose adapter. No shell, configurable command or public PID API.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, writeSync, readSync, realpathSync, lstatSync, fstatSync, opendirSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnedProcesses, boundedProcPids, isTransientProcError } from './owned-processes.mjs';
import { inspectExecIdentity, sleep } from './supervised-launch-linux.mjs';
import {
  CompositorConfiguration, helperCommand, helperEnvironment, verifyHelperIdentity, createHelperOutputCollector, HelperExecEvidence, HELPER_CAPS,
} from './supervised-compositor-helpers.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';
import { assertProtocolEnvelope } from './supervised-protocol.mjs';
import { captureKwinFileProof, verifyKwinBinary, proveInferredKwin, provePeerOwner, defaultInferredState } from './supervised-compositor-inferred.mjs';
import { compositorCommand, compositorBusConfiguration, COMPOSITOR_KWINRC, compositorEnvironment, validateCompositorPlan, SYSTEM_EXECUTABLES, COMPOSITOR_CAPS as CAPS } from './supervised-compositor-policy.mjs';
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
export function authorizeCompositorExecutables({inferred=defaultInferredState()}={}) {
  // WHY: PATH resolution and writable directory ancestry are not executable
  // authority. The fixed /usr/bin names are independently rechecked in worker.
  for(const path of ['/','/usr','/usr/bin']) {
    const st=lstatSync(path);
    if(!st.isDirectory() || st.isSymbolicLink() || ![0,process.getuid()].includes(st.uid) || (st.mode&0o022))throw Error('Untrusted system directory');
  }
  const receipts=Object.fromEntries(SYSTEM_EXECUTABLES.map(name=>[name,verifySystemExecutable(name)]));
  // WHY: kwin alone may later be proven without reading its exe (file capability).
  // That inference is only as good as the binary it names, so the receipt also
  // pins size/mtime/ctime and the exact file capability (any other set refuses).
  receipts.kwin_wayland.fileProof=captureKwinFileProof(inferred);
  return receipts;
}
export function reauthorizeCompositorExecutables(receipts,{inferred=defaultInferredState()}={}) {
  assertProtocolEnvelope(receipts);const actual=authorizeCompositorExecutables({inferred});
  if(Object.keys(receipts).length!==SYSTEM_EXECUTABLES.length || SYSTEM_EXECUTABLES.some(name=>actual[name].path!==receipts[name]?.path || !sameIdentity(actual[name].identity,receipts[name]?.identity)))throw Error('System ELF receipt changed');
  // Pre-launch half of the kwin binary proof: byte-level stat identity and exact capability.
  verifyKwinBinary(receipts.kwin_wayland,inferred);
  return actual;
}
// WHY (helper-hardening-3): a poll that lands mid-execve reads the NEW executable with an still-empty
// environ, so HOME is unreadable for an instant. That threw "Post-exec wrapper executable/identity
// mismatch", aborted startup after kwin was already forking, and left an unverifiable orphan. An
// unreadable HOME is "not observable yet" (retry within the startup bound), never a match; every
// definite difference still fails closed and now names the failing FIELDS only.
export function wrapperPostExecDecision(r,leader,receipt,plan,uid,parentPid,gateExe) {
  if(!r)return 'transient';
  if(r.exe===gateExe)return 'gate';
  const homeUnreadable=r.home===null||r.home===undefined;
  const failed=[!sameProcess(r,leader)&&'process',r.uid!==uid&&'uid',(!homeUnreadable&&r.home!==plan.home)&&'home',
    r.exe!==receipt.path&&'exe',!sameIdentity(r.executableIdentity,receipt.identity)&&'executableIdentity',
    r.ppid!==parentPid&&'ppid',r.session!==r.pid&&'session',r.pgrp!==r.pid&&'pgrp'].filter(Boolean);
  if(failed.length)throw Error(`Post-exec wrapper executable/identity mismatch (${failed.join(',')})`);
  return homeUnreadable?'transient':'ok';
}
// Wraps an exec-identity reader for a startup poll: transient read failures (exec in flight, process
// vanishing mid-read) count as "not observable yet" up to maxConsecutive polls; the (maxConsecutive+1)-th
// consecutive failure is thrown as-is, and any other error class is thrown at once.
export function makeTolerantInspect(inspect,{maxConsecutive=100}={}) {
  let streak=0;
  return pid=>{
    try {const r=inspect(pid);streak=0;return r;}
    catch(error) {if(!isTransientProcError(error) || ++streak>maxConsecutive)throw error;return null;}
  };
}
function matchesRole(record,receipt,plan,uid) {
  return record && record.uid===uid && record.home===plan.home && record.exe===receipt.path && sameIdentity(record.executableIdentity,receipt.identity);
}
// WHY: the 2026-10-21 inferred-kwin attempt died with a bare "Unexpected compositor
// descendant/role executable" and no way to tell WHICH member or condition refused.
// Every role refusal now carries this bounded, privacy-safe object (pid/starttime/
// state, the failed condition, a receipted executable NAME or 'unreceipted', booleans
// for uid/home, and the parent relation). It never carries HOME, paths, argv or
// environ, and it only describes the refusal: no proof is relaxed by building it.
const REFUSAL_MESSAGE_CAP = 450;
export function describeRoleRefusal(condition, member, record, receipts, plan, uid, relations = {}) {
  const exe = record?.exe;
  const named = typeof exe === 'string' ? SYSTEM_EXECUTABLES.find(name => receipts?.[name]?.path === exe) : undefined;
  const ppid = member?.ppid;
  const parent = ppid === undefined ? 'other'
    : ppid === relations.wrapperPid ? 'child-of-wrapper'
    : ppid === relations.kwinPid ? 'child-of-kwin'
    : ppid === relations.daemonPid ? 'child-of-daemon' : 'other';
  // WHY: an unreceipted child of kwin was refused at runtime (inferred-kwin-ready-4) and the
  // report could not say what it was. A basename under /usr/bin or /usr/lib is a distro
  // program name, not private data; anything elsewhere stays 'unreceipted'. Diagnostic only.
  const systemName = typeof exe === 'string' && /^\/usr\/(bin|lib|libexec)\/[A-Za-z0-9._\/+-]{1,200}$/.test(exe) && !exe.includes('..')
    ? exe.split('/').pop().slice(0, 64) : null;
  return { condition: String(condition).slice(0, 64), pid: member?.pid ?? null, starttime: member?.starttime ?? null, state: member?.state ?? null,
    exe: named ?? 'unreceipted', systemProgram: named ? null : systemName, uidMatches: record ? record.uid === uid : null, homeMatchesPlan: record ? record.home === plan.home : null, parent };
}
function roleRefusal(message, reason) {
  const error = Error(`${message} ${JSON.stringify(reason)}`.slice(0, REFUSAL_MESSAGE_CAP));
  error.reason = reason;
  return error;
}
// First receipt field that differs, for the role's own receipt.
function receiptMismatchField(record, receipt, plan, uid) {
  if (record.uid !== uid) return 'uid';
  if (record.home !== plan.home) return 'home';
  if (record.exe !== receipt.path) return 'exe';
  if (!sameIdentity(record.executableIdentity, receipt.identity)) return 'executableIdentity';
  return 'unknown';
}
// WHY (helper-hardening-3): the same execve race that broke the wrapper proof exists for the daemon and
// kwin: a poll can land on a forked-but-not-yet-exec'd copy of the wrapper, on a process whose environ is
// momentarily empty, or between two reads that straddle the exec. Those are "not observable yet", marked
// error.transient and retried a few times with a short pause; the final attempt's error is thrown
// unchanged, and a stable readable wrong value is never transient, so no proof is relaxed.
const TRANSIENT_ROLE_ATTEMPTS=6,TRANSIENT_ROLE_PAUSE_MS=20;
const defaultPause=ms=>{try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}catch{/* no pause available: retries still bounded */}};
const transient=error=>Object.assign(error,{transient:true});
export function proveCompositorRoles(family,plan,receipts,options={}) {
  const {pause=defaultPause,attempts=TRANSIENT_ROLE_ATTEMPTS}=options;
  for(let n=1;;n++) {
    try {return proveCompositorRolesOnce(family,plan,receipts,options);}
    catch(error) {if(error?.transient!==true || n>=attempts)throw error;pause(TRANSIENT_ROLE_PAUSE_MS);}
  }
}
function proveCompositorRolesOnce(family,plan,receipts,{inspect=inspectExecIdentity,uid=process.getuid(),gid=process.getgid(),inferred=null}={}) {
  const snapshot=family.sample();
  if(snapshot.members.length>CAPS.members)throw Error('Compositor role member cap');
  const roles={wrapper:null,kwin:null,daemon:null};
  const deferred=[];
  // Relations are read lazily: a role found earlier in the loop (or the deferred
  // inferred kwin candidate) is the parent a later member is described against.
  const relations=()=>({wrapperPid:family.leader?.pid,kwinPid:roles.kwin?.pid??deferred[0]?.pid,daemonPid:roles.daemon?.pid});
  for(const member of snapshot.members) {
    if(['Z','X'].includes(member.state))throw roleRefusal('Compositor role exited; ownership incomplete',describeRoleRefusal('member-exited',member,null,receipts,plan,uid,relations()));
    family.protect(member);
    let a,b;
    try {a=inspect(member.pid);b=inspect(member.pid);}
    catch(error) {
      // WHY: the ONLY tolerated read failure is EACCES on one non-leader member,
      // and only to hand it to the kwin-specific inferred proof below. That proof
      // refuses unless environ AND exe are both EACCES and the kernel's capability
      // sets show the exact file capability. Wrapper/daemon roles, every other
      // errno and a second EACCES member stay hard failures.
      if(error?.code!=='EACCES' || member.pid===family.leader.pid || deferred.length) {
        // Same error object/code as before (callers key on error.code); a reason is only attached.
        const why=member.pid===family.leader.pid?'unreadable-leader':deferred.length&&error?.code==='EACCES'?'second-unreadable-member':`unreadable:${String(error?.code??'ERR').slice(0,16)}`;
        if(error&&typeof error==='object'&&!error.reason)error.reason=describeRoleRefusal(why,member,null,receipts,plan,uid,relations());
        // exec/vanish race: same error and reason, but flagged so the caller's bounded retry may re-poll.
        if(isTransientProcError(error))error.transient=true;
        throw error;
      }
      deferred.push(member);continue;
    }
    // Same process but exe/identity/HOME moved between the two reads (or environ empty): exec in flight.
    if(sameProcess(a,member) && sameProcess(b,a) && (a.exe!==b.exe || !sameIdentity(a.executableIdentity,b.executableIdentity) || a.home!==b.home || b.home==null))throw transient(roleRefusal('Role executable changing (exec in flight)',describeRoleRefusal('exec-in-flight',member,b,receipts,plan,uid,relations())));
    // A forked, not-yet-exec'd copy of the wrapper (same receipted exe, child of the leader) is not a role yet.
    if(sameProcess(a,member) && member.pid!==family.leader.pid && b.ppid===family.leader.pid && b.exe===receipts['dbus-run-session']?.path && sameIdentity(b.executableIdentity,receipts['dbus-run-session'].identity) && b.uid===uid && b.home===plan.home)throw transient(roleRefusal('Wrapper fork not yet exec\'d',describeRoleRefusal('pre-exec-fork',member,b,receipts,plan,uid,relations())));
    if(!sameProcess(a,member) || !sameProcess(b,a) || a.exe!==b.exe || !sameIdentity(a.executableIdentity,b.executableIdentity))throw roleRefusal('Role PID/executable substitution',describeRoleRefusal('substitution',member,b,receipts,plan,uid,relations()));
    const role=member.pid===family.leader.pid?'wrapper':matchesRole(b,receipts.kwin_wayland,plan,uid)?'kwin':matchesRole(b,receipts['dbus-daemon'],plan,uid)?'daemon':null;
    const receipt=role==='wrapper'?receipts['dbus-run-session']:role==='kwin'?receipts.kwin_wayland:receipts['dbus-daemon'];
    if(!role)throw roleRefusal('Unexpected compositor descendant/role executable',describeRoleRefusal('no-role',member,b,receipts,plan,uid,relations()));
    if(roles[role])throw roleRefusal('Unexpected compositor descendant/role executable',describeRoleRefusal(`duplicate-role:${role}`,member,b,receipts,plan,uid,relations()));
    if(!matchesRole(b,receipt,plan,uid))throw roleRefusal('Unexpected compositor descendant/role executable',describeRoleRefusal(`receipt-mismatch:${receiptMismatchField(b,receipt,plan,uid)}`,member,b,receipts,plan,uid,relations()));
    if(role==='wrapper' && (!sameProcess(b,family.leader) || b.ppid!==family.leader.ppid || b.pgrp!==b.pid || b.session!==b.pid))throw roleRefusal('Post-exec wrapper identity mismatch',describeRoleRefusal('wrapper-identity',member,b,receipts,plan,uid,relations()));
    roles[role]={pid:b.pid,starttime:b.starttime};
  }
  if(!roles.wrapper)throw Error('Missing verified wrapper');
  if(deferred.length) {
    if(roles.kwin)throw roleRefusal('Duplicate/unexpected compositor role executable',describeRoleRefusal('duplicate-role:kwin',deferred[0],null,receipts,plan,uid,relations()));
    const table=new Map(snapshot.members.map(m=>[m.pid,m]));
    roles.kwin=proveInferredKwin({member:deferred[0],roles,table,plan,receipts,uid,gid,state:inferred??defaultInferredState()});
  }
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
function proveCompositorListener(family,plan,receipts,role,{canonical=realpathSync,lstat=lstatSync,table=()=>readBoundedText('/proc/net/unix',{maxBytes:CAPS.procUnixBytes}),fds=boundedFds,inspect=inspectExecIdentity,uid=process.getuid(),gid=process.getgid(),inferred=null}={},socketPath=plan.socketPath) {
  let st;
  try {st=lstat(socketPath);} catch(error){if(error.code==='ENOENT')return {owned:false,pending:true};throw error;}
  const valid=s=>s.isSocket() && !s.isSymbolicLink() && s.uid===uid;
  if(!valid(st) || canonical(socketPath)!==socketPath)throw Error('Foreign/noncanonical compositor socket');
  const text=table();if(typeof text!=='string' || Buffer.byteLength(text)>CAPS.procUnixBytes)throw Error('Unix table byte cap');
  const listeners=[];
  for(const line of text.split('\n').slice(1)) {
    const fields=line.trim().split(/\s+/);
    if(fields[7]!==socketPath)continue;
    // WHY: name the refused row's shape (field count, flags, type, state — no path, no inode) so a
    // runtime refusal says what the kernel actually listed instead of forcing another blind attempt.
    const shape=`fields=${fields.length} flags=${String(fields[3]).slice(0,8)} type=${String(fields[4]).slice(0,4)} st=${String(fields[5]).slice(0,2)} path=${socketPath===plan.socketPath?'wayland':'bus'}`;
    if(fields.length!==8 || fields[4]!=='0001' || !/^[1-9]\d*$/.test(fields[6]))throw Error(`Unexpected Unix socket listener state (${shape})`);
    // WHY: the kernel also lists each ACCEPTED connection under the listener's path (flags 0,
    // state 03 CONNECTED) — our own SO_PEERCRED probe or any client creates one. Those rows are
    // not listeners, so skip exactly that shape; every other non-listener shape still refuses.
    if(fields[3]==='00000000' && fields[5]==='03')continue;
    if(fields[3]!=='00010000' || fields[5]!=='01')throw Error(`Unexpected Unix socket listener state (${shape})`);
    listeners.push(fields[6]);
  }
  if(listeners.length!==1)throw Error('Missing/ambiguous Unix listener');
  const roles=proveCompositorRoles(family,plan,receipts,{inspect,uid,gid,inferred});
  const owner = roles[role];
  const expected = receipts[role === 'kwin' ? 'kwin_wayland' : 'dbus-daemon'];
  if(!owner || !family.known.has(owner.pid))throw Error('Listener lacks tracked fixed-role descendant');
  if(owner.inferred) {
    // WHY: kwin's fds are unreadable, so the kernel's own record of which process
    // listen()ed on this exact private path (SO_PEERCRED) replaces the fd proof.
    // Kwin-only by construction: inferred owners are produced for no other role.
    if(role!=='kwin')throw Error('Inferred ownership is kwin-only');
    const state=inferred??defaultInferredState();
    const peer=provePeerOwner({socketPath:socketPath,owner,uid,listenerKey:`${st.dev}:${st.ino}:${listeners[0]}`,state});
    const after=lstat(socketPath);
    if(!valid(after) || st.dev!==after.dev || st.ino!==after.ino || canonical(socketPath)!==socketPath)throw Error('Socket/owner substituted during proof');
    const now=state.deps.readProc(owner.pid);
    if(!now || now.starttime!==owner.starttime)throw Error('Listener role identity changed');
    family.protect(now);
    return {owned:true,pending:false,socketPath:socketPath,filesystemDevice:st.dev,filesystemInode:st.ino,kernelInode:listeners[0],owners:[{pid:owner.pid,starttime:owner.starttime}],
      ownerEvidence:{...owner.evidence,proofs:[...owner.evidence.proofs,'unix-table-single-listener','so-peercred-pid-uid-starttime'],peerPid:peer.pid,peerUid:peer.uid}};
  }
  const a=inspect(owner.pid);
  if(!sameProcess(a,owner) || !matchesRole(a,expected,plan,uid))throw Error('Listener role identity changed');
  const links=fds(a.pid);if(!Array.isArray(links) || links.length>CAPS.fdEntries)throw Error('Listener FD cap');
  if(!links.includes(`socket:[${listeners[0]}]`))throw Error('Unknown/foreign socket owner');
  const b=inspect(a.pid),after=lstat(socketPath);
  if(!sameProcess(a,b) || !matchesRole(b,expected,plan,uid) || !valid(after) || st.dev!==after.dev || st.ino!==after.ino || canonical(socketPath)!==socketPath)throw Error('Socket/owner substituted during proof');
  family.protect(b);
  // WHY: stat's filesystem inode is NOT the kernel socket inode from proc/net.
  return {owned:true,pending:false,socketPath:socketPath,filesystemDevice:st.dev,filesystemInode:st.ino,kernelInode:listeners[0],owners:[{pid:b.pid,starttime:b.starttime}]};
}
export function proveCompositorSocket(family, plan, receipts, options) {
  return proveCompositorListener(family, plan, receipts, 'kwin', options);
}

export function proveCompositorBusSocket(family, plan, receipts, options) {
  // Fixed private daemon listener only; no caller-selected paths or role names.
  // WHY: pass the real plan (role proofs revalidate it) and name the bus path separately.
  return proveCompositorListener(family, plan, receipts, 'daemon', options ?? {}, join(plan.runtime, 'bus'));
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
// WHY: same exact-identity/content check as bus.conf, so a swapped or edited private kwinrc
// (which could re-enable the input method or load other kwin plugins) refuses the launch.
export function verifyCompositorKwinConfiguration(plan,expectedIdentity,{lstat=lstatSync,canonical=realpathSync,read=path=>readBoundedText(path,{maxBytes:4096}),uid=process.getuid()}={}) {
  plan=validateCompositorPlan(plan);
  const path=join(plan.config,'kwinrc'),before=lstat(path);
  if(!before.isFile() || before.uid!==uid || (before.mode&0o777)!==0o600 || canonical(path)!==path || !sameIdentity(before,expectedIdentity) || read(path)!==COMPOSITOR_KWINRC || !sameIdentity(lstat(path),before))throw Error('Private kwin configuration identity/content changed');
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
  let busIdentity, kwinrcIdentity;
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
        // WHY: written only after the config dir was proven fresh+empty, exclusive-create 0600,
        // and re-verified below like bus.conf (see COMPOSITOR_KWINRC).
        const kwinrcPath = join(plan.config, 'kwinrc');
        writePrivateText(kwinrcPath, COMPOSITOR_KWINRC);
        kwinrcIdentity = identity(lstatSync(kwinrcPath));
      }
      verifyCompositorBusConfiguration(plan, busIdentity);
      if (!helper) verifyCompositorKwinConfiguration(plan, kwinrcIdentity);
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
      // WHY (helper-hardening-3): record the fork-time identity NOW, before the gate-ready wait and before
      // any exec proof, so every later failure can still retire exactly this family. If it cannot be
      // recorded, that is reported and the family keeps only the (weaker) capture-time authority.
      try { spawnedChild.recorded = family.noteSpawn(child.pid); }
      catch (error) { spawnedChild.recordError = String(error.message).slice(0, 160); }
      let ready=false,exited=false,closed=false,failure=null,released=false,disposed=false;
      let code = null, signal = null, completedExecution = null;
      const collector = createHelperOutputCollector(), started = performance.now();
      const tolerantWrapperInspect = makeTolerantInspect(inspectExecIdentity);
      // WHY: the 2 s compositor startup bound used to cap the WHOLE helper life inside corroborate, so a
      // healthy but slow kscreen-doctor timed out as "exec proof timeout" (inferred-kwin-ready-8). Helpers
      // are bounded by their own wall; the gate-ready wait has its own (python start-up) bound.
      const remainingStartup = () => helper
        ? Math.max(1, started + HELPER_CAPS.wallMs - performance.now())
        : CAPS.startupMs;
      const remainingGateReady = () => helper
        ? Math.max(1, Math.min(HELPER_CAPS.gateReadyMs, started + HELPER_CAPS.wallMs - performance.now()))
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
          await waitFor(()=>{if(failure)throw failure;if(exited)throw Error('Gate exited');family.pulse();return ready;},'gate ready', remainingGateReady());
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
          family.pulse();
          // WHY: the poll can land mid-execve (empty environ / starttime read straddling the exec); tolerate that.
          const r=tolerantWrapperInspect(child.pid);
          if(wrapperPostExecDecision(r,family.leader,receipts['dbus-run-session'],plan,process.getuid(),process.pid,python)!=='ok')return false;
          try {proveCompositorRoles(family,plan,receipts);}
          catch(error) {if(error?.transient===true)return false;throw error;}
          return true;
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
              // WHY: the gate executable is EXPECTED until execve completes (the receipt is written before
              // it), and a poll mid-exec can be unreadable. Only "role executable seen, then gate again"
              // is a revert; everything definitively wrong still throws inside tryObserve.
              const seenBefore = execEvidence.observed !== null;
              const nowRole = execEvidence.tryObserve(() => inspectExecIdentity(member.pid), family.leader,
                { path: command.binary, identity: command.identity }, plan, process.getuid(), python);
              if (seenBefore && !nowRole) throw Error('Helper unexpectedly reverted to gate executable');
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
