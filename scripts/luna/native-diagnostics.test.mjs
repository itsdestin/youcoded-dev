import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readNativeDiagnostics } from './native-diagnostics.mjs';

test('returns only allowed provider usage, including failed attempts, and never a session id', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luna-native-diag-'));
  const dir = path.join(root, 'private-diagnostics', 'chatgpt-cache');
  await mkdir(dir, { recursive:true, mode:0o700 });
  const rows = [
    { version:1,sessionId:'SECRET_SESSION',attemptId:'SECRET_ATTEMPT_1',model:'gpt-5.6-luna',purpose:'chat',outcome:'success',inputTokens:1200,outputTokens:12,cachedInputTokens:800,cacheDetailPresent:true,durationMs:1000,requestBody:'PRIVATE_PROMPT' },
    { version:1,sessionId:'SECRET_SESSION',attemptId:'SECRET_ATTEMPT_2',model:'gpt-5.6-luna',purpose:'chat',outcome:'failed',inputTokens:null,outputTokens:null,cachedInputTokens:null,cacheDetailPresent:false,durationMs:1200 },
    { version:1,sessionId:'OTHER',attemptId:'OTHER_ATTEMPT',model:'gpt-5.6-luna',purpose:'chat',outcome:'success',inputTokens:99,outputTokens:1,cachedInputTokens:0,cacheDetailPresent:true,durationMs:3 },
  ];
  await writeFile(path.join(dir, 'requests.jsonl'), rows.map(x=>JSON.stringify(x)).join('\n')+'\n', { mode:0o600 });
  const seen = new Set();
  try {
    const result = await readNativeDiagnostics({directory:dir,sessionId:'SECRET_SESSION',seen});
    assert.equal(result.length,2);
    assert.deepEqual(result.map(x=>x.outcome),['success','failed']);
    assert.equal(result[0].cachedInputTokens,800);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE_PROMPT'));
    assert.deepEqual(await readNativeDiagnostics({directory:dir,sessionId:'SECRET_SESSION',seen}),[]);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('refuses a symlinked private diagnostic file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luna-native-diag-'));
  const dir = path.join(root, 'private-diagnostics');
  await mkdir(dir,{mode:0o700});
  await writeFile(path.join(root,'outside'),'{}\n',{mode:0o600});
  await symlink(path.join(root,'outside'),path.join(dir,'requests.jsonl'));
  try { await assert.rejects(readNativeDiagnostics({directory:dir,sessionId:'x',seen:new Set()}),/private|symlink/); }
  finally { await rm(root,{recursive:true,force:true}); }
});
