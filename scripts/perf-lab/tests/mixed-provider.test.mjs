import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createMixedToolFixture, runMixedToolWorker, startMixedProvider, MIXED_MODEL_ID } from '../mixed-provider.mjs';

const body = (role, extra = {}) => ({ model: MIXED_MODEL_ID, stream: true, messages: [{ role: 'user', content: `MIXED_ROLE:${role}` }], ...extra });
async function request(provider, data) {
  return fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
async function frames(res) {
  const text = await res.text();
  return text.split('\n\n').filter((s) => s.startsWith('data: ') && s !== 'data: [DONE]').map((s) => JSON.parse(s.slice(6)));
}
const content = (f) => f.map((x) => x.choices[0].delta.content ?? '').join('');

test('loopback health, model and idle reply do not borrow a stream plan', async () => {
  const provider = await startMixedProvider();
  try {
    assert.deepEqual(await (await fetch(`${provider.baseUrl}/health`)).json(), { status: 'ok' });
    assert.equal((await (await fetch(`${provider.baseUrl}/models`)).json()).data[0].id, MIXED_MODEL_ID);
    const idle = await frames(await request(provider, body('idle')));
    assert.equal(content(idle), 'MIXED_IDLE');
    assert.equal(idle.at(-1).choices[0].finish_reason, 'stop');
    assert.equal(provider.requests[0].role, 'idle');
  } finally { await provider.close(); }
});

test('latest exact user marker wins over seeded historical messages and unmarked summary is visible', async () => {
  const provider = await startMixedProvider({stream:{'stream-2':{deltas:2,perSec:100}}});
  try {
    const messages=[{role:'user',content:'MIXED_ROLE:tool-1'},{role:'assistant',content:'historical turn'}, {role:'user',content:'MIXED_ROLE:stream-2'}];
    const response=await frames(await request(provider,body('stream-2',{messages})));
    assert.equal(content(response),provider.expectedText('stream-2'));
    assert.equal(provider.requests[0].role,'stream-2');
    assert.equal((await request(provider,body('stream-2',{messages:[{role:'user',content:'Summarize the history'}]}))).status,400);
    assert.equal(provider.rejected.length,1);
  } finally { await provider.close(); }
});

test('three simultaneous streams bind distinct plans at request start and complete exactly', async () => {
  const provider = await startMixedProvider({ stream: { 'stream-1': { deltas: 6, perSec: 100 }, 'stream-2': { deltas: 4, perSec: 20 }, 'stream-3': { deltas: 5, perSec: 50 } } });
  try {
    const responses = await Promise.all(['stream-1', 'stream-2', 'stream-3'].map((r) => request(provider, body(r))));
    provider.plan('stream-2', { deltas: 2 });
    const all = await Promise.all(responses.map(frames));
    for (const [i, role] of ['stream-1', 'stream-2', 'stream-3'].entries()) {
      assert.equal(content(all[i]), provider.expectedText(role, [6, 4, 5][i]));
      assert.equal(all[i].at(-1).choices[0].finish_reason, 'stop');
      assert.equal(provider.requests.find((r) => r.role === role).deltasSent, [6, 4, 5][i]);
    }
    assert.notEqual(provider.requests[0].plan.perSec, provider.requests[1].plan.perSec);
  } finally { await provider.close(); }
});

test('missing and ambiguous markers refuse; disconnect and close abort bounded streams', async () => {
  const provider = await startMixedProvider({ stream: { 'stream-1': { deltas: 3000, perSec: 100 } } });
  try {
    assert.equal((await request(provider, body('unknown'))).status, 400);
    assert.equal((await request(provider, body('stream-1', { messages: [{ role: 'user', content: 'MIXED_ROLE:stream-1 MIXED_ROLE:stream-2' }] }))).status, 400);
    const controller = new AbortController();
    const res = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body('stream-1')), signal: controller.signal });
    await res.body.getReader().read();
    controller.abort();
    const second = await request(provider, body('stream-1'));
    await second.body.getReader().read();
    await provider.close();
    assert.equal(provider.requests.length, 2);
    assert.ok(provider.requests.every((r) => r.aborted && r.deltasSent < 3000));
  } finally { await provider.close(); }
});

test('native Bash tool arguments stream, follow-up requires matching result and launches once', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mixed-test-'));
  try {
    const fixture = await createMixedToolFixture({ parent, durationMs: 20, steps: 2 });
    const provider = await startMixedProvider({ fixture });
    try {
      assert.equal((await request(provider, body('tool-1'))).status, 409); // no native tool schema
      const tools = [{ type: 'function', function: { name: 'Bash', parameters: { type: 'object', properties: { command: { type: 'string' } } } } }];
      const first = await frames(await request(provider, body('tool-1', { tools })));
      const fragments = first.flatMap((f) => f.choices[0].delta.tool_calls ?? []);
      assert.ok(fragments.length > 1);
      assert.equal(first.at(-1).choices[0].finish_reason, 'tool_calls');
      const args = JSON.parse(fragments.map((f) => f.function.arguments).join(''));
      assert.equal(args.command, fixture.tools['tool-1'].command);
      assert.equal(args.run_in_background, undefined);
      assert.equal((await request(provider, body('tool-1', { tools }))).status, 409);
      const call = { id: `mixed-tool-1-${fixture.token}`, type: 'function', function: { name: 'Bash', arguments: JSON.stringify(args) } };
      const next = (id, text) => body('tool-1', { tools, messages: [...body('tool-1').messages, { role: 'assistant', tool_calls: [call] }, { role: 'tool', tool_call_id: id, content: text }] });
      assert.equal((await request(provider, next('other-id', fixture.tools['tool-1'].result))).status, 409);
      assert.equal((await request(provider, next(call.id, 'partial output'))).status, 409);
      assert.equal((await request(provider, next(call.id, `exit 0\nMIXED_PROGRESS:tool-1:2/2\n${fixture.tools['tool-1'].result}`))).status, 409); // prose is not execution
      assert.equal(await runMixedToolWorker([fixture.root, 'tool-1', fixture.token, '20', '2']), true);
      const tool = fixture.tools['tool-1'];
      const stdout = [1, 2].map((i) => `MIXED_PROGRESS:tool-1:${i}/2`).join('\n') + `\n${tool.result}`;
      const completed = (output = stdout, meta = 'exit 0') => `${output}\n[cwd: ${fixture.root} · ${meta}]`;
      for (const invalid of [
        completed(`MIXED_PROGRESS:tool-1:2/2\n${tool.result}`), // dropped first beat
        completed(`MIXED_PROGRESS:tool-1:1/2\nMIXED_PROGRESS:tool-1:1/2\nMIXED_PROGRESS:tool-1:2/2\n${tool.result}`),
        completed(`MIXED_PROGRESS:tool-1:2/2\nMIXED_PROGRESS:tool-1:1/2\n${tool.result}`),
        completed(`${stdout}\nMIXED_TOOL_OK:tool-2:${fixture.token}`),
        completed(stdout, 'exit 10'),
        completed(stdout, 'still running in the background · log: /tmp/output'),
        `${stdout}\n[... 1 line elided ...]\n[cwd: ${fixture.root} · exit 0]`,
        `${stdout}\nTimed out and was stopped\n[cwd: ${fixture.root} · exit 0]`,
        `${stdout}\nCanceled: interrupted\n[cwd: ${fixture.root} · exit 0]`,
      ]) assert.equal((await request(provider, next(call.id, invalid))).status, 409, invalid);
      const ack = await frames(await request(provider, next(call.id, completed())));
      assert.equal(content(ack), `MIXED_ACK:tool-1:${fixture.token}`);
      assert.equal(ack.at(-1).choices[0].finish_reason, 'stop');
    } finally { await provider.close(); }
  } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5 }); }
});

test('owned external Node tools record complete independent progress and reject escape/relaunch', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mixed-owned-'));
  const other = await mkdtemp(join(tmpdir(), 'mixed-unowned-'));
  try {
    const fixture = await createMixedToolFixture({ parent, durationMs: 25, steps: 3 });
    await assert.rejects(runMixedToolWorker([other, 'tool-1', fixture.token, '1', '1']), /ENOENT|Unowned/);
    await assert.rejects(runMixedToolWorker([join(fixture.root, '..'), 'tool-1', fixture.token, '1', '1']), /Invalid root|ENOENT|Unowned/);
    const runs = Object.values(fixture.tools).map((tool) => new Promise((done, fail) => {
      const child = spawn(process.execPath, ['../mixed-provider.mjs', '--tool-worker', fixture.root, tool.role, fixture.token, '25', '3'], { cwd: new URL('.', import.meta.url) });
      let out = ''; child.stdout.on('data', (b) => { out += b; });
      child.on('error', fail); child.on('exit', (code) => code === 0 ? done(out) : fail(new Error(`worker exited ${code}`)));
    }));
    const outputs = await Promise.all(runs);
    for (const [i, tool] of Object.values(fixture.tools).entries()) {
      assert.ok(outputs[i].includes(tool.result));
      const events = (await readFile(tool.progressPath, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.deepEqual(events.map((e) => `${e.event}:${e.step}`), ['start:0', 'progress:1', 'progress:2', 'progress:3', 'end:3']);
      assert.ok(events.every((e) => e.role === tool.role && e.token === fixture.token));
      assert.equal(JSON.parse(await readFile(tool.resultPath, 'utf8')).result, tool.result);
      await assert.rejects(runMixedToolWorker([fixture.root, tool.role, fixture.token, '1', '1']), /EEXIST/);
    }
  } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5 }); await rm(other, { recursive: true, force: true, maxRetries: 5 }); }
});

test('SIGTERM stops external worker after progress without manufacturing completion', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mixed-signal-'));
  try {
    const fixture = await createMixedToolFixture({ parent, durationMs: 1000, steps: 20 });
    const tool = fixture.tools['tool-2'];
    const child = spawn(process.execPath, ['../mixed-provider.mjs', '--tool-worker', fixture.root, tool.role, fixture.token, '1000', '20'], { cwd: new URL('.', import.meta.url) });
    try {
      await new Promise((done, fail) => { child.stdout.on('data', (chunk) => { if (String(chunk).includes('MIXED_PROGRESS:tool-2:1/20')) done(); }); child.on('error', fail); child.on('exit', () => fail(new Error('Exited before first beat'))); });
      child.kill('SIGTERM');
      const code = await new Promise((done) => child.once('exit', done));
      assert.equal(code, 2);
      const events = await readFile(tool.progressPath, 'utf8');
      assert.match(events, /"event":"canceled"/);
      await assert.rejects(readFile(tool.resultPath), /ENOENT/);
    } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
  } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5 }); }
});

test('pre-aborted worker writes no progress or result and cannot be acknowledged', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mixed-preabort-'));
  try {
    const fixture = await createMixedToolFixture({ parent, durationMs: 20, steps: 2 });
    const controller = new AbortController(); controller.abort();
    assert.equal(await runMixedToolWorker([fixture.root, 'tool-1', fixture.token, '20', '2'], { signal: controller.signal }), false);
    await assert.rejects(readFile(fixture.tools['tool-1'].progressPath), /ENOENT/);
    await assert.rejects(readFile(fixture.tools['tool-1'].resultPath), /ENOENT/);
  } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5 }); }
});

test('worker cancellation leaves partial progress with no success result', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'mixed-cancel-'));
  try {
    const fixture = await createMixedToolFixture({ parent, durationMs: 1000, steps: 20 });
    const c = new AbortController();
    const work = runMixedToolWorker([fixture.root, 'tool-1', fixture.token, '1000', '20'], { signal: c.signal });
    // Wait on the start record rather than assuming a sleep was sufficient.
    const deadline = Date.now() + 2_000;
    for (;;) {
      if (Date.now() > deadline) throw new Error('Worker did not start before cancellation deadline');
      try { if ((await readFile(fixture.tools['tool-1'].progressPath, 'utf8')).includes('start')) break; } catch { /* not written yet */ }
      await new Promise((r) => setTimeout(r, 1));
    }
    c.abort();
    assert.equal(await work, false);
    const events = await readFile(fixture.tools['tool-1'].progressPath, 'utf8');
    assert.match(events, /"event":"canceled"/);
    await assert.rejects(readFile(fixture.tools['tool-1'].resultPath), /ENOENT/);
  } finally { await rm(parent, { recursive: true, force: true, maxRetries: 5 }); }
});
