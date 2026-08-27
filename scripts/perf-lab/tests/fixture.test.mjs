// Guards the shapes the whole perf lab depends on: the CC project-slug
// encoding (wrong slug => the app never finds the fixture transcripts) and the
// transcript line shape (wrong shape => loadHistory silently returns zero
// messages and every history measurement reads 0). Both are copies of app code;
// these tests are what catch the copy drifting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ccProjectSlug, transcriptLines, transcriptBody, readEnginePin,
  SIZES, CONTENT_SEED, messagesPerTurn, stableUuid,
} from '../fixture.mjs';

test('ccProjectSlug matches slug-encoding.ts for a Linux path', () => {
  assert.equal(ccProjectSlug('/home/destin/x/perf lab'), '-home-destin-x-perf-lab');
});

test('transcriptLines yields loadHistory-visible user+assistant pairs', () => {
  const lines = transcriptLines({ sessionId: 's1', cwd: '/p', turns: 3, startedAt: Date.UTC(2026, 0, 1) });
  assert.equal(lines.length, 6);
  const objs = lines.map((l) => JSON.parse(l));
  assert.equal(objs[0].type, 'user'); assert.ok(objs[0].promptId); assert.equal(objs[0].isMeta, false);
  assert.equal(objs[1].type, 'assistant'); assert.equal(objs[1].message.stop_reason, 'end_turn');
  assert.equal(new Set(objs.map((o) => o.uuid)).size, 6, 'uuids unique');
  assert.equal(objs[1].parentUuid, objs[0].uuid);
});

// Transcribed from loadHistory (session-browser.ts:686-717) — the exact gate the
// real parser applies. Kept here so a drift in transcriptLines fails a unit test
// rather than a five-minute app launch.
function loadHistoryFilter(lines) {
  const byUuid = new Map();
  for (const line of lines) {
    if (!line.trim() || line.includes('\x00')) continue;
    let p; try { p = JSON.parse(line); } catch { continue; }
    if (p.uuid && (p.type === 'user' || p.type === 'assistant')) byUuid.set(p.uuid, p);
  }
  const out = [];
  for (const p of byUuid.values()) {
    const message = p.message;
    if (!message) continue;
    if (p.type === 'user') {
      if (p.isMeta || !p.promptId) continue;
      const c = message.content;
      const text = typeof c === 'string' ? c
        : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
      if (!text.trim()) continue;
      out.push({ role: 'user', content: text.trim() });
    } else if (message.stop_reason === 'end_turn') {
      const c = message.content;
      const text = Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        : typeof c === 'string' ? c : '';
      if (!text.trim()) continue;
      out.push({ role: 'assistant', content: text.trim() });
    }
  }
  return out;
}

test('loadHistory would surface every generated turn', () => {
  const lines = transcriptLines({ sessionId: 's1', cwd: '/p', turns: 3, startedAt: Date.UTC(2026, 0, 1) });
  const msgs = loadHistoryFilter(lines);
  assert.equal(msgs.length, 6, 'all 6 messages survive loadHistory\'s filter');
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  assert.ok(msgs[0].content.startsWith('Turn 1:'));
  // readSessionTranscriptMeta's title scan (session-browser.ts:344) skips any
  // first prompt starting with '<' — the "Turn N:" prefix keeps us clear of it.
  assert.ok(!msgs[0].content.startsWith('<'));
});

test('sessionId + slug pass loadHistory\'s SAFE_ID_RE guard', () => {
  const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;   // session-browser.ts:88
  assert.ok(SAFE_ID_RE.test(ccProjectSlug('/home/destin/youcoded-dev/scratch/perf-lab/home/projects/alpha')));
  assert.ok(SAFE_ID_RE.test(crypto.randomUUID()));
});

test('readEnginePin reads the app\'s own pin, not a second hardcoded copy', () => {
  const pin = readEnginePin();
  assert.match(pin.version, /^b\d+$/);
  assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  assert.equal(pin.binaryRelPath, `llama-${pin.version}/llama-server`);
  assert.ok(pin.url.endsWith(pin.assetName));
});

// ---------------------------------------------------------------------------
// Realistic content (the default since 2026-08-27)
// ---------------------------------------------------------------------------
// The tests above pin the PLAIN generator, which is still reachable via
// { content: 'plain' }. These pin the realistic one as buildFixture actually
// uses it — same filter, same questions.

const ARGS = { sessionId: 's1', cwd: '/p/alpha', turns: 40, startedAt: Date.UTC(2026, 0, 1) };

test('transcriptBody defaults to realistic content, and realistic is richer than plain', () => {
  const realistic = transcriptBody(ARGS);
  const plain = transcriptBody({ ...ARGS, content: 'plain' });
  // Realistic turns emit extra tool lines, so lines/turn is NOT 2 — that is the
  // point, and the next test proves those extra lines stay invisible to history.
  assert.ok(realistic.length > plain.length, 'realistic writes more JSONL lines per turn');
  // Ratio is measured over 200 turns, not 40: the content mix (prose / code /
  // tool / diff / long_output) needs a few dozen turns to cycle, so a short
  // sample under-reports it (3.9x at 40 turns, 6.95x at 200, 7.5x at 2,500).
  const bigR = transcriptBody({ ...ARGS, turns: 200 }).join('\n').length;
  const bigP = transcriptBody({ ...ARGS, turns: 200, content: 'plain' }).join('\n').length;
  assert.ok(bigR > 5 * bigP,
    `realistic content should be several times the bytes of prose filler (measured ~6.8x), got ${(bigR / bigP).toFixed(2)}x`);
  // The expensive shapes must actually be in the ASSISTANT TEXT, not hidden in a
  // tool_result — a collapsed tool body costs nothing on resume (content.mjs note 3).
  const answerText = realistic
    .map((l) => JSON.parse(l))
    .filter((o) => o.type === 'assistant' && o.message.stop_reason === 'end_turn')
    .flatMap((o) => o.message.content.filter((b) => b.type === 'text').map((b) => b.text))
    .join('\n');
  assert.match(answerText, /```/, 'answers contain fenced code blocks');
});

test('transcriptBody rejects an unknown content mode instead of silently going cheap', () => {
  assert.throws(() => transcriptBody({ ...ARGS, content: 'realstic' }), /unknown content mode/);
});

test('realistic content holds loadHistory(all).length === 2 * turns', () => {
  // THE invariant scenario-history.mjs:184 aborts the run over. Verified here
  // against the transcribed filter, and separately against the app's own
  // compiled loadHistory (see the task report) with 50/2500/3500 turns.
  for (const turns of [1, 3, 40]) {
    const msgs = loadHistoryFilter(transcriptBody({ ...ARGS, turns }));
    assert.equal(msgs.length, messagesPerTurn * turns, `${turns} turns => ${messagesPerTurn * turns} messages`);
    assert.deepEqual([...new Set(msgs.map((m) => m.role))].sort(), ['assistant', 'user']);
    // Strict alternation: one user prompt then one end_turn answer, per turn.
    msgs.forEach((m, i) => assert.equal(m.role, i % 2 === 0 ? 'user' : 'assistant'));
  }
});

test('realistic first prompt survives the session-list title scan', () => {
  // readSessionTranscriptMeta (session-browser.ts:344) skips a first prompt
  // starting with '<', which would leave the fixture session untitled.
  const first = loadHistoryFilter(transcriptBody(ARGS))[0];
  assert.equal(first.role, 'user');
  assert.ok(!first.content.startsWith('<'), 'first prompt must not start with "<"');
});

test('realistic content is byte-identical for the same seed + startedAt', () => {
  // Determinism is what makes two perf reports comparable: if the transcript
  // moved between runs, so would the numbers.
  assert.equal(transcriptBody(ARGS).join('\n'), transcriptBody(ARGS).join('\n'));
  assert.notEqual(transcriptBody(ARGS).join('\n'), transcriptBody({ ...ARGS, seed: 'other' }).join('\n'));
  assert.equal(typeof CONTENT_SEED, 'string');
});

test('every generated uuid is unique across a transcript', () => {
  // uuids are the dedup key in BOTH consumers (loadHistory's lastParsedByUuid,
  // transcript-watcher's seenUuidsRecent) — a collision would silently drop a line.
  const objs = transcriptBody({ ...ARGS, turns: 400 }).map((l) => JSON.parse(l));
  assert.equal(new Set(objs.map((o) => o.uuid)).size, objs.length);
});

test('stableUuid is derived, uuid-shaped, and passes SAFE_ID_RE', () => {
  const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;   // session-browser.ts:88
  const id = stableUuid('perf-lab:huge');
  assert.equal(id, stableUuid('perf-lab:huge'), 'same key => same id');
  assert.notEqual(id, stableUuid('perf-lab:medium'));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(SAFE_ID_RE.test(id));
});

test('SIZES stays inside the calibrated budget', () => {
  // WHY this is a test and not just a comment: `huge` is bounded by
  // scenario-history.mjs's WATCH_TIMEOUT_MS (240s per resume sample), which this
  // file cannot see. Raising huge past ~4,000 turns of realistic content pushes
  // the resume past that ceiling, and the metric silently becomes null.
  assert.equal(SIZES.small, 50);
  assert.equal(SIZES.medium, 2500, 'medium is the ORDINARY-conversation size — keep it comparable');
  assert.ok(SIZES.huge > SIZES.medium, 'huge must still be the biggest');
  assert.ok(SIZES.huge <= 4000, 'past ~4,000 realistic turns the resume overruns WATCH_TIMEOUT_MS');
  // Byte budget: huge must stay near the ~33 MiB the old prose fixture had.
  const bytes = transcriptBody({ ...ARGS, turns: SIZES.huge }).join('\n').length;
  assert.ok(bytes < 45 * 1024 * 1024, `huge transcript is ${(bytes / 1048576).toFixed(1)} MiB, over the 45 MiB budget`);
});
