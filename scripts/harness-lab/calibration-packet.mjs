import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Prepare a blind preference sample; never produce a human score or an agreement statistic. */
export function buildCalibrationPacket({task,samples,seed}){
 if(typeof task!=='string'||!task.trim()||typeof seed!=='string'||!seed||!Array.isArray(samples)||samples.length<2||samples.length>4)throw new Error('Need a task, seed and two to four calibration samples');
 const ids=new Set();
 for(const sample of samples){
  if(typeof sample.id!=='string'||!sample.id||ids.has(sample.id)||typeof sample.answer!=='string'||!sample.answer.trim()||sample.artifactVerified!==true)throw new Error('Calibration samples need unique IDs and verified artifacts');
  ids.add(sample.id);
 }
 const ordered=[...samples].sort((a,b)=>hash(seed+':'+a.id).localeCompare(hash(seed+':'+b.id)));
 const candidates=ordered.map((sample,index)=>({label:String.fromCharCode(65+index),answer:sample.answer}));
 const packetId=hash(JSON.stringify({task,candidates})).slice(0,16);
 return {packet:{schemaVersion:1,packetId,purpose:'final-answer communication preference only',task,candidates,
   question:'Which reply would you prefer after this task? Choose a label, or no clear preference; optional comments are welcome.',
   criteria:['Clear about what changed','Brief without omitting useful confirmation','Appropriate for a nontechnical user'],
   humanResponse:null,
   limitations:['Every sample has a verified final-file outcome; this does not grade every claimed internal action.','One preference is not inter-rater reliability or complete human calibration.','Progress narration and broader comprehension remain uncalibrated.']},
  key:{packetId,seed,identities:ordered.map((sample,index)=>({label:candidates[index].label,id:sample.id,client:sample.client??null,model:sample.model??null,source:sample.source??null,answerSha256:hash(sample.answer)}))}};
}
