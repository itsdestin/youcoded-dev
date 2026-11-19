// Tests for scripts/morning-report.mjs. Run: node --test scripts/morning-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cronIntervalDays, scheduleDays, judgeSchedule, summarize, phoneMessage, renderReport, collectRepoSchedules, collectAnchors, collectCards } from './morning-report.mjs';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const wf = { name: 'Daily', days: 1 };
const run = (o) => ({ status: 'completed', conclusion: 'success', createdAt: ago(0.5), ...o });

test('cron lines map to hourly, daily, weekly', () => {
  assert.equal(cronIntervalDays('37 * * * *'), 1 / 24);
  assert.equal(cronIntervalDays('17 6 * * *'), 1);
  assert.equal(cronIntervalDays('17 6 * * 1'), 7);
});
test('a workflow file with a cron line is scheduled; one without is not', () => {
  assert.equal(scheduleDays("on:\n  schedule:\n    - cron: '17 6 * * *'\n"), 1);
  assert.equal(scheduleDays('on: [pull_request]\n'), null);
});

test('a failed scheduled run is red', () => {
  assert.equal(judgeSchedule(wf, [run({ conclusion: 'failure' })], NOW).level, 'red');
  assert.equal(judgeSchedule(wf, [run({ conclusion: 'timed_out' })], NOW).level, 'red');
});
test('a cancelled run is yellow, not green and not a false alarm', () => {
  assert.equal(judgeSchedule(wf, [run({ conclusion: 'cancelled' })], NOW).level, 'yellow');
});
test('a schedule that went quiet is yellow, never green', () => {
  assert.equal(judgeSchedule(wf, [run({ createdAt: ago(6) })], NOW).level, 'yellow');
  assert.equal(judgeSchedule(wf, [], NOW).level, 'yellow');
  assert.equal(judgeSchedule(wf, [run({ status: 'in_progress', conclusion: null })], NOW).level, 'yellow');
});
test('a recent successful scheduled run is green; the newest run decides', () => {
  assert.equal(judgeSchedule(wf, [run()], NOW).level, 'green');
  assert.equal(judgeSchedule(wf, [run({ conclusion: 'failure', createdAt: ago(3) }), run()], NOW).level, 'green');
});

// A fake GitHub: workflows list, raw workflow files, and per-workflow scheduled runs.
const CRON = "on:\n  schedule:\n    - cron: '1 1 * * *'\n";
function fakeGh({ workflows, files = {}, runs = {}, fail } = {}) {
  return (args) => {
    if (fail) throw new Error(fail);
    const p = args.at(-1);
    if (p.includes('/actions/workflows?')) return JSON.stringify({ workflows });
    if (p.includes('/contents/')) return files[p.split('/contents/')[1]] ?? 'on: [push]\n';
    const id = p.match(/workflows\/(\d+)\/runs/)[1];
    return JSON.stringify({ workflow_runs: (runs[id] ?? []).map((r) => ({ status: r.status, conclusion: r.conclusion, created_at: r.createdAt })) });
  };
}
const w = (id, name, o = {}) => ({ id, name, path: `.github/workflows/${id}.yml`, state: 'active', ...o });

test('repo section: green when every scheduled workflow passed; unscheduled ones are ignored', () => {
  const gh = fakeGh({ workflows: [w(1, 'Nightly'), w(2, 'PRs')], files: { '.github/workflows/1.yml': CRON }, runs: { 1: [run()] } });
  const s = collectRepoSchedules('r', 'o/r', NOW, gh);
  assert.equal(s.level, 'green');
  assert.match(s.summary, /1 scheduled/);
});
test('repo section: one failed run makes it red and names it', () => {
  const gh = fakeGh({ workflows: [w(1, 'Nightly')], files: { '.github/workflows/1.yml': CRON }, runs: { 1: [run({ conclusion: 'failure' })] } });
  const s = collectRepoSchedules('r', 'o/r', NOW, gh);
  assert.equal(s.level, 'red');
  assert.match(s.details[0], /Nightly/);
});
test('repo section: a schedule GitHub switched off for inactivity is yellow', () => {
  const gh = fakeGh({ workflows: [w(1, 'Nightly', { state: 'disabled_inactivity' })], files: { '.github/workflows/1.yml': CRON } });
  assert.equal(collectRepoSchedules('r', 'o/r', NOW, gh).level, 'yellow');
});
test('repo section: this report\'s own workflow and manually-disabled ones are not judged', () => {
  const gh = fakeGh({ workflows: [w(1, 'Morning report'), w(2, 'Old', { state: 'disabled_manually' })], files: { '.github/workflows/1.yml': CRON, '.github/workflows/2.yml': CRON } });
  const s = collectRepoSchedules('r', 'o/r', NOW, gh);
  assert.equal(s.level, 'green');
  assert.match(s.summary, /no scheduled checks/);
});
test('repo section: built-in GitHub jobs and workflows whose file is gone are skipped; an unreadable file is yellow', () => {
  const nf = (m) => Object.assign(new Error('Command failed'), { stderr: m });
  const base = fakeGh({ workflows: [w(1, 'Dependabot', { path: 'dynamic/dependabot/x' }), w(2, 'Gone'), w(3, 'Flaky')], files: {} });
  const gh = (args) => {
    const p = args.at(-1);
    if (p.endsWith('/2.yml')) throw nf('gh: Not Found (HTTP 404)');
    if (p.endsWith('/3.yml')) throw nf('gh: HTTP 502');
    return base(args);
  };
  const s = collectRepoSchedules('r', 'o/r', NOW, gh);
  assert.equal(s.level, 'yellow');
  assert.equal(s.details.length, 1);
  assert.match(s.details[0], /Flaky/);
});
test('repo section: a repo the token cannot read is yellow "could not check", never green', () => {
  const s = collectRepoSchedules('admin', 'o/admin', NOW, fakeGh({ fail: 'gh: Not Found (HTTP 404)' }));
  assert.equal(s.level, 'yellow');
  assert.equal(s.summary, 'could not check');
});

test('doc check and cards check: pass is green, nonzero exit is red, a tool that did not run is yellow', () => {
  const ok = () => 'cards: 5 ok\n';
  const bad = () => { throw Object.assign(new Error('x'), { status: 1, stdout: 'broken anchor\n', stderr: 'bad card\n' }); };
  const missing = () => { throw Object.assign(new Error('spawn node ENOENT'), { status: null }); };
  assert.equal(collectAnchors('/r', ok).level, 'green');
  assert.equal(collectAnchors('/r', bad).level, 'red');
  assert.equal(collectAnchors('/r', missing).level, 'yellow');
  assert.equal(collectCards('/r', ok).summary, 'cards: 5 ok');
  assert.equal(collectCards('/r', bad).level, 'red');
  assert.equal(collectCards('/r', missing).level, 'yellow');
});

test('phone message carries counts only, in the agreed words', () => {
  assert.equal(phoneMessage({ green: 12, yellow: 0, red: 0 }), 'Morning report: 12 fine.');
  assert.equal(phoneMessage({ green: 10, yellow: 0, red: 2 }), 'Morning report: 10 fine, 2 red. Open the report on GitHub.');
  assert.equal(phoneMessage({ green: 10, yellow: 2, red: 0 }), 'Morning report: 10 fine, 2 to look at. Open the report on GitHub.');
});

test('a green morning is one headline line; details only for non-green sections', () => {
  const md = renderReport([{ title: 'A', level: 'green', summary: 'fine', details: ['hidden'] }, { title: 'B', level: 'red', summary: 'bad', details: ['why'] }], '2026-11-18');
  assert.match(md, /1 green, 0 to look at, 1 red/);
  assert.ok(!md.includes('hidden') && md.includes('why'));
  assert.match(renderReport([{ title: 'A', level: 'green', summary: 's' }], 'd'), /all 1 green/);
  assert.deepEqual(summarize([{ level: 'red' }, { level: 'green' }]), { green: 1, yellow: 0, red: 1 });
});

test('the workflow runs at 13:30 UTC, can be started by hand, and keeps the ntfy secret out of the report job', () => {
  const y = fs.readFileSync(new URL('../.github/workflows/morning-report.yml', import.meta.url), 'utf8');
  assert.match(y, /cron: '30 13 \* \* \*'/);
  assert.match(y, /workflow_dispatch:/);
  const [reportJob, notifyJob] = y.split('\n  notify:');
  assert.ok(!reportJob.includes('NTFY_TOPIC'));
  assert.ok(notifyJob.includes('secrets.NTFY_TOPIC'));
});
