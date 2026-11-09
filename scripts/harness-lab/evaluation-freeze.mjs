#!/usr/bin/env node
// Reuses the existing exporter and canonical fingerprinting. No model calls or spending approval.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {exportSuite} from './suite.mjs';
import {configurationFingerprint} from './evaluation-audit.mjs';
const manifestName='evaluation-freeze.json';
function sourceFingerprints(cases){return Object.fromEntries(cases.map(c=>[c.id,configurationFingerprint(c)]));}
function exportedHashes(root){
 if(fs.lstatSync(root).isSymbolicLink())throw new Error('Freeze root must not be a link');
 const hashes={};
 const walk=relative=>{
  for(const name of fs.readdirSync(path.join(root,relative)).sort()){
   const key=relative?relative+'/'+name:name;if(key===manifestName)continue;
   const file=path.join(root,key),stat=fs.lstatSync(file);
   if(stat.isSymbolicLink())throw new Error('Frozen exports must not contain links');
   if(stat.isDirectory())walk(key);
   else if(stat.isFile())hashes[key]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   else throw new Error('Frozen exports must contain only ordinary files/directories');
  }
 };
 walk('');return hashes;
}
export function freezeEvaluationSet(root,cases){
 exportSuite(root,cases,{split:'evaluation-only'});fs.chmodSync(root,0o700);
 const manifest={schemaVersion:1,createdAt:new Date().toISOString(),split:'evaluation-only',executionAuthorized:false,
  scope:'Case definitions and exported task files only; runtime/model configuration is separate.',
  integrity:'Hash-based drift detection, not authenticated tamper-proofing.',caseOrder:cases.map(c=>c.id),
  sourceFingerprints:sourceFingerprints(cases),exportedFileHashes:exportedHashes(root)};
 fs.writeFileSync(path.join(root,manifestName),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 return manifest;
}
export function verifyEvaluationSet(root,cases){
 const file=path.join(root,manifestName);
 if(fs.lstatSync(file).isSymbolicLink())throw new Error('Freeze manifest must not be a link');
 const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 const sourceMatches=configurationFingerprint(manifest.sourceFingerprints)===configurationFingerprint(sourceFingerprints(cases))&&JSON.stringify(manifest.caseOrder)===JSON.stringify(cases.map(c=>c.id));
 const filesMatch=configurationFingerprint(manifest.exportedFileHashes)===configurationFingerprint(exportedHashes(root));
 return {matches:manifest.schemaVersion===1&&manifest.split==='evaluation-only'&&manifest.executionAuthorized===false&&sourceMatches&&filesMatch,sourceMatches,filesMatch,executionAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),verify=args[0]==='--verify',directory=args[verify?1:0];
  if(!directory||args.length!==(verify?2:1)||(!verify&&directory.startsWith('--')))throw new Error('Usage: evaluation-freeze.mjs NEW_DIRECTORY | --verify DIRECTORY');
  const {heldoutCases}=await import('./heldout-cases.mjs');
  const result=verify?verifyEvaluationSet(path.resolve(directory),heldoutCases):freezeEvaluationSet(path.resolve(directory),heldoutCases);
  console.log(JSON.stringify(result,null,2));if(verify&&!result.matches)process.exitCode=1;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
