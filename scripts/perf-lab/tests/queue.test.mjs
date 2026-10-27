// Offline: injected child runner, clock, leftovers check and in-memory files only (queue.mjs). Nothing is spawned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, classify, describePlan, extractOutputs, parseQueueArgs, planItem, resolveDeadline, runQueue, validateQueue } from '../queue.mjs';

const item = (label, extra = {}) => ({ label, tool: 'run', argv: ['--only', 'energy'], timeoutMinutes: 120, measureMinutes: 30, ...extra });
const opts = (over = {}) => ({ file: '/q.json', until: null, quietWaitHours: 6, outDir: '/out', stamp: 'T1', dryRun: false, ...over });

// A fake world: files in memory, a scripted child per call, a clock that advances by the child's minutes.
function world({ results, leftovers = [[]], start = Date.UTC(2026, 9, 22, 1, 0) } = {}) {
  const w = { t: start, files: {}, calls: [], leftoverCalls: 0 };
  const deps = {
    now: () => w.t, mkdir: () => {}, writeAtomic: (p, text) => { w.files[p] = text; },
    readText: (p) => w.files[p] ?? '', readJson: (p) => { if (!(p in w.files)) throw new Error('missing'); return JSON.parse(w.files[p]); },
    listDir: (d) => Object.keys(w.files).filter((p) => p.startsWith(`${d}/`)).map((p) => p.slice(d.length + 1)),
    leftovers: async () => leftovers[Math.min(w.leftoverCalls++, leftovers.length - 1)],
    runChild: async (req) => {
      const r = results[w.calls.length] ?? { code: 0, minutes: 10 };
      w.calls.push(req);
      w.t += r.minutes * 60_000;
      w.files[req.logPath] = r.log ?? '';
      for (const [p, j] of Object.entries(r.files ?? {})) w.files[p] = JSON.stringify(j);
      return { code: r.code, timedOut: !!r.timedOut };
    },
    log: () => {},
  };
  return { w, deps };
}
const run = (queue, o, world_) => runQueue(o, { items: queue }, world_.deps);

test('items run strictly one at a time, in order, each with the queue-owned time flags', async () => {
  const world_ = world({ results: [{ code: 0, minutes: 5, log: '/r/a.json\n', files: { '/r/a.json': { noise: {}, interference: { windows: [] }, incomplete: [] } } }, { code: 0, minutes: 5 }] });
  const s = await run([item('first'), item('second', { tool: 'ab' })], opts(), world_);
  assert.equal(world_.w.calls.length, 2);
  assert.match(world_.w.calls[0].args[0], /perf-lab\/run\.mjs$/);
  assert.match(world_.w.calls[1].args[0], /perf-lab\/ab\.mjs$/);
  assert.ok(world_.w.calls[0].args.includes('--max-quiet-wait-minutes'));
  assert.equal(world_.w.calls[0].timeoutMs, 120 * 60_000);
  assert.deepEqual(s.items.map((i) => i.status), [STATUS.measured, STATUS.measured]);
  assert.equal(s.state, 'finished');
  assert.ok(world_.w.files['/out/T1/queue-summary.md'].includes('first'));
  assert.ok(JSON.parse(world_.w.files['/out/T1/queue-summary.json']).items.length === 2);
});

test('an item that cannot finish by the deadline is never started; a shorter later one still can be', async () => {
  const world_ = world({ results: [] });
  // now = 01:00Z; deadline = the next 02:30 local is awkward across zones, so pass an explicit epoch through until-equivalent:
  const o = opts({ until: '23:59' });
  const now = world_.w.t;
  const deadlineMs = resolveDeadline('23:59', now);
  const minutesLeft = Math.floor((deadlineMs - now) / 60_000);
  const s = await run([item('too-long', { timeoutMinutes: minutesLeft + 10, measureMinutes: 10 }), item('fits', { timeoutMinutes: 60, measureMinutes: 10 })], o, world_);
  assert.equal(s.items[0].status, STATUS.skippedDeadline);
  assert.match(s.items[0].reason, /remain before/);
  assert.equal(s.items[1].status, STATUS.measured);
  assert.equal(world_.w.calls.length, 1);
});

test('leftover app processes stop the whole queue before the next item', async () => {
  const world_ = world({ results: [{ code: 0, minutes: 5 }], leftovers: [[], [4242]] });
  const s = await run([item('a'), item('b'), item('c')], opts(), world_);
  assert.equal(world_.w.calls.length, 1);
  assert.equal(s.items[1].status, STATUS.haltedSkip);
  assert.equal(s.items[2].status, STATUS.haltedSkip);
  assert.match(s.haltedBecause, /4242/);
  assert.equal(s.state, 'halted');
});

test('statuses: never-quiet, disturbed with named offenders, timeout and crash', async () => {
  const quiet = { noise: { neverQuiet: { load: 9, busyPct: 55, waitedS: 21600, blockedBy: 'qemu-system-x86 (2 cores)' } }, interference: { windows: [] }, incomplete: ['machine never became quiet'] };
  const dist = { noise: {}, interference: { windows: [{ label: 'energy-2-workload', verdict: 'disturbed', offenders: [{ name: 'claude', pids: [11] }] }] }, incomplete: ['interference: disturbed'] };
  const world_ = world({ results: [
    { code: 4, minutes: 1, log: '/r/q.json\n', files: { '/r/q.json': quiet } },
    { code: 4, minutes: 1, log: '/r/d.json\n', files: { '/r/d.json': dist } },
    { code: null, minutes: 1, timedOut: true },
    { code: 2, minutes: 1, log: 'boom: cannot build\n' },
  ] });
  const s = await run([item('q'), item('d'), item('t'), item('f')], opts(), world_);
  assert.deepEqual(s.items.map((i) => i.status), [STATUS.neverQuiet, STATUS.disturbed, STATUS.failed, STATUS.failed]);
  assert.match(s.items[0].offenders[0], /qemu/);
  assert.deepEqual(s.items[1].offenders, ['claude (pid 11)']);
  assert.match(s.items[2].reason, /hard cap/);
  assert.match(s.items[3].reason, /exit code 2/);
  assert.match(world_.w.files['/out/T1/queue-summary.md'], /never-quiet/);
});

test('energy lane results: insensitive is incomplete-other, excluded repeats are disturbed with offenders', () => {
  const insens = classify({ code: 4, reports: [{ path: '/r', json: { energy: { status: 'insensitive', reason: 'flat' }, incomplete: ['energy: insensitive'] } }] });
  assert.equal(insens.status, STATUS.incompleteOther);
  const few = classify({ code: 4, reports: [{ path: '/r', json: { energy: { status: 'incomplete', reason: 'only 2 clean', excluded: [{ repeat: 1, reasons: ['x'] }], repeats: [{ index: 1, verdicts: [{ offenders: [{ name: 'firefox' }] }] }] }, incomplete: ['energy: incomplete'] } }] });
  assert.equal(few.status, STATUS.disturbed);
  assert.deepEqual(few.offenders, ['firefox']);
});

test('ab output: reports come from the comparison directory and an incomparable result is flagged', async () => {
  const good = { noise: {}, interference: { windows: [] }, incomplete: [] };
  const world_ = world({ results: [{ code: 0, minutes: 1, log: 'comparison directory: /out/ab1\n', files: { '/out/ab1/a.json': good, '/out/ab1/b.json': good, '/out/ab1/comparison.json': { comparability: { comparable: false, reasons: ['power profile differs'] } } } }] });
  const s = await run([item('ab', { tool: 'ab' })], opts(), world_);
  assert.equal(s.items[0].status, STATUS.incompleteOther);
  assert.match(s.items[0].reason, /power profile differs/);
  assert.equal(s.items[0].reports.length, 2);
});

test('validation: the queue owns the time flags, caps must leave room to wait, args are strict', () => {
  assert.throws(() => validateQueue({ items: [item('x', { argv: ['--max-minutes', '5'] })] }), /must not contain/);
  assert.throws(() => validateQueue({ items: [item('x', { tool: 'bash' })] }), /"tool"/);
  assert.throws(() => validateQueue({ items: [item('x', { timeoutMinutes: undefined })] }), /timeoutMinutes/);
  assert.throws(() => planItem(item('x', { timeoutMinutes: 30, measureMinutes: 30 }), { quietWaitHours: 6 }), /no time to wait/);
  const p = planItem(item('x', { timeoutMinutes: 600, measureMinutes: 60 }), { quietWaitHours: 6 });
  assert.equal(p.quietWaitMinutes, 360);
  assert.deepEqual(p.argv.slice(-4), ['--max-minutes', '60', '--max-quiet-wait-minutes', '360']);
  assert.equal(planItem({ ...item('ab', { tool: 'ab', timeoutMinutes: 300, measureMinutes: 60 }) }, { quietWaitHours: 6 }).quietWaitMinutes, 90);
  assert.throws(() => parseQueueArgs(['q.json', '--until', '25:00']), /HH:MM/);
  assert.throws(() => parseQueueArgs(['--dry-run']), /required/);
  assert.equal(parseQueueArgs(['q.json', '--quiet-wait-hours', '2', '--dry-run']).quietWaitHours, 2);
});

test('deadline resolves to the next local HH:MM; extractOutputs finds run and ab outputs', () => {
  const now = new Date(2026, 9, 22, 23, 0).getTime();
  assert.equal(new Date(resolveDeadline('07:00', now)).getDate(), 23);
  assert.equal(new Date(resolveDeadline('23:30', now)).getDate(), 22);
  assert.equal(resolveDeadline(null, now), null);
  assert.deepEqual(extractOutputs('noise\n/a/b.json\ncomparison directory: /x/y\n'), { reports: ['/a/b.json'], comparisonDir: '/x/y' });
});

test('dry-run plan lists each command, cap and the lock and leftover rules', () => {
  const text = describePlan({ name: 'n', items: [item('one')] }, opts({ until: null, outDir: '/out' }), Date.UTC(2026, 9, 22, 1, 0));
  assert.match(text, /nothing launched/);
  assert.match(text, /--max-quiet-wait-minutes 90/);
  assert.match(text, /queue\.lock/);
  assert.match(text, /leftover app processes/);
});
