// Offline: how lane F plugs into run.mjs / identity / compare / ab / queue. Nothing launches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bootPlan, fixtureIdentity, parseArgs, selectionNeedsAssets, validateReport, workloadFixtureOptions, emptyReport } from '../run.mjs';
import { executionIdentity } from '../identity.mjs';
import { legacyEvidenceProblems } from '../legacy-evidence.mjs';
import { MODES, parseAbArgs } from '../ab.mjs';
import { ladderGroups, WORKLOAD_LANE } from '../workload-lane.mjs';
import { parseQueueArgs, validateQueue } from '../queue.mjs';

const args = (extra = []) => parseArgs(['--only', 'workloads', ...extra], { root: '/r' });

test('--only workloads: alone only, repeats default to the lane default, model-free, one boot per group per pass', () => {
  const cfg = args();
  assert.equal(cfg.workloadsLane, true); assert.equal(cfg.workloadsRepeats, WORKLOAD_LANE.repeats); assert.deepEqual([...cfg.only], ['workloads']);
  assert.equal(args(['--workloads-repeats', '2']).workloadsRepeats, 2);
  assert.throws(() => args(['--workloads-repeats', '0']), /whole number/);
  assert.throws(() => parseArgs(['--only', 'workloads,startup'], { root: '/r' }), /workloads must be used alone/);
  assert.throws(() => parseArgs(['--only', 'nope'], { root: '/r' }), /workloads \(alone\)/);
  assert.equal(selectionNeedsAssets(cfg), false);
  assert.equal(bootPlan(cfg).workloads, ladderGroups().length * WORKLOAD_LANE.repeats); assert.equal(bootPlan(cfg).total, bootPlan(cfg).workloads);
  assert.equal(parseArgs([], { root: '/r' }).workloadsLane, false, 'never part of the default selection');
});

test('identity: execution carries the pass count, fixture identity names every group and its recipe; other reports are unchanged', () => {
  assert.equal(executionIdentity(args()).workloadsRepeats, 3);
  assert.equal('workloadsRepeats' in executionIdentity(parseArgs(['--only', 'startup'], { root: '/r' })), false);
  const fx = fixtureIdentity(args()).options.workloads;
  assert.deepEqual(fx.groups.map((g) => g.id), ladderGroups().map((g) => g.id)); assert.equal(fx.thresholds.operationMs, 1000);
  assert.equal('workloads' in fixtureIdentity(parseArgs(['--only', 'startup'], { root: '/r' })).options, false);
  assert.equal(workloadFixtureOptions({ id: 'background-indexing' }).seedEngine, false);
  assert.equal(workloadFixtureOptions({ id: 'csv' }).decoyCount, 0);
});

test('report contract: a workloads report skips the legacy PRIMARY contract and is judged by its own', () => {
  const report = emptyReport({ label: 't' });
  report.workloadsExecution = { revision: 1, repeats: 1, groups: [] };
  report.legacyExecution = { revision: 1, phases: {} };
  assert.deepEqual(legacyEvidenceProblems(report, { primary: [], only: new Set(['workloads']) }), []);
  const problems = validateReport(report, new Set(['workloads']));
  assert.ok(problems.includes('workloads: required section missing'), problems.join('|'));
  assert.ok(!problems.some((p) => /PRIMARY|startup/.test(p)));
});

test('ab: --mode workloads selects exactly the lane; queue accepts a workloads run item', () => {
  assert.equal(MODES.workloads.only, 'workloads');
  const plan = parseAbArgs(['--a', '/x/a', '--b', '/x/b', '--mode', 'workloads'], { root: '/r' });
  assert.ok(plan.help !== true);
  const queue = JSON.parse(readFileSync(fileURLToPath(new URL('../queues/overnight-1.json', import.meta.url)), 'utf8'));
  assert.doesNotThrow(() => validateQueue(queue));
  const item = queue.items.find((i) => i.argv.includes('workloads'));
  assert.ok(item); assert.ok(item.argv.includes('--cached-only')); assert.ok(item.argv.includes('/home/destin/youcoded-dev/worktrees/sessions/96-merged-evaluation/youcoded'));
  assert.ok(item.timeoutMinutes >= 240 && item.measureMinutes < item.timeoutMinutes);
  assert.equal(parseQueueArgs([fileURLToPath(new URL('../queues/overnight-1.json', import.meta.url)), '--until', '07:00', '--quiet-wait-hours', '6']).quietWaitHours, 6);
});
