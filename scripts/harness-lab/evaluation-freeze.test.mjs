import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cases} from './suite.mjs';
import * as freeze from './evaluation-freeze.mjs';

test('evaluation freeze detects source changes, exported-file changes and links without authorizing execution',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yc-eval-freeze-')),out=path.join(root,'frozen');
 try{
  const manifest=freeze.freezeEvaluationSet(out,[cases[0]]);
  assert.equal(manifest.executionAuthorized,false);assert.equal(freeze.verifyEvaluationSet(out,[cases[0]]).matches,true);
  assert.throws(()=>freeze.freezeEvaluationSet(out,[cases[0]]),/exist/i);
  assert.equal(freeze.verifyEvaluationSet(out,[{...cases[0],instruction:'changed task'}]).matches,false);
  const input=path.join(out,cases[0].id,'environment','fixtures','request.json');const original=fs.readFileSync(input);
  fs.writeFileSync(input,'changed');assert.equal(freeze.verifyEvaluationSet(out,[cases[0]]).matches,false);
  fs.writeFileSync(input,original);fs.unlinkSync(input);fs.symlinkSync(path.join(root,'outside'),input);
  assert.throws(()=>freeze.verifyEvaluationSet(out,[cases[0]]),/link/i);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
