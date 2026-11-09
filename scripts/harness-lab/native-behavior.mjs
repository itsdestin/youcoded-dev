// Host-owned launch of EXISTING native offline profiles, never an agent-file
// importer. Fixed synthetic prompts and an empty disposable cwd prevent submitted
// code from impersonating SDK/permission/continuation hooks in this route.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {behaviorHash} from './behavior-evidence.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const ownedNativeProfiles=['background-followthrough','waiting-after-report','lost-report','clarification','activity-timing'];
export async function launchOwnedNativeProfile(profile){
 if(!ownedNativeProfiles.includes(profile))throw Error('Unsupported owned native profile');
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'yc-owned-native-'));
 try{
  const cwd=path.join(tmp,'work');await fs.mkdir(cwd);
  const output=path.join(tmp,'raw.json');
  const p=spawnSync(process.execPath,[path.resolve(here,'../../youcoded/desktop/test-engine/lab-runner.mjs'),'--smoke','--smoke-profile',profile,'--cwd',cwd,'--out',output],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,HOME:tmp}});
  if(p.status!==0)throw Error('Owned native profile failed: '+p.stderr);
  const raw=JSON.parse(await fs.readFile(output,'utf8'));
  const writeApproved=profile==='activity-timing'&&raw.permissionRequests.some(r=>r.tool==='Write')&&await fs.readFile(path.join(cwd,'lab-smoke.txt'),'utf8')==='production host smoke\n';
  return {raw,attestation:{profile,source:'host-owned-native-profile',rawSha256:behaviorHash(raw),writeApproved}};
 }finally{await fs.rm(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:20});}
}
// Only a matching host launch attestation can enable these fixture hooks. Agent
// SDK events remain observations in ordinary container runs, never host authority.
export function collectOwnedNative(c,raw,attestation){
 if(attestation?.source!=='host-owned-native-profile'||!ownedNativeProfiles.includes(attestation.profile)||attestation.rawSha256!==behaviorHash(raw))throw Error('Owned native capture binding mismatch');
 const checkpointId='answer',profile=attestation.profile;
 for(const r of raw.requests??[]){
  for(const phase of ['started','finished']){
   if(phase==='finished'&&!r.endedAt)continue;
   c.request({id:`native-${r.id}-${phase}`,checkpointId,requestId:r.id,phase,scope:r.scope??'parent',boundary:'sdk-attempt',tokens:phase==='finished'&&Number.isFinite(r.usage?.inputTokens)&&Number.isFinite(r.usage?.outputTokens)?r.usage.inputTokens+r.usage.outputTokens:null,reference:`owned ${profile}: actual observeModel SDK callback (not physical provider request)`});
  }
 }
 const wait=requestId=>{
  const starts=raw.activity?.receipts.filter(r=>r.kind==='ask-start'&&r.id===requestId&&r.scope==='parent')??[];
  const ends=raw.activity?.receipts.filter(r=>r.kind==='ask-end'&&r.id===requestId&&r.scope==='parent')??[];
  return starts.length===1&&ends.length===1?{start:starts[0].at,end:ends[0].at,clock:raw.activity.clock.id,reference:'owned native ask-start/ask-end '+requestId}:undefined;
 };
 for(const [i,q] of (raw.clarifications??[]).entries()){
  c.input({id:`native-question-${i}`,checkpointId,kind:'clarification-call',requestId:q.requestId,provenance:'scripted',reference:`owned ${profile}: PermissionRequest ${q.requestId}`});
  if(q.decision.behavior==='allow')c.input({id:`native-answer-${i}`,checkpointId,kind:'clarification-answer',requestId:q.requestId,provenance:'scripted',wait:wait(q.requestId),reference:`owned ${profile}: actual clarificationDecision allow ${q.requestId}`});
 }
 if(attestation.writeApproved){const asks=raw.activity.receipts.filter(r=>r.kind==='ask-start'&&r.scope==='parent');c.input({id:'native-write-approval',checkpointId,kind:'approval',provenance:'scripted',wait:asks.length===1?wait(asks[0].id):undefined,reference:'owned exact-Write fixture permission handler plus disk readback'});}
 if(raw.continuation?.episode)c.continuation({id:'native-continuation',checkpointId,episode:raw.continuation.episode,reference:`owned ${profile}: actual native-parent helper lifecycle; not shell/controller-protocol`});
}
