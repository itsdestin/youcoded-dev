// Resample independent task clusters, not individual repeated model trials.
export function pairedTaskStats(pairs,{samples=2000,seed=148}={}){
  if(!Array.isArray(pairs)||!Number.isInteger(samples)||samples<100||!Number.isInteger(seed)) throw new Error('Invalid paired-statistics configuration');
  const identities=new Set(),groups=new Map();let missingPairs=0;
  for(const p of pairs){
    if(typeof p.taskId!=='string'||!p.taskId||!Number.isInteger(p.repetition)||p.repetition<0) throw new Error('Invalid pair identity');
    const key=JSON.stringify([p.taskId,p.repetition]);
    if(identities.has(key)) throw new Error('Duplicate paired cell');identities.add(key);
    if(p.delta==null){missingPairs++;continue;}
    if(typeof p.delta!=='number'||!Number.isFinite(p.delta)) throw new Error('Invalid paired delta');
    const values=groups.get(p.taskId)??[];values.push(p.delta);groups.set(p.taskId,values);
  }
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
  const taskMeans=[...groups.values()].map(mean),n=taskMeans.length;
  let interval95=null;
  if(n>=2){
    let state=seed>>>0;
    const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
    const boot=[];
    for(let i=0;i<samples;i++){
      let total=0;for(let j=0;j<n;j++) total+=taskMeans[Math.floor(random()*n)];
      boot.push(total/n);
    }
    boot.sort((a,b)=>a-b);
    interval95=[boot[Math.floor(samples*0.025)],boot[Math.min(samples-1,Math.floor(samples*0.975))]];
  }
  return {meanDelta:n?mean(taskMeans):null,interval95,taskCount:n,pairCount:pairs.length-missingPairs,missingPairs,
    method:'paired task-cluster percentile bootstrap of equally weighted task means',samples,seed,
    publicClaimReady:false,
    warnings:[...(n<20?['Few independent tasks: interval can be unstable; repeats do not fix coverage.']:[]),
      'Interval assumes the task sampling distribution represents the intended workload; related templates are not automatically independent tasks.',
      'Missing cells, multiple comparisons, grading error, model drift and infrastructure confounds require separate review.',
      'Not an automatic significance badge or publication approval.']};
}
