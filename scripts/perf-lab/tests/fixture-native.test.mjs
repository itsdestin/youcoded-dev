// Tests for the native-session seeding in fixture.mjs — the pure parts, no asset copy.
// Run: node --test scripts/perf-lab/tests/fixture-native.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NATIVE_SESSIONS, nativeSessionLines, nativeStoreSlug } from '../fixture.mjs';

test('nativeStoreSlug mirrors slug-encoding.ts nativeStoreSlug: only backslash, colon, slash and space change', () => {
  assert.equal(nativeStoreSlug('/home/x/proj'), '-home-x-proj');
  assert.equal(nativeStoreSlug('C:\\Users\\d\\my proj'), 'C--Users-d-my-proj');
  // Dots and underscores survive — this is NOT ccProjectSlug.
  assert.equal(nativeStoreSlug('/home/x/a.b_c'), '-home-x-a.b_c');
});

test('nativeSessionLines writes a header the app accepts and one user/assistant/turn-complete triple per turn, all uuids distinct', () => {
  const binding = { providerId: 'perf-lab-fake', modelId: 'perf-lab-streamer' };
  const lines = nativeSessionLines({ sessionId: 'abc-123', cwd: '/home/x/proj', turns: 5, startedAt: 1_700_000_000_000, binding });
  assert.equal(lines.length, 1 + 5 * 3);
  const head = JSON.parse(lines[0]);
  assert.equal(head.v, 1);
  assert.equal(head.sessionId, 'abc-123', 'the reader accepts a header only when sessionId equals the file stem');
  assert.equal(head.cwd, '/home/x/proj');
  assert.deepEqual(head.binding, binding);
  assert.equal(head.title, undefined, 'no title: the listing must derive one from the first user message');
  assert.ok(!('sessionKind' in head) && !('parentSessionId' in head), 'a child session would be hidden from the Resume list');
  const events = lines.slice(1).map((l) => JSON.parse(l));
  assert.deepEqual(events.map((e) => e.type).slice(0, 3), ['user-message', 'assistant-text', 'turn-complete']);
  assert.equal(new Set(events.map((e) => e.uuid)).size, events.length, 'lines 2+ are deduped by uuid');
  assert.ok(events.every((e) => e.sessionId === 'abc-123'));
  assert.ok(typeof events[0].data.text === 'string' && events[0].data.text.length > 0);
  assert.equal(typeof events[1].data.partId, 'string');
  assert.ok(events[1].data.text.length > 50, 'assistant text is realistic content, not a stub');
  assert.equal(events[2].data.stopReason, 'end_turn');
  // Timestamps climb within and across turns.
  for (let i = 1; i < events.length; i++) assert.ok(events[i].timestamp >= events[i - 1].timestamp);
});

test('nativeSessionLines is deterministic and refuses a zero-turn session', () => {
  const opts = { sessionId: 'abc-123', cwd: '/home/x/proj', turns: 3, startedAt: 1_700_000_000_000, binding: { providerId: 'p', modelId: 'm' } };
  assert.deepEqual(nativeSessionLines(opts), nativeSessionLines(opts));
  assert.throws(() => nativeSessionLines({ ...opts, turns: 0 }), /whole number >= 1/);
});

test('the seeded scale: a hundred sessions, one long enough to page', () => {
  assert.equal(NATIVE_SESSIONS.count, 100);
  assert.ok(NATIVE_SESSIONS.bigTurns > 30, 'the app renders the last 30 turns first; the big session must have more so page-up loads something');
  assert.ok(NATIVE_SESSIONS.smallTurns >= 1);
});
