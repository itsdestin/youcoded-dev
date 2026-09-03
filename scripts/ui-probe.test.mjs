// scripts/ui-probe.test.mjs — the probe's own guard. Needs Chrome, so it is LOCAL only
// (workspace-ci.yml has no browser); `node --test scripts/ui-probe.test.mjs`.
//
// It found a real bug on its first run: Chrome is still flushing its scratch profile when
// kill() returns, so deleting the profile immediately threw ENOTEMPTY and the probe exited 1
// having actually succeeded. A tool whose exit code lies is worse than no tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBE = join(dirname(fileURLToPath(import.meta.url)), 'ui-probe.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'ui-probe-test-'));
const page = join(tmp, 'fixture.html');
writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#123">
<div id="c">before</div>
<script>
  setTimeout(() => { window.__ready = true; document.getElementById('c').textContent = 'w' + innerWidth; }, 400);
  console.error('deliberate console error');
</script>`);
const run = (...args) => spawnSync('node', [PROBE, `file://${page}`, ...args], { encoding: 'utf8' });

test('waits for the page, evaluates, and exits 0', () => {
  const r = run('--wait', 'window.__ready', '--eval', 'document.getElementById("c").textContent');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"w1440"/);            // the --wait actually waited; "before" would mean it did not
});

test('reports console errors, and --fail-on-error turns them into exit 1', () => {
  const quiet = run('--wait', 'window.__ready');
  assert.match(quiet.stdout, /deliberate console error/);
  assert.equal(quiet.status, 0, 'reported but not fatal by default');
  assert.equal(run('--wait', 'window.__ready', '--fail-on-error').status, 1);
});

test('a --wait that never comes true is exit 1, and --keep-going is exit 0', () => {
  // Also the regression guard for the profile-cleanup race: --keep-going must be able to
  // reach exit 0 at all, which it could not while rmSync was throwing on the way out.
  const failed = run('--wait', 'window.__never', '--settle', '0');
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /WAIT TIMED OUT/);
  const kept = run('--wait', 'window.__never', '--settle', '0', '--keep-going');
  assert.equal(kept.status, 0, kept.stderr);
});

test('one pass per --size, and {size} names each screenshot', () => {
  const shot = join(tmp, 'shots', 'p-{size}.png');
  const r = run('--size', '1200x800', '--size', '400x760', '--wait', 'window.__ready',
    '--eval', 'innerWidth', '--shot', shot);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1200x800\s+innerWidth\s+=>\s+1200/);
  assert.match(r.stdout, /400x760\s+innerWidth\s+=>\s+400/);
  assert.ok(existsSync(join(tmp, 'shots', 'p-1200x800.png')), 'shot per size');
  assert.ok(existsSync(join(tmp, 'shots', 'p-400x760.png')));
});

test('--json is parseable and carries every result', () => {
  const r = run('--wait', 'window.__ready', '--eval', 'innerWidth', '--json');
  const out = JSON.parse(r.stdout);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].evals[0].value, 1440);
  assert.equal(out.results[0].waited, true);
});

test('an eval that throws is reported, not fatal', () => {
  const r = run('--wait', 'window.__ready', '--eval', 'nope.nope');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ERROR/);
});

test('bad arguments fail fast with exit 2, not a launched browser', () => {
  assert.equal(spawnSync('node', [PROBE], { encoding: 'utf8' }).status, 1);            // no url: usage
  assert.equal(run('--size', 'huge').status, 2);
  assert.equal(run('--nonsense').status, 2);
});

test('it leaves no scratch profile behind', () => {
  const before = readdirSync(tmpdir()).filter((d) => d.startsWith('ui-probe-')).length;
  run('--wait', 'window.__ready');
  const after = readdirSync(tmpdir()).filter((d) => d.startsWith('ui-probe-')).length;
  assert.ok(after <= before, `left ${after - before} profile(s) behind`);
});
