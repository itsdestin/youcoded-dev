// scripts/perf-lab/suspects.mjs — one private packaged-app boot that puts a NUMBER on
// suspects found by reading code (docs/active/investigations/2026-10-04-performance-gap-review.md),
// so fixes can be ordered by measured cost instead of by how alarming the code looks.
//
// Legs, all in one boot, serial:
//   wheel.*  — how long a wheel event waits for the main thread (D2). The app's zoom
//              listener is non-passive on window, so on real hardware a scroll cannot
//              start until the main thread answers; this delay IS that wait.
//   fence    — main-thread work per second while ONE long code fence streams (D7),
//              against prose of the same length. A cost that climbs with the fence
//              is the re-highlight-from-the-top suspect.
//   flood.*  — a sustained terminal producer (D1): main-process IPC stalls, renderer
//              long tasks, CPU, and key/wheel input delay while it runs — once with
//              the terminal on screen, once with it hidden behind a chat.
//
// LIMITS (say them in any write-up): Xvfb software rendering; rAF/long tasks are
// main-thread measures, not presented frames; input delay starts at the browser's
// event timestamp for a CDP-injected event; one boot = a shakedown, not a baseline.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { openJourneySessions, installPageHelpers, installProbe, stopProbe } from './scenario-workload.mjs';
import { readRendererInfo } from './gpu.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';
import { cpuSnapshot } from './procs.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEGS = ['wheel', 'fence', 'flood'];

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), out: join(root, 'scratch/perf-lab/suspects.json'), maxMinutes: 12, floodMb: 40, fenceLines: 500, only: LEGS.join(',') };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!['--checkout', '--out', '--max-minutes', '--flood-mb', '--fence-lines', '--only'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const k of ['maxMinutes', 'floodMb', 'fenceLines']) { o[k] = Number(o[k]); if (!Number.isInteger(o[k]) || o[k] < 1) throw Error(`--${k} must be a positive integer`); }
  if (o.maxMinutes > 20 || o.floodMb > 200) throw Error('--max-minutes <= 20 and --flood-mb <= 200');
  for (const k of ['checkout', 'out']) if (!isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  o.only = o.only.split(',');
  if (o.only.some(l => !LEGS.includes(l))) throw Error(`--only takes ${LEGS.join(',')}`);
  return o;
}

export function stats(values) {
  const a = values.filter(n => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return { n: 0, medianMs: null, p95Ms: null, maxMs: null };
  const r = n => Math.round(n * 10) / 10;
  return { n: a.length, medianMs: r(a[a.length >> 1]), p95Ms: r(a[Math.ceil(a.length * 0.95) - 1]), maxMs: r(a.at(-1)) };
}

/** One code fence of `lines` lines, and how many deltas splitDeltas will cut it into. */
export function fenceText(lines) {
  const body = Array.from({ length: lines }, (_, i) => `  const value${i} = compute(${i}, "row-${i}") ?? fallback[${i % 7}]; // step ${i}`).join('\n');
  const text = `Here is the whole file:\n\n\`\`\`ts\nexport function generated() {\n${body}\n}\n\`\`\`\n`;
  return { text, deltas: (text.match(/\s*\S+|\s+$/g) ?? []).length };
}

const bounded = maxMinutes => {
  const end = Date.now() + maxMinutes * 60000 - 12000;
  return (promise, label, cap = 30000) => {
    const ms = Math.min(cap, end - Date.now());
    if (ms <= 0) return Promise.reject(Error(`deadline: ${label}`));
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`timeout: ${label}`)), ms); })]).finally(() => clearTimeout(timer));
  };
};

async function buildBounded(checkout, bound) {
  const code = `import { buildApp } from ${JSON.stringify(new URL('./build.mjs', import.meta.url).href)}; console.log('SUSPECTS_BUILD='+JSON.stringify(await buildApp(${JSON.stringify(checkout)}, {skipIfFresh:true})));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
  const done = new Promise((ok, fail) => { child.on('error', fail); child.on('close', exit => { const line = out.split('\n').findLast(s => s.startsWith('SUSPECTS_BUILD=')); if (exit || !line) fail(Error(`build failed: ${err.slice(-1200)}`)); else ok(JSON.parse(line.slice(15))); }); });
  return bound(done, 'packaged build', 240000);
}

// WHY passive + capture on window: it observes the same queue the app's own
// non-passive zoom listener sits in, without itself being able to block a scroll.
// No layout reads: timeStamp arithmetic only.
const INPUT_PROBE = `(() => {
  if (window.__suspectInput) return true;
  const p = { wheel: [], key: [] };
  p.onWheel = e => p.wheel.push(performance.now() - e.timeStamp);
  p.onKey = e => p.key.push(performance.now() - e.timeStamp);
  window.addEventListener('wheel', p.onWheel, { passive: true, capture: true });
  window.addEventListener('keydown', p.onKey, { passive: true, capture: true });
  p.take = () => { const r = { wheel: p.wheel, key: p.key }; p.wheel = []; p.key = []; return r; };
  window.__suspectInput = p;
  return true;
})()`;

const VISIBLE_CHAT = `[...document.querySelectorAll('.chat-scroll')].find(e => !e.closest('[aria-hidden="true"]') && e.getClientRects().length)`;

async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const g = n => (m.find(x => x.name === n)?.value ?? 0) * 1000;
  return { at: Date.now(), taskMs: g('TaskDuration'), scriptMs: g('ScriptDuration'), layoutMs: g('LayoutDuration'), styleMs: g('RecalcStyleDuration') };
}
const diff = (a, b) => ({ wallMs: b.at - a.at, taskMs: Math.round(b.taskMs - a.taskMs), scriptMs: Math.round(b.scriptMs - a.scriptMs), layoutMs: Math.round(b.layoutMs - a.layoutMs), styleMs: Math.round(b.styleMs - a.styleMs), busyPct: Math.round((b.taskMs - a.taskMs) / Math.max(1, b.at - a.at) * 100) });

async function readLongtasks(cdp) {
  return cdp.evaluate(`(() => { const p = window.__perfProbe; if (!p) return null; const lt = p.log.filter(r => r[0] === 'longtask').map(r => r[2]); const gaps = p.log.filter(r => r[0] === 'frame-gap').map(r => r[2]); return { supported: p.longtaskSupported, count: lt.length, totalMs: lt.reduce((a, b) => a + b, 0), maxMs: lt.length ? Math.max(...lt) : 0, frameGapsOver40: gaps.length, worstFrameGapMs: gaps.length ? Math.max(...gaps) : 0 }; })()`);
}

/** Wheel the visible chat `count` times, `everyMs` apart; returns queue delays and whether it really scrolled. */
async function wheelBurst(cdp, bound, { count = 30, everyMs = 100, deltaY = -160 } = {}) {
  const box = await bound(cdp.evaluate(`(() => { const p = ${VISIBLE_CHAT}; if (!p) return null; const r = p.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: p.scrollTop, max: p.scrollHeight - p.clientHeight }; })()`), 'chat box');
  if (!box) return { status: 'unmeasured', reason: 'no visible chat scroller' };
  await bound(cdp.evaluate('window.__suspectInput.take(); true'), 'reset input probe');
  for (let i = 0; i < count; i++) {
    await bound(cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: i % 2 ? -deltaY : deltaY }), `wheel ${i}`, 5000);
    await sleep(everyMs);
  }
  const got = await bound(cdp.evaluate(`({ ...window.__suspectInput.take(), top: (${VISIBLE_CHAT})?.scrollTop ?? null })`), 'wheel result');
  // An event the page never saw is not a 0 ms delay.
  return { status: got.wheel.length === count ? 'measured' : 'incomplete', sent: count, seen: got.wheel.length, scrollable: box.max > 0, queueDelay: stats(got.wheel) };
}

async function startStream(cdp, fake, id, plan, bound) {
  await bound(cdp.evaluate(`(async () => { while (document.querySelector('button[aria-label="Stop generating"]')) await new Promise(r => setTimeout(r, 50)); })()`), 'previous turn completed', 60000);
  fake.plan(plan);
  const completion = fake.expectCompletion(), n = fake.requests.length;
  const sent = await bound(cdp.evaluate(`window.claude.native.send(${JSON.stringify(id)}, 'suspects fixture')`), 'native send');
  if (sent?.status !== 'sent') throw Error(`native send refused: ${JSON.stringify(sent)}`);
  for (let i = 0; i < 100 && !fake.requests[n]?.deltasSent; i++) await sleep(50);
  const rec = fake.requests[n];
  if (!rec?.deltasSent) throw Error('fake stream never started');
  return { rec, completion };
}

async function legWheel(ctx) {
  const { cdp, fake, bound, sessions, ids, switchTo } = ctx, out = {};
  const hugeIdx = sessions.names.findIndex(n => sessions.sizeByName[n] === 'huge'), natIdx = ids.indexOf(sessions.nat[0].id);
  await switchTo(hugeIdx); await sleep(1500);
  out.idle = await wheelBurst(cdp, bound);
  // A reply streaming into a HIDDEN chat while the reader scrolls a long one.
  let s = await startStream(cdp, fake, sessions.nat[0].id, { deltas: 3000, perSec: 150, seed: 'suspects-wheel-a', text: null }, bound);
  out.hiddenStream = { ...await wheelBurst(cdp, bound), streamActive: s.rec.endedAt === null };
  await bound(s.completion, 'stream a', 60000);
  // The reply streaming into the chat being scrolled.
  await switchTo(natIdx); await sleep(800);
  s = await startStream(cdp, fake, sessions.nat[0].id, { deltas: 3000, perSec: 150, seed: 'suspects-wheel-b', text: null }, bound);
  await sleep(3000); // let some reply accumulate so there is something to scroll
  out.visibleStream = { ...await wheelBurst(cdp, bound), streamActive: s.rec.endedAt === null };
  // Wheeling straight after a switch into the long chat — the "just after switching" case.
  const t = Date.now();
  await switchTo(hugeIdx);
  out.afterSwitch = { ...await wheelBurst(cdp, bound, { count: 25, everyMs: 20 }), switchMs: Date.now() - t, streamActive: s.rec.endedAt === null };
  await bound(s.completion, 'stream b', 60000);
  return out;
}

async function legFence(ctx, lines) {
  const { cdp, fake, bound, sessions, ids, switchTo } = ctx;
  const natIdx = ids.indexOf(sessions.nat[1].id);
  await switchTo(natIdx); await sleep(800);
  const run = async (plan, label) => {
    await bound(installProbe(cdp), 'longtask probe');
    const s = await startStream(cdp, fake, sessions.nat[1].id, plan, bound);
    const rows = []; let prev = await metrics(cdp), prevSent = s.rec.deltasSent;
    while (s.rec.endedAt === null) {
      await sleep(2000);
      const now = await bound(metrics(cdp), 'metrics', 5000);
      rows.push({ deltasSoFar: s.rec.deltasSent, deltasInWindow: s.rec.deltasSent - prevSent, ...diff(prev, now) });
      prev = now; prevSent = s.rec.deltasSent;
      if (rows.length > 60) throw Error(`${label} stream ran past 120 s`);
    }
    const rec = await bound(s.completion, `${label} completion`, 60000);
    const longtasks = await bound(readLongtasks(cdp), 'longtasks'); await stopProbe(cdp).catch(() => {});
    const live = rows.filter(r => r.deltasInWindow > 0);
    const third = Math.max(1, Math.floor(live.length / 3));
    const avg = a => Math.round(a.reduce((x, r) => x + r.taskMs / Math.max(1, r.wallMs) * 100, 0) / Math.max(1, a.length));
    return { status: rec.aborted || rec.deltasSent !== rec.plannedDeltas ? 'incomplete' : 'measured', deltas: rec.deltasSent, chars: rec.chars, streamMs: rec.streamMs, busyPctFirstThird: avg(live.slice(0, third)), busyPctLastThird: avg(live.slice(-third)), longtasks, windows: rows };
  };
  const fence = fenceText(lines);
  const out = { lines, fence: await run({ deltas: fence.deltas, perSec: 150, text: fence.text }, 'fence') };
  // Control: ordinary prose, the same number of deltas at the same rate.
  out.prose = await run({ deltas: fence.deltas, perSec: 150, seed: 'suspects-prose', chars: fence.text.length, text: null }, 'prose');
  return out;
}

async function toggleTerminal(cdp) {
  const ev = { modifiers: 2, key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
}

async function legFlood(ctx, mb) {
  const { cdp, bound, sessions, ids, switchTo, app, hz } = ctx, out = { mb };
  const emptyIdx = sessions.names.findIndex(n => sessions.sizeByName[n] === 'empty'), hugeIdx = sessions.names.findIndex(n => sessions.sizeByName[n] === 'huge');
  const id = ids[emptyIdx], marker = `[perf-lab] flood complete: ${mb} MB`;
  const run = async (label, during) => {
    // Byte counter only — never keeps the flood in memory, never touches layout.
    await bound(cdp.evaluate(`(() => { const p = { bytes: 0, chunks: 0, tail: '', doneAt: null, firstAt: null }; p.off = window.claude.on.ptyOutputForSession(${JSON.stringify(id)}, d => { if (p.firstAt === null) p.firstAt = performance.now(); p.bytes += d.length; p.chunks++; p.tail = (p.tail + d).slice(-200); if (p.doneAt === null && p.tail.includes(${JSON.stringify(marker)})) p.doneAt = performance.now(); }); window.__flood = p; return true; })()`), 'flood counter');
    await bound(installProbe(cdp), 'longtask probe');
    await bound(installIpcStallProbe(cdp, { everyMs: 50 }), 'IPC probe');
    const family = app.family(), cpu0 = cpuSnapshot(family), m0 = await metrics(cdp), t0 = Date.now();
    await bound(cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(id)}, ${JSON.stringify(`perf-lab-flood ${mb}\r`)}); true`), 'send flood');
    const input = during ? await during() : null;
    // WHY a timeline: an average rate cannot tell a steady trickle from a burst
    // followed by a dead stop, and those are different bugs.
    let state = null; const timeline = [];
    while (Date.now() - t0 < 120000) {
      state = await bound(cdp.evaluate(`({ bytes: window.__flood.bytes, chunks: window.__flood.chunks, done: window.__flood.doneAt !== null })`), 'flood state', 20000);
      timeline.push([Date.now() - t0, Math.round(state.bytes / 104857.6) / 10]);
      if (state.done) break;
      await sleep(250);
    }
    const wallMs = Date.now() - t0, m1 = await metrics(cdp), cpu1 = cpuSnapshot(family);
    let ticks = 0, mainTicks = 0;
    for (const [pid, a] of cpu0) if (cpu1.has(pid)) { const d = Math.max(0, cpu1.get(pid) - a); ticks += d; if (pid === app.pid) mainTicks = d; }
    const ipc = await bound(readIpcStallProbe(cdp), 'IPC result').catch(e => ({ error: e.message }));
    const longtasks = await bound(readLongtasks(cdp), 'longtasks');
    await stopIpcStallProbe(cdp).catch(() => {}); await stopProbe(cdp).catch(() => {});
    await bound(cdp.evaluate('window.__flood?.off?.(); true'), 'flood counter off').catch(() => {});
    out[label] = {
      status: state?.done ? 'measured' : 'incomplete', wallMs, mbReceived: Math.round(state.bytes / 1048576 * 10) / 10, ipcMessages: state.chunks,
      ipcMessagesPerSec: Math.round(state.chunks / (wallMs / 1000)), renderer: diff(m0, m1), longtasks,
      mainProcessIpc: ipc.error ? ipc : { medianMs: ipc.medianMs, p95Ms: ipc.p95Ms, maxMs: ipc.maxMs, over100ms: ipc.over100ms, over250ms: ipc.over250ms, totalStallMs: ipc.totalStallMs, pings: ipc.pings, missedTicks: ipc.missedTicks },
      cpuSecondsAllProcesses: Math.round(ticks / hz * 10) / 10, cpuSecondsMainProcess: Math.round(mainTicks / hz * 10) / 10, input, mbByMs: timeline.filter((_, i) => i % Math.ceil(timeline.length / 40) === 0 || i === timeline.length - 1),
    };
    await sleep(1500);
  };
  // 1. The flooding terminal is the thing on screen.
  await switchTo(emptyIdx); await sleep(500);
  await toggleTerminal(cdp);
  for (let i = 0; i < 50; i++) { if (await cdp.evaluate(`document.documentElement.dataset.viewMode === 'terminal'`)) break; await sleep(100); }
  out.viewMode = await cdp.evaluate('document.documentElement.dataset.viewMode');
  await run('terminalVisible', null);
  // 2. Back to chat view on a DIFFERENT, long chat: the flood is now a hidden terminal,
  //    and the reader is scrolling and typing somewhere else.
  await toggleTerminal(cdp); await sleep(400);
  await switchTo(hugeIdx); await sleep(1500);
  await run('terminalHidden', async () => {
    const wheel = await wheelBurst(cdp, bound, { count: 30, everyMs: 100 });
    await bound(cdp.evaluate(`(() => { const el = [...document.querySelectorAll('.input-bar-container textarea')].find(e => !e.closest('[aria-hidden="true"]') && e.getClientRects().length); el?.focus(); window.__suspectInput.take(); return !!el; })()`), 'focus composer');
    for (const ch of 'typingwhilefloodingterminal') {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0), text: ch });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Key' + ch.toUpperCase(), windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) });
      await sleep(120);
    }
    const keys = await bound(cdp.evaluate('window.__suspectInput.take().key'), 'key delays');
    return { wheel, keyQueueDelay: stats(keys) };
  });
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv), bound = bounded(opts.maxMinutes);
  mkdirSync(dirname(opts.out), { recursive: true });
  const report = { status: 'incomplete', options: opts, scope: 'private packaged desktop on Xvfb (software rendering); main-thread and IPC measures only — not presented frames; one boot is a shakedown, repeat before ranking', loadAvgStart: readFileSync('/proc/loadavg', 'utf8').trim(), legs: {} };
  let x, app, fake;
  try {
    if (!assetsReady()) throw Error('perf-lab assets not cached');
    const build = await buildBounded(opts.checkout, bound);
    if (!build.sha || !statSync(build.binary).isFile()) throw Error('package missing build stamp or binary');
    report.build = { sha: build.sha, dirty: build.dirty, builtAt: build.builtAt };
    refusePackageProcesses(build.appDir);
    const hz = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
    const fixture = buildFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/suspects-fixture-')), { fakeProvider: true, log: () => {} });
    fake = await bound(startFakeProvider({ port: fixture.fakeProvider.port }), 'fake provider');
    x = await bound(startXvfb(':99'), 'Xvfb');
    app = await bound(launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: x.display, cdpPort: 9577, refuseExisting: true }), 'launch', 90000);
    const cdp = app.cdp;
    report.gpu = await bound(readRendererInfo(app.cdpPort, cdp), 'GPU info');
    await bound(cdp.send('Performance.enable'), 'metrics domain');
    await bound(installPageHelpers(cdp), 'page helpers');
    const ids = [], warnings = [];
    try {
      const sessions = await bound(openJourneySessions(cdp, fixture, { ids, warnings, nativeBinding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId } }), 'sessions', 90000);
      report.sessions = { names: sessions.names, sizes: sessions.sizeByName, warnings };
      await bound(cdp.evaluate(INPUT_PROBE), 'input probe');
      const switchTo = async idx => {
        const r = await bound(cdp.evaluate(`window.__perfLab.switchTo(${idx}, ${JSON.stringify(sessions.names[idx])}, ${ids.length}, false, null, false)`), `switch to ${sessions.names[idx]}`);
        if (r.mode === 'none') throw Error(`switch failed: ${r.reason}`);
        return r;
      };
      const ctx = { cdp, fake, bound, sessions, ids, switchTo, app, hz };
      // Each leg fails alone: a broken selector in one must not cost the others' numbers.
      for (const leg of opts.only) {
        try {
          report.legs[leg] = leg === 'wheel' ? await legWheel(ctx) : leg === 'fence' ? await legFence(ctx, opts.fenceLines) : await legFlood(ctx, opts.floodMb);
        } catch (e) { report.legs[leg] = { status: 'incomplete', error: String(e?.message ?? e) }; }
        const shot = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), 'screenshot').catch(() => null);
        if (shot) writeFileSync(`${opts.out}.${leg}.png`, Buffer.from(shot.data, 'base64'));
      }
      report.status = opts.only.every(l => report.legs[l] && !report.legs[l].error) ? 'measured' : 'incomplete';
    } finally {
      for (const id of [...ids].reverse()) await cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`).catch(() => {});
    }
  } catch (e) { report.status = 'incomplete'; report.error = String(e?.message ?? e); }
  finally {
    report.loadAvgEnd = readFileSync('/proc/loadavg', 'utf8').trim();
    if (app) await Promise.race([app.kill(), sleep(8000)]).catch(e => { report.cleanupError = e.message; });
    if (x?.proc) x.proc.kill('SIGTERM');
    if (fake) await Promise.race([fake.close(), sleep(3000)]).catch(() => {});
    writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.status}: ${opts.out}`);
  if (report.status !== 'measured') process.exitCode = 2;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 2; });
