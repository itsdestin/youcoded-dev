import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SCENARIOS, foreignYouCodedProcesses, gpuVerdict, HEAVY_APPEARANCE, legSchedule, parseOptions, typingGaps } from '../lane-run.mjs';
import { lanePage } from '../lane-page.mjs';
import { METRICS, SCENARIO_METRICS } from '../lane-measure.mjs';

const REQUIRED = ['--out', '/run/x/out', '--baseline', '/b', '--candidate', '/c'];

test('options: defaults match the design (16 chats, 4 streaming, 10 idle minutes, 3 repeats, all four scenarios)', () => {
  const o = parseOptions(REQUIRED);
  assert.equal(o.sessions, 16); assert.equal(o.streaming, 4); assert.equal(o.idleMinutes, 10); assert.equal(o.repeats, 3);
  assert.deepEqual(o.scenarios, [...ALL_SCENARIOS]);
  assert.equal(o.historyProjects, 136); assert.equal(o.historySessions, 1800); assert.equal(o.historyMB, 870);
  assert.equal(parseOptions([...REQUIRED, '--idle-minutes', '0.5']).idleMinutes, 0.5);
  assert.throws(() => parseOptions(['--out', '/o']), /required/);
  assert.throws(() => parseOptions([...REQUIRED, '--scenarios', 'type,nope']), /unknown scenario/);
  assert.throws(() => parseOptions([...REQUIRED, '--streaming', '20']), /cannot exceed/);
  assert.throws(() => parseOptions([...REQUIRED, '--bogus', '1']), /unknown or incomplete/);
});

test('schedule alternates baseline then candidate for every scenario and repeat', () => {
  const legs = legSchedule({ scenarios: ['type', 'idle'], repeats: 2 });
  assert.equal(legs.length, 8);
  assert.deepEqual(legs.slice(0, 4).map((l) => `${l.scenario}/${l.side}/${l.repeat}`), ['type/baseline/1', 'type/candidate/1', 'idle/baseline/1', 'idle/candidate/1']);
  // never two legs of the same side in a row
  for (let i = 1; i < legs.length; i++) assert.notEqual(legs[i].side, legs[i - 1].side);
});

test('another YouCoded is found by what it runs, and this run\'s own processes are not', () => {
  const procs = {
    '101': { comm: 'youcoded', exe: '/opt/YouCoded/youcoded' },
    '102': { comm: 'youcoded', exe: '/home/u/perf-lab-runs/run-1/builds/baseline/desktop/release/linux-unpacked/youcoded' },
    '103': { comm: 'node', exe: '/usr/bin/node' },
    '104': { comm: 'youcoded', exe: '/home/u/perf-lab-runs/run-10/evil/youcoded' }, // a sibling run folder is NOT ours
  };
  const deps = {
    procDir: '/p', readdir: () => [...Object.keys(procs), 'self'],
    readFile: (p) => procs[p.split('/')[2]].comm,
    readlink: (p) => procs[p.split('/')[2]].exe,
  };
  const found = foreignYouCodedProcesses('/home/u/perf-lab-runs/run-1', deps);
  assert.deepEqual(found.map((f) => f.pid).sort(), [101, 104]);
  assert.deepEqual(foreignYouCodedProcesses('/home/u/perf-lab-runs/run-1', { ...deps, readdir: () => ['102', '103'] }), []);
});

test('a leg only counts when the app is on the graphics card', () => {
  assert.equal(gpuVerdict({ softwareRendering: false, glRenderer: 'NVIDIA GeForce RTX 4070 SUPER', featureStatus: { gpu_compositing: 'enabled', rasterization: 'enabled_on' } }).ok, true);
  assert.match(gpuVerdict({ softwareRendering: true, glRenderer: 'llvmpipe' }).reason, /software renderer/);
  assert.match(gpuVerdict({ softwareRendering: null, error: 'x' }).reason, /unknown/);
  assert.match(gpuVerdict({ softwareRendering: false, featureStatus: { gpu_compositing: 'disabled_software' } }).reason, /compositing/);
  assert.equal(gpuVerdict(null).ok, false);
});

test('typing gaps are seeded, human-sized and the same every time', () => {
  const a = typingGaps(300, 's'), b = typingGaps(300, 's'), c = typingGaps(300, 'other');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every((g) => g >= 70 && g <= 1100));
  const median = [...a].sort((x, y) => x - y)[150];
  assert.ok(median > 90 && median < 200, `median ${median}`);
});

test('the in-page helper is valid code that installs and refuses cleanly on an empty page', () => {
  assert.doesNotThrow(() => new Function(`return (${lanePage})`)());
  // run it against a minimal fake page: no menus exist, so every finder answers null/false instead of throwing
  const win = { listeners: [], addEventListener(t, f) { this.listeners.push(t); }, innerWidth: 100, innerHeight: 100 };
  const doc = { querySelector: () => null, querySelectorAll: () => [] };
  const fn = new Function('window', 'document', 'performance', 'requestAnimationFrame', `return (${lanePage})()`);
  assert.equal(fn(win, doc, { now: () => 0, timeOrigin: 0 }, (f) => f()), true);
  assert.ok(win.listeners.includes('pointerdown'));
  assert.deepEqual(win.__lane.menuNames, ['session', 'model', 'main', 'folder']);
  for (const n of win.__lane.menuNames) { assert.equal(win.__lane.box(n), null); assert.equal(win.__lane.isOpen(n), false); }
});

test('every metric a scenario reports has a plain label, a unit and a floor', () => {
  for (const [scenario, list] of Object.entries(SCENARIO_METRICS)) for (const m of list) {
    assert.ok(METRICS[m]?.label && typeof METRICS[m].absFloor === 'number', `${scenario}/${m}`);
  }
});

test('the heavy theme settings are the glass + particle look with effects ON', () => {
  assert.equal(HEAVY_APPEARANCE.theme, 'devils-garden');
  assert.equal(HEAVY_APPEARANCE.reducedEffects, false);
  assert.equal(HEAVY_APPEARANCE.lookOverrides.glass, 'custom');
});
