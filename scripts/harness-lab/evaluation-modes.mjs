#!/usr/bin/env node
// WHY: modes select actual arms and task identities; repetition is a separate axis.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {developmentTasks} from './targeted-plan.mjs';
import {heldoutCases} from './heldout-cases.mjs';
import {legacyContract} from './legacy-protocol.mjs';
const contracts=JSON.parse(fs.readFileSync(new URL('./comparison-contracts.json',import.meta.url),'utf8'));
const external=JSON.parse(fs.readFileSync(new URL('./comparison-external-v2.json',import.meta.url),'utf8'));
// WHY: task identities/hash inputs explicitly bind the independently versioned contract.
export const comparisonTasks=contracts.tasks.map(t=>({...t,contractVersion:external.version,externalContract:external}));
const panel=JSON.parse(fs.readFileSync(new URL('./model-panel.json',import.meta.url),'utf8'));
export const registry=Object.freeze({
 youcoded:{version:null},'claude-code':{version:'2.1.302'},pi:{version:'1.3.0'},hermes:{version:'v0.22.2'},opencode:{version:'1.19.3'},
});
const capabilities=['filesystem','shell','functional-verifier','controlled-retrieval'];
const sha=/^[a-f0-9]{64}$/;
function need(ok,message){if(!ok)throw Error(message);}
function keys(value,allowed){need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k)),'Unknown scope/settings field');}
export function planMode(input){
 keys(input,['mode','profile','arms','taskIds','model','provider','network','limits','budgetUsd','image']);
 const {mode,profile,arms,model,provider,network,limits,budgetUsd,image}=input;
 need(['basic','compare','thorough'].includes(mode),'Unknown mode');
 need(['smoke','confirmation'].includes(profile),'Explicit smoke/confirmation repetition profile required');
 need(panel.models.some(m=>m.id===model)&&typeof provider==='string'&&/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,127}$/.test(provider)&&provider===provider.trim(),'Exact panel model and explicit provider label required');
 need(['controlled-retrieval','live-web'].includes(network),'Explicit research track required');
 need(typeof budgetUsd==='number'&&Number.isFinite(budgetUsd)&&budgetUsd>0&&budgetUsd<=15,'Positive experiment cap within existing USD15 ceiling required');
 need(typeof image==='string'&&/^[a-zA-Z0-9._/:@-]+@sha256:[a-f0-9]{64}$/.test(image),'Immutable image digest required');
 keys(limits,['maxRequests','timeoutSec','verifierTimeoutSec']);
 // WHY: retain the bounded legacy daily profiles, but substantial tasks cannot
 // accidentally inherit the old 20-request/180s canary allowance.
 const legacyBasic=mode==='basic'&&Array.isArray(input.taskIds)&&input.taskIds.length>0&&input.taskIds.every(id=>developmentTasks.some(t=>t.id===id));
 need(Number.isInteger(limits.maxRequests)&&limits.maxRequests>=(legacyBasic?20:40)&&limits.maxRequests<=120&&Number.isInteger(limits.timeoutSec)&&limits.timeoutSec>=(legacyBasic?180:480)&&limits.timeoutSec<=1200&&Number.isInteger(limits.verifierTimeoutSec)&&limits.verifierTimeoutSec>=(legacyBasic?30:60)&&limits.verifierTimeoutSec<=120,'Explicit per-mode limits required (legacy basic 20/180/30 minimum; substantial 40/480/60; maxima 120/1200/120)');
 need(Array.isArray(arms)&&arms.length>0&&new Set(arms.map(a=>a.id)).size===arms.length,'Unique explicit arms required');
 for(const a of arms){keys(a,['id','adapter','version','fingerprint','desktopDir','capabilities']);need(/^[a-z][a-z0-9-]*$/.test(a.id)&&registry[a.adapter]&&sha.test(a.fingerprint),'Pinned arm identity required');need(a.adapter==='youcoded'?a.version==='build:'+a.fingerprint:a.version===registry[a.adapter].version,'Adapter version differs from reviewed registry');if(a.capabilities!==undefined)need(Array.isArray(a.capabilities)&&a.capabilities.every(c=>capabilities.includes(c)),'Invalid capability inventory');}
 if(mode==='basic')need(arms.length===2&&arms.every(a=>a.adapter==='youcoded')&&arms.some(a=>a.id==='baseline')&&arms.some(a=>a.id==='candidate'),'basic requires baseline/candidate YouCoded builds');
 else if(mode==='compare')need(arms.length===2&&arms.filter(a=>a.adapter==='youcoded').length===1&&arms.filter(a=>a.adapter==='claude-code').length===1,'compare requires YouCoded versus Claude Code');
 else need(arms.length===Object.keys(registry).length&&Object.keys(registry).every(id=>arms.filter(a=>a.adapter===id).length===1),'thorough requires every registered supported adapter');
 const old=developmentTasks.map(t=>({id:t.id,split:'development',domain:t.domain??t.category,requiredCapabilities:['filesystem','shell','functional-verifier'],legacy:true}));
 let tasks;
 if(mode==='basic'){
  need(Array.isArray(input.taskIds)&&input.taskIds.length>=1&&input.taskIds.length<=3&&new Set(input.taskIds).size===input.taskIds.length,'basic selects 1..3 development tasks');
  tasks=input.taskIds.map(id=>{const t=[...comparisonTasks,...old].find(t=>t.id===id);need(t,'Unknown development task');return t;});
 }else{
  need(input.taskIds===undefined||JSON.stringify(input.taskIds)===JSON.stringify(comparisonTasks.map(t=>t.id))&&mode==='compare','Mode task scope is fixed');
  tasks=mode==='compare'?[...comparisonTasks]:[...comparisonTasks,...old,...heldoutCases.map(t=>({id:t.id,split:'evaluation-only',domain:t.domain??t.category,requiredCapabilities:['filesystem','shell','functional-verifier'],legacy:true,secrecy:'public-previously-inspected'}))];
 }
 // WHY: fresh preparations bind legacy acceptance to the actual frozen task
 // definition and independently versioned verifier, not just display metadata.
 tasks=tasks.map(t=>t.legacy?{...t,legacyVerification:legacyContract(t.id)}:t);
 const taskDefinitionHashes=Object.fromEntries(tasks.map(t=>[t.id,t.legacy?t.legacyVerification.definitionSha256:createHash('sha256').update(JSON.stringify(t)).digest('hex')]));
 const blockers=[];if(image.startsWith('offline-fixture@'))blockers.push('Offline fixture image/build identities are non-executable test doubles, not paid qualification');if(network==='live-web')blockers.push('live-web: unsupported/unqualified capture and native search path; controlled retrieval must not be relabeled');
 if(arms.some(a=>['claude-code','hermes'].includes(a.adapter))&&model!=='anthropic/claude-haiku-5.5')blockers.push('Claude Code/Hermes route only qualified for declared first-party Haiku model');
 const repetitions=profile==='smoke'?1:3,cells=[];
 for(const task of tasks)for(let r=0;r<repetitions;r++)for(const arm of arms){
  const missing=(task.requiredCapabilities??[]).filter(c=>!(arm.capabilities??capabilities).includes(c));
  if(missing.length)blockers.push(`${arm.id}/${task.id}: missing ${missing.join(',')}`);
  cells.push({taskId:task.id,split:task.split,arm:arm.id,agent:arm.adapter,model,repetition:r,missingCapabilities:missing});
 }
 return {schemaVersion:2,suiteVersion:external.version,mode,profile,arms,tasks,taskDefinitionHashes,cells,model,provider,network,limits,budgetUsd,image,repetitions,taskCount:tasks.length,armCount:arms.length,plannedCells:cells.length,requestCeilingBeforeBudget:cells.length*limits.maxRequests,blockers:[...new Set(blockers)],canRun:false,executionAuthorized:false,marketingReady:false,researchLabel:network==='controlled-retrieval'?'Frozen synthetic controlled search/retrieval; not live WebSearch':'Live-web unqualified',coverage:'Task acceptance offline; live resource/activity/supervision/recovery evidence not collected by planning'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{console.log(JSON.stringify(planMode(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
