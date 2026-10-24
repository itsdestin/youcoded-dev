// Opt-in boundary observations only: no GC intervention, listeners or polling.
import { checkpointDelta, RESOURCE_DESCRIPTOR } from './resource-checkpoint.mjs';

export const SETTLE_DESCRIPTOR = Object.freeze({ ...RESOURCE_DESCRIPTOR, revision: 5, checkpointDomains: ['full','renderer'], defaultDomain: 'full',
  rendererOnlyPolicy: 'Renderer-only diagnostics do not collect family PSS/composition. Independent supervisor ownership/RSS checks still apply; not whole-app health or standard acceptance.',
  lane: 'short-lifecycle-natural-settle', maxCyclesIncludingWarmup: 3, maxMinutes: 5,
  scheduleMs: Object.freeze([0, 250, 1000, 3000]), maxPoints: 24, maxLatenessMs: 100,
  naturalPolicy: 'No forced collection; no guarantee a GC occurred. Counts are Chromium renderer instance counters, not connected DOM counts or a leak diagnosis.',
  sequence: 'One app/CDP epoch: anchor; (control-before-i, workload-i, restored-anchor settle-i) for i=1..cycles. Control i+1 also follows workload i; no extra boots. Cycle 1 only is workload warmup; controls are never cycles or warmup.',
  permittedPairs: 'released:natural only, ordered same source/run/target/document epoch and URL; cumulative counters must not reset. Full-domain checkpoints additionally require shared PID start identities; family churn makes aggregate PSS incomparable. Renderer-only checkpoints do not collect process identities/PSS; supervisor ownership is independent.',
  comparison: 'Within-phase changes and raw workload-minus-control snapshots at equal planned offsets. Windows are sequential, not simultaneous or causal subtraction; observer elapsed is uncalibrated.',
  gaps: [...RESOURCE_DESCRIPTOR.gaps.filter(g => !g.startsWith('Observer overhead')), 'Matched no-work controls observe sequential windows, not an observer-free baseline. Anchor visibility is checked at phase boundaries, not continuously.'],
});
const sameState = (a,b) => a && b && ['mounted','visible'].every(k=>a[k]===b[k]) && ['ids','pills'].every(k=>Array.isArray(a[k]) && Array.isArray(b[k]) && a[k].length===b[k].length && a[k].every(id=>b[k].includes(id)));
const rendererOk = delta => delta?.renderer?.status === 'measured';
const sampleOk = s => s?.status==='measured' || s?.revision===3 && s.domain==='renderer' && s.status==='renderer-only' && s.renderer?.status==='measured';

export async function sampleSettlePhase({ driver, kind, cycle, anchor, previous = null,
  now = () => performance.now(), wait = ms => new Promise(r=>setTimeout(r,ms)), bound = p=>p, deadline, domain = 'full' }) {
  const phase = { domain, kind, cycle, policy:'natural-no-forced-gc', status:'incomplete', points:[], familyPssComparable:domain==='full', process:{status:domain==='renderer'?'not-collected':'requested'}, familyTransitions:[], anchor:{id:anchor,initialVerified:false,finalVerified:false}, reason:null };
  try {
    if (!['full','renderer'].includes(domain) || !['control','workload'].includes(kind) || !Number.isInteger(cycle) || cycle<1 || cycle>3 || !anchor) throw Error('invalid settle phase identity');
    if (!Number.isFinite(deadline) || deadline-now()<4000) throw Error('settle deadline lacks fixed schedule and read margin');
    const state = await bound(driver.state(), 'settle anchor state');
    if (!await bound(driver.verifyAnchor(anchor), 'settle anchor visibility')) throw Error('anchor visibility/restoration not established');
    phase.anchor.initialVerified=true;
    phase.startedAt = now();
    let prior = previous;
    for (const plannedMs of SETTLE_DESCRIPTOR.scheduleMs) {
      const due = phase.startedAt + plannedMs;
      // WHY: setTimeout truncates fractional delays and may wake before due.
      // Recheck the monotonic target after each yielding wait, never sample early
      // or shift later targets. Integer >=1ms sleeps avoid sub-ms busy retries;
      // independent retry/stagnation caps also bound broken injected clocks.
      let observed=now(), attempts=0, stagnant=0;
      while (true) {
        if (!Number.isFinite(observed) || observed<phase.startedAt) throw Error('settle wait clock invalid');
        if (observed>=deadline) throw Error('settle deadline exceeded during wait');
        if (observed>=due) break;
        if (++attempts>64 || stagnant>=8) throw Error('settle wait clock stagnation/retry cap exceeded');
        await bound(wait(Math.min(Math.max(1,Math.ceil(due-observed)),deadline-observed)), 'settle scheduled wait', deadline-observed);
        const next=now();
        if (!Number.isFinite(next) || next<observed) throw Error('settle wait clock invalid/nonmonotonic');
        stagnant=next===observed?stagnant+1:0;
        observed=next;
      }
      const actualMs = observed-phase.startedAt, latenessMs = actualMs-plannedMs;
      const point = { plannedMs, actualMs, latenessMs, sample:null };
      phase.points.push(point);
      // WHY: do not bunch overdue reads together and call that a matched schedule.
      if (now()>=deadline || latenessMs<0 || latenessMs>SETTLE_DESCRIPTOR.maxLatenessMs) throw Error('settle deadline/schedule lateness exceeded');
      point.sample = await bound(driver.sample('released','natural',domain), 'settle resource read');
      point.readWallMs = now()-phase.startedAt-actualMs;
      if (now()>=deadline || !sampleOk(point.sample) || (point.sample.domain??'full')!==domain || point.sample.gcPolicy!=='natural' || point.sample.phase!=='released') throw Error('incomplete or late natural checkpoint');
      if (prior) {
        const delta=checkpointDelta(prior,point.sample);
        if (!rendererOk(delta)) throw Error('settle renderer identity/order/counter continuity unavailable');
        if (domain==='full' && delta.family.status!=='measured') {
          phase.familyPssComparable=false;
          phase.familyTransitions.push({plannedMs,added:delta.family.added,removed:delta.family.removed,reused:delta.family.reused});
        }
      }
      prior=point.sample;
    }
    if (!sameState(state,await bound(driver.state(),'settle restored state')) || !await bound(driver.verifyAnchor(anchor),'settle final anchor visibility')) throw Error('anchor/session restoration changed during settle');
    phase.anchor.finalVerified=true;
    phase.status='measured';
  } catch(error) { phase.reason=String(error.message??error); }
  phase.endedAt=now();
  return phase;
}

export function summariseSettle(rows) {
  const rendererOnly=rows.length>0 && rows.every(r=>r.settle?.length===2 && r.settle.every(p=>p.domain==='renderer'));
  let complete=rows.length>0 && rows.length<=3;
  const count=rows.flatMap(r=>r.settle??[]).flatMap(p=>p.points??[]).filter(p=>sampleOk(p.sample)).length;
  let previous=null;
  const validPhase = phase => {
    if (!phase || phase.status!=='measured' || phase.points?.length!==4 || !phase.anchor?.initialVerified || !phase.anchor?.finalVerified) return false;
    return phase.points.every((p,i)=> {
      const valid=p.plannedMs===SETTLE_DESCRIPTOR.scheduleMs[i] && p.actualMs>=p.plannedMs && p.latenessMs===p.actualMs-p.plannedMs && p.latenessMs<=SETTLE_DESCRIPTOR.maxLatenessMs && sampleOk(p.sample) && (p.sample.domain??'full')===(phase.domain??'full') && p.sample.gcPolicy==='natural' && p.sample.phase==='released' && (!previous || rendererOk(checkpointDelta(previous,p.sample)));
      previous=p.sample;
      return valid;
    });
  };
  const observed=rows.map((row,index)=> {
    const [control,workload]=row.settle??[];
    const cValid=control?.kind==='control' && control.cycle===index+1 && validPhase(control);
    const wValid=workload?.kind==='workload' && workload.cycle===index+1 && validPhase(workload);
    if (!cValid || !wValid || control.anchor.id!==workload.anchor.id || row.reason || !row.completed) complete=false;
    const trajectory=(phase,valid)=> {
      if (!valid) return { status:'incomplete', change:null, familyPssComparable:false, pssMb:null };
      const d=checkpointDelta(phase.points[0].sample,phase.points.at(-1).sample);
      return {status:d.renderer.status,change:d.metrics,familyPssComparable:phase.familyPssComparable && d.family.status==='measured',pssMb:phase.familyPssComparable?d.pssMb:null};
    };
    const matched=cValid && wValid ? control.points.map((p,i)=> {
      const q=workload.points[i],d=checkpointDelta(p.sample,q.sample);
      return {plannedMs:p.plannedMs,controlActualMs:p.actualMs,workloadActualMs:q.actualMs,
        controlStartedAt:p.sample.startedAt,workloadStartedAt:q.sample.startedAt,
        status:d.renderer.status,rawSnapshotDifference:d.metrics,
        pssMb:control.familyPssComparable && workload.familyPssComparable?d.pssMb:null,
        familyStatus:rendererOnly?'not-collected':control.familyPssComparable && workload.familyPssComparable?d.family.status:'incomparable'};
    }):null;
    return {cycle:index+1,warmup:index===0,control:trajectory(control,cValid),workload:trajectory(workload,wValid),matched};
  });
  return {status:complete?(rendererOnly?'measured-renderer-only':'measured'):'incomplete',standardAcceptanceCoverage:false,
    process:{status:rendererOnly?'not-collected':'requested',wholeAppHealthEstablished:false},effectivePointCount:count,observed,
    interpretation:'Observed changes only, never a leak or GC verdict. Each trajectory uses its own first/last samples, not global cumulative totals. Raw matched differences span different timestamp windows; no cause or observer cost follows from subtraction. Family PSS covers enumerated marker PIDs only; discovery completeness is unproven.'};
}
