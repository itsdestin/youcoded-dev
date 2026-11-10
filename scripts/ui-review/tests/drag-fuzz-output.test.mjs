// Card #18(f): 60 scenarios must not leave a giant results file or hold every frame.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainScenario, writeSummary, FRAMES_FILE } from '../drag-fuzz-output.mjs';

// WHY: each test made a temp dir and never removed it (2 left behind per run).
const made = [];
const tmpDir = () => { const d = mkdtempSync(join(tmpdir(), 'dfo-')); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const fakeScenario = (n, failing) => ({
  desc: { n, pointer: 'mouse' },
  log: Array.from({ length: 540 }, (_, i) => ({ t: i * 16.6, cx: 1, rows: Array.from({ length: 14 }, (_, p) => ({ id: `s-${p}`, l: p * 10.5, w: 80.2, v: 'v', o: 1 })) })),
  marks: [{ t: 1, name: 'press' }],
  m: { contact: failing ? 2.5 : 0, continuity: 0, reversal: 0, others: 0, blink: 0, longFrame: 40 },
  where: failing ? { contact: { id: 'x', t: 5 } } : {},
});

test('60 scenarios: summary has no frames; frames file holds only the failing ones', () => {
  const out = tmpDir();
  const results = [];
  for (let n = 1; n <= 60; n++) {
    const full = fakeScenario(n, n % 10 === 0); // 6 failures
    results.push(retainScenario(full, out));
  }
  writeSummary(out, { url: 'u', DPR: 1.5, unlimited: false, results });
  const summary = JSON.parse(readFileSync(join(out, 'drag-fuzz.json'), 'utf8'));
  assert.equal(summary.results.length, 60);
  assert.ok(summary.results.every((r) => !('log' in r) && !('marks' in r)), 'no per-frame data retained');
  assert.ok(statSync(join(out, 'drag-fuzz.json')).size < 100_000, 'summary stays small');
  const lines = readFileSync(join(out, FRAMES_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.n), [10, 20, 30, 40, 50, 60]);
  assert.equal(lines[0].log.length, 540);
  assert.equal(results[9].framesFile, FRAMES_FILE);
  assert.equal(results[0].framesFile, undefined);
  assert.match(readFileSync(join(out, 'drag-fuzz.md'), 'utf8'), /#60 /);
});

test('an all-clean run writes no frames file', () => {
  const out = tmpDir();
  retainScenario(fakeScenario(1, false), out);
  assert.equal(existsSync(join(out, FRAMES_FILE)), false);
});
