// scripts/resize-bench.mjs — measure what a window resize actually costs the renderer.
//
// Drives a REAL viewport resize sweep over CDP (Emulation.setDeviceMetricsOverride),
// which produces genuine layout + resize events in the page. This matters: poking
// style widths from inside the page does NOT re-lay-out elements whose containing
// block is the viewport, so an in-page "benchmark" can measure nothing and look fine.
// That mistake cost a bogus result during the 2026-08-06 resize investigation.
//
// Pairs with an in-page probe (`window.__rp`) that records resize events, frame gaps,
// and long tasks; the sweep reads it back at the end. Without the probe you still get
// wall-clock ms/step, which is usually enough to A/B a fix.
//
// Usage:
//   YOUCODED_DEVTOOLS_PORT=9223 bash scripts/run-dev.sh <worktree> --label "..."
//   node scripts/resize-bench.mjs '<webSocketDebuggerUrl>' [steps]
//
// Find the URL with:
//   curl -s http://localhost:9223/json/list | grep -B3 'localhost:5223/"'
//
// The probe (paste via scripts/cdp-eval.mjs before sweeping — optional):
//   (() => { const t0=performance.now(), log=[]; window.__rp={t0,log};
//     addEventListener('resize',()=>log.push(['resize',Math.round(performance.now()-t0),innerWidth,innerHeight]));
//     let last=performance.now();
//     const tick=()=>{const n=performance.now(); if(n-last>40) log.push(['frame-gap',Math.round(n-t0),Math.round(n-last),innerWidth]); last=n; requestAnimationFrame(tick);};
//     requestAnimationFrame(tick);
//     new PerformanceObserver(l=>{for(const e of l.getEntries()) log.push(['longtask',Math.round(e.startTime-t0),Math.round(e.duration)]);}).observe({entryTypes:['longtask']});
//     return 'probe installed'; })()
//
// INTERPRETING THE OUTPUT — the whole point of the probe is telling these apart:
//   long tasks during the stall .......... our JS/layout blocks the main thread → fix our code
//   no long tasks, big frame gaps ........ paint/raster/compositing → not a layout problem
//   resize events not arriving ........... the renderer was never told → Electron/compositor path
//
// NOTE: `ws` is the only dependency and the workspace root has no node_modules.
// Run it with a checkout's deps on the resolution path, e.g. copy it next to them:
//   cp scripts/resize-bench.mjs youcoded/desktop/node_modules/.resize-bench.mjs
//   cd youcoded/desktop && node node_modules/.resize-bench.mjs '<ws>' 24
// (Same constraint documented in scripts/cdp-eval.mjs.)
//
// History: written for the 2026-08-06 window-resize investigation, which found that
// App.tsx keeps every open session's ChatView in the layout tree. See ROADMAP.md →
// "Window-resize lag has a SECOND cause" for the part that is still unexplained.
import WebSocket from 'ws';

const [, , wsUrl, stepsArg] = process.argv;
if (!wsUrl) {
  console.error('usage: node scripts/resize-bench.mjs <webSocketDebuggerUrl> [steps]');
  process.exit(1);
}
const STEPS = Number(stepsArg || 24);
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const msgId = ++id;
  pending.set(msgId, { res, rej });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});

ws.on('open', async () => {
  await send('Runtime.enable');
  const { w, h, dpr } = JSON.parse(
    await evaluate('JSON.stringify({w: innerWidth, h: innerHeight, dpr: devicePixelRatio})'),
  );
  await evaluate('window.__rp && (window.__rp.log.length = 0)');

  const t0 = Date.now();
  for (let i = 0; i < STEPS; i++) {
    // Sawtooth across 12 widths so the sweep resembles a drag rather than a
    // one-way shrink (a monotonic shrink lets layout caches help unfairly).
    const width = Math.round(w - (i % 12) * 40);
    await send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: dpr, mobile: false });
    await evaluate('void document.body.offsetHeight');   // wait for layout to settle
  }
  const wall = Date.now() - t0;
  await send('Emulation.clearDeviceMetricsOverride');

  const probe = await evaluate(`JSON.stringify((()=>{const l=window.__rp?window.__rp.log:[];
    const lt=l.filter(e=>e[0]==='longtask').map(e=>e[2]);
    const fg=l.filter(e=>e[0]==='frame-gap').map(e=>e[2]);
    return {probeInstalled:!!window.__rp, resizeEvents:l.filter(e=>e[0]==='resize').length,
            longtaskCount:lt.length, longtaskTotalMs:lt.reduce((a,b)=>a+b,0),
            longtaskMax:Math.max(0,...lt), frameGapMax:Math.max(0,...fg),
            topLongtasks:lt.sort((a,b)=>b-a).slice(0,8)};})())`);
  console.log(JSON.stringify(
    { steps: STEPS, baseWidth: w, wallMs: wall, msPerStep: +(wall / STEPS).toFixed(1), ...JSON.parse(probe) },
    null, 2,
  ));
  ws.close();
  process.exit(0);
});
ws.on('error', (e) => { console.error('ws error:', e.message); process.exit(1); });
