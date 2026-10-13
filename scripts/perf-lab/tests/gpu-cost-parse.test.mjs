import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseFdinfo, sumClients, totalEngineNs, engineDelta, memoryMiB, summariseTrace,
  median, percentile, describe, spread, exceedsNoise, monotonicRise, rendererVerdict,
} from '../gpu-cost-parse.mjs';

// REAL fdinfo of the Chromium GPU process on the Radeon 8060S, kernel 7.1.3, 2026-10-05.
const REAL = readFileSync(fileURLToPath(new URL('./fixtures/amdgpu-fdinfo-gpu-process.txt', import.meta.url)), 'utf8');

test('parseFdinfo reads engine ns and memory from a real amdgpu file', () => {
  const f = parseFdinfo(REAL);
  assert.equal(f.driver, 'amdgpu');
  assert.equal(f.clientId, 9648);
  assert.equal(f.engines.gfx, 2847531);
  assert.equal(f.engines.compute, 788168);
  assert.equal(f.memoryKiB.vram, 115360);
  assert.equal(f.memoryKiB.gtt, 12300);
});
test('parseFdinfo: a non-DRM fd is null, and a client with no engine keys has no engines', () => {
  assert.equal(parseFdinfo('pos:\t0\nflags:\t02\n'), null);
  const idle = parseFdinfo('drm-driver:\tamdgpu\ndrm-client-id:\t7\ndrm-memory-vram:\t12 KiB\n');
  assert.deepEqual(idle.engines, {});
  assert.equal(idle.memoryKiB.vram, 12);
});
test('sumClients dedupes the four duplicate fds of one client (the x4 trap)', () => {
  const fd = parseFdinfo(REAL);
  const clients = sumClients([1, 2, 3, 4].map(() => ({ pid: 10, comm: 'gpu', fd })));
  assert.equal(clients.size, 1);
  assert.equal(totalEngineNs(clients, 'gfx'), 2847531);
});
test('sumClients ignores non-amdgpu fds', () => {
  assert.equal(sumClients([{ pid: 1, fd: { driver: 'i915', clientId: 1, engines: {}, memoryKiB: {} } }]).size, 0);
});
test('engineDelta: percent of wall time; new clients count from zero; exited clients are reported', () => {
  const before = new Map([[1, { engines: { gfx: 1_000_000 }, memoryKiB: {} }], [2, { engines: { gfx: 5 }, memoryKiB: {} }]]);
  const after = new Map([[1, { engines: { gfx: 51_000_000 }, memoryKiB: {} }], [3, { engines: { gfx: 10_000_000 }, memoryKiB: {} }]]);
  const d = engineDelta(before, after, 1_000_000_000);
  assert.equal(d.ns, 60_000_000);
  assert.equal(d.pct, 6);
  assert.equal(d.lostClients, 1);
});
test('memoryMiB sums kinds', () => {
  const c = new Map([[1, { engines: {}, memoryKiB: { vram: 2048 } }], [2, { engines: {}, memoryKiB: { vram: 1024 } }]]);
  assert.equal(memoryMiB(c, 'vram'), 3);
});

const draw = (ts, dur) => ({ name: 'Display::DrawAndSwap', ph: 'X', ts, dur });
const pr = (state, ts = 0) => ({ name: 'PipelineReporter', ph: 'b', ts, args: { frame_reporter: { state } } });
test('summariseTrace counts frames, intervals, pipeline states and latency', () => {
  const ev = [
    draw(0, 1000), draw(33_000, 3000), draw(66_000, 2000), draw(200_000, 2000),
    pr('STATE_PRESENTED_ALL'), pr('STATE_PRESENTED_PARTIAL'), pr('STATE_DROPPED'), pr('STATE_NO_UPDATE_DESIRED'), pr('STATE_NO_UPDATE_DESIRED'),
    { name: 'SubmitCompositorFrameToPresentationCompositorFrame', ph: 'b', ts: 0, pid: 1, id2: { local: '0x1' } },
    { name: 'SubmitCompositorFrameToPresentationCompositorFrame', ph: 'e', ts: 5000, pid: 1, id2: { local: '0x1' } },
  ];
  const s = summariseTrace(ev);
  assert.equal(s.compositorFrames, 4);
  assert.deepEqual(s.pipeline, { presented: 2, dropped: 1, noUpdate: 2, other: 0 });
  assert.equal(s.frameIntervalMs.n, 3);
  assert.equal(s.longIntervals, 1);               // the 134 ms gap
  assert.equal(s.drawAndSwapMs.max, 3);
  assert.equal(s.presentLatencyMs.median, 5);
  assert.ok(Math.abs(s.compositorFps - 3 / 0.2) < 1e-9);
});
test('summariseTrace honours the time window', () => {
  const s = summariseTrace([draw(0, 1), draw(100, 1), draw(10_000, 1)], { fromUs: 50, toUs: 5000 });
  assert.equal(s.compositorFrames, 1);
});

test('stats helpers', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(describe([]).n, 0);
  assert.equal(spread([5, 7, 6]).range, 2);
});
test('exceedsNoise needs both the k x noise margin and the absolute floor', () => {
  assert.equal(exceedsNoise(10, 1, 15, 1), true);
  assert.equal(exceedsNoise(10, 3, 15, 1), false);          // within 2 x 3
  assert.equal(exceedsNoise(0.01, 0, 0.02, 0, { absFloor: 0.5 }), false);
  assert.equal(exceedsNoise(null, 0, 1, 0), false);
});
test('monotonicRise: rising passes, a reversal beyond tolerance fails', () => {
  assert.equal(monotonicRise([{ value: 1 }, { value: 2 }, { value: 5 }]).ok, true);
  assert.equal(monotonicRise([{ value: 1 }, { value: 5 }, { value: 3 }]).ok, false);
  assert.equal(monotonicRise([{ value: 1 }, { value: 5 }, { value: 4.8 }], 0.5).ok, true);
  assert.equal(monotonicRise([{ value: 1 }]).ok, false);
});
test('rendererVerdict REFUSES software, unknown and non-Radeon renderers', () => {
  const hw = { softwareRendering: false, glRenderer: 'ANGLE (AMD, AMD Radeon 8060S Graphics (radeonsi strix_halo ACO), OpenGL ES 3.2 Mesa 26.2.0-devel)', featureStatus: { gpu_compositing: 'enabled', rasterization: 'enabled' } };
  assert.equal(rendererVerdict(hw).ok, true);
  assert.equal(rendererVerdict({ ...hw, softwareRendering: true, glRenderer: 'ANGLE (Mesa, llvmpipe)' }).ok, false);
  assert.equal(rendererVerdict({ ...hw, softwareRendering: null }).ok, false);
  assert.equal(rendererVerdict({ ...hw, featureStatus: { gpu_compositing: 'unavailable_off' } }).ok, false);
  assert.equal(rendererVerdict({ ...hw, featureStatus: { rasterization: 'disabled_software' } }).ok, false);
  assert.equal(rendererVerdict({ ...hw, glRenderer: 'ANGLE (Intel, Mesa Intel UHD)' }).ok, false);
  assert.equal(rendererVerdict(null).ok, false);
});
