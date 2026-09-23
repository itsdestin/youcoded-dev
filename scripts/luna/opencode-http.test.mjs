import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runOpenCodeHttpThreeTurns, sanitizeCompletedResponse } from './opencode-http.mjs';
import { startRequestGate } from './request-gate.mjs';

const finished = (read = 300) => ({ info: { role: 'assistant' }, parts: [{ type: 'step-finish', tokens: { input: 700, output: 4, reasoning: 0, cache: { read, write: 0 } } }, { type: 'text', text: 'PRIVATE_REPLY' }] });

test('extracts only provider usage from a completed assistant response', () => {
  assert.deepEqual(sanitizeCompletedResponse(finished()), [{ inputTokens: 1000, cacheReadTokens: 300, outputTokens: 4 }]);
  assert.throws(() => sanitizeCompletedResponse({ info: { role: 'assistant', error: { name: 'PRIVATE_ERROR' } }, parts: [] }), /OpenCode response error/);
  assert.throws(() => sanitizeCompletedResponse({ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'PRIVATE_REPLY' }] }), /no completed provider step/);
});

test('synchronous server response proves each turn complete before restart and resumes the same session', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'luna-http-fake-'));
  const privateRoot = path.join(dir, 'youcoded-luna-experiment');
  const fixture = path.join(dir, 'fixture');
  const env = { PATH: process.env.PATH, OPENCODE_PURE: '1', YOUCODED_LUNA_EXPERIMENT: '1' };
  const names = [['HOME','home'],['XDG_CONFIG_HOME','config'],['XDG_DATA_HOME','data'],['XDG_CACHE_HOME','cache'],['XDG_STATE_HOME','state'],['TMPDIR','tmp']];
  const gate = await startRequestGate({limit:3,budgets:{perProbe:1,perRepetition:3,perTurn:1,turnMs:90000}});
  try {
    await mkdir(privateRoot, {mode:0o700});
    await mkdir(fixture, {mode:0o700});
    for (const [key,name] of names) { env[key]=path.join(privateRoot,name); await mkdir(env[key],{mode:0o700}); }
    const authRoot=path.join(env.XDG_DATA_HOME,'opencode');
    await mkdir(authRoot,{mode:0o700});
    await writeFile(path.join(authRoot,'auth.json'),'{}',{mode:0o600});
    const fake=path.join(dir,'fake-opencode');
    await writeFile(fake, `#!/usr/bin/env node
import http from 'node:http';
const server=http.createServer(async (req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=Buffer.concat(chunks).length?JSON.parse(Buffer.concat(chunks).toString()):{};
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST' && req.url==='/session')return res.end(JSON.stringify({id:'test-session'}));
  if(req.method==='GET' && req.url==='/session/test-session')return res.end(JSON.stringify({id:'test-session'}));
  if(req.method==='POST' && req.url==='/session/test-session/message'){
    if(body.model?.modelID!=='gpt-5.6-luna'||body.parts?.[0]?.type!=='text')return res.writeHead(400).end('{}');
    const permit=await fetch(process.env.LUNA_GUARD_URL+'/reserve',{method:'POST'});
    if(permit.status!==204)return res.writeHead(429).end('{}');
    return res.end(JSON.stringify(${JSON.stringify(finished())}));
  }
  res.writeHead(404).end('{}');
});
server.listen(0,'127.0.0.1',()=>console.log('opencode server listening on http://127.0.0.1:'+server.address().port));
setInterval(()=>{},1000);
`,{mode:0o700});
    await chmod(fake,0o700);
    const result=await runOpenCodeHttpThreeTurns({binary:fake,cwd:fixture,env,authRoot,gate,prompts:['cold','warm','restart']});
    assert.equal(gate.reserved(),3);
    assert.deepEqual(result.turns.map(t=>[t.turn,t.inputTokens,t.cacheReadTokens]),[[1,1000,300],[2,1000,300],[3,1000,300]]);
    assert.equal(JSON.stringify(result).includes('PRIVATE_REPLY'),false);
    assert.equal(JSON.stringify(result).includes('test-session'),false);
  } finally { await gate.close(); await rm(dir,{recursive:true,force:true,maxRetries:3}); }
});
