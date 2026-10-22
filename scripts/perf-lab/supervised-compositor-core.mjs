// Fixed compositor lifecycle; fake dependencies are for offline tests only.
import { validateCompositorPlan, COMPOSITOR_CAPS as CAPS, COMPOSITOR_DESCRIPTOR as DESCRIPTION } from './supervised-compositor-policy.mjs';
import { CLEANUP_BUDGET } from './supervised-launch-core.mjs';
import { assertProtocolEnvelope } from './supervised-protocol.mjs';
import { summarizeHelperRetirement } from './supervised-compositor-helpers.mjs';

// WHY: a retirement receipt that does not fit the bounded IPC/evidence envelope used to throw inside
// stop(), so NO retirement evidence existed (helper-hardening-1). If the full receipt does not fit, keep
// every verdict and count, mark it truncated, and never let the size of diagnostics veto the receipt.
const idOf = ({ pid, starttime, basis, signal, reason }) => ({ pid, starttime, ...(basis ? { basis } : {}), ...(signal ? { signal } : {}), ...(reason ? { reason: String(reason).slice(0, 64) } : {}) });
export function compactContainment(c) {
  return { spawned: c.spawned ?? null, leaderAliveBound: c.leaderAliveBound ?? null, scanComplete: c.scanComplete !== false,
    signalledCount: c.signalledCount ?? 0, signalled: (c.signalled ?? []).slice(0, 8).map(idOf),
    unverified: (c.unverified ?? []).slice(0, 8).map(idOf), refused: (c.refused ?? []).slice(0, 8).map(idOf),
    resolvedErrors: (c.resolvedErrors ?? []).map(e => String(e).slice(0, 96)) };
}
export function fitRetirementReceipt(receipt) {
  try { assertProtocolEnvelope({ final: receipt }); return receipt; } catch { /* compact below */ }
  const f = receipt.family ?? {}, p = receipt.pipes ?? {};
  return { reason: String(receipt.reason).slice(0, 256), cleanupConfirmed: receipt.cleanupConfirmed === true,
    abortError: receipt.abortError ?? null,
    family: { cleanupConfirmed: f.cleanupConfirmed === true, cleanupError: f.cleanupError ? String(f.cleanupError).slice(0, 256) : null,
      error: f.error ? String(f.error).slice(0, 256) : null, survivors: Array.isArray(f.survivors) ? f.survivors.length : 0,
      survivorIds: Array.isArray(f.survivors) ? f.survivors.slice(0, 8).map(({ pid, starttime }) => ({ pid, starttime })) : [],
      memoryComplete: f.memoryComplete !== false,
      ...(f.containment ? { containment: compactContainment(f.containment) } : {}) },
    pipes: { exited: p.exited === true, closed: p.closed === true, error: p.error ? String(p.error).slice(0, 256) : null,
      code: p.code ?? null, signal: p.signal ?? null },
    helpers: summarizeHelperRetirement(receipt.helpers), descriptor: receipt.descriptor,
    ...(receipt.output ? { output: receipt.output } : {}), ...(receipt.localResources ? { localResources: receipt.localResources } : {}),
    ...(receipt.evidenceError ? { evidenceError: receipt.evidenceError } : {}),
    truncated: 'ipc-record-budget; detail counts only' };
}
export class CompositorSession {
  constructor(plan,deps) {
    this.plan=validateCompositorPlan(plan);this.deps=deps;this.started=deps.now();this.state='new';this.gate=null;this.family=null;this.stopping=null;this.receipt=null;
  }
  note(type,fields={}) {const row={type,revision:1,...fields};assertProtocolEnvelope(row);this.deps.persist(row);this.deps.emit(row);}
  ready() {if(this.state!=='new')throw Error('Already acknowledged');this.state='ready';this.note('ready',{descriptor:DESCRIPTION});}
  async inspectOwned() {
    const proof=await this.deps.inspect(this.family);
    if(proof.owned!==true) {
      if(this.socketProof || this.deps.now()>=this.inspectDeadline)throw Error('Owned socket missing/readiness inspection timeout');
      return proof;
    }
    if(this.socketProof && (['filesystemDevice','filesystemInode','kernelInode','socketPath'].some(k=>proof[k]!==this.socketProof[k]) || JSON.stringify(proof.owners)!==JSON.stringify(this.socketProof.owners)))throw Error('Previously owned compositor socket/owner substituted');
    // WHY: an inferred (never directly read) executable must be visible in the
    // evidence stream once, with which proofs passed, not only in transient replies.
    if(proof.ownerEvidence && !this.ownerEvidenceNoted){this.ownerEvidenceNoted=true;this.note('owner-evidence',proof.ownerEvidence);}
    this.socketProof=proof;return proof;
  }
  async handle(message) {
    assertProtocolEnvelope(message);
    if(!message || Object.keys(message).length!==1 || !['start','inspect','stop'].includes(message.type))throw Error('Unsupported compositor command');
    if(message.type==='stop')return this.stop('controller-stop');
    if(this.stopping)throw Error('Compositor retired; retry forbidden');
    if(message.type==='inspect') {
      if(this.state!=='running')throw Error('Inspection before verified start');
      try {
        const proof = await this.inspectOwned();
        if (proof.owned !== true || !this.deps.createConfiguration) return { ...proof, ...DESCRIPTION };
        if (!this.configuration) {
          this.configuration = this.deps.createConfiguration(this.family, () => {
            // The real ownership adapter is synchronous; repeat complete proof
            // before every helper's connection, never reuse path readiness alone.
            if (this.stopping) throw Error('Compositor stopping before helper connection');
            const current = this.deps.inspect(this.family);
            if (current?.owned !== true || ['filesystemDevice', 'filesystemInode', 'kernelInode', 'socketPath']
              .some(key => current[key] !== this.socketProof[key]) ||
              JSON.stringify(current.owners) !== JSON.stringify(this.socketProof.owners)) {
              throw Error('Compositor socket replaced before helper connection');
            }
            return current;
          }, this.started + CAPS.wallMs - CAPS.cleanupReserveMs);
        }
        const configured = await this.configuration.inspect();
        return { ...DESCRIPTION, ...configured };
      } catch(error) {
        await this.stop('inspection-failed');
        return { ...DESCRIPTION, status: 'inspection-incomplete', reason: String(error.message).slice(0, 512),
          cleanupConfirmed: this.receipt?.cleanupConfirmed === true,
          socket: this.socketProof ?? null, helpers: this.receipt?.helpers ?? null };
      }
    }
    if(this.state!=='ready')throw Error('Only one compositor start');
    this.state='starting';
    try {
      this.captureDone=Promise.resolve(this.deps.spawnGate()).then(async gate=>{
        this.gate=gate;
        if(this.stopping){gate.abort();throw Error('Retired during acquisition');}
        // WHY: capture can establish a leader and then throw during sampling.
        // Keep that actual authority for cleanup, never a fallback numeric PID.
        try {await gate.capture();} finally {if(gate.family?.leader)this.family=gate.family;}
      });
      await this.captureDone;
      if(this.stopping || this.deps.now()>=this.started+CAPS.wallMs-CAPS.cleanupReserveMs)throw Error('Retired/deadline before release');
      this.gate.release();await this.gate.corroborate();
      if(this.stopping)throw Error('Retired during wrapper exec');
      this.state='running';this.inspectDeadline=this.deps.now()+CAPS.startupMs;this.note('started',{descriptor:DESCRIPTION});return {...DESCRIPTION,status:'started-not-ready'};
    } catch(error) {await this.stop(`startup: ${String(error.message).slice(0,512)}`);throw error;}
  }
  async tick() {
    if(this.stopping)return;
    if(this.deps.now()>=this.started+CAPS.wallMs-CAPS.cleanupReserveMs)return this.stop('deadline-reserve');
    if(!this.family)return;
    try {
      const sample=this.family.sample();
      if(sample.members.length>CAPS.members || !Number.isFinite(sample.rssMb) || sample.rssMb<0)throw Error('Incomplete/bounded family observation');
      this.note('sample',{rssMb:sample.rssMb,members:sample.members.map(({pid,starttime,state})=>({pid,starttime,state}))});
      const helperSample = this.configuration?.sampleResources() ?? { rssMb: 0, members: 0 };
      if (sample.members.length + helperSample.members > CAPS.members) throw Error('Combined compositor/helper member cap');
      if(sample.rssMb + helperSample.rssMb > CAPS.maxRssMb)return this.stop('memory-limit');
      if(this.state==='running' && !sample.members.some(r=>r.pid===this.gate.child.pid && !['Z','X'].includes(r.state)))return this.stop('dead-wrapper');
      if(this.state==='running')await this.inspectOwned();
    } catch(error){return this.stop(`ownership-uncertain: ${String(error.message).slice(0,512)}`);}
  }
  stop(reason) {
    if(this.stopping)return this.stopping;
    const idle=['new','ready'].includes(this.state);this.state='stopping';
    this.stopping=(async()=>{
      // Wait for the bounded acquisition/capture to settle so disconnect cannot
      // retire first and leave a late child untracked. No orphan retry path.
      await this.captureDone?.catch(()=>{});
      let helperRetirement = { cleanupConfirmed: true, receipts: [] };
      // Active helper families must retire before their compositor/bus parents.
      // A failed helper receipt poisons acquisition even if the wrapper is gone.
      try { if (this.configuration) helperRetirement = await this.configuration.stop(); }
      catch (error) { helperRetirement = { cleanupConfirmed: false, error: String(error.message).slice(0, 512) }; }
      let abortError=null;
      try {this.gate?.abort();}catch(error){abortError=String(error.message).slice(0,512);}
      let family={cleanupConfirmed:idle && !this.gate,survivors:[]},pipes={exited:!this.gate,closed:!this.gate};
      try {
        // WHY (helper-hardening-3): containment must not depend on the post-exec identity proof. If capture
        // never set this.family, the gate's own family still holds the SPAWN-time identity the supervisor
        // recorded for the child it forked; that (and only that) is enough authority to retire it. A gate
        // family without such a record keeps the old rule: no captured identity, no cleanup authority.
        const cleanupFamily=this.family??(this.gate?.family?.spawned?this.gate.family:null);
        if(cleanupFamily)family=await cleanupFamily.cleanup({termWaitMs:CLEANUP_BUDGET.termMs,killWaitMs:CLEANUP_BUDGET.killMs,everyMs:CLEANUP_BUDGET.stabilizeMs});
      }catch(error){family={cleanupConfirmed:false,error:String(error.message).slice(0,512),survivors:[]};}
      // A cleanup exception must not skip bounded exit/pipe observation. Missing
      // observations remain false even after later local-handle destruction.
      try {if(this.gate)pipes=await this.gate.waitClosed(CLEANUP_BUDGET.exitCloseMs);}
      catch(error){pipes={exited:false,closed:false,error:String(error.message).slice(0,512)};}
      this.receipt={reason,cleanupConfirmed:helperRetirement.cleanupConfirmed === true && !abortError && family.cleanupConfirmed===true && pipes.exited===true && pipes.closed===true && !pipes.error,abortError,family,pipes,helpers:summarizeHelperRetirement(helperRetirement),descriptor:DESCRIPTION};
      this.receipt=fitRetirementReceipt(this.receipt);this.state=this.receipt.cleanupConfirmed?'retired':'failed-retirement';
      // WHY: an evidence/IPC failure while announcing the retirement must not throw away the receipt (the
      // finalizer persists and sends it again); record it and keep the verdict.
      try {this.note('retirement',this.receipt);}
      catch(error) {this.receipt={...this.receipt,evidenceError:String(error.message).slice(0,256),cleanupConfirmed:false};}
      return this.receipt;
    })();return this.stopping;
  }
}
