import {createHash} from 'node:crypto';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const get=(obj,key)=>key.split('.').reduce((value,part)=>value?.[part],obj);
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const REQUIRED=['task.id','task.version','task.fixtureHash','task.rubricHash','model.id','model.revision','model.provider','model.reasoning',
 'environment.image','environment.cpu','environment.memoryMb','environment.network','controls.permissions','controls.cacheCondition',
 'controls.maxSeconds','controls.maxRequests','controls.maxOutputTokens','harness.id','harness.version','harness.promptHash','harness.toolsHash','harness.skillsHash'];

export function configurationFingerprint(config){return createHash('sha256').update(JSON.stringify(canonical(config))).digest('hex');}

export function auditComparison(left,right,{track='harness',allowedDifferences=[]}={}){
  if(!['harness','model','ablation'].includes(track))throw new Error('Unknown comparison track');
  const missing=[],differences=[],blockers=[];
  for(const key of REQUIRED){
    for(const [name,config] of [['left',left],['right',right]]){
      const value=get(config,key);
      if(value===undefined||value===null||value==='') missing.push(`${name}.${key}`);
    }
    if(!same(get(left,key),get(right,key))) differences.push(key);
  }
  if(missing.length)blockers.push('Missing configuration evidence: '+missing.join(', '));
  const permitted=key=>track==='harness'?key.startsWith('harness.'):
    track==='model'?key.startsWith('model.'):
    allowedDifferences.includes(key)||key==='harness.version';
  for(const key of differences)if(!permitted(key))blockers.push(`Unmatched ${key}`);
  return {track,comparable:!blockers.length,missing,differences,blockers,
    fingerprints:{left:configurationFingerprint(left),right:configurationFingerprint(right)},
    caveat:'Matching recorded declarations does not establish that an adapter actually honored them; reconcile against captured requests and environment evidence.'};
}

export function graderReliability(grades,humanReferences=[]){
  if(!Array.isArray(grades)||!Array.isArray(humanReferences))throw new Error('Grade arrays required');
  if([...grades,...humanReferences].some(r=>typeof r.rubricVersion!=='string'||!r.rubricVersion.trim()))
    throw new Error('Every grade and human reference requires an explicit rubric version');
  const rubrics=new Set([...grades,...humanReferences].map(r=>r.rubricVersion));
  if(rubrics.size>1)throw new Error('Mixed or partially missing rubric versions');
  const ids=new Set(),itemGroups=new Map(),orderGroups=new Map();let invalid=0;
  for(const row of grades){
    if(!row.itemId||!row.judgeId||!row.dimension||typeof row.valid!=='boolean')throw new Error('Invalid grade identity');
    const id=JSON.stringify([row.itemId,row.judgeId,row.dimension,row.order??null,row.repetition??0]);
    if(ids.has(id))throw new Error('Duplicate grade');ids.add(id);
    if(!row.valid){invalid++;continue;}
    if(typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<1||row.score>5)throw new Error('Invalid score; expected 1–5');
    const item=JSON.stringify([row.itemId,row.dimension]);
    const group=itemGroups.get(item)??[];group.push(row.score);itemGroups.set(item,group);
    if(['AB','BA'].includes(row.order)){
      const key=JSON.stringify([row.itemId,row.judgeId,row.dimension,row.repetition??0]);
      const orders=orderGroups.get(key)??{};orders[row.order]=row.score;orderGroups.set(key,orders);
    }
  }
  const orderDifferences=[...orderGroups.values()].filter(g=>g.AB!==undefined&&g.BA!==undefined).map(g=>Math.abs(g.AB-g.BA));
  const humanIds=new Set(),humanDifferences=[];
  for(const row of humanReferences){
    const id=JSON.stringify([row.itemId,row.dimension]);
    if(!row.itemId||!row.dimension||humanIds.has(id))throw new Error('Missing/duplicate human reference');humanIds.add(id);
    if(typeof row.score!=='number'||!Number.isFinite(row.score)||row.score<1||row.score>5)throw new Error('Invalid human score');
    const values=itemGroups.get(id);
    if(values)humanDifferences.push(Math.abs(mean(values)-row.score));
  }
  const disagreements=[...itemGroups.values()].filter(g=>g.length>=2).map(g=>Math.max(...g)-Math.min(...g));
  return {rubricVersion:[...rubrics][0]??null,totalGrades:grades.length,acceptedGrades:grades.length-invalid,invalidGrades:invalid,
    invalidRate:grades.length?invalid/grades.length:null,
    comparedItems:disagreements.length,meanScoreRange:mean(disagreements),
    orderPairs:orderDifferences.length,meanAbsoluteOrderDifference:mean(orderDifferences),
    humanComparedItems:humanDifferences.length,humanMeanAbsoluteDifference:mean(humanDifferences),
    humanCalibrationEstablished:false,
    limitations:['Scores assume a declared common 1–5 rubric; do not compare different rubric versions.',
      'Invalid judgments are grader failures, not agent failures.',
      'Disagreement is reported, not subtracted from agent quality.',
      'One human reference is a calibration observation, not proof of robust human agreement.']};
}
