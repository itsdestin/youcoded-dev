// scripts/perf-lab/scroll-deferral.mjs — does a scroll wait for the page's main thread?
// (docs/archive/investigations/2026-10-04-performance-gap-review.md, section 4d, Fix 3.)
//
// The earlier wheel measure only read how long a wheel event sat before a LISTENER saw it. That cannot
// change when the listener is made passive. What a person feels is different: while the page is busy,
// does the picture still move under the finger? This script asks exactly that.
//
// How: a tall striped scroller is laid over the app. The page's main thread is blocked for a known
// time by a busy loop (sent through the debugging protocol). During the block a real wheel input is
// delivered through the browser's input path (Input.dispatchMouseEvent). While the block is STILL
// running, a screenshot is taken (the screenshot is composed by the compositor, not the page's main
// thread). If the screenshot shows the stripes moved, the compositor scrolled without waiting for the
// page. If it shows no movement until the block ends, the scroll was held up by the page.
//
// Modes in one boot, interleaved: 'app' (whatever the app has registered), 'passive' (extra window
// wheel listener, passive: control) and 'blocking' (extra window wheel listener, passive: false, that
// does not cancel anything: the shape of the app's pinch-zoom listener). 'passive' vs 'blocking' is the
// proof the instrument can tell the two apart; 'app' is what the build under test does.
//
// Also (--zoom): a ctrl+wheel (what a trackpad pinch becomes) is delivered once and the app's zoom is
// read back, and the scroller is checked for stray movement, so a fix cannot silently break zoom.
//
// LIMITS, stated plainly: Xvfb is software-rendered, so this is not a real GPU's frames; it is a yes/no
// on whether the scroll happened during the block, not a frame-rate measure.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { bounded, buildBounded } from './suspects.mjs';
import { connect, waitForMainTarget } from './cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), out: join(root, 'scratch/perf-lab/suspects/scroll-deferral.json'), maxMinutes: 12, trials: 4, blockMs: 400, input: 'x11' };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!['--checkout', '--out', '--max-minutes', '--trials', '--block-ms', '--input'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const k of ['maxMinutes', 'trials', 'blockMs']) o[k] = Number(o[k]);
  if (!(o.maxMinutes >= 1 && o.maxMinutes <= 20)) throw Error('--max-minutes 1..20');
  if (!(o.trials >= 1 && o.trials <= 12)) throw Error('--trials 1..12');
  if (!(o.blockMs >= 150 && o.blockMs <= 1500)) throw Error('--block-ms 150..1500');
  if (!['x11', 'cdp'].includes(o.input)) throw Error('--input x11|cdp');
  for (const k of ['checkout', 'out']) if (!isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  return o;
}

// The overlay: 300px-tall window onto 6000px of high-contrast bands, fixed to the top-left so wheel input
// at (200,150) lands on it. Also records when the PAGE saw wheel and scroll events.
const OVERLAY = `(() => {
  if (window.__sd) return true;
  const sd = window.__sd = { wheelSeen: [], scrollSeen: [] };
  const box = document.createElement('div');
  box.id = '__sd_box';
  box.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;overflow:auto;z-index:2147483647;background:#fff';
  const tall = document.createElement('div');
  tall.style.cssText = 'height:6000px;width:100%;background:repeating-linear-gradient(#000 0 40px,#fff 40px 80px,#e00 80px 120px,#fff 120px 160px)';
  box.appendChild(tall); document.body.appendChild(box);
  sd.box = box;
  sd.stamp = () => performance.timeOrigin + performance.now();
  box.addEventListener('scroll', () => sd.scrollSeen.push(sd.stamp()), { passive: true });
  window.addEventListener('wheel', () => sd.wheelSeen.push(sd.stamp()), { passive: true, capture: true });
  return true;
})()`;

// The marks land in the trace, so trace events can be placed against the block without comparing clocks.
const BLOCK = ms => `(() => { performance.mark('sd-block-start'); const s = Date.now(); while (Date.now() - s < ${ms}); performance.mark('sd-block-end'); return { start: s, end: Date.now() }; })()`;

// Trace collection. WHY a trace: the page's main thread is blocked, so neither the page nor a screenshot can say
// when the scroll happened; the browser's own event log can (compositor-thread events carry their own timestamps).
async function traceStart(cdp, events) {
  cdp.on('Tracing.dataCollected', p => { for (const e of p.value) events.push(e); });
  await cdp.send('Tracing.start', { traceConfig: { recordMode: 'recordContinuously', includedCategories: ['input', 'input.scrolling', 'cc', 'latencyInfo', 'benchmark', 'blink.user_timing', 'devtools.timeline', 'disabled-by-default-input', 'viz', 'gpu'] }, transferMode: 'ReportEvents' });
}
async function traceStop(cdp) {
  const done = new Promise(res => cdp.on('Tracing.tracingComplete', res));
  await cdp.send('Tracing.end');
  await done;
}
// The few browser events that say WHEN the wheel was handed to the page and WHEN the compositor moved the
// scroller, placed relative to the block's start mark (ms; negative = before the block). WHY these names
// (found by dumping every scroll-ish event of an exploratory run, fix3-explore-1.json):
//   'Real scroll update input generation'   the wheel was injected (browser side)
//   'MouseWheelEventQueue::QueueEvent'      the browser queued/forwarded it towards the page
//   'InputHandler::ScrollUpdate'            the compositor thread applied the scroll (the verdict)
//   'ScrollableArea::scrollOffsetChanged'   the page's main thread learned of it afterwards
export function summariseTrace(events) {
  const mark = n => events.find(e => e.name === n)?.ts;
  const b0 = mark('sd-block-start'), b1 = mark('sd-block-end');
  if (b0 == null) return { error: 'no block mark in trace', total: events.length };
  const rel = ts => Math.round((ts - b0) / 100) / 10;
  const first = (name, ph) => { const e = events.filter(x => x.name === name && (!ph || x.ph === ph)).sort((p, q) => p.ts - q.ts)[0]; return e ? rel(e.ts) : null; };
  const blockLenMs = b1 ? rel(b1) : null;
  const scrollUpdateAtMs = first('InputHandler::ScrollUpdate');
  return {
    total: events.length, blockLenMs,
    wheelInjectedAtMs: first('Real scroll update input generation'),
    wheelQueuedAtMs: first('MouseWheelEventQueue::QueueEvent', 'X'),
    wheelAckedByPageAtMs: first('InputRouterImpl::MouseWheelEventHandled'),
    compositorScrollUpdateAtMs: scrollUpdateAtMs,
    pageLearnedOfScrollAtMs: first('ScrollableArea::scrollOffsetChanged'),
    // the verdict: the scroll was applied while the page was still blocked
    scrolledDuringBlock: scrollUpdateAtMs == null || blockLenMs == null ? null : scrollUpdateAtMs < blockLenMs,
  };
}

// `input` is a SECOND debugging connection: commands inside one connection are handled in order, so a wheel sent
// on the same connection as the busy loop would simply wait behind it and prove nothing about scrolling.
// One wheel click through real X input (XTEST). The pointer is moved first, then the click fires at an exact
// wall-clock time; the returned promise resolves when the helper has fired (or failed).
function xWheel(display, screenX, screenY, atEpochMs, ctrl = false, button = 5) {
  return new Promise(res => {
    const p = spawn('python3', [join(ROOT, 'scripts/perf-lab/xwheel.py'), display, String(screenX), String(screenY), String(button), String(atEpochMs), ctrl ? '1' : '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { err += b; });
    p.on('close', code => res({ code, out: out.trim(), err: err.trim() }));
  });
}

async function trial(cdp, input, env, mode, blockMs, extra = {}) {
  // reset (needs the main thread, so done while it is free)
  await cdp.evaluate(`(async () => { const sd = window.__sd; sd.box.scrollTop = 0; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
  await sleep(300);
  // cleared AFTER the reset's own scroll event has fired (it used to leak into the reading)
  await cdp.evaluate(`(() => { window.__sd.wheelSeen.length = 0; window.__sd.scrollSeen.length = 0; })()`);
  const events = []; await traceStart(cdp, events);
  const shot = async () => (await input.send('Page.captureScreenshot', { format: 'png' })).data;
  const base1 = await shot(); await sleep(100); const base2 = await shot();
  const baselineStable = base1 === base2;
  const t0 = Date.now();
  // 1) block the page's main thread; the reply arrives when the block ends
  const fireAt = Date.now() + 220;
  const xP = env.input === 'x11' ? xWheel(env.display, env.winLeft + 200, env.winTop + 150, fireAt) : null;
  const blockP = cdp.evaluate(BLOCK(blockMs)).then(v => ({ ...v, returnedAt: Date.now() }));
  // 2) wheel input a little after the block began
  await sleep(env.input === 'x11' ? 220 : 80);
  const wheelSentAt = Date.now();
  const wheelP = env.input === 'x11'
    ? xP.then(r => ({ ackedAt: Date.now(), xhelper: r }))
    : input.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 150, deltaX: 0, deltaY: 400, modifiers: 0 })
      .then(() => ({ ackedAt: Date.now() })).catch(e => ({ error: String(e.message || e), ackedAt: Date.now() }));
  // 3) a screenshot taken well inside the block
  await sleep(Math.max(30, Math.round(blockMs * 0.7) - (env.input === 'x11' ? 220 : 80)));
  const shotAskedAt = Date.now();
  const midP = shot().then(d => ({ data: d, returnedAt: Date.now() })).catch(e => ({ error: String(e.message || e), returnedAt: Date.now() }));
  const [block, wheel, mid] = await Promise.all([blockP, wheelP, midP]);
  await sleep(250);
  await traceStop(cdp);
  const after = await cdp.evaluate(`({ top: window.__sd.box.scrollTop, wheelSeen: window.__sd.wheelSeen, scrollSeen: window.__sd.scrollSeen })`);
  const midReturnedInsideBlock = mid.returnedAt < block.end;
  return {
    mode, ...extra, baselineStable,
    blockMs: block.end - block.start,
    wheelSentAtMsIntoBlock: wheelSentAt - block.start,
    shotAskedAtMsIntoBlock: shotAskedAt - block.start,
    midShotReturnedMsAfterBlockEnd: mid.returnedAt - block.end,
    midShotReturnedInsideBlock: midReturnedInsideBlock,
    // the verdict: did the picture change while the page was still blocked?
    movedDuringBlock: midReturnedInsideBlock && !mid.error ? mid.data !== base1 : null,
    midShotError: mid.error ?? null,
    wheelAckedMsAfterBlockEnd: wheel.ackedAt - block.end,
    pageSawWheelMsAfterBlockEnd: after.wheelSeen.length ? Math.round(after.wheelSeen[0] - block.end) : null,
    pageSawScrollMsAfterBlockEnd: after.scrollSeen.length ? Math.round(after.scrollSeen[0] - block.end) : null,
    finalScrollTop: after.top,
    totalMs: Date.now() - t0,
    trace: summariseTrace(events),
  };
}

async function zoomCheck(cdp, input, env) {
  // one ctrl+wheel (what a pinch becomes) at page point (x,y); dir -1 = wheel up (zoom in)
  const wheel = async (x, y, dir, ctrl) => {
    if (env.input === 'x11') { await xWheel(env.display, env.winLeft + x, env.winTop + y, Date.now() + 50, ctrl, dir < 0 ? 4 : 5); return; }
    await input.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dir * 120, modifiers: ctrl ? 2 : 0 });
  };
  await cdp.evaluate(`(async () => { const sd = window.__sd; sd.box.scrollTop = 0; await window.claude.zoom.reset(); })()`);
  await sleep(300);
  const before = await cdp.evaluate(`window.claude.zoom.get()`);
  // ctrl held, wheel up over the app body (outside the overlay: x=700) = zoom in
  await wheel(700, 400, -1, true);
  await sleep(700);
  const afterIn = await cdp.evaluate(`window.claude.zoom.get()`);
  // ctrl+wheel over the overlay scroller: must zoom, must NOT scroll the scroller
  await wheel(200, 150, 1, true);
  await sleep(700);
  const afterOut = await cdp.evaluate(`window.claude.zoom.get().then(z => ({ zoom: z, top: window.__sd.box.scrollTop }))`);
  const zoomAfterOut = afterOut.zoom;
  // a plain wheel over the overlay must still scroll it
  await cdp.evaluate(`window.claude.zoom.reset()`);
  await sleep(300);
  await wheel(200, 150, 1, false);
  await sleep(600);
  const plainTop = await cdp.evaluate(`window.__sd.box.scrollTop`);
  return { zoomBefore: before, zoomAfterCtrlWheelUp: afterIn, zoomAfterCtrlWheelDown: zoomAfterOut, scrollerTopAfterCtrlWheel: afterOut.top, scrollerTopAfterPlainWheel: plainTop };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv), bound = bounded(opts.maxMinutes);
  mkdirSync(dirname(opts.out), { recursive: true });
  const report = { status: 'incomplete', options: opts, scope: 'private packaged desktop on Xvfb (software rendering); yes/no on whether the compositor scrolled during a known main-thread block', loadAvgStart: readFileSync('/proc/loadavg', 'utf8').trim(), trials: [] };
  let x, app;
  try {
    if (!assetsReady()) throw Error('perf-lab assets not cached');
    const build = await buildBounded(opts.checkout, bound);
    if (!build.sha || !statSync(build.binary).isFile()) throw Error('package missing build stamp or binary');
    report.build = { sha: build.sha, dirty: build.dirty, builtAt: build.builtAt };
    refusePackageProcesses(build.appDir);
    const fixture = buildFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/suspects-fixture-')), { fakeProvider: false, nativeSessions: false, log: () => {} });
    x = await bound(startXvfb(':99'), 'Xvfb');
    app = await bound(launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: x.display, cdpPort: 9579, refuseExisting: true }), 'launch', 90000);
    const cdp = app.cdp;
    await sleep(4000);
    const input = await bound(waitForMainTarget(app.cdpPort).then(t => connect(t.webSocketDebuggerUrl)), 'second connection');
    await bound(cdp.evaluate(OVERLAY), 'overlay');
    // no window manager on the rig's display, so the page's origin on screen is the window's own position
    const win = { bounds: await bound(cdp.evaluate(`({ left: window.screenX, top: window.screenY, w: window.innerWidth, h: window.innerHeight, chrome: window.outerHeight - window.innerHeight })`), 'window bounds') };
    const env = { input: opts.input, display: x.display, winLeft: win.bounds.left ?? 0, winTop: win.bounds.top ?? 0 };
    report.window = win.bounds;
    // Listener that exists only in these modes. Added/removed by the harness, not the app.
    const setExtra = mode => cdp.evaluate(`(() => {
      const sd = window.__sd;
      if (sd.extra) { window.removeEventListener('wheel', sd.extra, { capture: true }); sd.extra = null; }
      if (${JSON.stringify(mode)} === 'passive') { sd.extra = () => {}; window.addEventListener('wheel', sd.extra, { passive: true, capture: true }); }
      if (${JSON.stringify(mode)} === 'blocking') { sd.extra = () => {}; window.addEventListener('wheel', sd.extra, { passive: false, capture: true }); }
      return true; })()`);
    report.hasPageWheelListener = null;
    for (let i = 0; i < opts.trials; i++) {
      for (const mode of ['app', 'passive', 'blocking']) {
        await bound(setExtra(mode), 'set mode');
        report.trials.push(await bound(trial(cdp, input, env, mode, opts.blockMs, { round: i + 1, load: readFileSync('/proc/loadavg', 'utf8').trim().split(' ')[0] }), `trial ${mode}`, opts.blockMs + 15000));
      }
    }
    await bound(setExtra('app'), 'set mode');
    report.zoom = await bound(zoomCheck(cdp, input, env), 'zoom check', 30000);
    const shot = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), 'screenshot').catch(() => null);
    if (shot) writeFileSync(`${opts.out}.png`, Buffer.from(shot.data, 'base64'));
    report.status = 'measured';
  } catch (e) { report.status = 'incomplete'; report.error = String(e?.message ?? e); }
  finally {
    report.loadAvgEnd = readFileSync('/proc/loadavg', 'utf8').trim();
    if (app) await Promise.race([app.kill(), sleep(8000)]).catch(e => { report.cleanupError = e.message; });
    if (x?.proc) x.proc.kill('SIGTERM');
    writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.status}: ${opts.out}`);
  if (report.status !== 'measured') process.exitCode = 2;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 2; });
