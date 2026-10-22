// Linux-only core-worker ownership. Never used by the shared app launcher.
import { opendirSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeOwnerNeedles } from './launch.mjs';
import { OWNER_MARKERS as MARKERS } from './owner-home.mjs';
import { procFailureSnapshot, createProcFailureRing, emitProcFailure } from './proc-forensics.mjs';
import { readBoundedText } from './lifecycle-evidence.mjs';

export const CONTAINMENT_LIMITS = 'Polling /proc identities, not pidfd-atomic signalling or arbitrary daemon containment: a helper that setsid and reparents between snapshots may be unseen. Summed RSS is not unique physical memory. Cleanup confirms observed disappearance across bounded rescans, not atomic containment. Zombies remain unconfirmed until externally reaped; synthetic positive disappearance relies on a private subreaper.';

// WHY: capping after readdir/filter/map allocates the full directory first.
// Bound the producer itself, counting ALL entries and closing on every exit.
export function* boundedProcPids({ open = path => opendirSync(path, { bufferSize: 32 }), maxEntries = 10000 } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000) throw Error('Invalid proc enumeration cap');
  const directory = open('/proc');
  try {
    for (let count=0; count<maxEntries; count++) {
      const entry=directory.readSync(); if(!entry) return;
      if (/^[1-9]\d*$/.test(entry.name)) { const pid=Number(entry.name); if(Number.isSafeInteger(pid)) yield pid; }
    }
    // Do not perform an extra unbounded lookahead: exactly-cap observations
    // remain explicitly truncated rather than asserting directory completion.
    throw Error('Proc enumeration cap reached; completeness unconfirmed');
  } finally { directory.closeSync(); }
}

// WHY (helper-hardening-3): the containment bound below compares a /proc start time (clock ticks since
// boot, USER_HZ=100 on Linux) with "now". Unreadable/garbled uptime yields null, which disables that one
// basis (fail closed): it can never grant authority.
export function bootTicks(read = path => readBoundedText(path, { maxBytes: 256 })) {
  try { const v = Number(String(read('/proc/uptime')).split(/\s+/)[0]); return Number.isFinite(v) && v >= 0 ? Math.floor(v * 100) : null; }
  catch { return null; }
}
const TRANSIENT_PROC_CODES = new Set(['EIDENTITYCHANGED', 'ESRCH', 'ENOENT']);
export const isTransientProcError = error => TRANSIENT_PROC_CODES.has(error?.code);

export function parseProcStat(text) {
  // WHY: comm may contain spaces and parentheses; field 22 is an opaque integer.
  const end = text.lastIndexOf(')'), pid = Number(text.slice(0, text.indexOf(' ')));
  const f = text.slice(end + 1).trim().split(/\s+/);
  if (end < 0 || !Number.isInteger(pid) || pid < 1 || f.length < 20 || !/^\d+$/.test(f[19])
    || !f.slice(1, 4).every(v => /^\d+$/.test(v))) throw new Error('Unreadable /proc stat identity');
  return { pid, state: f[0], ppid: Number(f[1]), pgrp: Number(f[2]), session: Number(f[3]), starttime: f[19] };
}

export function readProc(pid,{read=path=>readBoundedText(path,{maxBytes:65536}),onFailure,now=()=>performance.now(),phase='unspecified',intentionalTeardown=false}={}) {
  let rawStat=null,rawStatus=null,record=null,after=null,afterError=null,stage='read-stat-before',failureRecorded=false;
  const observe=(reason,error)=>{
    failureRecorded=true;
    const row=procFailureSnapshot({pid,operation:stage,phase,intentionalTeardown,at:now(),reason,errno:error?.code,rawStat,rawStatus,before:record,after,afterError});
    emitProcFailure(onFailure,row);
    if(error)try{error.procForensic=row;}catch{/*original failure remains authoritative*/}
  };
  try {
    try {rawStat=read(`/proc/${pid}/stat`,'utf8');stage='parse-stat-before';record=parseProcStat(rawStat);}
    catch(error){observe('read-or-parse-stat',error);if(['ENOENT','ESRCH'].includes(error.code))return null;throw error;}
    stage='read-cmdline';const cmdline=read(`/proc/${pid}/cmdline`,'utf8').replaceAll('\0',' ');
    stage='read-status';rawStatus=read(`/proc/${pid}/status`,'utf8');
    stage='parse-status';
    if(!/^Name:\s+.+/m.test(rawStatus)||!/^State:\s+[A-Z]/m.test(rawStatus))throw Error(`Malformed proc status for ${pid}`);
    const rss=/^VmRSS:\s+(\d+) kB/m.exec(rawStatus);
    if(/^VmRSS:/m.test(rawStatus)&&!rss)throw Error(`Malformed VmRSS proc status for ${pid}`);
    stage='read-stat-after';
    try{after=parseProcStat(read(`/proc/${pid}/stat`,'utf8'));}
    catch(error){afterError=error.code??'PARSE';if(['ENOENT','ESRCH'].includes(error.code)){observe('identity-disappeared',error);return null;}throw error;}
    stage='verify-identity';if(!same(after,record))throw Object.assign(Error(`PID ${pid} identity changed during proc read`),{code:'EIDENTITYCHANGED'});
    if(!rss){stage='missing-rss';observe('missing-rss');}
    return {...after,cmdline,rssMb:rss?Number(rss[1])/1024:null,memoryObservation:{status:rss?'measured':'incomplete',reason:rss?null:'VmRSS missing',statusState:/^State:\s+([A-Z])/m.exec(rawStatus)?.[1]??null,identityState:after.state,starttime:after.starttime}};
  }catch(error){
    // Extra identity probe supplies context ONLY. Parse/permission failures must
    // never become absence, zero memory or cleanup authority because it vanished.
    if(!after&&record){try{after=parseProcStat(read(`/proc/${pid}/stat`,'utf8'));}catch(e){afterError=e.code??'PARSE';}}
    if(!failureRecorded)observe(stage==='parse-status'?'parse-status':'proc-read-failed',error);
    if(['ENOENT','ESRCH'].includes(error.code)&&['ENOENT','ESRCH'].includes(afterError))return null;
    throw error;
  }
}
const same = (a, b) => a && b && a.pid === b.pid && a.starttime === b.starttime;

export class OwnedProcesses {
  constructor({ leaderPid, parentPid = process.pid, jobDir, maxMembers = 10000, descendantsOnly = false, read, procRead,
    list = boundedProcPids, uptimeTicks = bootTicks,
    signal = (pid, sig) => process.kill(pid, sig), now = Date.now,
    sleep = ms => new Promise(done => setTimeout(done, ms)) }) {
    // WHY: HOME in the private worker is not the owner's account authority.
    assertSafeOwnerNeedles([jobDir]);
    if (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 10000) throw Error('Invalid owned family member cap');
    this.procFailureRing=createProcFailureRing();this.procPhase='acquire';this.intentionalTeardown=false;
    const readOwned=read??(pid=>readProc(pid,{...(procRead?{read:procRead}:{}),phase:this.procPhase,intentionalTeardown:this.intentionalTeardown,now:()=>performance.now(),onFailure:row=>{
      if(pid===this.leaderPid||this.known?.has(pid)||this.uncertain?.has(pid))this.procFailureRing.record(row);
    }}));
    // WHY: compositor wrappers require positively observed descent, not numeric
    // session membership. Default app ownership policy remains unchanged.
    if (typeof descendantsOnly !== 'boolean') throw Error('Invalid descendant discovery policy');
    Object.assign(this, { leaderPid, parentPid, jobDir, maxMembers, descendantsOnly, read:readOwned, list, signal, now, sleep, uptimeTicks });
    // Spawn-time authority (see noteSpawn): null unless the SPAWNER recorded its own just-forked child.
    this.spawned = null; this.leaderAliveBound = null; this.contained = new Map(); this.containmentLog = [];
    this.unverifiedSeen = new Set(); this.sweepGaps = [];
    this.known = new Map(); this.uncertain = new Map(); this.errors = []; this.memoryErrors = []; this.memoryGaps = []; this.continuity = true; this.self = new Set();
    let pid = parentPid;
    for (let depth = 0; pid > 1; depth++) {
      if (depth >= 64 || this.self.has(pid)) throw new Error('Uncertain self ancestry');
      this.self.add(pid); const r = this.read(pid);
      if (!r) throw new Error('Missing self ancestry'); pid = r.ppid;
    }
  }

  // ---- Spawn-time containment authority (helper-hardening-3) -------------------------------------------
  // WHY: the supervisor forks the wrapper ITSELF, so the numeric pid it holds is not a guess: while that
  // child is unreaped the kernel cannot hand the pid to anyone else, and Node's detached spawn runs setsid()
  // before exec, so the child is its own session AND group leader (sid == pgid == pid) whose parent is us.
  // noteSpawn records (pid, starttime) at fork time, BEFORE any exec proof exists, so a startup/inspect
  // failure can still retire exactly this family. Nothing here is reachable from a caller-supplied pid.
  noteSpawn(pid) {
    if (this.spawned) throw Error('Spawn identity already recorded');
    if (!Number.isInteger(pid) || pid <= 1 || pid !== this.leaderPid) throw Error('Spawn identity must name the supervisor-forked leader');
    const ticks = this.uptimeTicks();
    const r = this.read(pid);
    if (!r || r.pid !== pid || r.ppid !== this.parentPid || r.pgrp !== pid || r.session !== pid) throw Error('Spawned child parent/session/group mismatch');
    this.protectContained(r);
    this.spawned = { pid, starttime: r.starttime };
    this.leaderAliveBound = ticks;
    return { ...this.spawned };
  }
  // Records "the leader was provably alive at boot-tick T". The uptime is read BEFORE the leader read, so T
  // is never later than the instant the leader was seen alive; a process whose start tick is strictly below
  // T therefore began while this pid was still held by our leader.
  pulse() {
    if (!this.spawned) return;
    try {
      const ticks = this.uptimeTicks(), r = this.read(this.spawned.pid);
      if (ticks !== null && r && r.starttime === this.spawned.starttime) this.leaderAliveBound = Math.max(this.leaderAliveBound ?? 0, ticks);
    } catch { /* an unreadable leader simply fails to extend the bound */ }
  }
  // Light protection for session-based targets: the full ancestry walk in protect() needs every parent to
  // be readable, which is exactly what fails for a reparented orphan. A session member is ours by session
  // lineage, so only "never self / an ancestor of the supervisor / pid<=1 / the live app" is required.
  protectContained(record) {
    if (record.pid <= 1 || this.self.has(record.pid)) throw Error(`Protected self/ancestor ${record.pid}`);
    if (MARKERS.some(m => record.cmdline.includes(m))) throw Error(`Protected cmdline for ${record.pid}`);
  }
  pruneContained() {
    for (const [pid, info] of this.contained) {
      const r = this.read(pid);
      // Gone, or the number now belongs to something else: the ORIGINAL identity is confirmed absent.
      if (!r || r.starttime !== info.starttime) { this.contained.delete(pid); this.known.delete(pid); }
    }
  }
  // Which evidence (if any) makes this session-S process a member of the family we spawned.
  // S == spawned.pid, and a process is in S only by inheriting it from a process already in S, so the
  // question is only whether S may have been EMPTY (and the number reused by a foreign setsid) meanwhile.
  containmentBasis(r, ctx) {
    const S = this.spawned.pid;
    if (r.session !== S) return null;
    if (r.pid === S) return r.starttime === this.spawned.starttime ? 'spawned-leader-identity' : null;
    // 1. Our leader still holds the pid (alive or unreaped zombie): S cannot have been reused.
    if (ctx.leaderHeld) return 'session-of-held-spawned-leader';
    const start = Number(r.starttime);
    if (!Number.isFinite(start)) return null;
    // 2. It began strictly before the last instant the leader was seen alive: it was born into OUR session.
    if (ctx.bound !== null && start < ctx.bound) return 'started-while-spawned-leader-alive';
    // 3. A previously authorised member that is still the same identity has held S continuously since it
    //    was born (born while the leader was alive), so everything now in S descends from our session.
    if (ctx.anchor && start >= ctx.anchor) return 'session-held-by-authorised-member';
    return null;
  }
  // One bounded scan of the session we created. signal=null observes and adopts only. Per-process signals
  // only (never kill(-pgid)): each target is re-read immediately before the signal and must still be the
  // identical (pid, starttime, session). Returns what is live and what could not be proven ours.
  containmentSweep(sig = null) {
    if (!this.spawned) return { authorised: [], unverified: [], refused: [], complete: true, signalled: [] };
    const S = this.spawned.pid, gaps = [], table = [];
    try { this.pruneContained(); } catch (error) { gaps.push({ pid: null, code: String(error.code ?? error.message).slice(0, 64) }); }
    try {
      let scanned = 0;
      for (const pid of this.list()) {
        if (++scanned > 10000) throw Error('Proc enumeration cap exceeded');
        try { const r = this.read(pid); if (r && r.session === S) table.push(r); }
        catch (error) { if (gaps.length < 8) gaps.push({ pid, code: String(error.code ?? 'ERR').slice(0, 16) }); }
      }
    } catch (error) { gaps.push({ pid: null, code: String(error.message).slice(0, 64) }); }
    const leader = table.find(r => r.pid === S);
    const ctx = { leaderHeld: !!leader && leader.starttime === this.spawned.starttime, bound: this.leaderAliveBound, anchor: null };
    if (ctx.leaderHeld) this.pulse();
    ctx.bound = this.leaderAliveBound;
    // Anchor: any recorded non-leader member still present with an unchanged identity inside S, that was
    // born while the leader was alive (so S was continuously ours up to it).
    for (const old of this.known.values()) {
      if (old.pid === S) continue;
      const r = table.find(t => t.pid === old.pid);
      if (r && r.starttime === old.starttime && ctx.bound !== null && Number(old.starttime) < ctx.bound) {
        ctx.anchor = Math.min(ctx.anchor ?? Infinity, Number(old.starttime));
      }
    }
    const out = { authorised: [], unverified: [], refused: [], signalled: [], complete: gaps.length === 0, gaps };
    for (const r of table) {
      const basis = this.containmentBasis(r, ctx);
      const brief = { pid: r.pid, starttime: r.starttime, state: r.state, ppid: r.ppid };
      if (!basis) { out.unverified.push({ ...brief, reason: 'no-authority-for-session-occupant' }); this.unverifiedSeen.add(`${r.pid}:${r.starttime}`); continue; }
      try { this.protectContained(r); } catch (error) { out.refused.push({ ...brief, basis, reason: String(error.message).slice(0, 96) }); continue; }
      if (this.known.size >= this.maxMembers && !this.known.has(r.pid)) { out.refused.push({ ...brief, basis, reason: 'member-cap' }); continue; }
      if (!this.contained.has(r.pid) && !this.known.has(r.pid)) this.contained.set(r.pid, { starttime: r.starttime, basis });
      if (this.contained.has(r.pid)) this.known.set(r.pid, { ...r });
      out.authorised.push({ ...brief, basis });
      if (sig && !['Z', 'X'].includes(r.state)) {
        try {
          // Fence: identical identity, immediately before the signal.
          const fresh = this.read(r.pid);
          if (!fresh) continue;
          if (fresh.starttime !== r.starttime || fresh.session !== S || fresh.pid !== r.pid) { out.refused.push({ ...brief, basis, reason: 'identity-changed-before-signal' }); continue; }
          if (!['Z', 'X'].includes(fresh.state)) { this.signal(r.pid, sig); out.signalled.push({ ...brief, basis, signal: sig }); }
        } catch (error) { if (error.code !== 'ESRCH') out.refused.push({ ...brief, basis, reason: String(error.message).slice(0, 96) }); }
      }
    }
    for (const entry of out.signalled) if (this.containmentLog.length < 64) this.containmentLog.push(entry);
    this.sweepGaps = gaps;
    return out;
  }
  rememberError(error) {
    if(error.procForensic)this.procFailureRing.record(error.procForensic);
    // WHY: memory sampling validity and ownership cleanup are different proofs.
    // A lost RSS observation is never a measured zero and still stops monitoring,
    // but cannot permanently deny later independently observed PID disappearance.
    const target=error.code==='PROC_MEMORY_GAP'?this.memoryErrors:this.errors;
    if (!target.includes(error.message)) target.push(error.message);
    if(error.code==='PROC_MEMORY_GAP'&&this.memoryGaps.length<128)this.memoryGaps.push(error.observation);
  }
  protect(record) {
    if (record.pid <= 1) throw new Error('Protected pid <= 1');
    let r = record; const seen = new Set();
    for (let depth = 0; r && r.pid > 1; depth++) {
      if (depth >= 64 || seen.has(r.pid)) throw new Error(`Uncertain protection ancestry for ${record.pid}`);
      seen.add(r.pid);
      if (this.self.has(r.pid)) {
        if (r.pid === record.pid) throw new Error(`Protected self/ancestor ${r.pid}`);
        return;
      }
      if (MARKERS.some(m => r.cmdline.includes(m))) throw new Error(`Protected cmdline/ancestor for ${record.pid}`);
      if (r.ppid <= 1) return;
      const parent = this.read(r.ppid);
      if (!parent) throw new Error(`Missing protection ancestry for ${record.pid}`);
      r = parent;
    }
  }
  capture() {
    const r = this.read(this.leaderPid);
    if (!r || r.ppid !== this.parentPid || r.pgrp !== r.pid || r.session !== r.pid || !r.cmdline.includes(this.jobDir)) {
      throw new Error('Detached private launch identity/parent/group mismatch');
    }
    this.protect(r); this.known.set(r.pid, r); this.leader = { ...r }; return this.sample();
  }
  // WHY: the exec gate deliberately has no package marker in argv. This narrow
  // path proves a direct child held BEFORE exec, without relaxing capture().
  // Evidence reader must bracket /proc identity + UID/exe/HOME reads.
  captureExecGate({ expectedExe, expectedUid, expectedHome, inspect }) {
    if (this.leader || typeof inspect !== 'function' || !expectedExe?.startsWith('/') || !Number.isInteger(expectedUid) || expectedUid < 0 || expectedHome !== join(this.jobDir, 'home')) throw Error('Invalid exec gate capture policy');
    const a = inspect(this.leaderPid), r = this.read(this.leaderPid), b = inspect(this.leaderPid);
    const valid = e => e && same(e, r) && e.exe === expectedExe && e.uid === expectedUid && e.home === expectedHome && e.ppid === this.parentPid && e.pgrp === e.pid && e.session === e.pid;
    if (!r || !valid(a) || !valid(b) || r.ppid !== this.parentPid || r.pgrp !== r.pid || r.session !== r.pid) throw Error('Exec gate identity/UID/exe/HOME/parent mismatch');
    this.protect(r); this.known.set(r.pid, r); this.leader = { ...r };
    return this.sample();
  }
  sample() {
    if(!this.intentionalTeardown)this.procPhase='sample';
    if (!this.leader) throw new Error('Leader identity not captured');
    if (this.spawned) { this.pulse(); this.pruneContained(); }
    const table = new Map();
    try {
      // WHY: enumeration and reads are not one snapshot. An anchor observed just
      // before enumeration preserves authority for this bounded terminal rescan,
      // not for an arbitrary later occupant of the numeric session.
      let openingAnchor = false;
      for (const old of this.known.values()) {
        const r = this.read(old.pid);
        if (r && !same(r, old)) throw new Error(`PID ${old.pid} reuse/identity mismatch`);
        if (r?.session === this.leader.session) openingAnchor = true;
      }
      const enumerate = () => {
        let scanned = 0;
        for (const pid of this.list()) { if (++scanned > 10000) throw Error('Proc enumeration cap exceeded'); const r = this.read(pid); if (r) table.set(pid, r); }
      };
      enumerate();
      if (this.continuity && openingAnchor && ![...this.known.values()].some(old => same(table.get(old.pid), old))) {
        table.clear(); enumerate();
      }
      for (const [pid, old] of this.known) {
        // Directory enumeration is not disappearance evidence for a known PID.
        if (!table.has(pid)) { const r = this.read(pid); if (r) table.set(pid, r); }
        const current = table.get(pid);
        if (current && !same(current, old)) throw new Error(`PID ${pid} reuse/identity mismatch`);
      }
      // WHY: a numeric group/session is not an identity. Once the last recorded
      // anchor leaves it, no later occupant may revive that discovery authority.
      const anchored = [...this.known.values()].some(old => {
        const r = table.get(old.pid); return same(r, old) && r.session === this.leader.session;
      });
      const scanAuthority = !this.descendantsOnly && this.continuity && (anchored || openingAnchor);
      let changed = true;
      while (changed) {
        changed = false;
        for (const r of table.values()) {
          if (this.known.has(r.pid)) continue;
          const recordedParent = this.known.get(r.ppid);
          const privateSession = r.session === this.leader.session;
          if (!recordedParent && !(privateSession && scanAuthority)) continue;
          // A table entry can predate PID reuse. Bracket a fresh child read with
          // fresh parent identities; never infer descent from a stale PPid alone.
          const parent = recordedParent && this.read(r.ppid);
          if (parent && !same(parent, recordedParent)) throw new Error(`Parent ${r.ppid} reuse/identity mismatch`);
          const current = this.read(r.pid);
          if (!current) continue;
          if (!same(current, r) || current.ppid !== r.ppid || current.session !== r.session) throw new Error(`Child ${r.pid} ancestry changed during adoption`);
          const parentAfter = recordedParent && this.read(current.ppid);
          if (parentAfter && !same(parentAfter, recordedParent)) throw new Error(`Parent ${r.ppid} reuse/identity mismatch`);
          const descendant = same(parent, recordedParent) && same(parentAfter, recordedParent);
          if (!descendant && !(privateSession && scanAuthority)) throw new Error(`Missing verified parent for ${r.pid}`);
          if (descendant) { this.protect(parent); this.protect(parentAfter); }
          if (this.known.size >= this.maxMembers || this.uncertain.size >= this.maxMembers) throw Error('Owned family member cap exceeded; discovery incomplete');
          this.uncertain.set(r.pid, { ...current, verified: false });
          this.protect(current); this.known.set(r.pid, { ...current }); table.set(r.pid, current);
          this.uncertain.delete(r.pid); changed = true;
        }
      }
      this.continuity &&= [...this.known.values()].some(old => {
        const r = table.get(old.pid); return same(r, old) && r.session === this.leader.session;
      });
      // WHY: descendant-only discovery must still detect unobserved reparented
      // occupants of the original session after its last known anchor is lost.
      // This is negative completeness evidence ONLY: never adopt or signal them.
      if (!this.continuity) {
        // WHY: an uncertain occupant that is now confirmed absent (or whose number was reused, i.e. the
        // ORIGINAL identity is gone) is no longer an unverified occupant; without this the entry made
        // every later scan throw even after the occupant was retired.
        for (const [pid, old] of this.uncertain) { const cur = table.get(pid); if (!cur || cur.starttime !== old.starttime) this.uncertain.delete(pid); }
        for (const r of table.values()) {
          if (r.session === this.leader.session && !this.known.has(r.pid)) {
            if (this.uncertain.size >= this.maxMembers) throw Error('Uncertain family member cap exceeded');
            this.uncertain.set(r.pid, { ...r, verified: false });
          }
        }
        if (this.uncertain.size) throw new Error('Private session continuity lost; unverified occupants remain');
      }
      const members = [...this.known.values()].map(old => table.get(old.pid)).filter(Boolean);
      let rssMb = 0;
      for (const r of members) {
        if (!this.contained.has(r.pid)) this.protect(r);
        if (r.state !== 'Z' && r.state !== 'X') {
          if (!Number.isFinite(r.rssMb) || r.rssMb < 0) throw Object.assign(new Error(`Missing RSS for ${r.pid}`),{
            code:'PROC_MEMORY_GAP',observation:{pid:r.pid,starttime:r.starttime,state:r.state,at:this.now(),detail:r.memoryObservation??null}});
          rssMb += r.rssMb;
        }
      }
      return { members, rssMb };
    } catch (error) { this.rememberError(error); throw error; }
  }
  signalAll(sig) {
    this.procPhase=this.intentionalTeardown?'cleanup-signal':'signal';
    // No negative PGID signals: each target gets an independent identity and fence
    // re-read. There remains a kernel TOCTOU window; this is not pidfd atomicity.
    for (const old of this.known.values()) {
      if (this.contained.has(old.pid)) continue; // signalled by containmentSweep under its own fence
      try {
        const r = this.read(old.pid); if (!r) continue;
        if (!same(r, old)) throw new Error(`PID ${old.pid} reuse before signal`);
        this.protect(r);
        const final = this.read(old.pid);
        // WHY: readProc's confirmed absence is not a replacement identity. An
        // exit between the two reads needs no signal; cleanup still requires
        // independent empty rescans and retains all historical ownership errors.
        if (final === null) continue;
        if (!same(final, old)) throw new Error(`PID ${old.pid} identity changed before signal`);
        this.protect(final);
        if (final.state !== 'Z' && final.state !== 'X') this.signal(old.pid, sig);
      } catch (error) { if (error.code !== 'ESRCH') this.rememberError(error); }
    }
  }
  survivors() {
    return [...this.known.values(), ...this.uncertain.values()].flatMap(old => {
      try { const r = this.read(old.pid); return r ? [{ ...old, currentStarttime: r.starttime, state: r.state }] : []; }
      catch (e) { this.rememberError(e); return [{ ...old, unreadable: true }]; }
    });
  }
  async cleanup({ termWaitMs = 500, killWaitMs = 1000, everyMs = 25 } = {}) {
    if (![termWaitMs, killWaitMs, everyMs].every(v => Number.isFinite(v) && v > 0 && v <= 10000)) throw new Error('Invalid cleanup bounds');
    this.intentionalTeardown=true;this.procPhase='cleanup-scan';
    let lastSweep = null;
    // WHY (helper-hardening-3): the session sweep runs FIRST in every scan so that members proven ours by
    // spawn-time authority are adopted before sample() judges the family (sample() would otherwise throw
    // "continuity lost" about the very orphan the sweep is about to prove and retire).
    const scan = () => {
      this.procPhase='cleanup-scan'; let empty = true;
      if (this.spawned) {
        try { lastSweep = this.containmentSweep(null); if (lastSweep.authorised.length || lastSweep.unverified.length || !lastSweep.complete) empty = false; }
        catch (error) { this.rememberError(error); empty = false; }
      }
      if (this.leader) { try { if (this.sample().members.length !== 0) empty = false; } catch { empty = false; } }
      return empty;
    };
    for (const [sig, budget] of [['SIGTERM', termWaitMs], ['SIGKILL', killWaitMs]]) {
      if (scan()) break;
      this.signalAll(sig);
      if (this.spawned) { this.procPhase='cleanup-signal'; try { lastSweep = this.containmentSweep(sig); } catch (error) { this.rememberError(error); } }
      const deadline = this.now() + budget;
      for (let n = 0; n <= Math.ceil(budget / everyMs); n++) {
        if (scan() || this.now() >= deadline) break;
        await this.sleep(Math.min(everyMs, deadline - this.now()));
      }
    }
    // A first empty enumeration is provisional. Give proc enumeration/reaping a
    // bounded stabilization interval, then independently observe disappearance.
    let empty = scan();
    if (empty) { await this.sleep(everyMs); empty = scan(); }
    const survivors = this.survivors();
    // An unverified-occupant complaint is retired ONLY when the final bounded rescans prove the session
    // empty and every occupant ever listed was either adopted-and-gone or never alive at the end; every
    // other error class (identity reuse, protection, unreadable) is kept untouched.
    const CONTINUITY = 'Private session continuity lost; unverified occupants remain';
    let resolvedErrors = [];
    if (empty && this.spawned && survivors.length === 0 && lastSweep?.complete && !lastSweep.unverified.length && this.errors.includes(CONTINUITY)) {
      this.errors = this.errors.filter(e => e !== CONTINUITY); resolvedErrors = [CONTINUITY];
    }
    const sweepNow = lastSweep ?? { authorised: [], unverified: [], refused: [] };
    const containment = this.spawned ? { spawned: { ...this.spawned }, leaderAliveBound: this.leaderAliveBound,
      signalled: this.containmentLog.slice(0, 16), signalledCount: this.containmentLog.length,
      adopted: [...this.contained].slice(0, 16).map(([pid, v]) => ({ pid, ...v })),
      unverified: sweepNow.unverified.slice(0, 16), refused: sweepNow.refused.slice(0, 16),
      scanComplete: sweepNow.complete !== false, gaps: this.sweepGaps.slice(0, 8), resolvedErrors } : null;
    return { cleanupConfirmed: empty && survivors.length === 0 && this.errors.length === 0 && (!containment || containment.scanComplete),
      cleanupError: this.errors.join('; ') || (survivors.length ? ['Owned identities survived bounded cleanup',...this.memoryErrors].join('; ') : null),
      survivors, memoryComplete:this.memoryErrors.length===0, memoryErrors:[...this.memoryErrors], memoryGaps:[...this.memoryGaps],
      ...(containment ? { containment } : {}),
      procFailures:this.procFailureRing.snapshot(), containmentLimits: CONTAINMENT_LIMITS };
  }
}
