// Offline: pure classifiers and injected fakes only. No compositor, app, socket or sensor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBindableInspection, gpuEvidence, recordedPids, verifyGone, acquireGpuBinding, gpuLifetimeFor } from '../gpu-bind.mjs';
import { compositorPlan, validateCompositorPlan } from '../supervised-compositor-policy.mjs';
import { gpuWorkloadBudget } from '../gpu-cost.mjs';
import { startCompositorSupervisor } from '../supervised-compositor-controller.mjs';
import { runGpuLane, parseArgs } from '../gpu-cost.mjs';
import { parseBindArgs } from '../gpu-bind-run.mjs';

const SOCK = '/tmp/perf-lab-compositor-abc/reservation/runtime/perf-0123456789abcdef';
const good = () => ({ modeVerified: true, observed: { refreshHz: 60, name: 'Virtual-0' },
  socket: { owned: true, pending: false, socketPath: SOCK, owners: [{ pid: 5, starttime: '9' }], ownerEvidence: { proofs: ['so-peercred-pid-uid-starttime'] } } });
const HW = { source: 'SystemInfo', glRenderer: 'ANGLE (AMD, AMD Radeon 8060S Graphics (radeonsi strix_halo ACO), OpenGL ES 3.2 Mesa 26.2.4)', softwareRendering: false, featureStatus: { gpu_compositing: 'enabled', rasterization: 'enabled' } };

test('only a verified, uniquely-owned, SO_PEERCRED-proven 60 Hz inspection may be bound', () => {
  assert.equal(assertBindableInspection(good()).socketPath, SOCK);
  const bad = patch => ({ ...good(), ...patch });
  assert.throws(() => assertBindableInspection(bad({ modeVerified: false })), /mode/);
  assert.throws(() => assertBindableInspection(bad({ observed: { refreshHz: 180 } })), /60 Hz/);
  assert.throws(() => assertBindableInspection(bad({ socket: { ...good().socket, owned: false } })), /uniquely owned/);
  assert.throws(() => assertBindableInspection(bad({ socket: { ...good().socket, owners: [] } })), /uniquely owned/);
  assert.throws(() => assertBindableInspection(bad({ socket: { ...good().socket, ownerEvidence: { proofs: [] } } })), /SO_PEERCRED/);
  assert.throws(() => assertBindableInspection(null), /mode/);
});
test('renderer verdict: hardware counts; software, unknown, non-Radeon and non-SystemInfo never count as GPU evidence', () => {
  const ok = gpuEvidence(HW); assert.equal(ok.hardware, true); assert.equal(ok.countsAsGpuEvidence, true); assert.match(ok.limits, /not physical scanout/);
  for (const [name, r] of [
    ['llvmpipe', { ...HW, glRenderer: 'ANGLE (Mesa, llvmpipe)', softwareRendering: true }],
    ['swiftshader', { ...HW, glRenderer: 'ANGLE (Google, SwiftShader)', softwareRendering: true }],
    ['unknown', { source: null, glRenderer: null, softwareRendering: null, featureStatus: {}, error: 'x' }],
    ['intel', { ...HW, glRenderer: 'ANGLE (Intel, Mesa Intel UHD)' }],
    ['compositing off', { ...HW, featureStatus: { gpu_compositing: 'disabled_software', rasterization: 'enabled' } }],
  ]) { const e = gpuEvidence(r); assert.equal(e.hardware, false, name); assert.equal(e.countsAsGpuEvidence, false, name); assert.ok(e.reason, name); }
  assert.equal(gpuEvidence({ ...HW, source: 'webgl' }).countsAsGpuEvidence, false);
  assert.equal(gpuEvidence({ ...HW, softwareRendering: true, glRenderer: 'llvmpipe' }).kind, 'software');
  assert.equal(gpuEvidence(null).hardware, false);
});
test('recorded pids are read with their start times; absent and reused pids pass, a live same-identity pid fails', () => {
  assert.deepEqual(recordedPids('{"pid":42,"starttime":"7"} {"leaderPid":43} {"pid":1}'), [{ pid: 42, starttime: '7' }, { pid: 43, starttime: null }]);
  const start = readStart(process.pid);
  assert.equal(verifyGone({ pids: [{ pid: 2 ** 22 - 3, starttime: '1' }], needles: [] }).ok, true);
  assert.equal(verifyGone({ pids: [{ pid: process.pid, starttime: String(Number(start) + 1) }], needles: [] }).reused.length, 1);
  assert.equal(verifyGone({ pids: [{ pid: process.pid, starttime: start }], needles: [] }).ok, false);
  assert.equal(verifyGone({ pids: [], needles: ['gpu-bind.test.mjs'], selfPids: [] }).ok, false); // our own cmdline names this file
});
function readStart(pid) { return require_fs().readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[19]; }
import * as fs from 'node:fs';
function require_fs() { return fs; }

test('acquisition failure stops the compositor and carries the retirement receipt; evidence dir is never reused', async () => {
  const dir = fs.mkdtempSync('/tmp/gpu-bind-test-'); const evidenceDir = dir + '/ev';
  let retired = 0;
  const handle = { ready: Promise.resolve(), inspect: async () => ({ modeVerified: false }), reservation: '/tmp/perf-lab-compositor-x/reservation', writeRetirement: async () => { retired++; return { cleanupConfirmed: true }; } };
  await assert.rejects(acquireGpuBinding({ evidenceDir, startCompositor: () => handle }), e => { assert.match(e.message, /mode/); assert.equal(e.cleanup.cleanupConfirmed, true); return true; });
  assert.equal(retired, 1);
  await assert.rejects(acquireGpuBinding({ evidenceDir, startCompositor: () => { throw Error('must not start'); } }), /EEXIST/);
  fs.rmSync(dir, { recursive: true });
});
test('lane: a software renderer is REFUSED with the renderer record and no numbers; cleanup is still verified', async () => {
  const o = parseArgs(['--checkout', '/isolated/app', '--app-dir', '/isolated/app/desktop/release/linux-unpacked', '--out', process.cwd() + '/scratch/perf-lab/gpu/fake.json']);
  const sw = { source: 'SystemInfo', glRenderer: 'llvmpipe', softwareRendering: true, featureStatus: {} };
  let verified = 0;
  const binding = { socketPath: SOCK, inspection: good() };
  const r = await runGpuLane({ ...o, out: '/tmp/never-written/x.json', work: '/tmp/never-written/work' }, {
    acquire: async () => binding, verify: async () => { verified++; return { ok: true }; }, gpu: () => ({}),
    suites: { themes: async (_o, _b, ctx) => { ctx.renderer = sw; throw Object.assign(Error('gpu-cost REFUSES to report: software renderer'), { refused: true, renderer: sw }); } },
    write: () => {}, preflightRuntime: async () => {},
  });
  assert.equal(r.status, 'refused-not-gpu-evidence'); assert.equal(r.renderer.glRenderer, 'llvmpipe'); assert.equal(r.results, undefined); assert.equal(verified, 1);
});
test('CLI options: canonical absolute paths only, fixture root must be a perf-lab directory', () => {
  const base = ['--checkout', '/a/c', '--app-dir', '/a/c/desktop/release/linux-unpacked', '--evidence-dir', '/a/ev', '--fixture-root', '/a/perf-lab/fx'];
  assert.equal(parseBindArgs(base).cdpPort, 9591);
  assert.throws(() => parseBindArgs([...base, '--wayland-display', 'wayland-0']), /Unknown/);
  assert.throws(() => parseBindArgs(base.map(x => x === '/a/perf-lab/fx' ? '/a/fx' : x)), /perf-lab/);
  assert.throws(() => parseBindArgs(base.map(x => x === '/a/ev' ? 'rel/ev' : x)), /canonical/);
});

test('compositor lifetime is an explicit bounded plan field: default 60 s, up to 20 min, nothing else', () => {
  const dir = '/tmp/perf-lab-test/reservation', sock = 'perf-0123456789abcdef';
  assert.equal(compositorPlan(dir, sock).wallMs, 60000);
  assert.equal(validateCompositorPlan(compositorPlan(dir, sock, 300000)).wallMs, 300000);
  assert.equal(compositorPlan(dir, sock, 1200000).wallMs, 1200000);
  for (const bad of [59999, 1200001, NaN, '90000', 1.5]) assert.throws(() => compositorPlan(dir, sock, bad), /lifetime/);
  // A tampered plan (different lifetime than it claims, or a missing one) is not a valid fixed plan.
  const { wallMs, ...noLife } = compositorPlan(dir, sock);
  assert.throws(() => validateCompositorPlan(noLife), /Invalid/);
});
test('lifetime is chosen from the workload plus margin, recorded, and refused (not silently clamped) when too long', () => {
  const small = gpuLifetimeFor(10000);
  assert.equal(small.compositorWallMs, 73000); // 25 s start + 10 s + 30 s margin + 8 s reserve
  assert.equal(gpuLifetimeFor(0).compositorWallMs, 63000);
  const mid = gpuLifetimeFor(300000);
  assert.equal(mid.compositorWallMs, 25000 + 300000 + 30000 + 8000);
  assert.ok(mid.appWallMs >= 120000 && mid.appWallMs <= 600000);
  assert.throws(() => gpuLifetimeFor(1200000), /maximum/);
  assert.throws(() => gpuLifetimeFor(-1), /non-negative/);
  assert.throws(() => gpuLifetimeFor(1000000, { appWorkloadMs: 1000000 }), /launch supervisor/);
});
test('GPU lane derives the lifetime from its requested workload, hands it to the compositor and records it', async () => {
  const base = parseArgs(['--checkout', '/c', '--app-dir', '/c/a', '--out', process.cwd() + '/scratch/perf-lab/gpu/x.json', '--suite', 'control', '--only', 'animated', '--seconds', '8']);
  assert.deepEqual(base.only, ['spin-cadence', 'bubbles-canvas-n10']);
  const life = gpuWorkloadBudget(base);
  assert.ok(life.compositorWallMs > 60000 && life.compositorWallMs <= 1200000);
  let given; const written = [];
  const rep = await runGpuLane(base, { preflightRuntime: null, gpu: () => ({}), acquire: async a => { given = a; throw Error('stop here'); }, write: (p, t) => written.push(JSON.parse(t)) });
  assert.equal(given.wallMs, life.compositorWallMs);
  assert.equal(rep.lifetime.compositorWallMs, life.compositorWallMs);
  assert.equal(written[0].lifetime.appWallMs, life.appWallMs);
  // Too long: refused before anything is acquired.
  let acquired = false;
  const long = await runGpuLane({ ...base, repeats: 3, seconds: 30, only: Array(9).fill('x') }, { preflightRuntime: null, gpu: () => ({}), acquire: async () => { acquired = true; }, write() {} });
  assert.equal(acquired, false); assert.match(long.error, /maximum|launch supervisor/); assert.notEqual(long.status, 'measured');
});
test('an animated control run with a zero-frame trace is incomplete, never a measured 0 fps', async () => {
  const base = parseArgs(['--checkout', '/c', '--app-dir', '/c/a', '--out', process.cwd() + '/scratch/perf-lab/gpu/x.json', '--suite', 'control', '--only', 'animated']);
  const binding = { socketPath: '/s', inspection: { observed: {} }, release: async () => ({}) };
  const variant = status => ({ id: 'spin-cadence', status, traces: [{ status, compositorFrames: 0, compositorFps: null }] });
  const mk = vs => runGpuLane(base, { preflightRuntime: null, gpu: () => ({}), acquire: async () => binding, verify: async () => ({ ok: true }), suites: { control: async () => ({ variants: vs }) }, write() {} });
  assert.equal((await mk([variant('incomplete')])).status, 'incomplete');
  assert.equal((await mk([variant('measured')])).status, 'measured');
});
test('the compositor start accepts only a valid lifetime option, and refuses before creating anything', () => {
  assert.throws(() => startCompositorSupervisor({ wallMs: 5 }), /lifetime/);
  assert.throws(() => startCompositorSupervisor({ wallMs: 90000, binary: '/usr/bin/sh' }), /accepts no binary/);
  assert.throws(() => startCompositorSupervisor({ wallMs: 90000 }, 'x'), /accepts no binary/);
});
