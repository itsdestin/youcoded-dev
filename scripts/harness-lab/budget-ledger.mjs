import {open, readFile, rename, unlink, mkdir, chmod, lstat, stat} from 'node:fs/promises';
import {dirname, basename, join} from 'node:path';
import {randomUUID} from 'node:crypto';

const finiteUsd = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const scopeId = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) && !['constructor','prototype'].includes(value);
export function validateBudgetScope(scope){
  if(scope===undefined)return;
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||Object.getPrototypeOf(scope)!==Object.prototype||Object.keys(scope).length!==2||!Object.hasOwn(scope,'id')||!Object.hasOwn(scope,'limitUsd')||!scopeId(scope.id)||!finiteUsd(scope.limitUsd)||scope.limitUsd<=0)throw new Error('Invalid budget scope');
}
function validateStoredScopes(state){
  const scopes=state.budgetScopes;
  if(scopes!==undefined&&(!scopes||typeof scopes!=='object'||Array.isArray(scopes)||Object.getPrototypeOf(scopes)!==Object.prototype||Object.entries(scopes).some(([id,cap])=>!scopeId(id)||!finiteUsd(cap)||cap<=0)))throw new Error('Malformed budget scopes');
  const bindings=new Map(),exposures=new Map();
  for(const row of state.requests){
    const id=row.budgetScopeId;
    if(Object.hasOwn(row,'budgetScopeId')&&(!scopeId(id)||!scopes||!Object.hasOwn(scopes,id)))throw new Error('Malformed request budget scope');
    if(bindings.has(row.trialId)&&bindings.get(row.trialId)!==id)throw new Error('Trial budget scope mismatch');
    bindings.set(row.trialId,id);
    // WHY: actual overruns are valid evidence, not corrupt state. Admission is an
    // estimated ceiling, not insurance against delayed or underestimated bills.
    if(id!==undefined)exposures.set(id,(exposures.get(id)??0)+(row.status==='settled'?Math.min(row.actualCostUsd,row.reservationUsd):row.reservationUsd));
  }
  for(const [id,exposure] of exposures)if(exposure>scopes[id]+1e-12)throw new Error('Inconsistent budget scope exposure');
}
const privateDirectory = async path => {
  await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0) throw new Error('Ledger directory must be private (mode 700)');
  await chmod(path,0o700);
};

/** A one-process, crash-conservative USD reservation ledger. */
export class BudgetLedger {
  static async open({path,limitUsd,priorUpperUsd,accountingMode='legacy',externalPriorUsd=priorUpperUsd}) {
    if(typeof path!=='string'||!path||!finiteUsd(limitUsd)||limitUsd<=0||!finiteUsd(priorUpperUsd)||priorUpperUsd>limitUsd||!['legacy','estimated'].includes(accountingMode)||!finiteUsd(externalPriorUsd)||externalPriorUsd>limitUsd||(accountingMode==='estimated'&&externalPriorUsd>priorUpperUsd)) throw new Error('Invalid ledger budget configuration');
    const parent=dirname(path);
    await privateDirectory(parent);
    const lockPath=`${path}.lock`;
    let lock;
    try { lock=await open(lockPath,'wx',0o600); }
    catch(error) {
      if(error?.code!=='EEXIST')throw new Error('Could not acquire budget ledger lock');
      // Never race another startup to unlink a dead owner's lock. PID reuse/namespaces also make automatic recovery unsafe.
      throw new Error('Budget ledger is already in use or needs manual stale-lock recovery after confirming all owners stopped');
    }
    try {
      await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
      const lockIdentity=await lock.stat();
      if((lockIdentity.mode&0o077)!==0) throw new Error('Ledger lock must be private');
      let state,needsPersist=false;
      try {
        const raw=await readFile(path,'utf8');
        const fileInfo=await stat(path);
        if((fileInfo.mode&0o077)!==0) throw new Error('Ledger file must be private');
        state=JSON.parse(raw);
        if(!state||state.schemaVersion!==1||state.limitUsd!==limitUsd||state.priorUpperUsd!==priorUpperUsd||(state.accountingMode??'legacy')!==accountingMode||(state.externalPriorUsd??priorUpperUsd)!==externalPriorUsd||!Array.isArray(state.requests)||typeof state.closed!=='boolean') throw new Error('Ledger configuration or schema mismatch');
        if(!finiteUsd(state.chargedUsd)||!finiteUsd(state.reservedUsd)||(accountingMode==='estimated'&&(!finiteUsd(state.providerUsageUsd)||!(state.billingCheckedAt===null||typeof state.billingCheckedAt==='string'&&Number.isFinite(Date.parse(state.billingCheckedAt)))||!Array.isArray(state.billingSnapshots)||state.billingSnapshots.some(s=>!s||!finiteUsd(s.providerUsageUsd)||typeof s.checkedAt!=='string'||!Number.isFinite(Date.parse(s.checkedAt)))||state.billingSnapshots.some(s=>s.providerUsageUsd>state.providerUsageUsd)))||state.requests.some(r=>!r||typeof r.id!=='string'||!finiteUsd(r.reservationUsd)||!['reserved','settled','unknown','upstream-error','restart-charged'].includes(r.status)||(r.status==='settled'&&!finiteUsd(r.actualCostUsd)))) throw new Error('Malformed budget ledger');
        validateStoredScopes(state);
        const charged=state.requests.reduce((sum,r)=>sum+(r.status==='reserved'?0:r.status==='settled'?r.actualCostUsd:r.reservationUsd),priorUpperUsd);
        const reserved=state.requests.filter(r=>r.status==='reserved').reduce((sum,r)=>sum+r.reservationUsd,0);
        if(Math.abs(charged-state.chargedUsd)>1e-9||Math.abs(reserved-state.reservedUsd)>1e-9||(!state.closed&&charged+reserved>limitUsd+1e-9)) throw new Error('Inconsistent budget ledger');
      } catch(error) {
        if(error?.code!=='ENOENT') throw error;
        needsPersist=true;
        state={schemaVersion:1,limitUsd,priorUpperUsd,accountingMode,externalPriorUsd,providerUsageUsd:0,billingCheckedAt:null,billingSnapshots:[],chargedUsd:priorUpperUsd,reservedUsd:0,closed:false,requests:[]};
      }
      const ledger=new BudgetLedger(path,lockPath,lock,state,lockIdentity);
      // WHY: after a crash it is unknowable whether an in-flight request incurred a charge; permanently charge its full upper bound.
      for(const row of state.requests) if(row.status==='reserved') {needsPersist=true;row.status='restart-charged';row.actualCostUsd=null;row.settledAt=new Date().toISOString();state.chargedUsd+=row.reservationUsd;state.reservedUsd-=row.reservationUsd;}
      // WHY: reservations are authoritative per request; subtraction residue must not
      // leave fictitious in-flight money or prevent a later restart/authorization.
      if(state.reservedUsd!==0)needsPersist=true;
      state.reservedUsd=0;
      // WHY: opening historical evidence must not migrate or rewrite it unless
      // crash recovery actually changes an in-flight hold.
      if(needsPersist)await ledger.persist();
      return ledger;
    } catch(error) {
      await lock.close().catch(()=>{});await unlink(lockPath).catch(()=>{});throw error;
    }
  }
  constructor(path,lockPath,lock,state,lockIdentity){this.path=path;this.lockPath=lockPath;this.lock=lock;this.lockIdentity=lockIdentity;this.state=state;this.queue=Promise.resolve();this.closedHandle=false;}
  snapshot(){return structuredClone(this.state);}
  transact(change){
    const operation=this.queue.then(async()=>{if(this.closedHandle)throw new Error('Budget ledger is closed');const before=structuredClone(this.state);try{const result=change();await this.persist();return result;}catch(error){this.state=before;throw error;}});
    this.queue=operation.catch(()=>{});return operation;
  }
  // WHY: a larger account limit is not permission; record explicit approval without releasing any previous hold.
  async authorizeLimit(limitUsd,authorization){
    if(!finiteUsd(limitUsd)||typeof authorization!=='string'||!authorization.trim())throw new Error('Explicit budget authorization is required');
    return this.transact(()=>{
      if(this.state.closed||this.state.reservedUsd!==0)throw new Error('Cannot amend closed or in-flight ledger');
      if(limitUsd<=this.state.limitUsd)throw new Error('New ceiling must exceed the previous ceiling');
      (this.state.authorizations??=[]).push({previousLimitUsd:this.state.limitUsd,newLimitUsd:limitUsd,authorization,at:new Date().toISOString()});
      this.state.limitUsd=limitUsd;
    });
  }
  reserve({trialId,reservationUsd,maxRequests,model=null,provider=null,estimateUsd=null,estimateBasis=null,requestControls=null,budgetScope}){
    validateBudgetScope(budgetScope);
    // WHY: callers cannot mutate scope identity/cap while queued behind another admission.
    budgetScope=budgetScope===undefined?undefined:{id:budgetScope.id,limitUsd:budgetScope.limitUsd};
    if(typeof trialId!=='string'||!trialId||!finiteUsd(reservationUsd)||reservationUsd<=0||!Number.isInteger(maxRequests)||maxRequests<=0) throw new Error('Invalid reservation');
    return this.transact(()=>{
      if(this.state.closed)throw new Error('Budget ledger is closed');
      const trialRows=this.state.requests.filter(r=>r.trialId===trialId);
      if(trialRows.some(r=>r.budgetScopeId!==budgetScope?.id))throw new Error('Trial budget scope cannot change');
      if(budgetScope){
        const existing=this.state.budgetScopes&&Object.hasOwn(this.state.budgetScopes,budgetScope.id)?this.state.budgetScopes[budgetScope.id]:undefined;
        if(existing!==undefined&&existing!==budgetScope.limitUsd)throw new Error('Budget scope limit cannot change');
        const exposure=this.state.requests.filter(r=>r.budgetScopeId===budgetScope.id).reduce((sum,r)=>sum+(r.status==='settled'?r.actualCostUsd:r.reservationUsd),0);
        if(exposure+reservationUsd>budgetScope.limitUsd+1e-12)throw new Error('Budget scope limit reached');
      }
      const prior=trialRows.length;
      if(prior>=maxRequests)throw new Error('Trial request limit reached');
      const floor=this.state.accountingMode==='estimated'?Math.max(this.state.chargedUsd,this.state.externalPriorUsd+(this.state.providerUsageUsd??0)):this.state.chargedUsd;
      if(floor+this.state.reservedUsd+reservationUsd>this.state.limitUsd+1e-12)throw new Error('Budget limit reached');
      const id=randomUUID();if(this.state.accountingMode==='estimated'&&(!finiteUsd(estimateUsd)||!estimateBasis))throw new Error('Estimated mode requires an estimate and basis');
      if(budgetScope)(this.state.budgetScopes??={})[budgetScope.id]=budgetScope.limitUsd;
      this.state.requests.push({id,trialId,...(budgetScope?{budgetScopeId:budgetScope.id}:{}),model:typeof model==='string'?model:null,provider:typeof provider==='string'?provider:null,reservationUsd,estimateUsd,estimateBasis,requestControls:requestControls&&typeof requestControls==='object'&&!Array.isArray(requestControls)?structuredClone(requestControls):null,status:'reserved',actualCostUsd:null,usage:null,createdAt:new Date().toISOString()});this.state.reservedUsd+=reservationUsd;return id;
    });
  }
  recordBillingSnapshot({providerUsageUsd,checkedAt=new Date().toISOString()}){
    if(this.state.accountingMode!=='estimated'||!finiteUsd(providerUsageUsd)||typeof checkedAt!=='string'||!Number.isFinite(Date.parse(checkedAt)))throw new Error('Invalid billing snapshot');
    return this.transact(()=>{this.state.providerUsageUsd=Math.max(this.state.providerUsageUsd??0,providerUsageUsd);this.state.billingCheckedAt=checkedAt;(this.state.billingSnapshots??=[]).push({providerUsageUsd,checkedAt});if(this.state.externalPriorUsd+providerUsageUsd+this.state.reservedUsd>this.state.limitUsd+1e-12)this.state.closed=true;});
  }
  report(){const requests=this.state.requests;return {confirmedUsd:requests.filter(r=>r.status==='settled').reduce((s,r)=>s+r.actualCostUsd,0),unknownUsd:requests.filter(r=>['unknown','upstream-error','restart-charged'].includes(r.status)).reduce((s,r)=>s+r.reservationUsd,0),inflightUsd:this.state.reservedUsd,providerUsageUsd:this.state.providerUsageUsd??null,billingCheckedAt:this.state.billingCheckedAt??null};}
  settle(id,actualCostUsd,usage){
    if(!finiteUsd(actualCostUsd))throw new Error('Invalid actual provider cost');
    return this.transact(()=>{
      const row=this.state.requests.find(r=>r.id===id&&r.status==='reserved');if(!row)throw new Error('Request is not reserved');
      row.actualCostUsd=actualCostUsd;row.usage=usage??null;row.status='settled';row.settledAt=new Date().toISOString();this.state.reservedUsd=this.state.requests.filter(r=>r.status==='reserved').reduce((sum,r)=>sum+r.reservationUsd,0);this.state.chargedUsd+=actualCostUsd;
      // WHY: a provider-reported bill above the conservative reservation invalidates the remaining budget proof.
      if(actualCostUsd>row.reservationUsd&&this.state.accountingMode!=='estimated')this.state.closed=true;
      if(this.state.accountingMode==='estimated'&&this.state.chargedUsd+this.state.reservedUsd>this.state.limitUsd+1e-12)this.state.closed=true;
    });
  }
  retain(id,status='unknown',{upstreamStatus=null,upstreamDiagnostic=null,usage=null,failureReason=null,responseStarted=null,durationMs=null}={}){
    if(!['unknown','upstream-error'].includes(status))throw new Error('Invalid retained request status');
    if(upstreamStatus!==null&&(!Number.isInteger(upstreamStatus)||upstreamStatus<100||upstreamStatus>599))throw new Error('Invalid upstream HTTP status');
    // WHY: additive diagnostics must never persist arbitrary exceptions or alter historical schema/accounting.
    if(failureReason!==null&&!['unknown','upstream-deadline','upstream-read-error','missing-terminal-marker','missing-usage','downstream-disconnect'].includes(failureReason))throw new Error('Invalid failure reason');
    if(responseStarted!==null&&typeof responseStarted!=='boolean'||durationMs!==null&&(!Number.isFinite(durationMs)||durationMs<0))throw new Error('Invalid failure timing');
    return this.transact(()=>{const row=this.state.requests.find(r=>r.id===id&&r.status==='reserved');if(!row)throw new Error('Request is not reserved');if(failureReason!==null)row.failureReason=failureReason;if(responseStarted!==null)row.responseStarted=responseStarted;if(durationMs!==null)row.durationMs=durationMs;row.status=status;row.upstreamStatus=upstreamStatus;if(upstreamDiagnostic)row.upstreamDiagnostic=structuredClone(upstreamDiagnostic);row.actualCostUsd=null;row.usage=structuredClone(usage);row.settledAt=new Date().toISOString();this.state.reservedUsd=this.state.requests.filter(r=>r.status==='reserved').reduce((sum,r)=>sum+r.reservationUsd,0);this.state.chargedUsd+=row.reservationUsd;});
  }
  recordActivity(id,activity){
    // WHY: timing is diagnostic, never a second charge or an arbitrary payload sink.
    const kinds=new Set(['request-start','request-end','first-byte','phase-start','phase-delta','phase-end']);
    const phases=new Set(['reasoning-stream','answer-stream','tool-argument-stream']);
    if(activity?.schemaVersion!==1||activity.clock?.kind!=='monotonic-ms'||typeof activity.clock.id!=='string'||!Array.isArray(activity.receipts)||activity.receipts.length>100000)throw new Error('Invalid activity capture');
    const clean={schemaVersion:1,clock:{id:activity.clock.id,kind:'monotonic-ms'},observation:{start:activity.observation.start,end:activity.observation.end,status:activity.observation.status},dropped:activity.dropped,receipts:activity.receipts.map(r=>{
      if(!kinds.has(r.kind)||r.requestId!==id||!Number.isFinite(r.at))throw new Error('Invalid activity receipt');
      return {kind:r.kind,at:r.at,scope:'parent',requestId:id,...(typeof r.id==='string'?{id:r.id}:{}),...(phases.has(r.phase)?{phase:r.phase}:{}),...(['completed','failed','interrupted','incomplete'].includes(r.status)?{status:r.status}:{})};
    })};
    return this.transact(()=>{const row=this.state.requests.find(r=>r.id===id);if(!row)throw new Error('Unknown activity request');row.activity=clean;});
  }
  async persist(){
    const temporary=join(dirname(this.path),`.${basename(this.path)}.${randomUUID()}.tmp`);
    const handle=await open(temporary,'wx',0o600);
    try {await handle.writeFile(JSON.stringify(this.state));await handle.sync();}finally{await handle.close();}
    try {
      await rename(temporary,this.path);await chmod(this.path,0o600);
      // A synced temp file alone does not durably commit the rename across power loss.
      const directory=await open(dirname(this.path),'r');
      try{await directory.sync();}finally{await directory.close();}
    }catch(error){await unlink(temporary).catch(()=>{});throw error;}
  }
  async close(){
    if(this.closedHandle)return;await this.queue;this.closedHandle=true;await this.lock.close();
    // WHY: remove a stale lock only if it still names this process's held inode, never a replacement owner's lock.
    try{const current=await stat(this.lockPath);if(this.lockIdentity.ino===current.ino)await unlink(this.lockPath);}catch(error){if(error?.code!=='ENOENT')throw error;}
  }
}
