#!/usr/bin/env node
// Offline only: matrix planning cannot load credentials, connect to a provider or authorize spend.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const price = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const supports = (patterns, id) => patterns.some(p=>p==='*'||p===id||(p.endsWith('/*')&&id.startsWith(p.slice(0,-1))));

export function planExperiment({models,tasks,adapters,repetitions,assumedInputTokens,assumedOutputTokens,requiredDomains=[]}) {
  if (!Number.isInteger(repetitions)||repetitions<1) throw new Error('repetitions must be a positive integer');
  if (!price(assumedInputTokens)||!price(assumedOutputTokens)) throw new Error('Explicit token assumptions required');
  for (const [label,rows] of Object.entries({models,tasks,adapters})) {
    if (!Array.isArray(rows)||!rows.length||rows.some(r=>typeof r.id!=='string'||!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)
      throw new Error(`Invalid or duplicate ${label} identities`);
  }
  const cells=[], blockers=new Set(['build-only: no live execution or spending approval is granted by this plan']);
  const domains=new Set(tasks.map(t=>t.domain??t.category));
  for (const domain of requiredDomains) if (!domains.has(domain)) blockers.add(`Missing task domain: ${domain}`);
  for (let repetition=0;repetition<repetitions;repetition++) {
    for (const [index,task] of tasks.entries()) for (const model of models) {
      // Rotate clients within every matched block rather than running all of one client first.
      const offset=(index+repetition)%adapters.length;
      for (const adapter of [...adapters.slice(offset),...adapters.slice(0,offset)]) {
        const unsupported=[];
        if (!supports(adapter.models??[],model.id)) unsupported.push('model');
        for (const capability of task.requiredCapabilities??['single-turn','filesystem'])
          if (!(adapter.capabilities??[]).includes(capability)) unsupported.push(capability);
        const transportReady=adapter.transportReady===true||(Array.isArray(adapter.transportReadyModels)&&adapter.transportReadyModels.includes(model.id));
        if (!transportReady) blockers.add(`${adapter.id}/${model.id}: client/model transport not validated`);
        for (const capability of unsupported.filter(x=>x!=='model')) blockers.add(`${adapter.id}/${task.id}: missing ${capability}`);
        const inputAssumption=task.estimatedInputTokens??assumedInputTokens;
        if(!price(inputAssumption))throw new Error('Invalid task-specific token assumption');
        const estimatedUsd=price(model.inputUsdPerMillion)&&price(model.outputUsdPerMillion)
          ?(inputAssumption*model.inputUsdPerMillion+assumedOutputTokens*model.outputUsdPerMillion)/1e6:null;
        cells.push({taskId:task.id,split:task.split??'unspecified',domain:task.domain??task.category,model:model.id,agent:adapter.id,repetition,
          unsupported,transportReady,assumedInputTokens:inputAssumption,estimatedUsd,estimateIncluded:unsupported.length===0});
      }
    }
  }
  const eligible=cells.filter(c=>c.estimateIncluded);
  return {schemaVersion:1,canRun:false,mode:'offline-planning',
    priceKind:'illustrative catalog estimate, not spending authorization or hard ceiling',
    assumptions:{inputTokensPerTask:assumedInputTokens,outputTokensPerTask:assumedOutputTokens,repetitions},
    estimatedTotalUsd:eligible.every(c=>c.estimatedUsd!==null)?eligible.reduce((n,c)=>n+c.estimatedUsd,0):null,
    plannedCells:cells.length,compatibleCells:eligible.length,unsupportedCells:cells.length-eligible.length,
    domains:[...domains],blockers:[...blockers],cells,
    warnings:['More repetitions do not replace independent task diversity.',
      'Context-tier pricing, route prices, cache creation, failed attempts, judges and auxiliary calls can exceed this illustration.',
      'Missing combinations remain visible; unsupported is not a task failure.',
      'Use same-model compatible-client tracks; do not compare raw cross-model token counts as equal computation.',
      'Refresh catalog and validate per-provider reasoning/route settings before any authorized execution.']};
}

export function planComparisonTracks({harnessModel='anthropic/claude-haiku-5.5',modelHarness='youcoded',...options}){
 const model=options.models?.find(m=>m.id===harnessModel),adapter=options.adapters?.find(a=>a.id===modelHarness);
 if(!model||!adapter)throw new Error('Declared control model and fixed harness are required');
 const tracks={harnessComparison:planExperiment({...options,models:[model]}),modelComparison:planExperiment({...options,adapters:[adapter]})};
 // WHY: changing harness and model together cannot isolate either effect. The shared
 // baseline is repeated in its own ordered cohort, not silently reused/double-counted.
 const cells=Object.entries(tracks).flatMap(([track,plan])=>plan.cells.map(cell=>({...cell,track,trialKey:JSON.stringify([track,cell.taskId,cell.model,cell.agent,cell.repetition])})));
 const totals=Object.values(tracks).map(t=>t.estimatedTotalUsd);
 return {schemaVersion:1,mode:'offline-planning',canRun:false,tracks,cells,plannedCells:cells.length,
  compatibleCells:cells.filter(c=>c.estimateIncluded).length,unsupportedCells:cells.filter(c=>!c.estimateIncluded).length,
  estimatedTotalUsd:totals.every(price)?totals.reduce((sum,n)=>sum+n,0):null,
  priceKind:'illustrative catalog estimate, not spending authorization or hard ceiling',
  domains:[...new Set(cells.map(c=>c.domain))],blockers:[...new Set(Object.values(tracks).flatMap(t=>t.blockers))],
  sharedBaseline:'Use separate track-specific repetitions by default; do not reuse outcomes without matching configuration and cache/order evidence.'};
}

if (process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length!==3||process.argv.includes('--help')) console.log('Usage: node scripts/harness-lab/experiment-plan.mjs PLAN_INPUT.json\nPrints an offline matrix/readiness report. Never calls models.');
    else console.log(JSON.stringify(planExperiment(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
