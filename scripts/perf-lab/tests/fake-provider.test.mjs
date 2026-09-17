// Tests for fake-provider.mjs — the real server, over real HTTP, on a throwaway port.
// Run: node --test scripts/perf-lab/tests/fake-provider.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAKE_MODEL_ID, buildReplyText, splitDeltas, startFakeProvider } from '../fake-provider.mjs';

// 0 = any free port: two test processes (or a rig run) must never fight over one.
const PORT = 0;

async function streamOnce(server, body = {}) {
  const done = server.expectCompletion();
  const res = await fetch(`${server.baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'x', stream: true, messages: [{ role: 'user', content: 'hi' }], ...body }),
  });
  const text = await res.text();
  const frames = text.split('\n\n').filter(Boolean);
  return { res, text, frames, rec: await done };
}

test('buildReplyText is deterministic in its seed and long enough', () => {
  const a = buildReplyText({ chars: 5000, seed: 's' });
  const b = buildReplyText({ chars: 5000, seed: 's' });
  assert.equal(a, b);
  assert.ok(a.length >= 5000);
  assert.notEqual(a, buildReplyText({ chars: 5000, seed: 't' }));
  assert.ok(/```/.test(a), 'the reply carries fenced code, like a real coding reply');
});

test('splitDeltas cuts to exactly the requested count and never loses text inside the cut', () => {
  const text = 'alpha beta  gamma\nsupercalifragilistic done';
  const pieces = splitDeltas(text, 6);
  assert.equal(pieces.length, 6);
  assert.equal(pieces.join(''), text.slice(0, pieces.join('').length), 'pieces concatenate back to a prefix of the text');
  // '  gamma' is seven characters, over the 6-char token cap: its lead whitespace
  // rides with the first 4-char slice, the tail becomes its own delta.
  assert.deepEqual(pieces.slice(0, 4), ['alpha', ' beta', '  gamm', 'a']);
  // Padding when the text is short: still exactly `count`, every piece non-empty.
  const padded = splitDeltas('ab cd', 5);
  assert.equal(padded.length, 5);
  assert.ok(padded.every((p) => p.length > 0));
  assert.throws(() => splitDeltas('x', 0), /whole number >= 1/);
});

test('streams the planned number of deltas at the planned rate, then a finish frame and [DONE]', async () => {
  const server = await startFakeProvider({ port: PORT });
  try {
    server.plan({ deltas: 200, perSec: 200, seed: 'rate' });
    const t0 = Date.now();
    const { res, frames, rec } = await streamOnce(server);
    const wall = Date.now() - t0;
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    assert.equal(frames.length, 202, '200 deltas + finish frame + [DONE]');
    assert.equal(frames.at(-1), 'data: [DONE]');
    const first = JSON.parse(frames[0].slice(6));
    assert.equal(first.object, 'chat.completion.chunk');
    assert.equal(first.model, FAKE_MODEL_ID);
    assert.equal(first.choices[0].delta.role, 'assistant');
    assert.ok(first.choices[0].delta.content.length > 0);
    const finish = JSON.parse(frames.at(-2).slice(6));
    assert.equal(finish.choices[0].finish_reason, 'stop');
    assert.equal(finish.usage.completion_tokens, 200);
    // Rate: 200 at 200/s is ~1 s; allow generous jitter on a loaded test machine.
    assert.equal(rec.deltasSent, 200);
    assert.ok(rec.streamMs >= 850 && rec.streamMs <= 2500, `streamMs ${rec.streamMs}`);
    assert.ok(wall < 4000, `wall ${wall}`);
    assert.ok(rec.achievedPerSec > 80 && rec.achievedPerSec <= 240, `achieved ${rec.achievedPerSec}/s`);
    // The concatenated deltas are the planned text, byte for byte.
    const joined = frames.slice(0, 200).map((f) => JSON.parse(f.slice(6)).choices[0].delta.content).join('');
    assert.equal(joined, server.plannedText());
    assert.equal(rec.chars, joined.length);
  } finally {
    await server.close();
  }
});

test('two streams of the same plan send identical bytes; a new plan changes them', async () => {
  const server = await startFakeProvider({ port: PORT });
  try {
    server.plan({ deltas: 30, perSec: 1000, seed: 'same' });
    // Only the per-request id and the clock differ between two streams of one plan.
    const norm = (t) => t.replace(/"created":\d+/g, '').replace(/"id":"chatcmpl-perf-\d+"/g, '');
    const a = await streamOnce(server);
    const b = await streamOnce(server);
    assert.equal(norm(a.text), norm(b.text));
    server.plan({ seed: 'other' });
    const c = await streamOnce(server);
    assert.notEqual(norm(a.text), norm(c.text));
    assert.equal(server.requests.length, 3);
  } finally {
    await server.close();
  }
});

test('answers /v1/models and /health, refuses unknown routes, and answers a non-streaming probe with JSON', async () => {
  const server = await startFakeProvider({ port: PORT });
  try {
    const models = await (await fetch(`${server.baseUrl}/models`)).json();
    assert.equal(models.data[0].id, FAKE_MODEL_ID);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/health`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/nope`)).status, 404);
    const probe = await (await fetch(`${server.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', stream: false, messages: [], max_tokens: 1 }) })).json();
    assert.equal(probe.object, 'chat.completion');
    assert.equal(probe.choices[0].finish_reason, 'stop');
    assert.equal(server.requests.at(-1).stream, false);
  } finally {
    await server.close();
  }
});

test('a client that disconnects mid-stream marks the record aborted and the server still closes cleanly', async () => {
  const server = await startFakeProvider({ port: PORT });
  try {
    server.plan({ deltas: 500, perSec: 50, seed: 'abort' });
    const ctl = new AbortController();
    const done = server.expectCompletion();
    const p = fetch(`${server.baseUrl}/chat/completions`, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', stream: true, messages: [] }) });
    await new Promise((r) => setTimeout(r, 300));
    ctl.abort();
    await p.then((res) => res.text()).catch(() => {});
    const rec = await done;
    assert.equal(rec.aborted, true);
    assert.ok(rec.deltasSent < 500);
  } finally {
    await server.close();
  }
});
