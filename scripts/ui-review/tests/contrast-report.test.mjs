// An empty contrast report must say WHICH empty it is.
//
// Before this test, contrast.md was byte-identical whether every surface passed
// or no surface was ever checked. A plan that carries `probe: false` — a value
// that gets copied whenever a new plan is started from an existing one —
// produces the second while reading as the first. On 2026-09-05 a session read
// an empty report as "no data", then spent four extra six-theme sweeps and two
// hand-rolled pixel scripts measuring a text-contrast failure by hand. This
// report exists to hand that over for free.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = new URL('../contrast-report.mjs', import.meta.url).pathname;

/** One run dir holding `shots-<plan>/manifest-1.json` with the given entries. */
function runDir(plan, entries) {
  const root = mkdtempSync(join(tmpdir(), 'contrast-'));
  const d = join(root, `shots-${plan}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'manifest-1.json'), JSON.stringify(entries));
  return { root, d, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const report = (dir) => execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' });

test('a plan that never probed says so instead of looking clean', () => {
  // `probe: false` in the plan => shot.mjs writes no contrastFails key at all.
  const r = runDir('cc-subagents', [{ theme: 'light', name: 'bar', verified: true }]);
  try {
    const out = report(r.d);
    assert.match(out, /NOTHING WAS CHECKED/);
    assert.match(out, /0 surfaces probed/);
    assert.match(out, /cc-subagents/, 'names the plan that opted out');
    assert.match(out, /probe: false/, 'says which key to drop');
  } finally { r.cleanup(); }
});

test('a probed run with no failures reports the count, not silence', () => {
  const r = runDir('main', [{ theme: 'light', name: 'bar', verified: true, contrastFails: [] }]);
  try {
    const out = report(r.d);
    assert.match(out, /1 surface\/theme shot\(s\) probed/);
    assert.doesNotMatch(out, /NOTHING WAS CHECKED/);
  } finally { r.cleanup(); }
});

test('real failures still render their table', () => {
  const r = runDir('main', [{
    theme: 'light', name: 'helpers', verified: true,
    contrastFails: [{ ratio: 1.5, need: 4.5, text: 'Working', fg: '#4CAF50', bg: '#d2dcd2', path: 'span.pill' }],
  }]);
  try {
    const out = report(r.d);
    assert.match(out, /## light/);
    assert.match(out, /Working/);
    assert.match(out, /1 distinct failing text element/);
  } finally { r.cleanup(); }
});
