import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');

/** Controlled long-history probe, not evidence that any client has reached its context threshold. */
export function buildRetentionProbe({seed='retention-candidate-v1',fillerTurns=12,paragraphsPerTurn=200,contextWindowTokens=200000}={}){
 if(typeof seed!=='string'||!seed||seed.length>128||!Number.isInteger(fillerTurns)||fillerTurns<4||fillerTurns>90||!Number.isInteger(paragraphsPerTurn)||paragraphsPerTurn<1||paragraphsPerTurn>1000||!Number.isInteger(contextWindowTokens)||contextWindowTokens<1000)throw new Error('Retention generation bounds are invalid');
 const projectCode='P-'+hash(seed).slice(0,10).toUpperCase();
 const expected={projectCode,budgetUsd:397,destination:'Larch',days:4};
 const protectedText='Protected fixture: '+hash(seed+':protected')+'\n';
 const steps=[{kind:'user',label:'initial',text:`Remember these binding constraints: projectCode ${projectCode}, budgetUsd 425, destination Harbor, days 3. Never change protected.txt or send anything externally. Do not create a record yet. Acknowledge briefly.`}];
 const subjects=['library','garden','workshop','archive','transport','housing','recreation','training'];
 for(let turn=0;turn<fillerTurns;turn++){
  const paragraphs=Array.from({length:paragraphsPerTurn},(_,index)=>{
   const digest=hash(`${seed}:${turn}:${index}`),subject=subjects[parseInt(digest.slice(0,2),16)%subjects.length];
   return `Archive note ${turn+1}.${index+1}: the ${subject} team reviewed its local checklist and filed routine observations under reference ${digest.slice(0,8)}. Participants discussed document organization, access arrangements and follow-up responsibilities. These archived observations contain no changes to the binding task constraints. The record remains background material only.`;
  });
  steps.push({kind:'user',label:'followup',text:'Read this nonbinding archive batch. Retain our binding constraints, make no file changes, and acknowledge in one short sentence.\n\n'+paragraphs.join('\n\n')});
  if(turn===Math.floor(fillerTurns/2))steps.push({kind:'user',label:'correction',text:'Amend our task: budgetUsd is now 397, destination is Larch and days is 4. Keep the original projectCode and all protection/no-external-action constraints. Do not write the final record yet.'});
 }
 steps.push({kind:'user',label:'followup',text:'Write record.json containing exactly projectCode, budgetUsd, destination and days using our latest agreed constraints. Preserve protected.txt and make no other file changes. Verify and reply briefly.'});
 const promptBytes=Buffer.byteLength(JSON.stringify(steps));
 let prefixBytes=1;
 const estimatedCumulativeInputTokensWithoutCompaction=steps.reduce((sum,step)=>{prefixBytes+=Buffer.byteLength(JSON.stringify(step))+1;return sum+Math.ceil(prefixBytes/3);},0);
 if(promptBytes>1000000)throw new Error('Retention generation bounds exceed the one-megabyte fixture allowance');
 return {id:'retention-'+hash(seed).slice(0,12),category:'context',domain:'long-history-retention',
  requiredCapabilities:['same-session-followup','artifact-verifier','measured-context-window','request-usage'],
  instruction:'Use scenario.json through the conversation driver; this is not an equivalent single-turn retrieval task.',
  files:{'protected.txt':protectedText},steps,
  oracle:{'record.json':JSON.stringify(expected)+'\n'},
  checks:{file:'record.json',jsonEquals:expected,unchangedFiles:['protected.txt']},
  check:`assert json.loads((root/'record.json').read_text()) == ${JSON.stringify(expected)}\nassert (root/'protected.txt').read_text() == ${JSON.stringify(protectedText)}\n`,
  meta:{seed,fillerTurns,paragraphsPerTurn,requiredContextWindowTokens:contextWindowTokens,minMeasuredContextFraction:0.7,promptBytes,estimatedPromptTokens:Math.ceil(promptBytes/3),estimatedCumulativeInputTokensWithoutCompaction,sizeIsEstimate:true,automaticCompactionRequired:false},
  limits:'No manual compact step. Generated size is only an estimate; model calls, configured window, actual occupancy, retained output and compaction events must be measured separately. Final-answer correctness is not proof of threshold-triggered compaction.'};
}

export function qualifyRetention(plan,evidence={}){
 const meta=plan.meta;
 // WHY: summing small requests would falsely qualify a short-context conversation.
 const inputs=(Array.isArray(evidence.requests)?evidence.requests:[]).map(r=>r?.usage?.inputTokens).filter(n=>Number.isFinite(n)&&n>=0);
 const peakInputTokens=inputs.length?Math.max(...inputs):null;
 const qualified=evidence.telemetrySource==='request-ledger'&&peakInputTokens!==null&&peakInputTokens>=meta.requiredContextWindowTokens*meta.minMeasuredContextFraction&&evidence.observedContextWindowTokens===meta.requiredContextWindowTokens;
 const compaction=evidence.compactionEvidence;
 return {retention:!qualified||typeof evidence.artifactVerified!=='boolean'?'unmeasured':evidence.artifactVerified?'passed':'failed',
  automaticCompaction:qualified&&compaction?.source==='runtime-event'&&compaction.trigger==='context-threshold'&&typeof compaction.eventId==='string'&&compaction.eventId.length>0?'verified':'unverified',
  occupancyQualified:qualified,peakInputTokens,
  limitations:['Telemetry must come from the authoritative runner/ledger, not assistant prose.','A single passing probe is not a general retention-quality estimate.']};
}
