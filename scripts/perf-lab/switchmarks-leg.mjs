// scripts/perf-lab/switchmarks-leg.mjs — the rig proof for "switch marks" (the hitch recorder's `switch` lines).
// Run:  node scripts/perf-lab/suspects.mjs --only switchmarks --main-inspect 0 --max-minutes 15 --out <abs>/switchmarks.json
//
// WHAT IT DOES (one boot, six sessions: a HUGE resumed conversation, medium, small, empty, two native; one native streams):
//   chat view    — 20 switches 1 s apart round-robin over all six; 6 into/out of a session that is STREAMING a reply;
//                  20 rapid A<->B flips 250 ms apart (huge <-> small).
//   terminal view — 20 switches 1 s apart over the four terminals; 3 switches INTO a terminal that was flooded while hidden
//                  (a backlog waits for it); 20 rapid flips 250 ms apart.
// Each switch is a real click on the pill (the page's own `.click()`, so the app's click path and event timestamp are used), timed
// by the rig's OWN clock = click -> two animation callbacks later (the lab's long-standing "painted" definition). The recorder's
// line for the same switch is paired by start time, and the leg reports, per phase, how the two clocks differ and what the
// recorder alone can see (settled > first frame). It also scans the whole file for anything identifying.
//
// LIMITS (say them in any write-up): Xvfb software rendering; one boot is a shakedown; the rig clock stops 2 rAFs after the click
// (a frame boundary), the recorder's first frame is the first task after the NEXT frame (so they differ by up to ~one frame by
// construction); terminal "settled" is xterm's parse-complete of the hidden backlog, not GPU drawing.
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const p95 = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] : null; };
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** Page side: click pill idx, time two rAFs, wait out `everyMs` from the click. Returns one record per switch. */
const RUNNER = `(() => {
  if (window.__swm) return true;
  window.__swm = async (plan, everyMs, injectMs) => {
    const out = [];
    for (const idx of plan) {
      const t = performance.now();
      const ps = window.__perfLab.pills();
      const el = ps.length === window.__swmCount ? ps[idx] : null;
      if (!el) { out.push({ idx, error: 'no pill ' + idx + ' of ' + ps.length }); break; }
      el.click();
      // POSITIVE CONTROL (only when asked): late content the recorder MUST see - a node appended to the visible pane injectMs after the click.
      if (injectMs) setTimeout(() => { const p = window.__perfLab.visiblePane(); const root = p && p.closest('[data-chat-session-id]'); if (root) root.appendChild(document.createElement('span')); }, injectMs);
      await window.__perfLab.nextFrame2();
      out.push({ idx, rigT0: performance.timeOrigin + t, rigMs: performance.now() - t, view: document.documentElement.dataset.viewMode });
      const wait = everyMs - (performance.now() - t);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    return out;
  };
  return true;
})()`;

export async function legSwitchMarks(ctx, h) {
  const { cdp, fake, bound, sessions, ids, fixtureHome } = ctx;
  const { sleep, toggleTerminal, startStream, copyTo } = h;
  const idxOf = (size) => sessions.names.findIndex((n) => sessions.sizeByName[n] === size);
  const huge = idxOf('huge'), medium = idxOf('medium'), small = idxOf('small'), empty = idxOf('empty');
  const nat0 = ids.indexOf(sessions.nat[0].id), nat1 = ids.indexOf(sessions.nat[1]?.id ?? sessions.nat[0].id);
  const all = [huge, small, nat0, medium, empty, nat1];
  const claude = [huge, medium, small, empty];
  const out = { sessionCount: ids.length, phases: {} };
  await bound(cdp.evaluate(`window.__swmCount = ${ids.length}; true`), 'count');
  await bound(cdp.evaluate(RUNNER), 'runner');
  const run = (plan, everyMs, label, injectMs = 0) => bound(cdp.evaluate(`window.__swm(${JSON.stringify(plan)}, ${everyMs}, ${injectMs})`), label, 120000);
  const phases = [];
  const phase = async (name, fn) => { const from = Date.now(); const rig = await fn(); phases.push({ name, from, to: Date.now(), rig }); };
  const cycle = (set, n, avoid) => { const p = []; let i = 0; while (p.length < n) { const v = set[i++ % set.length]; if (v !== (p.at(-1) ?? avoid)) p.push(v); } return p; };
  const view = () => bound(cdp.evaluate(`document.documentElement.dataset.viewMode`), 'view');

  // Start from a known place (chat view, the empty session), a few settled seconds in.
  await bound(cdp.evaluate(`window.__perfLab.switchTo(${empty}, ${JSON.stringify(sessions.names[empty])}, ${ids.length}, false, null, false)`), 'start place');
  await sleep(2000);
  if ((await view()) !== 'chat') { await toggleTerminal(cdp); await sleep(600); }

  await phase('chat-spaced', () => run(cycle(all, 20, empty), 1000, 'chat spaced'));
  await sleep(1500);

  // A destination that is STREAMING a reply: native session 0.
  await phase('chat-streaming', async () => {
    await run([small], 1200, 'to small');
    const s = await startStream(cdp, fake, sessions.nat[0].id, { deltas: 3000, perSec: 150, seed: 'switchmarks-stream', text: null }, bound);
    await sleep(800);
    const rig = await run([nat0, small, nat0, small, nat0, small], 1200, 'streaming switches');
    // Then STAY on the streaming session past the recorder's 3 s cap: it never holds still, so it must end as "streaming" with settled null.
    rig.push(...await run([nat0], 4000, 'dwell on the streaming session'));
    rig.push(...await run([small], 1200, 'back'));
    await bound(s.completion, 'stream done', 60000).catch(() => {});
    return rig;
  });
  await sleep(2500);

  // Positive control: the rig itself adds a node to the new pane 100 ms after each click (inside the recorder's 150 ms quiet window), so
  // settled must come out near 100 ms+ (later than the first frame) with mut >= 1. A change 150+ ms after the last one is a new event, by design.
  await phase('chat-control-late-content', () => run([huge, small, huge, small, huge, small], 1500, 'late content control', 100));
  await sleep(1500);

  // Faster than the 150 ms quiet window: switches must be CUT SHORT, one line each, `interrupted` on all but the last.
  await phase('chat-flurry', () => run(Array.from({ length: 15 }, (_, i) => (i % 2 ? small : huge)), 80, 'chat flurry'));
  await sleep(2500);

  await phase('chat-rapid', () => run(Array.from({ length: 20 }, (_, i) => (i % 2 ? huge : small)), 250, 'chat rapid'));
  await sleep(2500);

  // Terminal view: every Claude session's terminal on screen once.
  for (const i of claude) {
    await run([i], 300, 'to claude');
    if ((await view()) !== 'terminal') { await toggleTerminal(cdp); await sleep(700); }
  }
  await sleep(1500);
  await phase('terminal-spaced', () => run(cycle(claude, 20, claude.at(-1)), 1000, 'terminal spaced'));
  await sleep(1500);

  // A terminal flooded while it is out of sight keeps a backlog that is written when it is shown again.
  await phase('terminal-backlog', async () => {
    const rig = [];
    for (let k = 0; k < 3; k++) {
      rig.push(...await run([huge], 800, 'away'));
      await bound(cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(ids[empty])}, 'perf-lab-flood 4\\r'); true`), 'flood');
      await sleep(2500);
      rig.push(...await run([empty], 4000, 'back to flooded'));
    }
    return rig;
  });
  await sleep(2500);

  await phase('terminal-rapid', () => run(Array.from({ length: 20 }, (_, i) => (i % 2 ? empty : huge)), 250, 'terminal rapid'));
  await sleep(9000); // the window flushes every 5 s, main writes within 2 s

  // ---- read the recorder's file -------------------------------------------------------------------------------
  const file = join(fixtureHome, '.config', 'youcoded', 'perf', 'hitches.jsonl');
  if (!existsSync(file)) throw Error(`no hitch log at ${file}`);
  if (ctx.outPath) copyTo(file, `${ctx.outPath}.hitches.jsonl`);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const sw = lines.filter((l) => l.kind === 'switch').map((l) => ({ ...l, t: Date.parse(l.ts) }));

  for (const p of phases) {
    const mine = sw.filter((l) => l.t >= p.from - 500 && l.t <= p.to + 500);
    const rig = p.rig.filter((r) => !r.error);
    const pairs = [];
    const used = new Set();
    for (const r of rig) {
      let best = null;
      mine.forEach((l, i) => { if (used.has(i)) return; const d = Math.abs(l.t - r.rigT0); if (d < 150 && (!best || d < best.d)) best = { i, d, l }; });
      if (best) { used.add(best.i); pairs.push({ rig: r, line: best.l, startDiffMs: best.d }); }
    }
    const diffs = pairs.filter((x) => x.line.ff != null).map((x) => x.line.ff - x.rig.rigMs);
    out.phases[p.name] = {
      rigSwitches: rig.length, errors: p.rig.filter((r) => r.error), recorderLines: mine.length, paired: pairs.length,
      oneLinePerSwitch: mine.length === rig.length,
      ends: Object.fromEntries([...new Set(mine.map((l) => l.end))].map((e) => [e, mine.filter((l) => l.end === e).length])),
      interruptedExpected: p.name.endsWith('flurry'),
      rigPaintedMs: { median: r1(median(rig.map((r) => r.rigMs))), p95: r1(p95(rig.map((r) => r.rigMs))) },
      recorderFirstFrameMs: { median: r1(median(mine.map((l) => l.ff))), p95: r1(p95(mine.map((l) => l.ff))), max: r1(Math.max(...mine.map((l) => l.ff ?? 0))) },
      recorderSettledMs: { median: r1(median(mine.map((l) => l.st))), p95: r1(p95(mine.map((l) => l.st))), max: r1(Math.max(...mine.map((l) => l.st ?? 0))), unknown: mine.filter((l) => l.st == null).length },
      firstFrameMinusRigMs: { median: r1(median(diffs)), min: r1(Math.min(...diffs)), max: r1(Math.max(...diffs)), within2Frames: diffs.filter((d) => Math.abs(d) <= 34).length, n: diffs.length },
      settledLaterThanFirstFrame: mine.filter((l) => l.st != null && l.ff != null && l.st - l.ff >= 50).length,
      byDestination: Object.fromEntries(['huge', 'medium', 'small', 'empty'].map((n) => [n, null])),
      perSwitch: pairs.map((x) => ({ dest: sessions.sizeByName[sessions.names[x.rig.idx]] ?? (x.rig.idx === nat0 || x.rig.idx === nat1 ? 'native' : '?'), rigMs: r1(x.rig.rigMs), ff: x.line.ff, st: x.line.st, end: x.line.end, e1: x.line.e1, e2: x.line.e2, mut: x.line.mut, ls: x.line.ls, loaf: x.line.loaf, drain: x.line.drain, gap: x.line.gap, cold: x.line.cold, str: x.line.str, vm: x.line.vm, cause: x.line.cause, startDiffMs: r1(x.startDiffMs) })),
    };
    delete out.phases[p.name].byDestination;
  }
  // ---- privacy scan: nothing that identifies a session, folder or file may be in the file ----------------------------
  const needles = new Set([...sessions.names, ...ids, fixtureHome, 'alpha', 'beta', '/home/', '/tmp/', '.jsonl"', 'suspects fixture']);
  for (const id of ids) if (id.length > 8) needles.add(id.slice(0, 8));
  const hits = [...needles].filter((n) => n && text.includes(n));
  out.privacy = { fileBytes: text.length, lines: lines.length, switchLines: sw.length, needlesChecked: needles.size, hits };
  out.keys = [...new Set(sw.flatMap((l) => Object.keys(l)))].sort();
  out.allSwitchLinesEnumOnly = sw.every((l) => ['cause', 'vm', 'dk', 'end'].every((k) => /^[a-z]{2,12}$/.test(l[k])));
  out.minuteLines = lines.filter((l) => l.kind === 'minute').map((l) => l.rend).slice(-3);
  return out;
}
