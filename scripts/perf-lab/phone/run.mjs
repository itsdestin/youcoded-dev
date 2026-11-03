#!/usr/bin/env node
// scripts/perf-lab/phone/run.mjs — the phone speed lab. Drives the YouCoded Dev copy on a connected Android phone
// through fixed steps (steps.mjs) and reports, per step: frames (dropped and slow, against the screen's own rate), the
// browser's long animation frames and what filled them, the time from the finger to what the step waits for, how
// busy the page, graphics and assistant were, and memory.
//
// WHY (Destin, 2026-11-02, card #96): "we need to set up and run something akin to the perf lab for mobile to test
// frame drops/speeds, cpu/gpu usage, lag, etc when opening the keyboard, managing files, navigating menus". The desktop
// perf lab never ran the phone, and the keyboard / Settings / drawer lag was being fixed by guesswork.
//
//   node scripts/perf-lab/phone/run.mjs                      every step, 3 repeats each
//   node scripts/perf-lab/phone/run.mjs keyboard-open --repeat 5
//   node scripts/perf-lab/phone/run.mjs --no-trace           skip the timeline recording (lighter, no thread split)
//   node scripts/perf-lab/phone/run.mjs --fresh              restart the dev copy first (true first opens)
//   node scripts/perf-lab/phone/run.mjs skills-drawer-resize --page-js "<expr>"   an experiment (see below)
//   node scripts/perf-lab/phone/run.mjs --list
//   node scripts/perf-lab/phone/run.mjs --compare <a.json> <b.json>
//
// Reports go to perf-reports/phone/<date>-<label>.{json,md}. The lab takes no pictures and stops the moment the dev
// copy is not the window in front (device.mjs → requireDevInFront).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dev from './device.mjs';
import { PROBE } from './probe.mjs';
import { STEPS } from './steps.mjs';
import { summarizeTrace } from './trace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS = join(HERE, '..', '..', '..', 'perf-reports', 'phone');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
if (flag('--list')) { for (const s of STEPS) console.log(`${s.name.padEnd(22)} ${s.what}`); process.exit(0); }
if (flag('--compare')) { const i = argv.indexOf('--compare'); compare(argv[i + 1], argv[i + 2]); process.exit(0); }
const repeat = Number(opt('--repeat', 3));
const label = opt('--label', 'run');
const trace = !flag('--no-trace');
const wanted = argv.filter((a, i) => !a.startsWith('--') && !['--repeat', '--label', '--page-js'].includes(argv[i - 1]));
const steps = wanted.length ? STEPS.filter((s) => wanted.includes(s.name)) : STEPS;
if (!steps.length) { console.error(`no such step: ${wanted.join(', ')} (--list shows them)`); process.exit(1); }

const median = (a) => { const s = [...a].filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

async function main() {
  if (flag('--fresh')) {
    // Start from a freshly opened app, so each step's first run is a true first open (code loaded on demand included).
    dev.shell(`am force-stop ${dev.PKG}`);
    dev.shell(`monkey -p ${dev.PKG} -c android.intent.category.LAUNCHER 1`);
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      try { const p = await dev.connectPage(); const ready = await p.evaluate(`!!window.__ycBootReady`); p.close(); if (ready) break; } catch { /* still starting */ }
    }
    await sleep(2500);
  }
  dev.requireDevInFront();
  const page = await dev.connectPage();
  await page.evaluate(PROBE);
  // --page-js "<expression>": an experiment run on the page before the steps (switch something off, measure again).
  // It lasts until the page reloads; the report records it, so an experiment is never mistaken for a baseline.
  const pageJs = opt('--page-js', null);
  if (pageJs) console.log('experiment:', await page.evaluate(pageJs));
  const top = dev.statusBarTop();
  const ctx = {
    page, sleep,
    key: (c) => dev.key(c),
    swipe: (...a) => dev.swipe(...a),
    find: (sel, text) => page.evaluate(`window.__plab.find(${JSON.stringify(sel)}, ${JSON.stringify(text ?? null)})`),
    toScreen: (r) => ({ x: r.x * r.dpr, y: top + r.y * r.dpr }),
    async tapOn(sel, text) {
      const r = await ctx.find(sel, text);
      if (!r) throw new Error(`nothing to tap: ${sel ?? ''} ${text ?? ''}`.trim());
      const p = ctx.toScreen(r); dev.tap(p.x, p.y);
    },
    async waitFor(sel, text, ms) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ctx.find(sel, text)) return true; await sleep(150); }
      return false;
    },
  };
  // The screen's rate, from a quiet second of frames.
  await page.evaluate('window.__plab.start()'); await sleep(1000);
  const idle = await page.evaluate('window.__plab.stop()');
  const frameMs = median(idle.frames) || 16.7;
  const refreshHz = Math.round(1000 / frameMs);
  const procs = dev.appProcesses();
  const meta = { date: new Date().toISOString(), label, device: dev.shell('getprop ro.product.model'), android: dev.shell('getprop ro.build.version.release'),
    webview: (await page.evaluate('navigator.userAgent')).match(/Chrome\/[\d.]+/)?.[0], refreshHz, frameMs, screen: dev.screenSize(), repeat, trace, experiment: pageJs };
  console.log(`phone lab · ${meta.device} · Android ${meta.android} · ${meta.webview} · ${refreshHz} Hz · ${repeat}× each`);

  // One listener for the whole run: each step's recording collects into `traceInto` while it is set.
  let traceInto = null, traceDone = null;
  page.on('Tracing.dataCollected', (p) => traceInto?.push(...p.value));
  page.on('Tracing.tracingComplete', () => traceDone?.());

  const results = [];
  for (const step of steps) {
    const runs = [];
    for (let r = 0; r < repeat; r++) {
      try {
      dev.requireDevInFront();
      await step.prepare(ctx);
      dev.requireDevInFront();
      await sleep(300);
      const before = { app: dev.cpuTicks(procs.app), node: dev.cpuTicks(procs.node), t: Date.now() };
      if (trace) await page.send('Tracing.start', { categories: 'devtools.timeline,toplevel,v8.execute,blink,cc,gpu,viz', transferMode: 'ReportEvents' });
      const events = [];
      traceInto = events;
      dev.gfxReset();
      await page.evaluate('window.__plab.start()');
      const waitShown = step.shows ? page.evaluate(`window.__plab.waitShown(${JSON.stringify(step.shows.sel ?? null)}, ${JSON.stringify(step.shows.text ?? null)}, 8000)`) : null;
      await step.act(ctx);
      const shown = waitShown ? await waitShown : null;
      await sleep(step.settleMs);
      const m = await page.evaluate('window.__plab.stop()');
      const shownFrames = dev.gfxStats();
      const worked = step.check ? !!(await page.evaluate(step.check)) : shown !== false;
      const after = { app: dev.cpuTicks(procs.app), node: dev.cpuTicks(procs.node), t: Date.now() };
      let threads = null;
      if (trace) {
        const done = new Promise((res) => { traceDone = res; });
        await page.send('Tracing.end'); await done;
        traceInto = null;
        threads = summarizeTrace(events);
      }
      const wallS = (after.t - before.t) / 1000;
      const cpu = (a, b) => (a == null || b == null ? null : Math.round(((b - a) / 100 / wallS) * 100));
      const slow = m.frames.filter((f) => f > frameMs * 1.5);
      runs.push({
        frames: m.frames.length, slowFrames: slow.length, droppedFrames: Math.round(slow.reduce((a, f) => a + (Math.round(f / frameMs) - 1), 0)),
        worstFrameMs: Math.round(Math.max(0, ...m.frames)), p95FrameMs: Math.round(pct(m.frames, 0.95) ?? 0),
        longFrames: m.loafs.length, longFramesMs: m.loafs.reduce((a, l) => a + l.d, 0), longFrameTop: m.loafs.sort((a, b) => b.d - a.d).slice(0, 3),
        tapResponseMs: Math.max(0, ...m.events.filter((e) => /pointer|click|touch|key/.test(e.name)).map((e) => e.d)),
        shownMs: shown === false ? 'never' : m.shownMs,
        cpuAppPct: cpu(before.app, after.app), cpuAssistantPct: cpu(before.node, after.node),
        threads, memoryMb: dev.memoryMb(), worked,
        screenFrames: shownFrames.total, screenJanky: shownFrames.janky, screenP90: shownFrames.p90, screenP99: shownFrames.p99,
      });
      await step.undo?.(ctx);
      await sleep(400);
      } catch (e) {
        // A step that cannot be done (nothing to tap, a screen that never came) is recorded and skipped; only the
        // privacy guard (dev copy not in front) stops the whole run.
        if (/not in front|not running/.test(String(e.message))) throw e;
        if (traceInto) { traceInto = null; try { await page.send('Tracing.end'); } catch { /* not tracing */ } }
        try { await page.evaluate('window.__plab.stop()'); } catch { /* page gone */ }
        runs.push({ worked: false, error: String(e.message || e) });
        console.log(`${step.name.padEnd(22)} run ${r + 1} failed: ${e.message}`);
        try { await step.undo?.(ctx); } catch { /* best effort */ }
      }
    }
    const sum = (k) => median(runs.map((x) => (typeof x[k] === 'number' ? x[k] : null)));
    const thread = (name) => median(runs.map((x) => x.threads?.[name] ?? null));
    const row = {
      step: step.name, what: step.what,
      slowFrames: sum('slowFrames'), droppedFrames: sum('droppedFrames'), worstFrameMs: sum('worstFrameMs'), p95FrameMs: sum('p95FrameMs'),
      longFrames: sum('longFrames'), longFramesMs: sum('longFramesMs'), tapResponseMs: sum('tapResponseMs'),
      shownMs: runs.some((x) => x.shownMs === 'never') ? 'never' : sum('shownMs'),
      pageBusyMs: thread('page'), graphicsBusyMs: thread('graphics'), compositorBusyMs: thread('compositor'),
      pageKinds: runs.find((x) => x.threads?.pageKinds)?.threads.pageKinds ?? null,
      cpuAppPct: sum('cpuAppPct'), cpuAssistantPct: sum('cpuAssistantPct'), memoryMb: sum('memoryMb'),
      screenJanky: sum('screenJanky'), screenFrames: sum('screenFrames'), screenP99: sum('screenP99'),
      failed: runs.filter((x) => !x.worked).length,
      // The first run on its own: a screen opened for the first time since launch loads its code then (deferred
      // screens), which the median of warm repeats hides.
      first: runs[0] ? { shownMs: runs[0].shownMs, slowFrames: runs[0].slowFrames, worstFrameMs: runs[0].worstFrameMs, longFramesMs: runs[0].longFramesMs } : null,
      runs,
    };
    results.push(row);
    if (row.failed) console.log(`${step.name.padEnd(22)} ${row.failed} of ${runs.length} runs did NOT do the step — not a result`);
    console.log(`${step.name.padEnd(22)} slow ${String(row.slowFrames).padStart(3)} · dropped ${String(row.droppedFrames).padStart(3)} · worst ${String(row.worstFrameMs).padStart(4)}ms · long ${row.longFrames}/${row.longFramesMs}ms · tap ${row.tapResponseMs}ms · shows ${row.shownMs ?? '-'}ms · page ${row.pageBusyMs ?? '-'}ms · gfx ${row.graphicsBusyMs ?? '-'}ms · shown late ${row.screenJanky ?? '-'}/${row.screenFrames ?? '-'} (p99 ${row.screenP99 ?? '-'}ms) · app ${row.cpuAppPct}% · ${row.memoryMb}MB · first: shows ${row.first?.shownMs ?? '-'}ms worst ${row.first?.worstFrameMs ?? '-'}ms`);
  }
  // An experiment's change lasts until the page reloads: reload now, so it can never leak into a later run (it did
  // once — a hidden Settings panel made the next run's Settings open invisible, 2026-11-02).
  if (pageJs) {
    await page.evaluate('location.reload()').catch(() => {});
    console.log('experiment undone: page reloaded');
  }
  page.close();
  mkdirSync(REPORTS, { recursive: true });
  const base = join(REPORTS, `${meta.date.slice(0, 16).replace(/[:T]/g, '-')}-${label}`);
  writeFileSync(`${base}.json`, JSON.stringify({ meta, results }, null, 2));
  writeFileSync(`${base}.md`, markdown(meta, results));
  console.log(`\nreport: ${base}.md`);
}

function markdown(meta, results) {
  const L = [`# Phone speed lab — ${meta.label}`, '', `${meta.date} · ${meta.device} · Android ${meta.android} · ${meta.webview} · screen ${meta.refreshHz} Hz (a frame every ${meta.frameMs.toFixed(1)} ms) · median of ${meta.repeat}`, '',
    'Shown late (Android): frames the phone itself counted as janky on screen, out of all it drew in the step. Slow frames: the page took over 1.5 frames. Dropped: frames the screen showed nothing new. Long frames: the browser\'s own report of a frame over 50 ms. Shows: from the finger to the first frame showing what the step waits for. Page / graphics: time those parts of the phone were busy during the step (timeline). App CPU: % of one core.', '',
    '| Step | Shown late (Android) | Slow frames | Dropped | Worst frame | Long frames | Tap response | Shows | First time: shows / worst frame | Page busy | Graphics busy | App CPU | Memory |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) L.push(`| ${r.step} — ${r.what}${r.failed ? ` **(${r.failed} run(s) failed)**` : ''} | ${r.screenJanky ?? '–'} of ${r.screenFrames ?? '–'} (p99 ${r.screenP99 ?? '–'} ms) | ${r.slowFrames} | ${r.droppedFrames} | ${r.worstFrameMs} ms | ${r.longFrames} (${r.longFramesMs} ms) | ${r.tapResponseMs} ms | ${r.shownMs ?? '–'}${typeof r.shownMs === 'number' ? ' ms' : ''} | ${r.first?.shownMs ?? '–'} / ${r.first?.worstFrameMs ?? '–'} ms | ${r.pageBusyMs ?? '–'} ms | ${r.graphicsBusyMs ?? '–'} ms | ${r.cpuAppPct}% | ${r.memoryMb} MB |`);
  L.push('', '## What the page thread was busy with (first run)', '');
  for (const r of results) if (r.pageKinds) L.push(`- **${r.step}**: ${Object.entries(r.pageKinds).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v} ms`).join(' · ')}`);
  L.push('', '## What filled the long frames', '');
  for (const r of results) {
    const top = r.runs.flatMap((x) => x.longFrameTop).sort((a, b) => b.d - a.d).slice(0, 3);
    if (top.length) L.push(`- **${r.step}**: ${top.map((t) => `${t.d} ms (script ${t.script}, style+layout ${t.style}${t.top.length ? `; ${t.top.join(', ')}` : ''})`).join(' · ')}`);
  }
  return L.join('\n') + '\n';
}

function compare(a, b) {
  const A = JSON.parse(readFileSync(a, 'utf8')), B = JSON.parse(readFileSync(b, 'utf8'));
  const keys = ['slowFrames', 'droppedFrames', 'worstFrameMs', 'longFramesMs', 'tapResponseMs', 'shownMs', 'pageBusyMs', 'graphicsBusyMs', 'cpuAppPct'];
  console.log(`${A.meta.label} → ${B.meta.label}`);
  for (const rb of B.results) {
    const ra = A.results.find((r) => r.step === rb.step);
    if (!ra) continue;
    console.log(`${rb.step.padEnd(22)} ` + keys.map((k) => `${k} ${ra[k] ?? '–'}→${rb[k] ?? '–'}`).join(' · '));
  }
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
