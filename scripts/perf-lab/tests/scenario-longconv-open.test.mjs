// Unit tests for scenario-longconv-open.mjs and longconv-open-run.mjs (CLI + seeding) - the saved conversation, page sources, row classification. No app.
// Run: node --test scripts/perf-lab/tests/scenario-longconv-open.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NEWEST_MARKER, TURN_CYCLE, censusSource, classifyRung, longConversationLines, openSource, planRung, planRungs, proofProblems, visiblePaneIdsSource,
} from '../scenario-longconv-open.mjs';
import { aggregateRounds } from '../scenario-bigfence-stream.mjs';
import { parseCli, seedLongConversation } from '../longconv-open-run.mjs';

const binding = { providerId: 'p', modelId: 'm' };
const lines = (turns) => longConversationLines({ sessionId: 's1', cwd: '/home/u/proj', turns, startedAt: 1_000_000, binding }).map((l) => JSON.parse(l));

test('the saved conversation: header, distinct uuids, every turn complete, tool turns carry a tool call AND its result', () => {
  const ev = lines(40);
  assert.deepEqual(Object.keys(ev[0]).sort(), ['binding', 'createdAt', 'cwd', 'harnessId', 'sessionId', 'v']);
  const body = ev.slice(1);
  assert.equal(new Set(body.map((e) => e.uuid)).size, body.length, 'uuids unique (the store dedupes by uuid)');
  const count = (t) => body.filter((e) => e.type === t).length;
  assert.equal(count('user-message'), 40); assert.equal(count('turn-complete'), 40);
  const toolTurns = TURN_CYCLE.length ? Array.from({ length: 39 }, (_, i) => TURN_CYCLE[i % TURN_CYCLE.length]).filter((k) => k === 'tool').length : 0;
  assert.equal(count('tool-use'), toolTurns * 2); assert.equal(count('tool-result'), toolTurns * 2);
  const ids = new Set(body.filter((e) => e.type === 'tool-use').map((e) => e.data.toolUseId));
  assert.deepEqual([...ids].sort(), body.filter((e) => e.type === 'tool-result').map((e) => e.data.toolUseId).sort(), 'each call has its result');
  assert.ok(body.some((e) => e.type === 'assistant-text' && /```/.test(e.data.text)), 'code fences are in the mix');
  assert.equal(planRung(40).toolTurns, toolTurns);
});

test('the NEWEST message (and only it) carries the marker; timestamps never go backwards; deterministic', () => {
  const ev = lines(12);
  const withMarker = ev.filter((e) => e.type === 'assistant-text' && e.data.text.includes(NEWEST_MARKER));
  assert.equal(withMarker.length, 1);
  assert.equal(ev.filter((e) => e.type === 'assistant-text').at(-1), withMarker[0]);
  const ts = ev.slice(1).map((e) => e.timestamp);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.deepEqual(lines(12), ev);
  assert.throws(() => longConversationLines({ sessionId: 's', cwd: '/a', turns: 1, startedAt: 0, binding }));
});

test('plans and page sources', () => {
  assert.deepEqual(planRungs().map((p) => p.id), ['longconv-40', 'longconv-200', 'longconv-1000']);
  const detail = { claudeSessionId: 's1', provider: 'native' };
  assert.doesNotThrow(() => new Function(`return ${openSource({ detail, marker: NEWEST_MARKER, priorIds: ['old'] })}`));
  assert.doesNotThrow(() => new Function(`return ${censusSource}`));
  assert.doesNotThrow(() => new Function(`return ${visiblePaneIdsSource}`));
  assert.ok(openSource({ detail, marker: NEWEST_MARKER, priorIds: [] }).includes('youcoded:resume-session'));
});

const good = (over = {}) => ({
  open: { ok: true, dispatchMs: 1000, paneMs: 1050, firstEntryMs: 1300, newestPaintedMs: 1500, settledMs: 1900, entriesAtPaint: 60, entriesAtSettle: 60 },
  census: { heapMb: 30, domNodes: 600, toolCardTextHits: 4, scrollHeightPx: 18000, entryKinds: { 'msg-#': 30 } },
  scrollUp: { ok: true }, late: { verdict: 'clean', framesWithLate: 0, maxLateInViewport: 0, jumpedFrames: 0, frames: 300, scrolledPx: 9000, settledAtRest: true },
  longtasks: { stream: { maxMs: 90, totalMs: 120, count: 2, frameGapMaxMs: 100 }, settle: { maxMs: 0, totalMs: 0, count: 0 } },
  loop: {}, main: { maxDelayMs: 5, totalStallMs: 0 }, memory: { peakPssMb: 600 },
  typing: { complete: true, streamMaxMs: 40, settleMaxMs: 5, afterMaxMs: 6, saturated: false, keysStream: 3, keysSettle: 8, keysAfter: 15 },
  ...over,
});

test('classify: times are measured from the dispatch; clean scroll + fast = measured', () => {
  const plan = planRung(40);
  const r = classifyRung(plan, good());
  assert.equal(r.status, 'measured');
  assert.equal(r.openToNewestPaintMs, 500); assert.equal(r.openToSettledMs, 900); assert.equal(r.openToFirstEntryMs, 300);
  assert.equal(r.worstTypingMs, 40); assert.equal(r.scrollBlankAtRest, 0);
});

test('classify: a blank frame in view or a viewport jump is slow with a zero limit; a slow first paint is named', () => {
  const plan = planRung(1000);
  const blank = classifyRung(plan, good({ late: { verdict: 'late-content', framesWithLate: 3, maxLateInViewport: 2, jumpedFrames: 0, frames: 300, scrolledPx: 9000 } }));
  assert.equal(blank.status, 'slow'); assert.deepEqual(blank.breaches.map((b) => b.metric), ['scrollBlankFrames']);
  const jump = classifyRung(plan, good({ late: { verdict: 'clean', framesWithLate: 0, jumpedFrames: 10, frames: 300, scrolledPx: 9000 } }));
  assert.deepEqual(jump.breaches.map((b) => b.metric), ['scrollJumpedFrames']);
  const late = classifyRung(plan, good({ open: { ...good().open, newestPaintedMs: 6000 } }));
  assert.ok(late.breaches.some((b) => b.metric === 'openToNewestPaintMs' && b.value === 5000));
});

test('classify: missing evidence is failed with a reason, never a healthy zero', () => {
  const plan = planRung(200);
  const t = classifyRung(plan, good({ open: { ok: false, reason: 'the newest message never reached the visible area', dispatchMs: 1 } }));
  assert.equal(t.status, 'failed:open-timeout'); assert.equal(t.openToNewestPaintMs, null); assert.match(t.reason, /newest message/);
  assert.match(proofProblems(plan, good({ scrollUp: { ok: false, reason: 'no visible .chat-scroll' } })).join(), /scroll-up pass did not run/);
  assert.equal(classifyRung(plan, good({ typing: { complete: false, reasons: ['the conversation pane never appeared, so no keys were sent'] } })).status, 'failed:evidence-incomplete');
  assert.equal(classifyRung(plan, good({ census: null })).status, 'failed:evidence-incomplete');
  assert.equal(classifyRung(plan, { failure: { status: 'memory-cap', error: 'over 3072 MB' } }).status, 'failed:memory-cap');
});

test('aggregate works on these rows too, with this scenario\'s metric list', () => {
  const plan = planRung(40);
  const agg = aggregateRounds([{ side: 'old', row: classifyRung(plan, good()) }, { side: 'old', row: classifyRung(plan, good({ open: { ...good().open, newestPaintedMs: 2000 } })) }], ['openToNewestPaintMs']);
  assert.equal(agg['longconv-40'].old.metrics.openToNewestPaintMs.median, 750);
});

test('seeding rewrites the fixture\'s big native session with the requested number of turns, leaving the resume detail pointing at it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'longconv-'));
  const path = join(dir, 's.jsonl');
  writeFileSync(path, 'old\n');
  const fixture = { nativeSessions: { big: { path, sessionId: 'sess-1' }, cwd: '/home/u/p', slug: 'slug', binding } };
  const detail = seedLongConversation(fixture, 25);
  const rows = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.filter((r) => r.type === 'user-message').length, 25);
  assert.equal(rows[0].sessionId, 'sess-1');
  assert.deepEqual([detail.claudeSessionId, detail.projectSlug, detail.provider], ['sess-1', 'slug', 'native']);
  assert.throws(() => seedLongConversation({ nativeSessions: {} }, 5), /nativeSessions/);
});

test('CLI', () => {
  const c = parseCli(['--a', '/x', '--turns', '40,200']);
  assert.deepEqual(c.turns, [40, 200]); assert.equal(c.rounds, 2);
  assert.throws(() => parseCli(['--a', '/x', '--turns', '1'])); assert.throws(() => parseCli(['--turns', '40'])); assert.throws(() => parseCli(['--a', '/x', '--bogus']));
});

test('--scroll-input: wheel by default, none accepted, anything else refused', () => {
  assert.equal(parseCli(['--a', '/x']).scrollInput, 'wheel');
  assert.equal(parseCli(['--a', '/x', '--scroll-input', 'none']).scrollInput, 'none');
  assert.throws(() => parseCli(['--a', '/x', '--scroll-input', 'touch']), /wheel or none/);
});
