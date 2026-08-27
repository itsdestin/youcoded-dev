// scripts/perf-lab/tests/scenario-workload.test.mjs — the pure helpers behind the
// workload scenario's 2026-08-27 fixes. Everything here exists because of ONE run:
// the post-rebase baseline showed a "medium" conversation of 319 entries switching
// in 1.4 s beside a 5,000-entry medium taking 14.8 s to open. The label was wrong,
// the number was clean, and nothing failed. These pin the three pieces that now
// make that impossible: the streamer targets by name, the expected entry count is
// computed from the fixture, and a settle below it is reported as unverified.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES_PER_TURN, expectedEntries, STREAM_SIZES, streamTargetsFor, restoreStreamTargets, MEASURES } from '../scenario-workload.mjs';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = {
  projects: { alpha: '/f/projects/alpha', beta: '/f/projects/beta' },
  transcripts: {
    small: { sessionId: 's', slug: 'x', path: '/f/s.jsonl', turns: 50, cwd: '/f/projects/alpha' },
    medium: { sessionId: 'm', slug: 'x', path: '/f/m.jsonl', turns: 2500, cwd: '/f/projects/alpha' },
    huge: { sessionId: 'h', slug: 'x', path: '/f/h.jsonl', turns: 3500, cwd: '/f/projects/alpha' },
  },
};

describe('expectedEntries', () => {
  test('is a measured constant: 2 entries per turn (small 50 -> 100, huge 3500 -> 7000 on 2026-08-27)', () => {
    assert.equal(ENTRIES_PER_TURN, 2);
    assert.equal(expectedEntries(50), 100);
    assert.equal(expectedEntries(3500), 7000);
  });
  test('counts what the streamer has appended so far, so a streamed-into session can still settle', () => {
    assert.equal(expectedEntries(2500, 0), 5000);
    assert.equal(expectedEntries(2500, 7), 5014);
  });
});

describe('streamTargetsFor', () => {
  test('streams into medium and small by NAME — never huge, never the empty control', () => {
    assert.deepEqual([...STREAM_SIZES], ['medium', 'small']);
    const t = streamTargetsFor(fixture);
    assert.deepEqual(t.map((x) => x.size), ['medium', 'small']);
    assert.ok(!t.some((x) => x.size === 'huge'), 'huge must stay the one clean loaded switch');
  });
  test('each target is the LIVE file of the resumed session, in its own cwd, carrying its turn count', () => {
    const [m] = streamTargetsFor(fixture);
    assert.equal(m.path, '/f/m.jsonl');
    assert.equal(m.sessionId, 'm');
    assert.equal(m.cwd, '/f/projects/alpha');
    assert.equal(m.turns, 2500);
  });
  test('a size the fixture lacks is skipped, not invented — the scenario warns on the shortfall', () => {
    const t = streamTargetsFor({ transcripts: { small: fixture.transcripts.small } });
    assert.deepEqual(t.map((x) => x.size), ['small']);
    assert.deepEqual(streamTargetsFor({}), []);
  });
});

describe('MEASURES tells the truth about the stream and the settle rule', () => {
  test('configuration names WHO is streamed into and excludes the control', () => {
    const cfg = MEASURES.configuration.join('\n');
    assert.match(cfg, /streams into the medium and small sessions/);
    assert.match(cfg, /never into the empty control/);
    assert.ok(!/streams into 3 sessions/.test(cfg), 'the old "3 sessions" claim measured 1–2');
  });
  test('the painted clock says a stable count below the conversation size is not a settle', () => {
    assert.match(MEASURES.clocks.switchPaintedMedianMs, /at least what the conversation holds/);
    assert.ok(MEASURES.clocks['switchPaintedBySize.huge.medianMs'], 'the PRIMARY switch metric must have its clock defined');
  });
});

describe('restoreStreamTargets', () => {
  // Measured 2026-08-27: without this, repeat 2 resumed a 'medium' holding repeat
  // 1's streamed turns — huge switch 10.9 -> 13.9 -> 14.6 s across three repeats
  // of an unchanged app.
  test('cuts each transcript back to its pre-stream bytes and empties the list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-lab-restore-'));
    try {
      const path = join(dir, 'm.jsonl');
      writeFileSync(path, 'line1\nline2\n');
      const list = [{ path, size: readFileSync(path).length }];
      appendFileSync(path, 'streamed\nstreamed\n');
      const warnings = [];
      restoreStreamTargets(list, warnings);
      assert.equal(readFileSync(path, 'utf8'), 'line1\nline2\n');
      assert.deepEqual(warnings, []);
      assert.equal(list.length, 0, 'a second call (the finally fallback) must be a no-op');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('a file that cannot be restored is a WARNING in the run, not a silent bigger conversation', () => {
    const warnings = [];
    restoreStreamTargets([{ path: '/nonexistent/perf-lab/x.jsonl', size: 10 }], warnings);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /LARGER conversation than labelled/);
  });
});
