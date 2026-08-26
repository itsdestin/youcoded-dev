// Guards the two shapes the whole perf lab depends on: the CC project-slug
// encoding (wrong slug => the app never finds the fixture transcripts) and the
// transcript line shape (wrong shape => loadHistory silently returns zero
// messages and every history measurement reads 0). Both are copies of app code;
// these tests are what catch the copy drifting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ccProjectSlug, transcriptLines, readEnginePin } from '../fixture.mjs';

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
