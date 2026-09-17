// scripts/perf-lab/fake-provider.mjs — a stand-in model server the rig can stream
// from at ANY speed, with deterministic content.
//
// WHY THIS EXISTS
// The rig's only real per-token stream was the local model (Qwen 0.5B under
// llama.cpp), which on this machine emits ~12 deltas a second — measured
// 2026-09-03: 35 deltas in 3 s against 181 frames. Real use is a cloud model at
// 50–150 tokens/s, so every per-token cost in the renderer was under-represented
// by an order of magnitude and the rig could not see the shell-redraw-per-token
// class of defect at all (docs/active/investigations/2026-09-01-perf-rig-blind-
// to-native-streaming.md). This server streams whatever rate the scenario asks
// for, and its content is the same seeded realistic markdown the transcripts use,
// so a baseline and a candidate stream byte-identical replies.
//
// HOW THE APP REACHES IT
// Not by replacing the engine binary. The app supports a user-added
// "Custom endpoint (OpenAI-compatible)" provider (provider-types.ts:6,
// provider-registry.ts:390-399): a row in ~/.youcoded/providers.json with a
// baseUrl and no key is immediately `ready`, and a native session bound to it
// sends POST <baseUrl>/chat/completions with `stream: true` through the AI SDK's
// openai-compatible client. The fixture writes that row (fixture.mjs, the
// `fakeProvider` option) pointing at this server's port; nothing else in the app
// is touched, and the real engine path (used by the workload's native leg) is
// unchanged.
//
// WHAT THE SDK READS from each SSE frame (openai-compatible-chat-language-model.ts
// schema, checked 2026-09-16): `choices[0].delta.content` -> one text-delta event,
// `finish_reason` -> finish, `usage` on the final frame, then `data: [DONE]`.
// Every delta here is its own frame, so N frames = N `assistant-text` events in
// the app = N reducer actions — the unit the renderer pays per.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { createServer } from 'node:http';
import { assistantContentBlocks } from './content.mjs';

/** Port the fixture's provider row points at. 9555/9556 are the rig's CDP ports. */
export const FAKE_PROVIDER_PORT = 9558;
/** The providers.json row id the fixture writes. Any string works; a ulid is not required. */
export const FAKE_PROVIDER_ID = 'perf-lab-fake';
/** Free-form on a custom endpoint (model-catalog.ts:296: the user types a model id). */
export const FAKE_MODEL_ID = 'perf-lab-streamer';

// ---------------------------------------------------------------------------
// Reply content (pure — unit-tested)
// ---------------------------------------------------------------------------

const REPLY_KINDS = Object.freeze(['prose', 'code', 'prose', 'diff', 'code', 'long_output']);

/**
 * A markdown reply of at least `chars` characters, built from the transcript
 * generator's own realistic blocks (prose, fenced code, diffs, log dumps) so the
 * streaming bubble parses the same shapes a real coding session streams.
 * Deterministic in `seed`.
 */
export function buildReplyText({ chars = 12_000, seed = 'perf-lab-stream' } = {}) {
  const parts = [];
  let total = 0;
  for (let i = 0; total < chars; i++) {
    const kind = REPLY_KINDS[i % REPLY_KINDS.length];
    const text = assistantContentBlocks(kind, `${seed}:${i}`)
      .filter((b) => b.type === 'text' && typeof b.text === 'string' && b.text)
      .map((b) => b.text)
      .join('\n\n');
    if (!text) continue;
    parts.push(text);
    total += text.length + 2;
  }
  return parts.join('\n\n');
}

/**
 * Cuts a reply into token-sized deltas: each whitespace run rides with the word
 * after it (how a real tokenizer emits " word"), and long words are split into
 * ~4-character pieces. Exactly `count` deltas: the text is truncated when it is
 * longer than the pieces needed, and the LAST piece absorbs any shortfall so the
 * count is never off by one. Pure, so the split is identical for baseline and candidate.
 */
export function splitDeltas(text, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`splitDeltas: count must be a whole number >= 1, got ${JSON.stringify(count)}`);
  const pieces = [];
  for (const m of text.matchAll(/\s*\S+|\s+$/g)) {
    const tok = m[0];
    if (tok.length <= 6) { pieces.push(tok); continue; }
    // A long token: keep any leading whitespace with the first slice.
    const lead = tok.match(/^\s*/)[0];
    const word = tok.slice(lead.length);
    for (let i = 0; i < word.length; i += 4) pieces.push((i === 0 ? lead : '') + word.slice(i, i + 4));
  }
  if (pieces.length >= count) return pieces.slice(0, count);
  // Not enough text: pad by repeating from the start so every delta carries text.
  const out = pieces.slice();
  for (let i = 0; out.length < count; i++) out.push(pieces[i % pieces.length] ?? ' x');
  return out;
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

const json = (res, status, body) => {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
};

/**
 * Starts the server. Returns a handle:
 *   plan({ deltas, perSec, seed, chars }) — what the NEXT chat completions stream(s) send;
 *                                            the plan stays until replaced
 *   expectCompletion()                     — a promise for the record of the next request
 *                                            that STARTS after this call and then finishes
 *   requests                               — every request record so far
 *   close()                                — stop listening and end any in-flight stream
 *
 * A request record: { index, model, stream, plannedDeltas, perSec, deltasSent, chars,
 *   startedAt, firstWriteAt, lastWriteAt, endedAt, streamMs, achievedPerSec,
 *   backpressureWaits, aborted }.
 * Times are Date.now() epoch ms so a scenario can line them up with its own clock.
 */
export async function startFakeProvider({ port = FAKE_PROVIDER_PORT, host = '127.0.0.1' } = {}) {
  let current = { deltas: 200, perSec: 100, seed: 'perf-lab-stream', chars: null };
  let planned = null;   // { text, pieces } built lazily from `current`
  const requests = [];
  const waiters = [];   // expectCompletion() resolvers, in call order
  const inFlight = new Set();

  const ensurePlanned = () => {
    if (planned) return planned;
    const chars = current.chars ?? Math.max(1000, current.deltas * 5);
    const text = buildReplyText({ chars, seed: current.seed });
    const pieces = splitDeltas(text, current.deltas);
    planned = { pieces, text: pieces.join('') };
    return planned;
  };

  const streamReply = async (req, res, body) => {
    const { pieces, text } = ensurePlanned();
    const perSec = current.perSec;
    const rec = {
      index: requests.length, model: body?.model ?? null, stream: true,
      plannedDeltas: pieces.length, perSec, deltasSent: 0, chars: text.length,
      startedAt: Date.now(), firstWriteAt: null, lastWriteAt: null, endedAt: null,
      streamMs: null, achievedPerSec: null, backpressureWaits: 0, aborted: false,
    };
    requests.push(rec);
    const waiter = waiters.shift() ?? null;
    inFlight.add(res);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const id = `chatcmpl-perf-${rec.index}`;
    const created = Math.floor(rec.startedAt / 1000);
    const frame = (delta, finish = null, extra = {}) =>
      `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: FAKE_MODEL_ID, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
    // A client that goes away mid-stream: `res` closes (the request side may not
    // fire), `res.write` then returns false forever and 'drain' never comes. Both
    // sides are watched and a backpressure wait also ends on close — measured, the
    // first version hung a test run for good on exactly this.
    const onGone = () => { if (!rec.endedAt) rec.aborted = true; };
    req.on('close', onGone);
    res.on('close', onGone);
    const write = async (s) => {
      if (rec.aborted || res.destroyed || res.writableEnded) { rec.aborted = true; return; }
      if (!res.write(s)) {
        rec.backpressureWaits++;
        await new Promise((r) => {
          const done = () => { res.off('drain', done); res.off('close', done); r(); };
          res.once('drain', done);
          res.once('close', done);
        });
      }
    };

    // Pacing: at each tick send every delta that is DUE by the wall clock, so a
    // late tick catches up and the average rate holds even under load. A fixed
    // setInterval would fall behind on a busy machine and quietly stream slower.
    const t0 = performance.now();
    const dueBy = (nowMs) => Math.min(pieces.length, Math.floor((nowMs - t0) / 1000 * perSec) + 1);
    let sent = 0;
    while (sent < pieces.length && !rec.aborted) {
      const due = dueBy(performance.now());
      while (sent < due && !rec.aborted) {
        const delta = sent === 0 ? { role: 'assistant', content: pieces[sent] } : { content: pieces[sent] };
        await write(frame(delta));
        sent++;
        rec.deltasSent = sent;
        const now = Date.now();
        if (rec.firstWriteAt === null) rec.firstWriteAt = now;
        rec.lastWriteAt = now;
      }
      if (sent < pieces.length) {
        const nextAt = t0 + (sent / perSec) * 1000;
        await new Promise((r) => setTimeout(r, Math.max(1, Math.ceil(nextAt - performance.now()))));
      }
    }
    if (!rec.aborted) {
      await write(frame({}, 'stop', {
        usage: { prompt_tokens: 64, completion_tokens: sent, total_tokens: 64 + sent },
      }));
      await write('data: [DONE]\n\n');
      res.end();
    }
    inFlight.delete(res);
    rec.endedAt = Date.now();
    rec.streamMs = rec.firstWriteAt === null ? null : rec.lastWriteAt - rec.firstWriteAt;
    rec.achievedPerSec = rec.streamMs > 0 ? Math.round((sent - 1) / rec.streamMs * 1000 * 10) / 10 : null;
    if (waiter) waiter(rec);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/health')) return json(res, 200, { status: 'ok' });
      if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
        return json(res, 200, { object: 'list', data: [{ id: FAKE_MODEL_ID, object: 'model', owned_by: 'perf-lab' }] });
      }
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        let body = null;
        try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: { message: 'perf-lab fake provider: body is not JSON' } }); }
        if (body?.stream === true) return await streamReply(req, res, body);
        // A non-streaming probe (the engine path's warm-up shape); answer minimally.
        const rec = { index: requests.length, model: body?.model ?? null, stream: false, plannedDeltas: 0, perSec: null, deltasSent: 0, chars: 2, startedAt: Date.now(), firstWriteAt: null, lastWriteAt: null, endedAt: Date.now(), streamMs: null, achievedPerSec: null, backpressureWaits: 0, aborted: false };
        requests.push(rec);
        return json(res, 200, {
          id: `chatcmpl-perf-${rec.index}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: FAKE_MODEL_ID,
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }
      return json(res, 404, { error: { message: `perf-lab fake provider: no route for ${req.method} ${url.pathname}` } });
    } catch (err) {
      try { json(res, 500, { error: { message: `perf-lab fake provider: ${err.message}` } }); } catch { /* headers already sent */ }
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  // `port: 0` asks the OS for a free port (tests); the fixture's row names the fixed one.
  const bound = server.address().port;

  return {
    port: bound, host,
    baseUrl: `http://${host}:${bound}/v1`,
    requests,
    plan(next) {
      current = { ...current, ...next };
      planned = null;
      return { ...current };
    },
    /** The text the next stream will send (built from the current plan). */
    plannedText() { return ensurePlanned().text; },
    expectCompletion() { return new Promise((resolve) => waiters.push(resolve)); },
    async close() {
      for (const res of inFlight) { try { res.destroy(); } catch { /* already gone */ } }
      inFlight.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
