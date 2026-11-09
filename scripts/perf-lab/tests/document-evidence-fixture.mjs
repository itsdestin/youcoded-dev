import { alignDocumentClocks, summariseDocumentInput } from '../document-input.mjs';
const inputEvidence=(caseId,operationMs,extraMs=0)=>{
  const actionStartMs=25,actionEndMs=25+operationMs;
  const times=Array.from({length:Math.ceil((actionEndMs+120)/50)+1},(_,i)=>i*50);
  const train={samples:times.map((actualMs,token)=>({token,plannedMs:actualMs,actualMs,ackMs:actualMs+10+extraMs})),skippedSlots:0,failed:0,exhausted:false};
  const post=times.at(-1)+extraMs+30;
  const clocks=alignDocumentClocks([{beforeMs:-20,rendererMs:80,afterMs:-20},{beforeMs:-10,rendererMs:90,afterMs:-10},{beforeMs:post,rendererMs:post+100,afterMs:post},{beforeMs:post+10,rendererMs:post+110,afterMs:post+10}]);
  return summariseDocumentInput(train,{overflow:0,receipts:train.samples.map(s=>({token:s.token,atMs:s.actualMs+109+extraMs,trusted:true,correctTarget:true,caseId}))},clocks,{actionStartMs,actionEndMs,caseId});
};
export function setDocumentOperation(row,operationMs){
  row.operationMs=operationMs;row.input=inputEvidence(row.id,operationMs);
}
export function shiftDocumentInput(row,extraMs){
  const current=row.input.samples[0].receipt.atMs-row.input.samples[0].actualMs-109;
  row.input=inputEvidence(row.id,row.operationMs,current+extraMs);
}
export const documentEvidence = (id='case',operationMs=20) => ({
  id,operationMs, proof:{attempted:true,correctTarget:true,correctResult:true,unmountedBefore:true,viewer:'sheet-grid',marker:'sentinel'},
  renderer:{available:true,sampleCount:2,maxDelayMs:10,maxGapMs:30,totalStallMs:0,totalExcessMs:20,observedMs:100,stopped:true,truncated:false},
  main:{available:true,sampleCount:2,maxDelayMs:10,maxGapMs:30,totalStallMs:0,totalExcessMs:20,observedMs:100,stopped:true,truncated:false},
  frame:{frames:2,frameGapMaxMs:20,observedMs:100,framesPerSec:20,errors:[]},
  ipc:{pings:2,tickSamples:1,rejectedPings:0,openStallMs:null,sawHidden:false,medianMs:1,p95Ms:2,maxMs:2,totalStallMs:0,maxTickDelayMs:0},
  input:inputEvidence(id,operationMs),
  memory:{complete:true,samples:1,peakRssMb:100}
});
