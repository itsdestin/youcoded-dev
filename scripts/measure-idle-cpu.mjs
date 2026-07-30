#!/usr/bin/env node
// scripts/measure-idle-cpu.mjs — measure YouCoded's idle CPU burn, and name the
// cause when it's high.
//
// WHY THIS EXISTS
//   Idle CPU is invisible in code review and silently regresses. The 2026-07-30
//   investigation found a single Tailwind `animate-pulse` dot taking the idle
//   app from 4% to 43% of one CPU core, because Chromium repaints the whole
//   window on every frame of a non-composited animation — at 180 Hz. The cost is
//   per-FRAME, not per-element, so ONE perpetual animation pays it in full.
//   That class of regression is trivial to reintroduce and impossible to see, so
//   this script measures it on demand.
//
// USAGE
//   # 1. Launch a dev instance with the CDP port open:
//   YOUCODED_DEVTOOLS_PORT=9333 bash scripts/run-dev.sh <worktree> --label "Idle CPU"
//
//   # 2. Leave the window VISIBLE and idle, then:
//   node scripts/measure-idle-cpu.mjs                 # 20s sample
//   node scripts/measure-idle-cpu.mjs --seconds 30
//   node scripts/measure-idle-cpu.mjs --budget 8      # non-zero exit if over
//
// READING THE RESULT
//   Reported as % of ONE core, summed across the Electron process family
//   (browser + renderers + GPU). Reference numbers from the 2026-07-30 run on a
//   2560x1600@180Hz panel, dev instance, meadow-mist theme:
//     ~4%    idle, welcome screen, no perpetual animation   <- healthy
//     ~35%   3 sessions showing the pulsing "Initializing" overlay (pre-fix)
//     ~43%   one un-promoted 64px `animate-pulse` div, nothing else
//   Anything above ~10% visible-idle means something is animating every frame.
//   The script lists any running CSS animations so you can see what.
//
//   Expect LOWER numbers on a 60Hz display — the burn scales with refresh rate,
//   so a regression that costs 40% here costs ~13% on a 60Hz laptop. Compare
//   against a baseline captured on the SAME machine, not against these numbers.
//
// SAFETY
//   Read-only /proc sampling plus CDP against the DEV instance only. Never point
//   this at the production install — attaching CDP to it is exactly the thing
//   .claude/rules/live-app-safety.md forbids. The script refuses to sample a
//   process whose executable path is outside a dev checkout.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const SECONDS = Number(flag('seconds', 20));
const PORT = Number(flag('port', 9333));
const BUDGET = flag('budget', null) === null ? null : Number(flag('budget', null));
const HZ = 100; // Linux USER_HZ; /proc/*/stat utime+stime are in these ticks

if (process.platform !== 'linux') {
  console.error('measure-idle-cpu: /proc sampling is Linux-only.');
  console.error('On other platforms use the CDP section alone, or Activity Monitor / Task Manager.');
  process.exit(2);
}

// ── Find the dev Electron family ───────────────────────────────────────────
// Match on the electron binary inside a checkout's node_modules. The packaged
// production app lives at /opt/YouCoded (or Program Files / Applications) and
// can never match this, which is the safety interlock.
function devElectronPids() {
  let out = '';
  try {
    out = execFileSync('ps', ['-eo', 'pid,args', '--no-headers'], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const pids = [];
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, cmd] = m;
    if (!/node_modules\/electron\/dist\/electron/.test(cmd)) continue;
    if (/\/opt\/|Program Files|\/Applications\//.test(cmd)) continue; // never the packaged app
    pids.push(pid);
  }
  return pids;
}

// ── /proc sampling ─────────────────────────────────────────────────────────
function ticks(statPath) {
  try {
    const s = readFileSync(statPath, 'utf8');
    // comm can contain spaces and ')', so split after the LAST ')'
    const rest = s.slice(s.lastIndexOf(')') + 2).split(/\s+/);
    return Number(rest[11]) + Number(rest[12]); // utime + stime
  } catch {
    return null;
  }
}
const comm = (p) => {
  try { return readFileSync(`/proc/${p}/task/${p}/comm`, 'utf8').trim(); } catch { return '?'; }
};

function snapshot(pids) {
  const out = new Map();
  for (const p of pids) {
    let tids;
    try { tids = readdirSync(`/proc/${p}/task`); } catch { continue; } // exited mid-run
    for (const t of tids) {
      const v = ticks(`/proc/${p}/task/${t}/stat`);
      if (v !== null) out.set(`${p}:${t}`, v);
    }
  }
  return out;
}

// ── CDP: what is animating, and at what frame rate ─────────────────────────
async function inspectRenderer() {
  let targets;
  try {
    const res = await fetch(`http://localhost:${PORT}/json/list`);
    targets = await res.json();
  } catch {
    return { ok: false, reason: `no CDP on port ${PORT} (launch with YOUCODED_DEVTOOLS_PORT=${PORT})` };
  }
  const page = targets.find((t) => t.type === 'page' && t.title !== 'DevTools');
  if (!page) return { ok: false, reason: 'no app page target found' };

  // Minimal CDP client — one eval, no dependencies (keeps this script runnable
  // from the workspace root, which has no node_modules of its own).
  const { default: WebSocket } = await import(
    `${process.env.YOUCODED_DESKTOP ?? new URL('../youcoded/desktop', import.meta.url).pathname}/node_modules/ws/index.js`
  ).catch(() => ({ default: null }));
  if (!WebSocket) return { ok: false, reason: 'ws module not resolvable; skipping animation inspection' };

  return await new Promise((resolve) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    // rAF never fires while the window is hidden/minimized, so the frame count
    // must race a timer — otherwise this eval hangs forever on a minimized
    // window and the whole run reports "CDP timed out" instead of the far more
    // useful "you measured a hidden window".
    const expr = `(async()=>{
      let frames=0;const t0=performance.now();
      await Promise.race([
        new Promise(res=>{const tick=()=>{frames++;
          if(performance.now()-t0<1000)requestAnimationFrame(tick);else res();};
          requestAnimationFrame(tick);}),
        new Promise(res=>setTimeout(res,1500)),
      ]);
      const fps=Math.round(frames/((performance.now()-t0)/1000));
      const anims=document.getAnimations().filter(a=>a.playState==='running').map(a=>{
        const t=a.effect&&a.effect.target;
        const cn=t?((t.className&&t.className.baseVal!==undefined?t.className.baseVal:t.className)||t.tagName):'?';
        const wc=t?getComputedStyle(t).willChange:'?';
        const inf=(()=>{try{return a.effect.getTiming().iterations===Infinity;}catch(e){return null;}})();
        return {name:a.animationName||a.transitionProperty||'?',target:(cn+'').slice(0,60),willChange:wc,infinite:inf};
      });
      return JSON.stringify({fps,visibility:document.visibilityState,anims});
    })()`;
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve({ ok: false, reason: 'CDP timed out' }); }, 15000);
    ws.on('open', () => ws.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true },
    })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.id !== 1) return;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      const v = m.result?.result?.value;
      resolve(v ? { ok: true, ...JSON.parse(v) } : { ok: false, reason: 'eval returned nothing' });
    });
    ws.on('error', () => { clearTimeout(timer); resolve({ ok: false, reason: 'CDP connect failed' }); });
  });
}

// ── Run ────────────────────────────────────────────────────────────────────
const pids = devElectronPids();
if (!pids.length) {
  console.error('measure-idle-cpu: no DEV Electron processes found.');
  console.error('Launch one first:  YOUCODED_DEVTOOLS_PORT=9333 bash scripts/run-dev.sh <worktree>');
  console.error('(This script deliberately refuses to sample the packaged production app.)');
  process.exit(2);
}

console.log(`Sampling ${pids.length} dev Electron processes for ${SECONDS}s — keep the window VISIBLE and idle.\n`);
const before = snapshot(pids);
const anim = await inspectRenderer(); // runs during the sample window; ~1s of rAF counting
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const after = snapshot(pids);

const perProc = new Map();
const perThread = [];
for (const [key, v] of after) {
  const d = v - (before.get(key) ?? v);
  if (d <= 0) continue;
  const pct = (d / HZ / SECONDS) * 100;
  const [pid, tid] = key.split(':');
  perProc.set(pid, (perProc.get(pid) ?? 0) + pct);
  perThread.push({ pct, pid, tid, name: comm(pid) === '?' ? '?' : readSafe(`/proc/${pid}/task/${tid}/comm`) });
}
function readSafe(p) { try { return readFileSync(p, 'utf8').trim(); } catch { return '?'; } }

const total = [...perProc.values()].reduce((a, b) => a + b, 0);

console.log('Per-process (% of ONE core):');
for (const [pid, pct] of [...perProc.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(pid).padStart(8)}  ${pct.toFixed(2).padStart(6)}%  ${comm(pid)}`);
}
console.log(`  ${'TOTAL'.padStart(8)}  ${total.toFixed(2).padStart(6)}%\n`);

console.log('Top threads:');
for (const t of perThread.sort((a, b) => b.pct - a.pct).slice(0, 8)) {
  console.log(`  ${t.pct.toFixed(2).padStart(6)}%  ${t.name}`);
}

if (anim.ok) {
  console.log(`\nRenderer: ${anim.fps} fps, visibility=${anim.visibility}`);
  if (anim.visibility !== 'visible') {
    console.log('  NOTE: window is not visible — Chromium throttles it, so this number is not the idle-visible figure.');
  }
  if (!anim.anims.length) {
    // 0 fps here is the HEALTHY reading, not a broken probe: with nothing
    // animating there is no damage, so Chromium produces no frames at all.
    console.log('  No running CSS animations — 0 fps is the expected, healthy result.');
  } else {
    console.log(`  ${anim.anims.length} running animation(s):`);
    for (const a of anim.anims) {
      const promoted = a.willChange && a.willChange !== 'auto';
      const mark = promoted ? 'promoted' : 'NOT PROMOTED — repaints the whole window every frame';
      console.log(`    - ${a.name} on "${a.target}" [${mark}]`);
    }
    console.log('  A perpetual animation without will-change is the #1 cause of idle burn.');
  }
} else {
  console.log(`\n(animation inspection skipped: ${anim.reason})`);
}

if (BUDGET !== null) {
  if (total > BUDGET) {
    console.log(`\nFAIL: ${total.toFixed(2)}% exceeds the ${BUDGET}% budget.`);
    process.exit(1);
  }
  console.log(`\nPASS: ${total.toFixed(2)}% is within the ${BUDGET}% budget.`);
}
