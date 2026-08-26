// scripts/perf-lab/metrics-startup.mjs — fuses the main-process perf log (epoch ms,
// via perfMark()) and the renderer's performance.mark()/paint entries (ms since the
// renderer's own timeOrigin) into ONE table where every number is ms since the rig
// spawned the app process. That's the only clock a perf report can compare across runs.
import { readFileSync } from 'node:fs';

// WHY: a crash mid-write, or a chore that never ran, means the log can have a
// truncated final line or simply be missing a name entirely. JSON.parse throwing
// on a partial line must not take the whole parse down with it — skip and move on.
// Last-occurrence-wins (plain Map.set) matches the log being append-only: if a name
// is somehow written twice, the later line is the truth.
export function parsePerfLog(text) {
  const marks = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      marks.set(entry.name, entry.t);
    } catch {
      // malformed/truncated line (e.g. a crash mid-write) — ignore, not fatal.
    }
  }
  return marks;
}

// Chore mark suffix (`main:chore:<name>:done`) for each of the 16 boot chores, in the
// order main.ts runs them. THIS ORDER IS LOAD-BEARING: each chore's duration is
// mark[n] − mark[n−1], so a key in the wrong slot silently bills one chore's time to
// its neighbour. It must match the source order of the perfMark() calls in main.ts's
// whenReady block, which tests/perf-marks-placement.test.ts pins from the other side.
//
// `prelude` and `ipcPrefs` are not chores in the "app does a startup task" sense —
// they exist so the work that used to hide inside their successors is measured as
// itself: prelude = runAnalyticsOnLaunch + app.getGPUInfo + first-run detection (was
// billed to installHooks); ipcPrefs = the favorites/game/home-path ipcMain.handle
// registrations + Menu.setApplicationMenu(null) (was billed to themeProtocol).
const CHORES = [
  ['rotateLog', 'rotate-log'],
  ['prelude', 'prelude'],
  ['installHooks', 'install-hooks'],
  ['hookRelay', 'hook-relay'],
  ['legacyCleanup', 'legacy-cleanup'],
  ['hookReconcile', 'hook-reconcile'],
  ['promptSuggestion', 'prompt-suggestion'],
  ['retentionDefault', 'retention-default'],
  ['symlinkCleanup', 'symlink-cleanup'],
  ['staleDownloads', 'stale-downloads'],
  ['reconcileMcp', 'reconcile-mcp'],
  ['announcements', 'announcements'],
  ['remoteServer', 'remote-server'],
  ['ipcPrefs', 'ipc-prefs'],
  ['themeProtocol', 'theme-protocol'],
  // Renamed from authStore: the window covers createAuthStore +
  // registerMarketplaceApiHandlers + remoteServer.setAccountStore +
  // registerSocialHandlers — four registrations, not one store.
  ['accounts', 'accounts'],
];

/**
 * @param {object} args
 * @param {number} args.spawnedAt - epoch ms when the rig spawned the app process. The zero point every output number is relative to.
 * @param {Map<string, number>} args.mainMarks - parsePerfLog() output (epoch ms per mark name).
 * @param {{name: string, startTime: number}[]} args.rendererMarks - performance.mark() entries, ms since args.timeOrigin.
 * @param {number} args.timeOrigin - the renderer's performance.timeOrigin (epoch ms), converts renderer clock -> epoch ms.
 * @param {{name: string, startTime: number}[]} args.paint - performance paint entries, ms since args.timeOrigin.
 */
export function startupTable({ spawnedAt, mainMarks, rendererMarks, timeOrigin, paint }) {
  // rel() is the one place spawnedAt-subtraction happens, so every field is undefined-safe
  // the same way: a missing mark (chore never ran, mark not yet fired) is `null`, never NaN.
  const rel = (epochMs) => (epochMs === undefined ? null : Math.round(epochMs - spawnedAt));
  const main = (name) => mainMarks.get(name); // undefined if that mark never fired
  // Renderer/paint entries are read off .name via find() rather than pre-indexed into a Map:
  // both arrays are tiny (a handful of marks), and find() reads the same either way whether
  // the entry is present or absent — no separate "does this Map have the key" branch needed.
  const renderer = (name) => {
    const entry = rendererMarks.find((m) => m.name === name);
    return entry === undefined ? null : rel(timeOrigin + entry.startTime);
  };
  const paintAt = (name) => {
    const entry = paint.find((p) => p.name === name);
    return entry === undefined ? null : rel(timeOrigin + entry.startTime);
  };

  // Each chore's duration is measured from the PREVIOUS mark that actually fired — starting
  // at main:when-ready, then chaining chore-to-chore. WHY: chores are optional/conditional in
  // main.ts (a feature flag can skip one), so if chore N's mark never wrote, chore N+1's
  // duration must still mean something — it spans back to the last mark that DID fire, not to
  // a `null` that would poison every duration after it. `prev` only advances past a chore whose
  // mark actually fired; a missing mark leaves `prev` untouched so the NEXT chore absorbs the gap.
  const chores = {};
  let prev = main('main:when-ready');
  for (const [key, markSuffix] of CHORES) {
    const t = main(`main:chore:${markSuffix}:done`);
    chores[key] = t === undefined || prev === undefined ? null : Math.round(t - prev);
    if (t !== undefined) prev = t;
  }

  const cwStart = main('main:create-window:start');
  const cwDone = main('main:create-window:done');
  const createWindowAt = rel(cwStart);
  const firstContentfulPaint = paintAt('first-contentful-paint');

  return {
    whenReady: rel(main('main:when-ready')),
    chores,
    createWindow: cwStart !== undefined && cwDone !== undefined ? Math.round(cwDone - cwStart) : null,
    // Not itself in the plan's abbreviated StartupMetrics field list, but blankWindowMs (below)
    // is computed from it and both are asserted by the test / read by compare.mjs's
    // `startup.median.*` paths — so it's part of the real output shape.
    createWindowAt,
    didFinishLoad: rel(main('main:main-window:did-finish-load')),
    postWindowDone: rel(main('main:post-window:done')),
    // performance.timeOrigin IS the renderer page's navigation start, so this is ms
    // from process spawn to the moment the page began loading — no product-side mark
    // needed (and no inline <script> in index.html, which a renderer CSP could block).
    // WHY it matters: `modulesEvaluated - documentStart` is the bundle-evaluation
    // window (React, react-dom, CSS, App.tsx and the whole component graph), which was
    // entirely invisible while the mark that follows it was still named as if it fired
    // at the START of the module rather than after every import had evaluated.
    documentStart: rel(timeOrigin),
    // ESM hoists imports above the module body, so this mark fires AFTER the bundle
    // finished evaluating — hence the name. See src/renderer/index.tsx.
    modulesEvaluated: renderer('yc:modules-evaluated'),
    rootRender: renderer('yc:root-render'),
    firstPaint: paintAt('first-paint'),
    firstContentfulPaint,
    appMounted: renderer('yc:app-mounted'),
    sessionsListed: renderer('yc:sessions-listed'),
    // The window is created visible — main.ts:620, `show: !opts?.inactive && !opts?.buddy`.
    // This is the blank-box time — a hard-reject metric because settled screenshots cannot
    // see an experiment that lengthens it (e.g. E1).
    // Both operands can be null (missing create-window:start mark, or FCP never fired) —
    // guard explicitly rather than let `null - null` silently become 0.
    blankWindowMs:
      firstContentfulPaint !== null && createWindowAt !== null ? firstContentfulPaint - createWindowAt : null,
  };
}

// Reads the perf-log file for this run and asks the CDP-attached page for its own
// performance entries, then fuses them. `app` carries whatever the rig's launcher
// attaches (spawnedAt, a cdp.evaluate helper); `fixture` carries this run's paths.
const PAGE_SAMPLE_EXPR = `({ timeOrigin: performance.timeOrigin, marks: performance.getEntriesByType('mark').map(m=>({name:m.name,startTime:m.startTime})), paint: performance.getEntriesByType('paint').map(p=>({name:p.name,startTime:p.startTime})) })`;

/**
 * Sample the renderer, but do NOT sample before first-contentful-paint has been
 * recorded.
 *
 * WHY: callers collect as soon as the `yc:sessions-listed` mark appears, and
 * React mounts BEFORE the browser paints the frame that mount produced. Measured
 * on a real boot: appMounted 1000ms, sessionsListed 1001ms, and the paint entries
 * did not exist yet — so firstPaint, firstContentfulPaint and therefore
 * blankWindowMs all came back null. blankWindowMs is a hard-reject PRIMARY
 * metric, so a null there does not fail loudly; it silently blinds the gate that
 * is supposed to catch an experiment showing the window earlier but painting it
 * later. Waiting for the entry costs a few frames and makes the metric real.
 *
 * The wait is bounded: if paint genuinely never happens the fields stay null and
 * the caller still gets every mark-derived number, rather than the whole run
 * dying over one metric.
 */
async function samplePageAfterPaint(cdp, { timeoutMs = 10000, everyMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let page = await cdp.evaluate(PAGE_SAMPLE_EXPR);
  while (!page.paint.some((p) => p.name === 'first-contentful-paint') && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, everyMs));
    page = await cdp.evaluate(PAGE_SAMPLE_EXPR);
  }
  return page;
}

export async function collectStartup(app, fixture, opts = {}) {
  const page = await samplePageAfterPaint(app.cdp, opts);
  return startupTable({
    spawnedAt: app.spawnedAt,
    mainMarks: parsePerfLog(readFileSync(fixture.perfLog, 'utf8')),
    rendererMarks: page.marks,
    timeOrigin: page.timeOrigin,
    paint: page.paint,
  });
}
