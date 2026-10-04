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
import { cpuSnapshot, pssMb } from './procs.mjs';
import { startHops, summariseHops, readEmissions, classify, attachMainCounters } from './hops.mjs';
import { connect } from './cdp.mjs';
import { traceMain, summariseTrace } from './trace-main.mjs';
import { installTerminalHelpers } from './scenario-terminal.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEGS = ['wheel', 'fence', 'flood'];
// WHY opt-in 'mixed' (2026-10-04, fix 5): a realistic reply (headings, lists, table, short fences, links) streamed
// the same way as the prose control, with commit/layout counts per delta. Not in the default run.
// WHY a separate list (2026-10-04, terminal flow control): these two are opt-in, so the default run is unchanged.
const EXTRA_LEGS = ['ctrlc', 'echo', 'noterm', 'minimized', 'mixed', 'prose'];

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), out: join(root, 'scratch/perf-lab/suspects.json'), maxMinutes: 12, floodMb: 40, floodRate: 0, mainInspect: '0', floodViews: 'visible,hidden', fenceLines: 500, only: LEGS.join(',') };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!['--checkout', '--out', '--max-minutes', '--flood-mb', '--flood-rate', '--main-inspect', '--flood-views', '--fence-lines', '--only'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const k of ['maxMinutes', 'floodMb', 'fenceLines', 'floodRate']) { o[k] = Number(o[k]); if (!Number.isInteger(o[k]) || o[k] < (k === 'floodRate' ? 0 : 1)) throw Error(`--${k} must be a positive integer`); }
  if (o.maxMinutes > 20 || o.floodMb > 200) throw Error('--max-minutes <= 20 and --flood-mb <= 200');
  for (const k of ['checkout', 'out']) if (!isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  o.floodViews = String(o.floodViews).split(',');
  if (o.floodViews.some(v => !['visible', 'hidden'].includes(v))) throw Error('--flood-views takes visible,hidden');
  o.only = o.only.split(',');
  if (o.only.some(l => ![...LEGS, ...EXTRA_LEGS].includes(l))) throw Error(`--only takes ${[...LEGS, ...EXTRA_LEGS].join(',')}`);
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
  // WHY the pieces are counted the way splitDeltas cuts them (tokens over 6 chars become 4-char slices):
  // counting whitespace-separated tokens undercounted by ~45%, so the fake provider truncated the fence
  // at ~277 of 500 lines. Fixed 2026-10-04 — numbers from before this are a DIFFERENT series.
  return { text, deltas: countDeltas(text) };
}

/** How many deltas the fake provider's splitDeltas cuts `text` into (tokens over 6 chars become 4-char slices). */
export function countDeltas(text) {
  let deltas = 0;
  for (const m of text.matchAll(/\s*\S+|\s+$/g)) {
    const word = m[0].trim();
    deltas += m[0].length <= 6 ? 1 : Math.ceil(word.length / 4);
  }
  return deltas;
}

/** A realistic assistant reply, about `target` deltas long: headings, paragraphs with inline code and links,
 *  bullet and numbered lists, a table, short code fences, a quote. Sections repeat with varying numbers. */
export function mixedText(target = 9000) {
  const parts = [];
  for (let i = 1; countDeltas(parts.join('')) < target; i++) {
    parts.push(`## Step ${i}: tightening the \`handler${i}\` path\n\n` +
      `The slow part is the **retry loop** in \`src/net/client${i}.ts\`. Each attempt re-reads the *whole* config, so a flaky link makes the cost grow with every failure; see [the design note](https://example.com/notes/${i}) for the reasoning behind the backoff. In practice this means a request that should take 40 ms can stall for several seconds before it finally gives up and reports the error to the caller.\n\n` +
      `- Cache the parsed config once per session (\`loadConfig()\`)\n- Cap retries at ${3 + i % 4} and add jitter\n- Log the **final** error only, not every attempt\n\n` +
      `1. Measure the baseline with \`npm run bench\`\n2. Apply the change behind a flag\n3. Re-measure and compare the p95\n\n` +
      `| Case | Before (ms) | After (ms) |\n|---|---|---|\n| cold start | ${900 + i} | ${410 + i} |\n| warm | ${220 + i} | ${95 + i} |\n| flaky link | ${5200 + i} | ${640 + i} |\n\n` +
      `\`\`\`ts\nexport async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {\n  const res = await fetch(url).catch(() => null);\n  if (res?.ok) return res;\n  if (attempt >= ${3 + i % 4}) throw new Error('giving up after ' + attempt);\n  await sleep(2 ** attempt * 50 + Math.random() * 25);\n  return fetchWithRetry(url, attempt + 1);\n}\n\`\`\`\n\n` +
      `> Note: the jitter matters more than the cap; without it every client retries in lockstep and the server sees a thundering herd.\n\n` +
      `That should bring the worst case down by roughly an order of magnitude, and the happy path is unchanged. If the numbers do not move, check \`logs/retry-${i}.log\` first, because a misconfigured proxy produces the same symptom.\n\n`);
  }
  return parts.join('');
}

export const bounded = maxMinutes => {
  const end = Date.now() + maxMinutes * 60000 - 12000;
  return (promise, label, cap = 30000) => {
    const ms = Math.min(cap, end - Date.now());
    if (ms <= 0) return Promise.reject(Error(`deadline: ${label}`));
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`timeout: ${label}`)), ms); })]).finally(() => clearTimeout(timer));
  };
};

export async function buildBounded(checkout, bound) {
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

export async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const g = n => (m.find(x => x.name === n)?.value ?? 0) * 1000;
  const c = n => m.find(x => x.name === n)?.value ?? 0;
  return { at: Date.now(), taskMs: g('TaskDuration'), scriptMs: g('ScriptDuration'), layoutMs: g('LayoutDuration'), styleMs: g('RecalcStyleDuration'), layouts: c('LayoutCount'), styles: c('RecalcStyleCount') };
}
export const diff = (a, b) => ({ wallMs: b.at - a.at, taskMs: Math.round(b.taskMs - a.taskMs), scriptMs: Math.round(b.scriptMs - a.scriptMs), layoutMs: Math.round(b.layoutMs - a.layoutMs), styleMs: Math.round(b.styleMs - a.styleMs), layouts: b.layouts - a.layouts, styleRecalcs: b.styles - a.styles, busyPct: Math.round((b.taskMs - a.taskMs) / Math.max(1, b.at - a.at) * 100) });

export async function readLongtasks(cdp) {
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

async function legFence(ctx, lines, profileBase, which = 'fence') {
  // `lines` is also read by the completeness check below.
  const { cdp, fake, bound, sessions, ids, switchTo } = ctx;
  const natIdx = ids.indexOf(sessions.nat[1].id);
  await switchTo(natIdx); await sleep(800);
  const run = async (plan, label) => {
    await bound(installProbe(cdp), 'longtask probe');
    const s = await startStream(cdp, fake, sessions.nat[1].id, plan, bound);
    // WHY opt-in CPU profile (SUSPECTS_PROFILE=1): names WHICH function the busy time is in.
    // A profiled run is a diagnostic only (sampling slows the page) — never a before/after number.
    const profiling = process.env.SUSPECTS_PROFILE === '1';
    if (profiling) {
      await bound(cdp.send('Profiler.enable'), 'profiler enable');
      await bound(cdp.send('Profiler.setSamplingInterval', { interval: 200 }), 'profiler interval');
      await bound(cdp.send('Profiler.start'), 'profiler start');
    }
    // WHY a MutationObserver count: one callback per task that changed the page ~= one React commit,
    // so callbacks per second against deltas per second says whether batching is really one commit per frame.
    await bound(cdp.evaluate(`(() => { window.__mut = { cb: 0, rec: 0, frames: 0 }; if (!window.__rafLoop) { window.__rafLoop = true; const tick = () => { window.__mut.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); } window.__mutObs?.disconnect(); if (${process.env.SUSPECTS_NO_MUT === '1'}) return false; window.__mutObs = new MutationObserver(r => { window.__mut.cb++; window.__mut.rec += r.length; }); window.__mutObs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); return true; })()`), 'mutation counter');
    const mut = async () => bound(cdp.evaluate('({ ...window.__mut })'), 'mutation read', 5000);
    // SUSPECTS_TRACE=1: an 8 s browser trace from 15 s into the stream, folded by activity (Layout, Paint, ...) — see trace-main.mjs.
    let tracePromise = null;
    if (process.env.SUSPECTS_TRACE === '1') tracePromise = (async () => { await sleep(15000); return summariseTrace(await traceMain(cdp, 8000)); })().catch(e => ({ error: e.message }));
    const rows = []; let prev = await metrics(cdp), prevSent = s.rec.deltasSent, prevMut = await mut();
    while (s.rec.endedAt === null) {
      await sleep(2000);
      const now = await bound(metrics(cdp), 'metrics', 5000), mnow = await mut();
      const fenceChunkEls = await bound(cdp.evaluate("document.querySelectorAll('.yc-fence-chunk').length"), 'chunk count', 5000).catch(() => null);
      rows.push({ fenceChunkEls, framesPerSec: Math.round((mnow.frames - prevMut.frames) / ((now.at - prev.at) / 1000)), commitsApprox: mnow.cb - prevMut.cb, mutationRecords: mnow.rec - prevMut.rec, deltasSoFar: s.rec.deltasSent, deltasInWindow: s.rec.deltasSent - prevSent, ...diff(prev, now) });
      prev = now; prevSent = s.rec.deltasSent; prevMut = mnow;
      if (rows.length > 60) throw Error(`${label} stream ran past 120 s`);
    }
    const rec = await bound(s.completion, `${label} completion`, 60000);
    if (profiling) {
      const { profile } = await bound(cdp.send('Profiler.stop'), 'profiler stop', 60000);
      writeFileSync(`${profileBase}.${label}.cpuprofile`, JSON.stringify(profile));
      await cdp.send('Profiler.disable').catch(() => {});
    }
    const longtasks = await bound(readLongtasks(cdp), 'longtasks'); await stopProbe(cdp).catch(() => {});
    // WHY a picture right after the stream, per leg: the end-of-run screenshot only shows the LAST leg (prose),
    // so it cannot show whether a long streamed code block came out complete and coloured.
    // WHY wait first: the renderer can still be catching up when the producer has finished, and a
    // picture of a half-drawn block would read as a defect (or hide one). Then check completeness
    // from the page itself: the fence's last line must be on screen, and highlighted spans present.
    await sleep(4000);
    // NOTE the fake provider truncates the fence (it sent ~19k of 35k chars in every run so far, baseline
    // included), so "complete" means: the last line it ACTUALLY sent is on screen.
    const sentLines = [...(plan.text ?? '').slice(0, rec.chars).matchAll(/value(\d+) = /g)];
    const lastSent = sentLines.length ? sentLines[sentLines.length - 1][1] : null;
    const doneCheck = lastSent === null ? null : await bound(cdp.evaluate(`(() => { const t = document.body.textContent || ''; return { lastSentLine: ${lastSent}, lastLinePresent: t.includes('value${lastSent} = '), firstLinePresent: t.includes('value0 = '), hljsSpans: document.querySelectorAll('.hljs-keyword').length }; })()`), 'completeness check').catch(() => null);
    const legShot = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), 'leg screenshot').catch(() => null);
    if (legShot) writeFileSync(`${profileBase}.${label}-final.png`, Buffer.from(legShot.data, 'base64'));
    const live = rows.filter(r => r.deltasInWindow > 0);
    const third = Math.max(1, Math.floor(live.length / 3));
    const avg = a => Math.round(a.reduce((x, r) => x + r.taskMs / Math.max(1, r.wallMs) * 100, 0) / Math.max(1, a.length));
    return { status: rec.aborted || rec.deltasSent !== rec.plannedDeltas ? 'incomplete' : 'measured', deltas: rec.deltasSent, chars: rec.chars, streamMs: rec.streamMs, busyPctFirstThird: avg(live.slice(0, third)), busyPctLastThird: avg(live.slice(-third)), trace: tracePromise ? await tracePromise : undefined, longtasks, doneCheck, windows: rows };
  };
  if (which === 'mixed') {
    const text = mixedText(9000);
    return { mixed: await run({ deltas: countDeltas(text), perSec: 150, text }, 'mixed') };
  }
  if (which === 'prose') {
    const fence = fenceText(lines);
    return { prose: await run({ deltas: fence.deltas, perSec: 150, seed: 'suspects-prose', chars: fence.text.length, text: null }, 'prose') };
  }
  const fence = fenceText(lines);
  const out = { lines, fence: await run({ deltas: fence.deltas, perSec: 150, text: fence.text }, 'fence') };
  // Control: ordinary prose, the same number of deltas at the same rate.
  out.prose = await run({ deltas: fence.deltas, perSec: 150, seed: 'suspects-prose', chars: fence.text.length, text: null }, 'prose');
  return out;
}

export async function toggleTerminal(cdp) {
  const ev = { modifiers: 2, key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, nativeVirtualKeyCode: 192 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ev });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
}

// Every process in the app's family that has memory worth reading (main, renderers, GPU, helpers, pty-workers).
function classifyPids(app) { const c = classify(app); return [c.main, ...c.renderers, ...c.gpu, ...c.utility, ...c.ptyWorkers]; }

async function legFlood(ctx, mb, rate = 0) {
  const { cdp, bound, sessions, ids, switchTo, app, hz, fixtureHome, views, mainCounters } = ctx, out = { mb };
  const emptyIdx = sessions.names.findIndex(n => sessions.sizeByName[n] === 'empty'), hugeIdx = sessions.names.findIndex(n => sessions.sizeByName[n] === 'huge');
  const id = ids[emptyIdx], marker = `[perf-lab] flood complete: ${mb} MB`;
  const run = async (label, during) => {
    // Byte counter only — never keeps the flood in memory, never touches layout.
    await bound(cdp.evaluate(`(() => { const p = { bytes: 0, chunks: 0, tail: '', doneAt: null, firstAt: null, lastAt: null }; p.off = window.claude.on.ptyOutputForSession(${JSON.stringify(id)}, d => { const n = performance.now(); if (p.firstAt === null) p.firstAt = n; p.lastAt = n; p.bytes += d.length; p.chunks++; p.tail = (p.tail + d).slice(-200); if (p.doneAt === null && p.tail.includes(${JSON.stringify(marker)})) p.doneAt = n; }); window.__flood = p; return true; })()`), 'flood counter');
    await bound(installProbe(cdp), 'longtask probe');
    await bound(installIpcStallProbe(cdp, { everyMs: 50 }), 'IPC probe');
    const family = app.family(), cpu0 = cpuSnapshot(family), m0 = await metrics(cdp);
    // WHY pss before: the cost of a flood in memory is (peak - before) and (after settling - before).
    const pssBefore = pssMb(classifyPids(app));
    // WHY: counts the renderer's own uncaught errors by message — proves WHAT stopped the flood.
    const thrown = {}; if (!ctx.exceptionsOn) { ctx.exceptionsOn = true; await cdp.send('Runtime.enable').catch(() => {}); cdp.on('Runtime.exceptionThrown', p => { const m = String(p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || '').split('\n')[0].slice(0, 120); ctx.thrown[m] = (ctx.thrown[m] || 0) + 1; }); } ctx.thrown = thrown;
    const hops = startHops(app, id, { everyMs: 250 });
    if (mainCounters) await mainCounters.reset().catch(() => {});
    const mcTimeline = [];
    const t0 = Date.now();
    // SUSPECTS_PROFILE=1: a renderer CPU profile of the first 1.5 s of the visible flood (written next to --out as .cpuprofile).
    let profDone = null;
    if (process.env.SUSPECTS_PROFILE && label === 'terminalVisible') {
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
      profDone = (async () => { await sleep(1500); const { profile } = await cdp.send('Profiler.stop'); await cdp.send('Profiler.disable'); writeFileSync(`${ctx.outPath}.cpuprofile`, JSON.stringify(profile)); })();
    }
    await bound(cdp.evaluate(`window.__flood.t0 = performance.now(); window.claude.session.sendInput(${JSON.stringify(id)}, ${JSON.stringify(`perf-lab-flood ${mb}${rate ? ' ' + rate : ''}\r`)}); true`), 'send flood');
    const input = during ? await during() : null;
    // WHY a timeline: an average rate cannot tell a steady trickle from a burst
    // followed by a dead stop, and those are different bugs.
    let state = null; const timeline = [];
    while (Date.now() - t0 < 150000) {
      state = await bound(cdp.evaluate(`({ bytes: window.__flood.bytes, chunks: window.__flood.chunks, done: window.__flood.doneAt !== null })`), 'flood state', 20000);
      timeline.push([Date.now() - t0, Math.round(state.bytes / 104857.6) / 10]);
      if (mainCounters && timeline.length % 2 === 0) { const m = await mainCounters.read().catch(() => null); if (m) mcTimeline.push([Date.now() - t0, Math.round(m.send.chars / 104857.6) / 10, Object.values(m.worker).reduce((a, w) => a + w.chars, 0) / 1048576 | 0]); }
      if (state.done) break;
      // A flood that has not moved for 20 s is a dead stop, not a slow run: stop waiting.
      const recent = timeline.filter(r => r[0] > Date.now() - t0 - 20000);
      if (timeline.length > 80 && recent.length > 10 && recent[0][1] === recent.at(-1)[1]) break;
      await sleep(250);
    }
    const wallMs = Date.now() - t0, m1 = await metrics(cdp), cpu1 = cpuSnapshot(family);
    const pssPeakish = pssMb(classifyPids(app));
    let ticks = 0, mainTicks = 0;
    for (const [pid, a] of cpu0) if (cpu1.has(pid)) { const d = Math.max(0, cpu1.get(pid) - a); ticks += d; if (pid === app.pid) mainTicks = d; }
    // The IPC samples with absolute times, so a stall can be lined up with the pipeline timeline.
    const ipcRaw = await bound(cdp.evaluate(`(() => { const p = window.__ipcStall; return p ? { t0: performance.timeOrigin + p.t0, samples: p.samples } : null; })()`), 'IPC samples').catch(() => null);
    const ipc = await bound(readIpcStallProbe(cdp), 'IPC result').catch(e => ({ error: e.message }));
    const longtasks = await bound(readLongtasks(cdp), 'longtasks');
    // Where did the bytes stop? Ask the renderer what it received and what xterm shows.
    const finalState = await bound(cdp.evaluate(`({ bytes: window.__flood.bytes, chunks: window.__flood.chunks, done: window.__flood.doneAt !== null, lastAtMsAgo: window.__flood.lastAt === null ? null : Math.round(performance.now() - window.__flood.lastAt), firstAtMs: window.__flood.firstAt === null ? null : Math.round(window.__flood.firstAt - window.__flood.t0), lastByteAtMs: window.__flood.lastAt === null ? null : Math.round(window.__flood.lastAt - window.__flood.t0), doneAtMs: window.__flood.doneAt === null ? null : Math.round(window.__flood.doneAt - window.__flood.t0), tail: window.__flood.tail, xtermTail: window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, 4) ?? null })`), 'final state').catch(e => ({ error: e.message }));
    await stopIpcStallProbe(cdp).catch(() => {}); await stopProbe(cdp).catch(() => {});
    // WHY (2026-10-04, terminal flow control): "the window RECEIVED the marker" is not "the terminal SHOWS it".
    // With backpressure the terminal is still drawing when the last chunk arrives, and without it xterm throws
    // the tail away; this waits (up to 60 s) for the marker AND the prompt to be on the xterm screen and says how long it took.
    const xtermSettled = await bound(cdp.evaluate(`(async () => { const t = performance.now(); let txt = ''; while (performance.now() - t < 60000) { txt = window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, 6) ?? ''; if (txt.includes(${JSON.stringify(marker)}) && /> *$/m.test(txt.trimEnd().split('\\n').pop() ?? '')) return { ok: true, ms: Math.round(performance.now() - t), tail: txt.slice(-160) }; await new Promise(r => setTimeout(r, 20)); } return { ok: false, ms: 60000, tail: txt.slice(-160) }; })()`), 'xterm settle', 70000).catch(e => ({ error: e.message }));
    await bound(cdp.evaluate('window.__flood?.off?.(); true'), 'flood counter off').catch(() => {});
    // Keep watching 12 s after the run: does memory come back, does anything wake up late?
    await sleep(12000);
    // Is the terminal still alive after the flood? A short command must come back whole.
    const recovery = await bound(cdp.evaluate(`(async () => { let got = ''; const off = window.claude.on.ptyOutputForSession(${JSON.stringify(id)}, d => { got += d; }); window.claude.session.sendInput(${JSON.stringify(id)}, 'perf-lab-glyphs 20\\r'); const t = performance.now(); while (performance.now() - t < 8000 && !got.includes('glyph fill complete: 20 lines')) await new Promise(r => setTimeout(r, 50)); off(); return { arrived: got.includes('glyph fill complete: 20 lines'), bytes: got.length, ms: Math.round(performance.now() - t) }; })()`), 'recovery check', 20000).catch(e => ({ error: e.message }));
    const hopRows = hops.stop();
    const mainEnd = mainCounters ? await mainCounters.read().catch(e => ({ error: e.message })) : null;
    const pssAfter = pssMb(classifyPids(app));
    const emissions = readEmissions(fixtureHome).filter(r => r.flood === mb && r.t >= t0 - 1000);
    const stalls = ipcRaw ? ipcRaw.samples.filter(s => s[1] > 150).map(s => ({ atMs: Math.round(ipcRaw.t0 + s[0] - t0), stallMs: s[1] })) : [];
    out[label] = {
      status: state?.done ? 'measured' : 'incomplete', wallMs, mbReceived: Math.round(state.bytes / 1048576 * 10) / 10, ipcMessages: state.chunks,
      ipcMessagesPerSec: Math.round(state.chunks / (wallMs / 1000)), renderer: diff(m0, m1), longtasks,
      mainProcessIpc: ipc.error ? ipc : { medianMs: ipc.medianMs, p95Ms: ipc.p95Ms, maxMs: ipc.maxMs, over100ms: ipc.over100ms, over250ms: ipc.over250ms, over1000ms: ipc.over1000ms, totalStallMs: ipc.totalStallMs, pings: ipc.pings, missedTicks: ipc.missedTicks, openStallMs: ipc.openStallMs },
      stallsOver150ms: stalls,
      cpuSecondsAllProcesses: Math.round(ticks / hz * 10) / 10, cpuSecondsMainProcess: Math.round(mainTicks / hz * 10) / 10, input, mbByMs: timeline.filter((_, i) => i % Math.ceil(timeline.length / 40) === 0 || i === timeline.length - 1),
      finalState, xtermSettled, recovery, rate, rendererErrors: thrown,
      producer: { rows: emissions.length, first: emissions[0] ?? null, last: emissions.at(-1) ?? null, errors: emissions.filter(r => r.event === 'error'), writtenMbByMs: emissions.filter((_, i) => i % Math.ceil(emissions.length / 40) === 0).map(r => [r.sinceStartMs, Math.round(r.written / 104857.6) / 10, r.eagain]) },
      pipeline: { watch: hops.watch, ...summariseHops(hopRows, hz), timeline: undefined },
      pipelineTimeline: hopRows.filter((_, i) => i % Math.ceil(hopRows.length / 120) === 0),
      mainCounters: mainEnd && { end: mainEnd, mbSentToRendererAndWorkerMbByMs: mcTimeline.filter((_, i) => i % Math.ceil(mcTimeline.length / 30) === 0) },
      pssMb: { before: pssBefore, afterRun: pssPeakish, after12sSettle: pssAfter },
    };
    await sleep(1500);
  };
  // 1. The flooding terminal is the thing on screen.
  await switchTo(emptyIdx); await sleep(500);
  await toggleTerminal(cdp);
  for (let i = 0; i < 50; i++) { if (await cdp.evaluate(`document.documentElement.dataset.viewMode === 'terminal'`)) break; await sleep(100); }
  out.viewMode = await cdp.evaluate('document.documentElement.dataset.viewMode');
  if (views.includes('visible')) await run('terminalVisible', null);
  // 2. Back to chat view on a DIFFERENT, long chat: the flood is now a hidden terminal,
  //    and the reader is scrolling and typing somewhere else.
  await toggleTerminal(cdp); await sleep(400);
  await switchTo(hugeIdx); await sleep(1500);
  if (views.includes('hidden')) await run('terminalHidden', async () => {
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


// ── Ctrl+C during a flood, and keystroke echo at idle (terminal flow control, 2026-10-04) ─────────
async function toTerminalView(ctx) {
  const { cdp, sessions, switchTo } = ctx;
  const emptyIdx = sessions.names.findIndex(n => sessions.sizeByName[n] === 'empty');
  await switchTo(emptyIdx); await sleep(500);
  await toggleTerminal(cdp);
  for (let i = 0; i < 50; i++) { if (await cdp.evaluate(`document.documentElement.dataset.viewMode === 'terminal'`)) break; await sleep(100); }
  return ctx.ids[emptyIdx];
}

// How long from pressing Ctrl+C in a flooding terminal until (a) the window has RECEIVED the interrupt
// message, (b) the terminal on screen SHOWS it, (c) the producer actually stopped. Input must never queue behind output.
async function legCtrlC(ctx, mb) {
  const { cdp, bound, fixtureHome } = ctx, out = { mb };
  const id = await toTerminalView(ctx);
  out.viewMode = await cdp.evaluate('document.documentElement.dataset.viewMode');
  const marker = '[perf-lab] flood interrupted';
  const t0 = Date.now();
  const r = await bound(cdp.evaluate(`(async () => {
    const id = ${JSON.stringify(id)}, marker = ${JSON.stringify(marker)}, sleep = ms => new Promise(r => setTimeout(r, ms));
    const st = { tail: '', ctrlAt: null, recvAt: null, bytesBefore: 0, bytesAfter: 0 };
    const off = window.claude.on.ptyOutputForSession(id, d => { if (st.ctrlAt === null) st.bytesBefore += d.length; else st.bytesAfter += d.length; st.tail = (st.tail + d).slice(-300); if (st.ctrlAt !== null && st.recvAt === null && st.tail.includes(marker)) st.recvAt = performance.now(); });
    window.claude.session.sendInput(id, ${JSON.stringify(`perf-lab-flood ${mb}\r`)});
    // 400 ms in: an unbraked 200 MB flood is over in ~1.7 s, so a later Ctrl+C would hit a finished command.
    await sleep(400);
    st.tail = ''; st.ctrlAt = performance.now(); window.claude.session.sendInput(id, '\\x03');
    let xtermAt = null;
    while (performance.now() - st.ctrlAt < 90000) { const txt = window.__terminalRegistry?.getScreenText(id, 8) ?? ''; if (txt.includes(marker)) { xtermAt = performance.now(); break; } await sleep(10); }
    off();
    return { mbBeforeCtrlC: Math.round(st.bytesBefore / 104857.6) / 10, mbAfterCtrlC: Math.round(st.bytesAfter / 104857.6) / 10, receivedMarkerMs: st.recvAt === null ? null : Math.round(st.recvAt - st.ctrlAt), xtermShowsMarkerMs: xtermAt === null ? null : Math.round(xtermAt - st.ctrlAt), xtermTail: (window.__terminalRegistry?.getScreenText(id, 4) ?? '').slice(-120) };
  })()`), 'ctrl-c leg', 120000).catch(e => ({ error: e.message }));
  Object.assign(out, r);
  await sleep(1500);
  const em = readEmissions(fixtureHome).filter(x => x.t >= t0 - 1000);
  const stopped = em.find(x => x.event === 'interrupted');
  out.producerWrittenMbAtEnd = em.filter(x => x.flood === mb).at(-1) ? Math.round(em.filter(x => x.flood === mb).at(-1).written / 104857.6) / 10 : null;
  out.producerInterrupted = !!stopped;
  out.recovery = await bound(cdp.evaluate(`(async () => { let got = ''; const off = window.claude.on.ptyOutputForSession(${JSON.stringify(id)}, d => { got += d; }); window.claude.session.sendInput(${JSON.stringify(id)}, 'perf-lab-glyphs 20\\r'); const t = performance.now(); while (performance.now() - t < 20000 && !got.includes('glyph fill complete: 20 lines')) await new Promise(r => setTimeout(r, 20)); off(); return { arrived: got.includes('glyph fill complete: 20 lines'), ms: Math.round(performance.now() - t) }; })()`), 'recovery', 30000).catch(e => ({ error: e.message }));
  out.loadAvg = readFileSync('/proc/loadavg', 'utf8').trim();
  return out;
}

// Key press -> character visible in the xterm buffer, idle terminal. 36 distinct characters, 200 ms apart.
async function legEcho(ctx) {
  const { cdp, bound } = ctx, out = {};
  const id = await toTerminalView(ctx);
  await sleep(1500);
  // The xterm's own hidden textarea is what takes keys in terminal view; focus it like a click would.
  out.focused = await bound(cdp.evaluate(`(() => { const t = document.querySelector('.terminal-overlay-scroll:not(.terminal-hidden) textarea'); if (t) t.focus(); return !!t && document.activeElement === t; })()`), 'focus xterm');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const recv = [], buf = [], failed = [];
  for (const ch of chars) {
    const armed = cdp.evaluate(`(async () => {
      const id = ${JSON.stringify(id)}, ch = ${JSON.stringify(ch)}; let t0 = null, recvAt = null;
      const onKey = e => { if (e.key === ch && t0 === null) t0 = e.timeStamp; };
      window.addEventListener('keydown', onKey, { capture: true, passive: true });
      const off = window.claude.on.ptyOutputForSession(id, d => { if (recvAt === null && t0 !== null && d.includes(ch)) recvAt = performance.now(); });
      const mc = new MessageChannel(); let resolveTick; mc.port1.onmessage = () => resolveTick(); const tick = () => new Promise(r => { resolveTick = r; mc.port2.postMessage(0); });
      const deadline = performance.now() + 4000; let bufAt = null;
      while (performance.now() < deadline) { if (t0 !== null && (window.__terminalRegistry?.getScreenText(id, 60) ?? '').includes(ch)) { bufAt = performance.now(); break; } await tick(); }
      window.removeEventListener('keydown', onKey, true); off();
      return { recvMs: recvAt === null || t0 === null ? null : recvAt - t0, bufMs: bufAt === null || t0 === null ? null : bufAt - t0 };
    })()`);
    await sleep(40);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: ch >= '0' && ch <= '9' ? 'Digit' + ch : 'Key' + ch, windowsVirtualKeyCode: ch.charCodeAt(0), text: ch });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: ch >= '0' && ch <= '9' ? 'Digit' + ch : 'Key' + ch, windowsVirtualKeyCode: ch.charCodeAt(0) });
    const r = await bound(armed, `echo ${ch}`, 10000).catch(e => ({ error: e.message }));
    if (r.bufMs == null) failed.push(ch); else { buf.push(r.bufMs); if (r.recvMs != null) recv.push(r.recvMs); }
    await sleep(160);
  }
  out.keys = chars.length; out.notSeen = failed;
  out.keyToIpcReceived = stats(recv); out.keyToXtermBuffer = stats(buf);
  out.loadAvg = readFileSync('/proc/loadavg', 'utf8').trim();
  return out;
}

// ── A session with no desktop terminal that can answer, and a window nobody can see (flow-control review, 2026-10-04) ──
// noterm: reload the window mid-flood. For the moment between the old page going and the new one mounting its
// terminals the session has no desktop terminal at all — the same position as a phone-driven session with the
// desktop closed. The brake must not apply: the producer should finish about as fast as it did before any brake existed
// (~2 s for 200 MB), memory must stay bounded, and the newest output must still arrive once the page is back.
async function legNoTerm(ctx, mb) {
  const { cdp, bound, fixtureHome, app } = ctx, out = { mb };
  const id = await toTerminalView(ctx);
  const marker = `[perf-lab] flood complete: ${mb} MB`;
  const pssBefore = pssMb(classifyPids(app));
  const t0 = Date.now();
  await bound(cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(id)}, ${JSON.stringify(`perf-lab-flood ${mb}\r`)}); true`), 'send flood');
  await sleep(300);
  // WHY about:blank and not a reload: after a plain reload the new page mounts the terminal again (hidden, behind the
  // chat view), so the hidden-terminal allowance — not "no terminal" — paced the rest (first attempt: 116 MB in 178 s).
  // A blank page has no terminal at all for the whole flood, like a phone-driven session with the desktop closed.
  const appUrl = await bound(cdp.evaluate('location.href'), 'url');
  await cdp.send('Page.navigate', { url: 'about:blank' }).catch(e => { out.reloadError = e.message; });
  let done = null;
  while (Date.now() - t0 < 180000) {
    const em = readEmissions(fixtureHome).filter(r => r.flood === mb && r.t >= t0 - 1000);
    done = em.find(r => r.event === 'done');
    if (done) break;
    await sleep(100);
  }
  out.producerDoneMs = done ? done.t - t0 : null;
  { const rows = readEmissions(fixtureHome).filter(r => r.flood === mb && r.t >= t0 - 1000); out.producerLastRow = rows.at(-1) ?? null; out.producerRows = rows.length; out.producerErrors = rows.filter(r => r.event === 'error').slice(0, 3); out.workersAlive = classify(app).ptyWorkers?.length ?? null; }
  out.pssAfterDone = pssMb(classifyPids(app));
  out.pssBefore = pssBefore;
  await cdp.send('Page.navigate', { url: appUrl }).catch(e => { out.reloadError = e.message; });
  await sleep(4000);
  // The page comes back: does the newest output (marker + prompt) reach the new terminal?
  const shown = await bound(cdp.evaluate(`(async () => { const t = Date.now(); while (Date.now() - t < 60000) { const txt = window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, 8) ?? ''; if (txt.includes(${JSON.stringify(marker)})) return { ok: true, ms: Date.now() - t, tail: txt.slice(-100) }; await new Promise(r => setTimeout(r, 100)); } return { ok: false, tail: (window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, 4) ?? '').slice(-100) }; })()`), 'tail after reload', 90000).catch(e => ({ error: e.message }));
  out.tailAfterReload = shown;
  await sleep(8000);
  out.pssAfterSettle = pssMb(classifyPids(app));
  out.loadAvg = readFileSync('/proc/loadavg', 'utf8').trim();
  return out;
}

// minimized: hide the window (main process win.hide(): the page becomes document.hidden and its timers are throttled
// to ~1 s, exactly as when minimised or in the tray) mid-flood, time the PRODUCER to completion, then show it and check
// the terminal ends with the exact tail.
async function legMinimized(ctx, mb) {
  const { cdp, bound, fixtureHome, app } = ctx, out = { mb };
  if (!ctx.mainPort) throw Error('minimized needs --main-inspect 1');
  const id = await toTerminalView(ctx);
  const marker = `[perf-lab] flood complete: ${mb} MB`;
  const mainEval = async expr => { const targets = await (await fetch(`http://127.0.0.1:${ctx.mainPort}/json/list`)).json(); const m = await connect(targets.find(x => x.webSocketDebuggerUrl).webSocketDebuggerUrl); try { return await m.evaluate(expr); } finally { m.close?.(); } };
  const thrown = {}; await cdp.send('Runtime.enable').catch(() => {}); cdp.on('Runtime.exceptionThrown', p => { const m = String(p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || '').split('\n')[0].slice(0, 100); thrown[m] = (thrown[m] || 0) + 1; });
  const pssBefore = pssMb(classifyPids(app));
  // WHY hide FIRST and wait 12 s: Chromium only stretches a hidden page's timers after a ~10 s grace period, so a
  // flood that starts at the moment of hiding finishes inside the grace period and shows nothing (first attempt, 100 MB in 7.8 s).
  out.hide = await mainEval(`(() => { const { BrowserWindow } = process.mainModule.require('electron'); const w = BrowserWindow.getAllWindows().find(w => !w.isDestroyed()); w.hide(); return { visible: w.isVisible() }; })()`);
  await sleep(12000);
  out.visibilityInPage = await bound(cdp.evaluate('document.visibilityState'), 'visibility').catch(e => e.message);
  const t0 = Date.now();
  await bound(cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(id)}, ${JSON.stringify(`perf-lab-flood ${mb}\r`)}); true`), 'send flood');
  let done = null;
  while (Date.now() - t0 < 240000) {
    const em = readEmissions(fixtureHome).filter(r => r.flood === mb && r.t >= t0 - 1000);
    done = em.find(r => r.event === 'done');
    if (done) break;
    await sleep(200);
  }
  out.producerDoneMsWhileHidden = done ? done.t - t0 : null;
  const lastRow = readEmissions(fixtureHome).filter(r => r.flood === mb && r.t >= t0 - 1000).at(-1);
  out.producerWrittenMbAtGiveUp = lastRow ? Math.round(lastRow.written / 104857.6) / 10 : null;
  out.pssHidden = pssMb(classifyPids(app));
  out.pssBefore = pssBefore;
  await mainEval(`(() => { const { BrowserWindow } = process.mainModule.require('electron'); BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).forEach(w => w.show()); return true; })()`);
  const shown = await bound(cdp.evaluate(`(async () => { const t = Date.now(); while (Date.now() - t < 90000) { const txt = window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, 8) ?? ''; if (txt.includes(${JSON.stringify(marker)})) return { ok: true, ms: Date.now() - t, tail: txt.slice(-100) }; await new Promise(r => setTimeout(r, 100)); } return { ok: false, tail: (window.__terminalRegistry?.getScreenText(${JSON.stringify(id)}, 4) ?? '').slice(-100) }; })()`), 'tail after show', 120000).catch(e => ({ error: e.message }));
  out.tailAfterShow = shown;
  out.rendererErrors = thrown;
  await sleep(5000);
  out.pssAfterSettle = pssMb(classifyPids(app));
  out.loadAvg = readFileSync('/proc/loadavg', 'utf8').trim();
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
    app = await bound(launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: x.display, cdpPort: 9577, refuseExisting: true, extraArgs: [...(opts.mainInspect === '1' ? ['--inspect=9301'] : []), ...(process.env.SUSPECTS_APP_ARGS ? process.env.SUSPECTS_APP_ARGS.split(' ') : [])] }), 'launch', 90000);
    const cdp = app.cdp;
    report.gpu = await bound(readRendererInfo(app.cdpPort, cdp), 'GPU info');
    await bound(cdp.send('Performance.enable'), 'metrics domain');
    await bound(installPageHelpers(cdp), 'page helpers');
    await bound(installTerminalHelpers(cdp), 'terminal helpers');
    let mainCounters = null;
    if (opts.mainInspect === '1') { try { mainCounters = await bound(attachMainCounters(9301), 'main inspector'); report.mainHook = mainCounters.hook; } catch (e) { report.mainHook = { error: String(e.message) }; } }
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
      const ctx = { cdp, fake, bound, sessions, ids, switchTo, app, hz, fixtureHome: fixture.home, views: opts.floodViews, mainCounters, outPath: opts.out, mainPort: opts.mainInspect === '1' ? 9301 : null };
      // Each leg fails alone: a broken selector in one must not cost the others' numbers.
      for (const leg of opts.only) {
        try {
          report.legs[leg] = leg === 'wheel' ? await legWheel(ctx) : leg === 'fence' ? await legFence(ctx, opts.fenceLines, opts.out) : leg === 'mixed' || leg === 'prose' ? await legFence(ctx, opts.fenceLines, opts.out, leg) : leg === 'ctrlc' ? await legCtrlC(ctx, opts.floodMb) : leg === 'echo' ? await legEcho(ctx) : leg === 'noterm' ? await legNoTerm(ctx, opts.floodMb) : leg === 'minimized' ? await legMinimized(ctx, opts.floodMb) : await legFlood(ctx, opts.floodMb, opts.floodRate);
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
