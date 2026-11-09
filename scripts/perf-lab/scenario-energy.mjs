// scripts/perf-lab/scenario-energy.mjs — the app side of lane C (energy): boot-level wiring for energy-lane.mjs.
//
// WORKLOAD (chosen 2026-10-21): the native-stream "visible" leg — one native reply streamed at cloud-model speed
// (3000 deltas at 150/s, about 20 s) from the perf-lab fake endpoint into the VISIBLE chat pane, with the standard six
// sessions open. WHY this one: it already exists with a fixture, a fake provider and a Stop-button end signal, it is
// deterministic (same bytes, same rate every repeat), it is model-free (no engine/assets), it is long enough (~20 s) for
// ~20 meter readings, and it exercises exactly the renderer/main-process streaming path the stall work is about.
// WHY NOT streamLeg(): that adds commit/layout/IPC probes and CDP counters whose own cost would be charged to the app
// in an energy window. This scenario sends the same message and waits for the same end signal, nothing more.
// BASELINE: the same boot, same open sessions, same visible pane, nothing streaming, for windowMs.
//
// Not runnable offline end to end (needs a booted app); the lane logic it feeds is covered by energy-lane.test.mjs.
import { waitFor } from './cdp.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { installStreamHelpers, STREAM_DELTAS, STREAM_PER_SEC, LEG_GRACE_MS } from './scenario-native-stream.mjs';
import { installPageHelpers, openJourneySessions } from './scenario-workload.mjs';
import { ENERGY_LANE, batteryReader, locateBattery, meterReader, runEnergyLane, selectPptMeter, startCpuLoad } from './energy-lane.mjs';
import { discoverEnergySensors } from './energy.mjs';
import { readEnvironment } from './interference-watch.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ENERGY_MEASURES = Object.freeze({
  scenario: 'energy', lane: 'C',
  // WHY question/configuration/clocks: assessComparability requires every measures descriptor to carry
  // them; without them each energy report was refused as "malformed measures.energy" and `ab --mode energy` could never compare.
  question: 'How much more whole-chip power (PPT) does the app draw while streaming a reply than while sitting idle, and does the meter even respond to CPU work on this machine right now?',
  configuration: ['CPU-coverage self-check first (worker-thread load, 3 baseline/load/baseline triples); app workload skipped when the meter does not respond',
    'baseline/workload/baseline windows, 7 attempts (+3 replacements), at least 5 clean repeats required', 'native reply streamed into the visible pane from the fake endpoint; six sessions open',
    'battery read only while discharging in all three windows', 'disturbed or unknown interference windows excluded and listed'],
  clocks: { windows: 'Date.now() in the controller around each baseline/workload window', meter: 'amdgpu hwmon power1_input sampled by the lane (driver-averaged)', battery: 'power_supply power_now or current_now x voltage_now while discharging' },
  workload: { name: 'native-stream-visible', deltas: STREAM_DELTAS, perSec: STREAM_PER_SEC, description: 'one native reply streamed into the visible pane at cloud speed from the fake endpoint; six sessions open' },
  baseline: 'same boot and sessions, nothing streaming, hold still',
  meter: 'amdgpu hwmon power1 (PPT), whole-chip; differential estimate only',
  blindTo: ['which part of the chip the power went to', 'application-attributable watts', 'GPU paint cost (llvmpipe under Xvfb)', 'anything the meter smooths over (driver averaging)'],
});

/** Fixture options: the native-stream journey, model-free (no engine/model provisioning needed for a fake endpoint). */
export function energyFixtureOptions() {
  return { fakeProvider: true, seedEngine: false, historySizes: { small: 4, medium: 8, huge: 12 }, decoyCount: 0 };
}

export async function runEnergyScenario(app, fixture, { repeats = ENERGY_LANE.repeats, log = () => {}, checkDeadline, onProgress, settleMs = 20_000, deps = {} } = {}) {
  if (!fixture.fakeProvider) throw new Error('energy: the fixture was built without { fakeProvider: true } — no endpoint to stream from');
  const cdp = app.cdp, ids = [], warnings = [];
  let fake = null;
  try {
    // Sensors first: if there is no usable meter there is no point streaming anything.
    const discovery = await (deps.discover ?? discoverEnergySensors)();
    const meter = await selectPptMeter(discovery);
    const battery = await (deps.locateBattery ?? locateBattery)();
    const discoverySummary = { status: discovery.status, truncated: discovery.truncated, sensorsByFamily: discovery.sensorsByFamily, entriesByFamily: discovery.entriesByFamily,
      kinds: [...new Set((discovery.sensors ?? []).map((s) => s.kind))], errors: (discovery.errors ?? []).length };
    fake = await startFakeProvider({ port: fixture.fakeProvider.port });
    await installPageHelpers(cdp);
    await installStreamHelpers(cdp);
    const { nat } = await openJourneySessions(cdp, fixture, { ids, warnings, nativeBinding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId } });
    const natIdx = ids.indexOf(nat[0].id);
    const names = await cdp.evaluate('window.__perfLab.pills().map((p) => p.getAttribute("title") || p.textContent.trim())').catch(() => []);
    // Bring the native session on screen: the stream must land in the VISIBLE pane.
    const shown = await cdp.evaluate(`window.__perfLab.switchTo(${natIdx}, ${JSON.stringify(names[natIdx] ?? '')}, ${ids.length}, false, null, false)`);
    if (shown?.mode === 'none') throw new Error(`energy: could not bring the native session on screen — ${shown.reason}`);
    await sleep(settleMs);   // let boot and session-creation work drain so the first baseline is idle

    let n = 0;
    const budgetMs = Math.ceil(STREAM_DELTAS / STREAM_PER_SEC * 1000) + LEG_GRACE_MS;
    const workload = async () => {
      fake.plan({ deltas: STREAM_DELTAS, perSec: STREAM_PER_SEC, seed: `energy-${++n}` });
      const completion = fake.expectCompletion();
      const send = await cdp.evaluate(`window.claude.native.send(${JSON.stringify(nat[0].id)}, 'perf-lab-stream energy')`);
      if (!send || send.status === 'failed') throw new Error(`energy: native.send was not dispatched — ${JSON.stringify(send)}`);
      await Promise.race([completion, new Promise((_, rej) => setTimeout(() => rej(new Error(`energy: the stream did not finish within ${budgetMs} ms`)), budgetMs).unref())]);
      // The app's own end-of-turn signal (Stop button gone), same as the native-stream visible leg.
      await waitFor(cdp, 'window.__perfStream.stopCount() === 0', { timeoutMs: budgetMs, everyMs: 100 });
    };
    const baseline = () => sleep(deps.windowMs ?? ENERGY_LANE.windowMs);

    return await runEnergyLane({
      meter, readMeter: meter.status === 'supported' ? (deps.readMeter ?? meterReader(meter.sensor)) : null,
      battery, readBattery: battery ? (deps.readBattery ?? batteryReader(battery)) : null,
      interference: app.interference ?? null, baseline, workload,
      workloadInfo: { ...ENERGY_MEASURES.workload, baseline: ENERGY_MEASURES.baseline },
      discovery: discoverySummary,
      startCpuLoad: deps.startCpuLoad ?? startCpuLoad, cpuSeconds: () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; },
      readEnv: readEnvironment, checkDeadline, onProgress, log, options: { repeats, ...(deps.options ?? {}) },
    });
  } finally {
    try { if (fake) await fake.close(); } catch { /* provider already gone */ }
  }
}
