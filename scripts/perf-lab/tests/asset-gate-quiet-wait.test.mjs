// Offline: no network, no app. Proves (1) missing model/engine assets are refused unless the
// owner explicitly opts in, and (2) the quiet-machine wait has its own bound and never eats the
// measurement budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture, assetStatus, assetRefusalMessage, assetDownloadEnvAllowed } from '../fixture.mjs';
import { parseArgs, noiseGate, assetPreflight, requireAssetsOrAuthorization, selectionNeedsAssets, validateReport, EXIT } from '../run.mjs';
import { parseAbArgs, describePlan } from '../ab.mjs';

const READY = { ggufSrc: '/x/m.gguf', engineSrc: '/x/e', pin: { version: 'b1' } };

test('missing assets + no opt-in: buildFixture refuses, zero provisioning/network calls', () => {
  let provisioned = 0;
  assert.throws(
    () => buildFixture('/nonexistent-root', { assetsReadyFn: () => null, provision: () => { provisioned++; } }),
    (e) => /refusing to download/.test(e.message) && /--allow-asset-download/.test(e.message) && /490 MB/.test(e.message) && /model-free/.test(e.message),
  );
  assert.equal(provisioned, 0);
});

test('opt-in: provisioning path is invoked exactly once', () => {
  let provisioned = 0, ready = null;
  try {
    buildFixture('/nonexistent-root/\0bad', {
      allowAssetDownload: true,
      assetsReadyFn: () => ready,
      provision: () => { provisioned++; ready = READY; },
    });
  } catch { /* the later fixture write fails on the bogus root; only the provisioning call matters */ }
  assert.equal(provisioned, 1);
});

test('assets present: used with no provisioning even without opt-in', () => {
  let provisioned = 0;
  try { buildFixture('/nonexistent-root/\0bad', { assetsReadyFn: () => READY, provision: () => { provisioned++; } }); } catch { /* bogus root */ }
  assert.equal(provisioned, 0);
});

test('assetStatus reports present / missing / authorized without any download', () => {
  assert.equal(assetStatus({ assetsReadyFn: () => READY }).state, 'present');
  assert.equal(assetStatus({ assetsReadyFn: () => null, pinFn: () => ({ assetName: 'eng.tar.gz' }) }).state, 'missing');
  const auth = assetStatus({ allow: true, assetsReadyFn: () => null, pinFn: () => ({ assetName: 'eng.tar.gz' }) });
  assert.equal(auth.state, 'authorized'); assert.match(auth.detail, /eng\.tar\.gz/);
  assert.match(assetRefusalMessage({ statusFn: () => ({ detail: 'D' }) }), /D/);
});

test('flag and env are the only opt-ins; default is refuse', () => {
  assert.equal(parseArgs([]).allowAssetDownload, false);
  assert.equal(parseArgs(['--allow-asset-download']).allowAssetDownload, true);
  assert.equal(assetDownloadEnvAllowed({}), false);
  assert.equal(assetDownloadEnvAllowed({ PERF_LAB_ALLOW_ASSET_DOWNLOAD: '1' }), true);
});

test('preflight: model-free selection needs nothing; missing throws before launch; present passes', () => {
  const cfg = parseArgs(['--only', 'artifacts']);
  assert.equal(selectionNeedsAssets(cfg), false);
  assert.equal(assetPreflight(cfg, { statusFn: () => { throw new Error('must not be asked'); } }).state, 'not-needed');
  const startup = parseArgs(['--only', 'startup']);
  assert.throws(() => requireAssetsOrAuthorization(startup, { statusFn: () => ({ state: 'missing', detail: 'gone' }) }), (e) => e.exitCode === EXIT.ERROR);
  assert.equal(requireAssetsOrAuthorization(startup, { statusFn: () => ({ state: 'present', detail: 'ok' }) }).state, 'present');
  assert.equal(requireAssetsOrAuthorization(parseArgs(['--only', 'startup', '--allow-asset-download']), { statusFn: ({ allow }) => ({ state: allow ? 'authorized' : 'missing', detail: '' }) }).state, 'authorized');
});

test('ab: forwards the flag and both bounds; describePlan shows both and asset status', () => {
  const plan = parseAbArgs(['--a', '/a', '--b', '/b', '--allow-asset-download', '--max-quiet-wait-minutes', '7', '--max-minutes', '30']);
  assert.ok(plan.common.includes('--allow-asset-download'));
  assert.equal(plan.cfg.maxQuietWaitMinutes, 7);
  const text = describePlan(plan, [], { assetFn: () => ({ state: 'authorized', detail: 'x' }) });
  assert.match(text, /quiet-wait bound\s+7 min/);
  assert.match(text, /time bound\s+hard cap 30 min/);
  assert.match(text, /download AUTHORIZED/);
  assert.doesNotMatch(parseAbArgs(['--a', '/a', '--b', '/b']).common.join(' '), /allow-asset-download/);
});

function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
const emptyNoise = () => ({ loadAvgBefore: null, machineBusyPctBefore: null, maxLoadAvgAccepted: null, maxBusyPctAccepted: null, discardedRuns: 0, loadAvgAfter: null, quietWaitMs: 0, neverQuiet: null });

test('quiet wait: waited time is credited back so it does not consume the measurement budget', async () => {
  const c = fakeClock(); const noise = emptyNoise(); let credited = 0; let polls = 0;
  await noiseGate(noise, { ...c, say: () => {}, pollMs: 30_000, maxWaitMs: 20 * 60_000, onWaited: (ms) => { credited += ms; },
    loadAvg: () => (++polls < 31 ? 9 : 1), busyPct: async () => 0 });
  assert.equal(credited, 30 * 30_000);          // 15 minutes of waiting handed back
  assert.equal(noise.quietWaitMs, credited);
  assert.equal(noise.neverQuiet, null);
});

test('quiet wait: exceeding its own bound records neverQuiet and throws INCOMPLETE before any launch', async () => {
  const c = fakeClock(); const noise = emptyNoise(); let credited = 0;
  await assert.rejects(
    noiseGate(noise, { ...c, say: () => {}, pollMs: 30_000, maxWaitMs: 2 * 60_000, onWaited: (ms) => { credited += ms; },
      loadAvg: () => 12.5, busyPct: async () => 50 }),
    (e) => e.exitCode === EXIT.INCOMPLETE && /machine never became quiet: load 12\.5/.test(e.message),
  );
  assert.equal(noise.neverQuiet.load, 12.5);
  assert.ok(credited > 0 && credited <= 2 * 60_000);
  const problems = validateReport({ noise, legacyExecution: undefined }, new Set());
  assert.ok(problems.some((p) => /machine never became quiet/.test(p)));
});

test('parseArgs: quiet bound defaults to 20 and is independent of --max-minutes', () => {
  const cfg = parseArgs(['--max-minutes', '20']);
  assert.equal(cfg.maxQuietWaitMinutes, 20);
  assert.equal(cfg.maxMinutes, 20);
  assert.equal(parseArgs(['--max-quiet-wait-minutes', '3']).maxQuietWaitMinutes, 3);
});

test('busy machine: --busy-machine measures without waiting, records the busy reading, and is never clean or comparable', async () => {
  const c = fakeClock(); const noise = emptyNoise(); let credited = 0;
  await noiseGate(noise, { ...c, say: () => {}, pollMs: 30_000, maxWaitMs: 2 * 60_000, onWaited: (ms) => { credited += ms; },
    loadAvg: () => 6.5, busyPct: async () => 40, whoIsBusy: async () => [{ name: 'qemu-system-x86', pids: [1, 2], cores: 2.4 }], busyMachine: true });
  assert.equal(noise.discardedRuns, 0);
  assert.equal(noise.neverQuiet, null);
  assert.equal(noise.busyMachineReadings.length, 1);
  assert.match(noise.busyMachineReadings[0].busyWith, /qemu-system-x86 ×2 using 2\.4 cores/);
  assert.equal(parseArgs(['--busy-machine']).busyMachine, true);
  const problems = validateReport({ noise, exploratory: { mode: 'busy-machine' } }, new Set());
  assert.ok(problems.some((p) => /exploratory: measured on a busy machine \(1 busy reading/.test(p)));
});
