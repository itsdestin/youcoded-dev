// Reduced immutable values from lifecycle-model-free-attempt-dkolngdi, NOT a
// reclassification of that original failed report. No scratch/runtime dependency.
// Session IDs and per-PID mb are synthetic placeholders; membership/starttimes,
// total PSS, renderer counters and timing boundaries retain the observed shape.
import { RESOURCE_DESCRIPTOR,RESOURCE_METRICS } from '../resource-checkpoint.mjs';
const baseStarts={'1443467':'2899560','1443469':'2899568','1443470':'2899568','1443507':'2899654','1443511':'2899656','1443619':'2899666','1443693':'2899707','1443694':'2899707'};
const addedStarts={'1443765':'2899757','1443766':'2899758','1443767':'2899758','1443829':'2899813'};
const identity={source:'package-stamp:bc9e43752d0c9d2bb49eeff1e50ee70800668f27:331dbfcbbf58',run:'56e6d813-fcc3-4307-a9e0-2e0c9645bd4e',target:'435CA3B25EDE8D776E96EA3E60B1B9A7',documentEpoch:'1792552403213.1',documentUrl:'file:///isolated/package/resources/app.asar/dist/renderer/index.html'};
const raw={
 before:{times:[2051.934102,2072.368984],pss:617.8115234375,metrics:[.438146,.243454,12,30,.036096,.081329,13976768,410,330]},
 grown:{times:[3173.42953,3191.35896],pss:677.572265625,metrics:[.787739,.415232,69,104,.07425,.108046,22275624,535,778]},
 switched:{times:[3202.175055,3219.819062],pss:678.615234375,metrics:[.803889,.425432,70,107,.074512,.110109,17165088,537,860]},
 released:{times:[3240.485767,3258.86615],pss:678.876953125,metrics:[.825058,.438039,71,112,.074768,.111637,18878104,539,1002]},
};
export function preservedChurnCycle(){
 const checkpoints=Object.fromEntries(Object.entries(raw).map(([phase,data])=>{
  const starts={...baseStarts,...(phase==='before'?{}:addedStarts)},pids=Object.keys(starts).map(Number);
  return [phase,{revision:2,phase,gcPolicy:'natural',status:'measured',scope:RESOURCE_DESCRIPTOR.scope,identity:{...identity,processStarts:starts},startedAt:data.times[0],endedAt:data.times[1],gaps:[],
   metrics:Object.fromEntries(RESOURCE_METRICS.map((k,i)=>[k,data.metrics[i]])),pss:{totalMb:data.pss,expectedPids:pids,perPid:pids.map(pid=>({pid,mb:data.pss/pids.length})),complete:true,discoveryComplete:false}}];
 }));
 const before={ids:['anchor'],mounted:1},created=['owned-a','owned-b'];
 return {index:1,completed:true,reason:null,created,closed:[...created].reverse(),before,after:structuredClone(before),openState:{ids:['anchor',...created],mounted:3},
  output:Array.from({length:2},()=>({plannedDeltas:40,deltasSent:40,chars:153,aborted:false,shown:true,exact:true,persistedExact:true,turnComplete:true})),
  natural:checkpoints.released,checkpoints,persistedRecords:{before:3,after:7},afterGc:{status:'unmeasured',reason:'not requested',sample:null}};
}
