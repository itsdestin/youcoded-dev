// WHY: independent component sums double-count concurrent work. Split at endpoints
// and count union/overlap on one declared clock and scope, never infer idle from silence.
export const ACTIVITY_LANES = ['request-in-flight','reasoning-stream','answer-stream','tool-argument-stream',
  'tool-submitted-to-result','tool-executing','approval-wait','background-dependency-wait','scheduler-state'];
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function analyzeTimeline(intervals, window) {
  const empty={schemaVersion:1,window:window??null,laneUnionMs:Object.fromEntries(ACTIVITY_LANES.map(k=>[k,null])),
    coveredUnionMs:null,overlapMs:null,unclassifiedInRequestMs:null,unclassifiedOutsideRequestMs:null,
    censoredIntervals:null,invalidIntervals:null,segments:[],coverage:'unsupported',
    reason:'No aligned observation window; timestamps are missing. Silence is not thinking or idle.'};
  if (!window || !finite(window.start) || !finite(window.end) || window.end<window.start) return empty;
  empty.censoredIntervals=0;empty.invalidIntervals=0;
  const valid=[];
  for(const i of intervals){
    if(i.clock!==window.clock) throw new Error('Activity clock mismatch: alignment required');
    if(i.scope!==window.scope) continue;
    if(i.end===null){empty.censoredIntervals++;continue;}
    if(!finite(i.start)||!finite(i.end)||i.end<i.start){empty.invalidIntervals++;continue;}
    const start=Math.max(i.start,window.start),end=Math.min(i.end,window.end);
    if(end>start) valid.push({...i,start,end});
  }
  const endpoints=[...new Set([window.start,window.end,...valid.flatMap(i=>[i.start,i.end])])].sort((a,b)=>a-b);
  const totals={};let union=0,overlap=0,outside=0,inRequest=0;
  for(let j=1;j<endpoints.length;j++){
    const start=endpoints[j-1],end=endpoints[j],ms=end-start;
    const active=valid.filter(i=>i.start<=start&&i.end>=end);
    const lanes=[...new Set(active.map(i=>i.lane))].sort();
    for(const lane of lanes)totals[lane]=(totals[lane]??0)+ms;
    if(active.length)union+=ms;
    if(active.length>1)overlap+=ms;
    if(!active.length)outside+=ms;
    // WHY: observed delivery envelopes classify only their actual receipt span;
    // provider-pending/remainder is unknown, not hidden reasoning or proven idle.
    if(lanes.includes('request-in-flight')&&!lanes.some(l=>['reasoning-stream','answer-stream','tool-argument-stream'].includes(l)))inRequest+=ms;
    empty.segments.push({start,end,lanes});
  }
  return {...empty,laneUnionMs:{...empty.laneUnionMs,...totals},coveredUnionMs:valid.length?union:null,overlapMs:valid.length?overlap:null,
    unclassifiedInRequestMs:totals['request-in-flight']===undefined?null:inRequest,
    // WHY: missing interval ends do not prove that the remaining time was outside a request.
    unclassifiedOutsideRequestMs:totals['request-in-flight']===undefined||empty.censoredIntervals>0||empty.invalidIntervals>0||window.censored?null:outside,coverage:window.collected&&!window.censored&&empty.invalidIntervals===0?'measured':'partial',
    reason:window.collected?'Explicit process observation window; stream spans measure delivery envelopes, not cognition. Closed spans are measured subtotals; incomplete/dropped coverage censors outside-request gaps. No implicit cross-clock alignment. Scheduler/dependency state remains unknown.':
      'Observed timestamp envelope only, not end-to-end wall time. Request-phase receipts, execution boundaries and scheduler states absent. Lane totals are non-additive; overlap includes concurrent same-lane spans. Tool pending spans include queuing; text/reasoning events are points, not continuous compute.'};
}
