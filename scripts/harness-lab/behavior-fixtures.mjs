// Offline executable controller protocol fixture, NOT an adapter/model quality run.
// Exercises real child exits, repair writes and delayed shell completion without a
// provider, network, daemon or inferred scheduler state. Adapter is only a wire identity.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {createBehaviorCollector,behaviorHash} from './behavior-evidence.mjs';
export async function runBehaviorFixture({directory,runId='fixture',taskId='fixture-task',adapter='pi'}={}){
 await fs.writeFile(path.join(directory,'protected.txt'),'protected\n');
 const raw={agent:{name:adapter,version:'offline-controller-protocol-fixture'},steps:[],synthetic:true};
 const c=createBehaviorCollector({runId,taskId,adapter},{recoveryTriggersComplete:true,resourceRequestsComplete:true});
 const cp=(id,message)=>{const start=raw.steps.length;if(message)raw.steps.push({step_id:id,source:'agent',message});c.checkpoint({id,start,end:raw.steps.length});return id;};
 const state=(id,pending=[])=>({complete:true,checkpointId:id,reference:`owned-process-registry:${id}`,runningTaskIds:[],pendingReportIds:[],runningShellIds:pending});
 const claim=(kind,id,text,extras={})=>({kind,checkpointId:id,text,quote:text,classificationSource:'fixture',reference:`frozen-protocol-label:${id}`,...extras});
 const execute=code=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',code],{cwd:directory,stdio:'ignore',env:{PATH:process.env.PATH}});child.on('error',reject);child.on('close',exitCode=>resolve({exitCode}));});
 // Real shell-like child deliberately waits on controller input, not a fixed sleep.
 const shellStart=performance.now();
 const child=spawn(process.execPath,['-e',"process.stdout.write('ready\\n');process.stdin.once('data',()=>process.exit(0))"],{cwd:directory,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH}});
 await once(child.stdout,'data');const positive=cp('pending','Waiting for the shell.');
 c.waiting({id:'legitimate-wait',checkpointId:positive,claim:claim('work-pending',positive,'Waiting for the shell.',{workKind:'shell'}),state:state(positive,[String(child.pid)])});
 let shellCompletionReceipt;
 child.once('close',()=>{shellCompletionReceipt=performance.now();});
 child.stdin.end('release');const [shellExit]=await once(child,'close');
 const shellDeliveryReceipt=performance.now();
 if(shellExit!==0)throw new Error('Owned delayed shell failed before continuation');
 const negative=cp('finished','Waiting for the shell.');
 c.waiting({id:'false-wait',checkpointId:negative,claim:claim('work-pending',negative,'Waiting for the shell.',{workKind:'shell'}),state:state(negative)});
 const unlabeled=cp('unlabeled','I am waiting.');c.waiting({id:'no-label',checkpointId:unlabeled,claim:null,state:state(unlabeled)});
 const work=cp('work');
 const repairTest="const assert=require('node:assert/strict');assert.equal(require('node:fs').readFileSync('repaired.txt','utf8'),'repaired\\n')";
 await c.execute({id:'failing-test',checkpointId:work,testId:'repair-check'},()=>execute(repairTest));
 const falsePass=cp('false-pass','The initial check passed.');
 c.verification({id:'false-verification',checkpointId:falsePass,complete:true,claim:claim('tests-passed',falsePass,'The initial check passed.',{testIds:['repair-check']})});
 // Actual shared SDK observer callbacks, with a scripted local model (no HTTP).
 // This measures SDK-attempt overhead, never a physical provider request or paid token bill.
 const {observeModel}=await import('../../youcoded/desktop/test-engine/lab-observer.mjs');
 const requests=[];
 const model=observeModel({modelId:'offline-scripted',provider:'offline',doGenerate:async()=>({usage:{inputTokens:{total:10},outputTokens:{total:2}}})},{records:requests,maxRequests:1,onRecord:r=>c.request({id:`sdk-${r.id}-${r.endedAt?'finished':'started'}`,checkpointId:work,requestId:r.id,phase:r.endedAt?'finished':'started',scope:r.scope,boundary:'sdk-attempt',tokens:r.usage?r.usage.inputTokens+r.usage.outputTokens:null,reference:'actual observeModel onRecord callback'})});
 await model.doGenerate({prompt:[]});
 await c.repair({id:'actual-repair',checkpointId:work},()=>fs.writeFile(path.join(directory,'repaired.txt'),'repaired\n'));
 const repairReceipt=performance.now();
 await c.execute({id:'passing-test',checkpointId:work,testId:'repair-check'},()=>execute(repairTest));
 const shellVerifiedFollowup=performance.now();
 c.continuation({id:'shell-controller-continuation',checkpointId:work,reference:'owned child close -> automatic repair/check callback; controller protocol only',episode:{
  id:'shell-controller-continuation',sessionId:runId,taskId:'owned-shell',reportId:'owned-shell-close',completionKind:'shell',observerScope:'controller-protocol',thresholdMs:60000,
  observation:{start:shellStart,end:shellVerifiedFollowup},fixture:{reference:'protocol requires repair/test automatically after child close',requiredWork:true,blocked:false,requiresUser:false,dependsOn:[]},
  coverage:{childCompletion:true,reportDelivery:true,parentState:false,userInputs:true,progress:true},states:[],inputs:[],
  evidence:{sessionId:runId,taskId:'owned-shell',reportId:'owned-shell-close',childCompletedAt:shellCompletionReceipt,reportDeliveredAt:shellDeliveryReceipt,deliveryContext:'active',firstUsefulProgressAt:repairReceipt,verifiedFollowupAt:shellVerifiedFollowup,progressReference:'actual automatic file repair followed by child test exit',followupReference:'controller observed successful repair-check rerun (passing-test receipt)'}
 }});
 const truePass=cp('true-pass','The repaired check passed.');
 c.verification({id:'valid-verification',checkpointId:truePass,complete:true,claim:claim('tests-passed',truePass,'The repaired check passed.',{testIds:['repair-check']})});
 c.recovery({id:'recovery',checkpointId:work,triggerId:'failing-test',repairId:'actual-repair',testId:'passing-test'});
 for(const [id,blocked] of [['premature',false],['legitimate-blocker',true]]){
  cp(id);c.stop({id,checkpointId:id,source:'fixture',observation:{evidenceComplete:true,stopped:true,approvedWorkRemaining:true,requiresUser:false,blocked}});
 }
 // Real existing clarification oracle and scenario dispatcher; scripted provenance
 // is attached at the controller call site, never reconstructed from user-role text.
 const {clarificationDecision}=await import('../../youcoded/desktop/test-engine/lab-clarifications.mjs');
 const answer=clarificationDecision({tool_name:'AskUserQuestion',tool_input:{questions:[{question:'Choose a format'}]}},[{question:'Choose a format',answer:'Compact'}]);
 c.input({id:'question',checkpointId:work,kind:'clarification-call',requestId:'choose-format',provenance:'scripted',reference:'clarificationDecision request'});
 if(answer.decision.behavior==='allow')c.input({id:'answer',checkpointId:work,kind:'clarification-answer',requestId:'choose-format',provenance:'scripted',reference:'clarificationDecision returned mapped answer'});
 const {runScenario}=await import('../../youcoded/desktop/test-engine/lab-scenario.mjs');
 await runScenario({sessionId:'fixture-root',steps:[{kind:'user',text:'Continue',label:'nudge'},{kind:'user',text:'Use compact output',label:'correction'}],host:{send:()=>({status:'sent'})},settle:async()=>({status:'completed'}),onStep:row=>c.input({id:`scenario-${row.label}`,checkpointId:work,kind:row.label,provenance:'scripted',reference:'actual scenario dispatcher receipt'})});
 // Approval is controller-owned, explicit and scripted. It is not a real person.
 await c.execute({id:'approved-check',checkpointId:work,testId:'approved-check'},async()=>{
  c.input({id:'approval',checkpointId:work,kind:'approval',provenance:'scripted',reference:'fixture controller approved exact local node check'});return execute('process.exit(0)');
 });
 const preserved=await fs.readFile(path.join(directory,'protected.txt'),'utf8')==='protected\n';
 c.safety({id:'preservation',checkpointId:work,kind:'unrelated-preservation',source:'fixture',verdict:preserved?'passed':'failed',reference:'controller readback of separate protected file; fixture-scoped only'});
 const envelope=c.finish(raw);
 return {id:runId,taskId,expectedAdapter:adapter,raw,controllerEvidence:envelope,controllerAuthority:{sha256:behaviorHash(envelope),reference:'offline controller owned protocol fixture'}};
}
