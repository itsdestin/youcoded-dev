// scripts/perf-lab/suspects-b.mjs — second batch of suspect measurements
// (docs/active/investigations/2026-10-04-performance-gap-review.md, section 4c).
//
//   sessions — D9: many Claude Code sessions at once. Each mounts an xterm with a WebGL
//              context; Chromium keeps ~16 per page and silently kills the oldest.
//              Records context-lost/restored events, which renderer each terminal ended
//              on, renderer + GPU memory, session-switch time in chat and terminal view,
//              and long tasks. REQUIRES WebGL in the rig; this boot turns on SwiftShader
//              (software GL) for it, so the numbers are NOT a real GPU's.
//   native   — D3: resume a LONG native (non-Claude) session; count transcript events the
//              page receives (a whole-history replay would be thousands) and time it.
//   sheet    — D14: open a 2000 x 100 CSV against a 200 x 10 control in the session drawer.
//
// Same limits as suspects.mjs: Xvfb software rendering, main-thread/IPC measures only,
// one boot is a shakedown. Never touches the live app (own fixture HOME, own ports).
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { assetsReady, buildFixture, nativeSessionLines } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { installPageHelpers, installProbe, stopProbe, waitForSessionReady } from './scenario-workload.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { readRendererInfo } from './gpu.mjs';
import { pssMb } from './procs.mjs';
import { classify } from './hops.mjs';
import { installTerminalHelpers } from './scenario-terminal.mjs';
import { installResumeHelpers } from './scenario-native-resume.mjs';
import { installArtifactHelpers, registerArtifacts, step } from './scenario-artifacts.mjs';
import { bounded, buildBounded, readLongtasks, stats, toggleTerminal } from './suspects.mjs';
import { waitFor } from './cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEGS = ['sessions', 'native', 'sheet'];

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), out: join(root, 'scratch/perf-lab/suspects-b.json'), maxMinutes: 18, only: LEGS.join(','), counts: '8,16,20', bigTurns: 2000 };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (!['--checkout', '--out', '--max-minutes', '--only', '--counts', '--big-turns'].includes(k) || !v || v.startsWith('--')) throw Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  o.maxMinutes = Number(o.maxMinutes); o.bigTurns = Number(o.bigTurns);
  if (!(o.maxMinutes >= 1 && o.maxMinutes <= 20)) throw Error('--max-minutes 1..20');
  for (const k of ['checkout', 'out']) if (!isAbsolute(o[k])) throw Error(`--${k} must be absolute`);
  o.only = o.only.split(','); o.counts = String(o.counts).split(',').map(Number);
  if (o.only.some(l => !LEGS.includes(l))) throw Error(`--only takes ${LEGS.join(',')}`);
  if (o.counts.some(n => !Number.isInteger(n) || n < 1 || n > 40)) throw Error('--counts: whole numbers 1..40');
  return o;
}

const rendererPss = app => { const c = classify(app); return { renderers: pssMb(c.renderers), gpu: pssMb(c.gpu), main: pssMb([c.main]) }; };

// ── D9: many sessions ───────────────────────────────────────────────────────────
// Reads, per terminal wrapper: does it hold a canvas, and does that canvas's GL context
// still live? getContext() on a canvas that already has a webgl2 context returns THAT context.
const TERMINAL_MAP = `(() => {
  const ws = [...document.querySelectorAll('.terminal-overlay-scroll')];
  const rows = ws.map(w => {
    const cs = [...w.querySelectorAll('.xterm-screen canvas')];
    let gl = 0, lost = 0;
    for (const c of cs) { try { const g = c.getContext('webgl2'); if (g) { gl++; if (g.isContextLost()) lost++; } } catch (e) { /* not a gl canvas */ } }
    return { canvases: cs.length, gl, lost, dom: !!(w.querySelector('.xterm-rows') && w.querySelector('.xterm-rows').children.length) };
  });
  const sum = { terminals: rows.length, withLiveWebgl: rows.filter(r => r.gl > r.lost).length, withLostWebgl: rows.filter(r => r.lost > 0).length, domOnly: rows.filter(r => !r.gl && r.dom).length, noCanvasNoRows: rows.filter(r => !r.gl && !r.dom).length };
  return { sum, perTerminal: rows.map(r => (r.gl > r.lost ? 'webgl' : r.lost ? 'lost' : r.dom ? 'dom' : '?')) };
})()`;

async function legSessions(ctx, counts) {
  const { cdp, bound, fixture, app, ids, names } = ctx, out = { stages: [] };
  await bound(installTerminalHelpers(cdp), 'terminal helpers');
  await bound(installPageHelpers(cdp), 'page helpers');
  out.webglAvailable = await bound(cdp.evaluate(`(() => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); return !!g; } catch (e) { return false; } })()`), 'webgl probe');
  await bound(cdp.evaluate(`(() => {
    const c = window.__ctxEvents = { lost: [], restored: [], t0: performance.now() };
    const idx = t => [...document.querySelectorAll('.terminal-overlay-scroll')].findIndex(w => w.contains(t));
    const rec = list => e => list.push([Math.round(performance.now() - c.t0), idx(e.target)]);
    // capture on document: webglcontextlost does not bubble but is seen in the capture phase.
    document.addEventListener('webglcontextlost', rec(c.lost), true);
    document.addEventListener('webglcontextrestored', rec(c.restored), true);
    return true;
  })()`), 'context event capture');
  const ev = () => bound(cdp.evaluate('({ lost: window.__ctxEvents.lost.length, restored: window.__ctxEvents.restored.length, lostList: window.__ctxEvents.lost.slice(0, 60), restoredList: window.__ctxEvents.restored.slice(0, 60) })'), 'context events');
  const create = async i => {
    const r = await bound(cdp.evaluate(`window.claude.session.create(${JSON.stringify({ name: `m-${i}`, cwd: i % 2 ? fixture.projects.beta : fixture.projects.alpha, skipPermissions: true })}).then(s => ({ id: s.id })).catch(e => ({ error: String(e && e.message || e) }))`), `create ${i}`, 60000);
    if (!r?.id) throw Error(`session ${i} create failed: ${r?.error}`);
    ids.push(r.id); names.push(`m-${i}`);
    await bound(waitForSessionReady(cdp), `ready ${i}`, 45000);
  };
  const switchChat = async idx => { const r = await bound(cdp.evaluate(`window.__perfLab.switchTo(${idx}, ${JSON.stringify(names[idx])}, ${ids.length}, false, null, false)`), `chat switch ${idx}`); return r; };
  // A fixed pseudo-random visiting order so every stage sees the same shape of switching.
  const order = (n, k) => Array.from({ length: k }, (_, i) => (i * 7 + 3) % n);

  let made = 0;
  for (const target of counts) {
    while (made < target) { await create(made); made++; }
    await sleep(8000); // late context-loss storms land a few seconds after mount
    const stage = { sessions: made, loadAvg: readFileSync('/proc/loadavg', 'utf8').trim() };
    stage.contextEventsAfterCreate = await ev();
    stage.terminalsAfterCreate = await bound(cdp.evaluate(TERMINAL_MAP), 'terminal map');
    stage.pss = rendererPss(app);
    // chat-view switching across all sessions
    await bound(installProbe(cdp), 'longtask probe');
    const before = (await ev()).lost;
    const chat = [];
    for (const idx of order(made, 24)) { const r = await switchChat(idx); chat.push(r); await sleep(150); }
    stage.chatSwitch = { ms: stats(chat.filter(r => r.mode !== 'none').map(r => r.ms)), menuSwitches: chat.filter(r => r.mode === 'menu').length, failed: chat.filter(r => r.mode === 'none').length, longtasks: await bound(readLongtasks(cdp), 'longtasks') };
    await stopProbe(cdp).catch(() => {});
    stage.lostDuringChatSwitching = (await ev()).lost - before;
    // terminal-view switching: every session into terminal view, then switch among them
    const beforeT = (await ev()).lost;
    const toTerminal = [];
    for (let i = 0; i < made; i++) {
      await switchChat(i);
      await toggleTerminal(cdp);
      await bound(cdp.evaluate(`window.__perfTerm.until(() => document.documentElement.dataset.viewMode === 'terminal', 10000)`), `terminal view ${i}`, 15000);
      toTerminal.push(i);
    }
    stage.terminalsInTerminalView = await bound(cdp.evaluate(TERMINAL_MAP), 'terminal map 2');
    await bound(installProbe(cdp), 'longtask probe 2');
    const term = [];
    for (const idx of order(made, 24)) { const r = await bound(cdp.evaluate(`window.__perfTerm.switchTo(${idx}, ${JSON.stringify(names[idx])}, ${ids.length}, ${idx})`), `terminal switch ${idx}`, 30000); term.push(r); await sleep(150); }
    stage.terminalSwitch = { ms: stats(term.filter(r => r.ok).map(r => r.ms)), notOk: term.filter(r => !r.ok).length, reasons: [...new Set(term.filter(r => !r.ok).map(r => r.reason))].slice(0, 3), longtasks: await bound(readLongtasks(cdp), 'longtasks 2') };
    await stopProbe(cdp).catch(() => {});
    stage.lostDuringTerminalPhase = (await ev()).lost - beforeT;
    stage.contextEventsEnd = await ev();
    stage.pssAfter = rendererPss(app);
    // back to chat view for every session so the next stage starts from the same state
    for (let i = 0; i < made; i++) {
      await switchChat(i);
      if (await cdp.evaluate(`document.documentElement.dataset.viewMode === 'terminal'`)) { await toggleTerminal(cdp); await sleep(120); }
    }
    stage.shot = `${ctx.out}.sessions-${made}.png`;
    const shot = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), 'stage screenshot').catch(() => null);
    if (shot) writeFileSync(stage.shot, Buffer.from(shot.data, 'base64'));
    out.stages.push(stage);
  }
  return out;
}

// ── D3: long native resume ──────────────────────────────────────────────────────
async function legNative(ctx) {
  const { cdp, bound, fixture } = ctx, ns = fixture.nativeSessions, out = { files: {}, resumes: [] };
  if (!ns?.big) throw Error('fixture has no native sessions');
  // Two more files of 400 turns (the standard phase's size) beside the big one, newest first.
  const mk = turns => {
    const sessionId = randomUUID(), p = join(ns.dir, `${sessionId}.jsonl`);
    writeFileSync(p, nativeSessionLines({ sessionId, cwd: ns.cwd, turns, startedAt: Date.now() - 3_600_000, binding: ns.binding }).join('\n') + '\n');
    return { sessionId, turns, bytes: statSync(p).size };
  };
  const plan = [mk(400), { sessionId: ns.big.sessionId, turns: ns.big.turns, bytes: ns.big.bytes }, mk(400)];
  await bound(installProbe(cdp), 'probe'); await bound(installPageHelpers(cdp), 'page helpers'); await bound(installResumeHelpers(cdp), 'resume helpers');
  const call = e => bound(cdp.evaluate(`(async () => { const h = window.__perfNat; return await (${e}); })()`), e.slice(0, 40), 90000);
  await bound(cdp.evaluate(`(() => { window.__tcount = { n: 0, byType: {} }; window.claude.on.transcriptEvent(e => { const c = window.__tcount; c.n++; c.byType[e && e.type] = (c.byType[e && e.type] || 0) + 1; }); return true; })()`), 'transcript counter');
  for (const f of plan) {
    const pillsBefore = await call('h.stripPillIds()');
    await bound(cdp.evaluate('window.__tcount.n = 0; window.__tcount.byType = {}; true'), 'reset counter');
    const r = await step(cdp, `native:resume-${f.turns}`, async () => {
      const detail = { claudeSessionId: f.sessionId, projectSlug: ns.slug, projectPath: ns.cwd, provider: 'native', binding: ns.binding };
      const t0 = Date.now();
      await call(`h.resume(${JSON.stringify(detail)})`);
      await waitFor(cdp, `window.__perfNat.stripPillIds().length > ${pillsBefore.length}`, { timeoutMs: 30000, everyMs: 25 });
      const pillMs = Date.now() - t0;
      const settled = await call('h.settleEntries(90000)');
      return { ok: settled.settled, pillMs, paintedMs: Date.now() - t0, entries: settled.entries };
    }, { pingMs: 50 });
    await sleep(1500);
    const counted = await bound(cdp.evaluate('({ n: window.__tcount.n, byType: window.__tcount.byType })'), 'counter read');
    out.resumes.push({ turns: f.turns, fileBytes: f.bytes, ...r, transcriptEventsReceived: counted.n, byType: counted.byType, loadAvg: readFileSync('/proc/loadavg', 'utf8').trim() });
    out.files[f.turns] = f.bytes;
  }
  return out;
}

// ── D14: big spreadsheet ────────────────────────────────────────────────────────
const csv = (rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ((r * 31 + c * 17) % 5 === 0 ? `item-${r}-${c}` : String((r * 7919 + c * 104729) % 100000 / 100))).join(',')).join('\n') + '\n';

async function legSheet(ctx) {
  const { cdp, bound, fixture, app } = ctx, out = { opens: [] };
  await bound(installProbe(cdp), 'probe'); await bound(installPageHelpers(cdp), 'page helpers');
  await bound(installArtifactHelpers(cdp), 'artifact helpers');
  const dirName = 'perf-artifacts', dir = join(fixture.projects.alpha, dirName);
  mkdirSync(dir, { recursive: true });
  const files = {};
  const put = (key, base, text) => { const abs = join(dir, base); writeFileSync(abs, text); files[key] = { key, name: base, rel: `${dirName}/${base}`, abs, bytes: statSync(abs).size }; };
  put('control', 'perf-control.csv', csv(200, 10));
  put('big', 'perf-big.csv', csv(2000, 100));
  put('control2', 'perf-control2.csv', csv(200, 10));
  const t = fixture.transcripts?.small ?? null;
  const s = await bound(cdp.evaluate(`window.claude.session.create(${JSON.stringify({ name: 'sheet', cwd: fixture.projects.alpha, skipPermissions: true, ...(t ? { resumeSessionId: t.sessionId } : {}) })}).then(s => ({ id: s.id })).catch(e => ({ error: String(e && e.message || e) }))`), 'create session', 60000);
  if (!s?.id) throw Error(`session.create failed: ${s?.error}`);
  await bound(waitForSessionReady(cdp), 'ready', 45000);
  await bound(registerArtifacts(cdp, fixture.projects.alpha, s.id, files), 'register', 60000);
  // WHY aria-label: HeaderBar's Session Files button now carries a Tooltip + aria-label and NO title attribute,
  // so scenario-artifacts' clickTitle('Session Files') no longer finds it (stale selector in that scenario).
  const opened = await cdp.evaluate(`(async () => { const b = document.querySelector('button[aria-label="Session Files"]'); if (!b) return { ok: false, reason: 'no button[aria-label=Session Files]' }; b.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return { ok: true }; })()`);
  if (!opened.ok) throw Error(`drawer button: ${opened.reason}`);
  await waitFor(cdp, `window.__perfArt.drawerOpen()`, { timeoutMs: 15000, everyMs: 25 });
  await waitFor(cdp, `(() => { const n = window.__perfArt.rowNames(); return !!(n && n.indexOf('perf-control.csv') >= 0); })()`, { timeoutMs: 20000, everyMs: 50 });
  out.files = Object.fromEntries(Object.values(files).map(f => [f.name, f.bytes]));
  const cells = `document.querySelectorAll('.drawer-pane table td').length`;
  // control, big, control again (so a first-open warm-up cannot be mistaken for the sheet's size)
  for (const key of ['control', 'big', 'control2']) {
    const f = files[key];
    await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`).catch(() => {});
    const r = await step(cdp, `sheet:open-${key}`, async () => {
      const t0 = Date.now();
      const click = await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(f.name)})`);
      if (!click.ok) throw Error(`could not open ${f.name}: ${click.reason}`);
      // [data-artifact-viewer] is gone from the current build, so wait on the grid itself: the viewer pads to
      // max(rows,50) x max(cols,26) cells (CsvView: MIN_ROWS 50, MIN_COLS 26, caps 2000 x 100).
      await waitFor(cdp, `${cells} === ${key === 'big' ? 200000 : 5200}`, { timeoutMs: 120000, everyMs: 25 });
      return { ok: true, openMs: Date.now() - t0 };
    }, { pingMs: 50 });
    await sleep(1500);
    const dom = await bound(cdp.evaluate(`({ domNodes: document.querySelectorAll('*').length, cells: ${cells}, tables: document.querySelectorAll('.drawer-pane table').length })`), 'dom count');
    // The cost of ONE click on a cell (it only moves a selection outline).
    const click = await bound(cdp.evaluate(`(async () => { const td = document.querySelectorAll('.drawer-pane table td')[5]; if (!td) return null; const t0 = performance.now(); td.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round((performance.now() - t0) * 10) / 10; })()`), 'cell click', 60000);
    out.opens.push({ key, file: f.name, bytes: f.bytes, ...r, dom, cellClickToPaintMs: click, pss: rendererPss(app).renderers.totalMb, loadAvg: readFileSync('/proc/loadavg', 'utf8').trim() });
    const shot = await bound(cdp.send('Page.captureScreenshot', { format: 'png' }), 'screenshot').catch(() => null);
    if (shot) writeFileSync(`${ctx.out}.sheet-${key}.png`, Buffer.from(shot.data, 'base64'));
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv), bound = bounded(opts.maxMinutes);
  mkdirSync(dirname(opts.out), { recursive: true });
  const report = { status: 'incomplete', options: opts, scope: 'private packaged desktop on Xvfb (software rendering, SwiftShader GL for the sessions leg); main-thread and IPC measures only; one boot per leg is a shakedown', loadAvgStart: readFileSync('/proc/loadavg', 'utf8').trim(), legs: {} };
  let x, app, fake;
  try {
    if (!assetsReady()) throw Error('perf-lab assets not cached');
    const build = await buildBounded(opts.checkout, bound);
    if (!build.sha || !statSync(build.binary).isFile()) throw Error('package missing build stamp or binary');
    report.build = { sha: build.sha, dirty: build.dirty, builtAt: build.builtAt };
    refusePackageProcesses(build.appDir);
    const wantsNative = opts.only.includes('native');
    const fixture = buildFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/suspects-fixture-')), { fakeProvider: true, nativeSessions: wantsNative ? { count: 3, bigTurns: opts.bigTurns, smallTurns: 3 } : false, log: () => {} });
    fake = await bound(startFakeProvider({ port: fixture.fakeProvider.port }), 'fake provider');
    x = await bound(startXvfb(':99'), 'Xvfb');
    // WHY these flags, and only for the sessions leg: the plain rig has no WebGL ("webgl: unavailable_off"),
    // so xterm falls back to DOM drawing and a context cap can never be hit. SwiftShader gives the page a
    // software WebGL; Chromium's per-page context limit is the same code path as on a real GPU.
    const webglArgs = opts.only.includes('sessions') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'] : [];
    app = await bound(launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: x.display, cdpPort: 9578, refuseExisting: true, extraArgs: webglArgs }), 'launch', 90000);
    const cdp = app.cdp;
    report.gpu = await bound(readRendererInfo(app.cdpPort, cdp), 'GPU info');
    const ids = [], names = [];
    const ctx = { cdp, bound, fixture, app, ids, names, out: opts.out };
    try {
      for (const leg of opts.only) {
        try { report.legs[leg] = leg === 'sessions' ? await legSessions(ctx, opts.counts) : leg === 'native' ? await legNative(ctx) : await legSheet(ctx); }
        catch (e) { report.legs[leg] = { status: 'incomplete', error: String(e?.message ?? e) }; }
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
