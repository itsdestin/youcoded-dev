// One private packaged app across short chat-only create/send/switch/close cycles.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { assetsReady, buildFixture, nativeStoreSlug } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { pssMb } from './procs.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const METRICS = ['TaskDuration', 'ScriptDuration', 'LayoutCount', 'JSHeapUsedSize', 'Nodes', 'JSEventListeners'];
const finite = n => typeof n === 'number' && Number.isFinite(n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function parseOptions(argv, root = ROOT) {
  const o = { checkout: join(root, 'youcoded'), cycles: 5, maxMinutes: 10, out: join(root, 'scratch/perf-lab/short-lifecycle.json') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--post-gc') { o.postGc = true; continue; }
    const v = argv[++i];
    if (!['--checkout', '--app-dir', '--cycles', '--max-minutes', '--out'].includes(k) || !v || v.startsWith('--')) throw new Error(`Invalid option ${k}`);
    o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  for (const [k, max] of [['cycles', 100], ['maxMinutes', 10]]) {
    if (!/^[1-9]\d*$/.test(String(o[k])) || !Number.isSafeInteger(Number(o[k])) || Number(o[k]) > max) throw new Error(`--${k === 'maxMinutes' ? 'max-minutes' : k} must be an integer 1..${max}`);
    o[k] = Number(o[k]);
  }
  for (const k of ['checkout', 'out', 'appDir']) if (o[k] !== undefined && !isAbsolute(o[k])) throw new Error(`--${k === 'appDir' ? 'app-dir' : k} must be absolute`);
  return o;
}

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(x => b.includes(x));
export function summariseCycles(cycles) {
  const reasons = [];
  const rows = cycles.map((c, idx) => {
    const reasonsBefore = reasons.length;
    const bad = text => reasons.push(`cycle ${idx + 1}: ${text}`);
    if (!c || c.completed === false || c.reason) bad(c?.reason || 'not completed');
    if (!Array.isArray(c?.created) || c.created.length < 2 || new Set(c.created).size !== c.created.length) bad('no two distinct created sessions');
    if (!same(c?.created, c?.closed)) bad('owned sessions not all closed');
    if (!Array.isArray(c?.openState?.ids) || !c.created?.every(id => c.openState.ids.includes(id)) || !Number.isInteger(c?.openState?.mounted) || c.openState.mounted < c.before?.mounted + 2) bad('created sessions were not active and mounted during workload');
    if (!same(c?.before?.ids, c?.after?.ids) || !Number.isInteger(c?.before?.mounted) || c.before.mounted !== c?.after?.mounted) bad('session list or mounted chats did not return to pre-cycle state');
    if (!Array.isArray(c?.output) || c.output.length !== 2 || c.output.some(r => !r || !finite(r.deltasSent) || r.deltasSent <= 0 || r.deltasSent !== r.plannedDeltas || !finite(r.chars) || r.chars <= 0 || r.aborted !== false || r.shown !== true || r.exact !== true || r.persistedExact !== true || r.turnComplete !== true)) bad('fake reply output absent, incomplete or not verified in visible chat');
    for (const name of METRICS) if (!finite(c?.natural?.metrics?.[name])) bad(`missing/nonfinite natural ${name}`);
    if (!finite(c?.natural?.pss?.totalMb) || c.natural.pss.totalMb <= 0 || !Array.isArray(c?.natural?.pss?.perPid) || c.natural.pss.perPid.length === 0 || c.natural.pss.perPid.some(p => !finite(p.mb))) bad('missing process-family PSS');
    if (!finite(c?.persistedRecords?.before) || !finite(c?.persistedRecords?.after)) bad('missing persisted-file context');
    if (c?.afterGc?.status === 'measured' && (!finite(c.afterGc.sample?.pss?.totalMb) || METRICS.some(k => !finite(c.afterGc.sample?.metrics?.[k])))) bad('post-GC diagnostic lacks counters');
    const previous = cycles[idx - 1];
    const deltaFromPrevious = previous ? { pssMb: finite(c?.natural?.pss?.totalMb) && finite(previous?.natural?.pss?.totalMb) ? c.natural.pss.totalMb - previous.natural.pss.totalMb : null,
      ...Object.fromEntries(METRICS.map(k => [k, finite(c?.natural?.metrics?.[k]) && finite(previous?.natural?.metrics?.[k]) ? c.natural.metrics[k] - previous.natural.metrics[k] : null])) } : null;
    return { ...c, valid: reasons.length === reasonsBefore, warmup: idx === 0, deltaFromPrevious };
  });
  // A partial cleanup/sample is retained as evidence, never included as though
  // it completed the same workload as the healthy post-warmup cycles.
  const trendRows = rows.slice(1).filter(c => c.valid);
  const trendValue = read => ({ samples: trendRows.filter(c => finite(read(c))).length,
    change: trendRows.length > 1 && finite(read(trendRows[0])) && finite(read(trendRows.at(-1))) ? read(trendRows.at(-1)) - read(trendRows[0]) : null });
  const trend = { pssMb: trendValue(c => c.natural?.pss?.totalMb),
    ...Object.fromEntries(METRICS.map(k => [k, trendValue(c => c.natural?.metrics?.[k])])) };
  const gcPolicy = cycles.some(c => c?.gcRequested || c?.afterGc?.status === 'measured') ? 'intervened' : 'natural';
  return { gcPolicy, status: reasons.length || !cycles.length ? 'incomplete' : 'measured', reasons: cycles.length ? reasons : ['no cycles'], rawSampleCount: rows.filter(c => c.natural && c.natural.metrics && finite(c.natural.pss?.totalMb)).length, cycles: rows, trend,
    context: `${gcPolicy === 'intervened' ? 'Forced GC was requested: later pre-GC samples belong to a GC-intervened run, not an untouched natural-GC trajectory. ' : ''}First cycle is warmup; natural counters are not after-GC retention. Saved transcript/file counts can grow legitimately. Neither PSS slope nor persisted-record growth proves a leak. Chat only: terminal, files and previews unengaged.` };
}

// WHY: a hung CDP or a frozen renderer cannot enforce an in-page timeout. Node
// bounds each operation AND the full run, including its cleanup reservation.
export function makeBound(maxMinutes) {
  const end = Date.now() + maxMinutes * 60_000 - 12_000;
  return (promise, label = 'operation', cap = 30_000) => {
    const ms = Math.min(cap, end - Date.now());
    if (ms <= 0) return Promise.reject(new Error(`Lifecycle deadline exceeded at ${label}`));
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Lifecycle timeout at ${label}`)), ms); })]).finally(() => clearTimeout(timer));
  };
}

// Counts saved JSONL files (context, not a leak verdict); all roots stay in fixture HOME.
export function recordCount(home, readDirectory = path => readdirSync(path, { withFileTypes: true })) {
  let n = 0;
  const pending = [join(home, '.youcoded'), join(home, 'YouCoded')];
  while (pending.length) {
    const dir = pending.pop();
    let entries;
    try { entries = readDirectory(dir); }
    catch (error) {
      // WHY: app-owned mkdir locks disappear normally while this observation
      // walks the fixture. A vanished directory is not a lifecycle failure;
      // permission/I/O errors still invalidate the observation rather than lie.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) pending.push(join(dir, entry.name));
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) n++;
    }
  }
  return n;
}
const pageState = `(() => ({ mounted: document.querySelectorAll('.chat-scroll').length,
  visible: [...document.querySelectorAll('.chat-scroll')].filter(p => !p.closest('[aria-hidden="true"]')).length,
  pills: [...document.querySelectorAll('[data-session-strip] [data-session-id]')].map(p => p.getAttribute('data-session-id')) }))()`;

export function lifecycleStartupReady(text) {
  const names = new Set(text.split('\n').flatMap(line => {
    try { return [JSON.parse(line).name]; } catch { return []; }
  }));
  return ['bg:reconcile:copies-done', 'bg:chatsearch-refresh:done', 'bg:materialize:done', 'bg:slug-repair:done'].every(name => names.has(name));
}

async function waitForLifecycleStartup(fixture, bound) {
  const started = Date.now();
  while (true) {
    const text = existsSync(fixture.perfLog) ? readFileSync(fixture.perfLog, 'utf8') : '';
    if (lifecycleStartupReady(text)) return { waitedMs: Date.now() - started, settled: true };
    if (Date.now() - started >= 90_000) throw new Error('Startup repair did not finish; refusing to attribute its resource growth to lifecycle cycles');
    await bound(sleep(100), 'startup repair completion');
  }
}

export function makeDriver(app, fixture, fake, bound) {
  const cdp = app.cdp;
  const evaluate = (code, label) => bound(cdp.evaluate(code), label);
  return {
    async state() {
      const [list, dom] = await Promise.all([evaluate('window.claude.session.list()', 'session list'), evaluate(pageState, 'mounted chats')]);
      if (!Array.isArray(list) || !Number.isInteger(dom?.mounted)) throw new Error('session list or mounted chat state unavailable');
      return { ids: list.map(s => s.id), mounted: dom.mounted, visible: dom.visible, pills: dom.pills };
    },
    async create(name) {
      const options = { name, cwd: fixture.projects.alpha, skipPermissions: false, provider: 'native', binding: { providerId: fixture.fakeProvider.id, modelId: fixture.fakeProvider.modelId }, preset: 'coder' };
      // The caller owns the timeout AND the eventual ID. Timing out this inner
      // promise would hide a late-created session from its cleanup handler.
      const s = await cdp.evaluate(`window.claude.session.create(${JSON.stringify(options)})`);
      if (!s?.id || s.provider !== 'native') throw new Error(`native create returned ${JSON.stringify(s)}`);
      return s.id;
    },
    async switchTo(id) {
      // Desktop session.switch IPC is a stub; click the actual pill and verify the visible pane.
      for (let i = 0; i < 100; i++) {
        const ok = await evaluate(`(() => { const p = [...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x => x.getAttribute('data-session-id') === ${JSON.stringify(id)}); if (!p) return false; p.click(); return true; })()`, 'click session pill');
        if (ok) {
          for (let j = 0; j < 100; j++) {
            const seen = await evaluate(`(() => { const p = [...document.querySelectorAll('[data-session-strip] [data-session-id]')].find(x => x.getAttribute('data-session-id') === ${JSON.stringify(id)}); const panes = [...document.querySelectorAll('.chat-scroll')]; const visible = panes.findIndex(x => !x.closest('[aria-hidden="true"]')); return !!p && visible >= 0 && Number(p.getAttribute('data-session-idx')) === visible; })()`, 'visible chat');
            if (seen) return;
            await bound(sleep(100), 'visible chat wait');
          }
          throw new Error(`pill ${id} did not become active`);
        }
        await bound(sleep(100), 'pill wait');
      }
      throw new Error(`session pill ${id} missing`);
    },
    async send(id, seed) {
      fake.plan({ deltas: 40, perSec: 100, seed, chars: 1200 });
      const text = fake.plannedText();
      const requestStart = fake.requests.length;
      const completion = fake.expectCompletion();
      const result = await evaluate(`window.claude.native.send(${JSON.stringify(id)}, ${JSON.stringify(`lifecycle ${seed}`)})`, 'native send');
      if (!result || result.status !== 'sent') throw new Error(`native send not accepted: ${JSON.stringify(result)}`);
      const rec = await bound(completion, 'fake completion', 15_000);
      if (fake.requests.length !== requestStart + 1 || rec !== fake.requests[requestStart]) throw new Error('unexpected provider request count');
      // DOM-rendered markdown is not raw SSE text; check actual visible text for
      // deterministic non-markup content rather than mistaking a prompt echo for a reply.
      const needle = text.split('\n').map(s => s.trim()).find(s => /^[A-Za-z][^`#|>*]{19,}/.test(s))?.slice(0, 24);
      if (!needle) throw new Error('fake reply lacks a verifiable plain-text fragment');
      let shown = false;
      for (let i = 0; i < 100; i++) {
        shown = await evaluate(`(() => { const p = [...document.querySelectorAll('.chat-scroll')].find(x => !x.closest('[aria-hidden="true"]')); return !!p && p.innerText.includes(${JSON.stringify(needle)}); })()`, 'reply in visible chat');
        if (shown) break;
        await bound(sleep(100), 'reply wait');
      }
      // WHY: provider-sent bytes alone do not establish what the app accepted.
      // Compare the coalesced native transcript's complete text and turn end to
      // the exact fake reply; a DOM fragment separately proves it was displayed.
      const transcript = join(fixture.home, '.youcoded', 'sessions', nativeStoreSlug(fixture.projects.alpha), `${id}.jsonl`);
      let persistedExact = false, turnComplete = false;
      for (let i = 0; i < 100; i++) {
        if (existsSync(transcript)) {
          // The final append may be mid-write; skip only the torn last line.
          const events = readFileSync(transcript, 'utf8').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
          persistedExact = events.some(e => e.type === 'assistant-text' && e.data?.text === text);
          turnComplete = events.some(e => e.type === 'turn-complete');
          if (persistedExact && turnComplete) break;
        }
        await bound(sleep(100), 'persisted reply wait');
      }
      return { plannedDeltas: rec.plannedDeltas, deltasSent: rec.deltasSent, chars: rec.chars, aborted: rec.aborted, shown, exact: rec.deltasSent === rec.plannedDeltas && rec.chars === text.length, persistedExact, turnComplete, fragment: needle, requestIndex: rec.index };
    },
    close: id => cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(id)})`),
    async sample() {
      const { metrics } = await bound(cdp.send('Performance.getMetrics'), 'natural metrics');
      return { metrics: Object.fromEntries((metrics ?? []).map(m => [m.name, m.value])), pss: pssMb(app.family()) };
    },
    records: () => recordCount(fixture.home),
    collectGc: () => bound(cdp.send('HeapProfiler.collectGarbage'), 'collect garbage', 10_000),
  };
}

export async function createOwnedSession(driver, name, bound, protectedIds = []) {
  const pending = Promise.resolve().then(() => driver.create(name));
  try { return await bound(pending, 'owned session create'); }
  catch (error) {
    // WHY: rejection by the external deadline does not cancel Electron's create.
    // The late result still owns cleanup; never touch an ID present beforehand.
    pending.then(id => {
      if (typeof id === 'string' && id && !protectedIds.includes(id)) return driver.close(id);
    }).catch(e => console.error(`late session cleanup: ${e.message}`));
    throw error;
  }
}

export async function runCycles(app, fixture, { cycles = 5, driver, bound = (p => p), postGc = false } = {}) {
  const rows = [];
  for (let index = 1; index <= cycles; index++) {
    const row = { index, gcRequested: postGc, created: [], closed: [], output: [], completed: false, reason: null, before: null, after: null, natural: null, afterGc: { status: 'unmeasured', reason: 'not requested', sample: null }, persistedRecords: { before: null, after: null } };
    rows.push(row);
    try {
      row.before = await bound(driver.state(), 'pre-cycle state');
      row.persistedRecords.before = await bound(driver.records(), 'pre-cycle saved files');
      for (let n = 0; n < 2; n++) {
        const id = await createOwnedSession(driver, `lifecycle-${index}-${n}`, bound, row.before.ids);
        if (!id || row.before.ids.includes(id) || row.created.includes(id)) throw new Error(`create returned invalid or pre-existing ID ${id}`);
        row.created.push(id);
        await bound(driver.switchTo(id), 'cycle switch');
        row.output.push(await bound(driver.send(id, `cycle-${index}-${n}`), 'cycle reply'));
      }
      for (let j = 0; j < 100; j++) {
        row.openState = await bound(driver.state(), 'active session state');
        if (row.created.every(id => row.openState.ids.includes(id)) && row.openState.mounted >= row.before.mounted + 2) break;
        await bound(sleep(100), 'active sessions wait');
      }
      await bound(driver.switchTo(row.created[0]), 'switch back');
    } catch (e) { row.reason = String(e?.message ?? e); }
    finally {
      // WHY: never destroy the fixture's pre-cycle sessions, even on a failed send.
      for (const id of [...row.created].reverse()) {
        try { await bound(driver.close(id), 'cycle cleanup'); row.closed.push(id); }
        catch (e) { row.reason = [row.reason, `cleanup ${id}: ${e.message}`].filter(Boolean).join('; '); }
      }
      try {
        for (let j = 0; j < 100; j++) {
          row.after = await bound(driver.state(), 'post-close state');
          if (same(row.before?.ids, row.after.ids) && row.before?.mounted === row.after.mounted) break;
          await bound(sleep(100), 'post-close wait');
        }
        row.natural = await bound(driver.sample(), 'natural resource sample');
        row.persistedRecords.after = await bound(driver.records(), 'post-cycle saved files');
        if (postGc) {
          try { await bound(driver.collectGc(), 'GC diagnostic'); row.afterGc = { status: 'measured', reason: null, sample: await bound(driver.sample(), 'post-GC resource sample') }; }
          catch (e) { row.afterGc = { status: 'unmeasured', reason: String(e?.message ?? e), sample: null }; }
        }
      } catch (e) { row.reason = [row.reason, `observation: ${e.message}`].filter(Boolean).join('; '); }
    }
    row.completed = !row.reason;
    // Do not continue after a broken cleanup: later cycles would inherit its resources.
    if (summariseCycles([row]).status !== 'measured') break;
  }
  return rows;
}

// WHY: a timed-out startup can still return a handle later; clean that exact
// owned handle rather than losing it when the deadline rejects the race.
async function startOwned(start, close, bound, label) {
  const pending = Promise.resolve().then(start);
  try { return await bound(pending, label); }
  catch (e) { pending.then(close).catch(() => {}); throw e; }
}

async function launchOwned(start, bound) {
  return startOwned(start, app => app.kill(), bound, 'app launch');
}

// WHY: buildApp's subprocesses are not cancellable through its Promise. Run the
// existing helper in an owned process group so a deadline stops the build family,
// rather than merely rejecting while tsc/electron-builder continue running.
async function buildBounded(checkout, bound) {
  const code = `import { buildApp } from ${JSON.stringify(new URL('./build.mjs', import.meta.url).href)}; const r = await buildApp(${JSON.stringify(checkout)}, { skipIfFresh: true }); console.log('PERF_LIFECYCLE_BUILD=' + JSON.stringify(r));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b; });
  child.stderr.on('data', b => { stderr += b; });
  const done = new Promise((ok, reject) => {
    child.on('error', reject);
    child.on('close', exit => {
      if (exit !== 0) return reject(new Error(`packaged build exited ${exit}: ${stderr.slice(-2000) || stdout.slice(-2000)}`));
      const line = stdout.split('\n').findLast(s => s.startsWith('PERF_LIFECYCLE_BUILD='));
      if (!line) return reject(new Error('packaged build returned no build identity'));
      try { ok(JSON.parse(line.slice('PERF_LIFECYCLE_BUILD='.length))); } catch (e) { reject(e); }
    });
  });
  try { return await bound(done, 'packaged build', 240_000); }
  catch (e) {
    // This PID is the detached child we spawned, not an app or a shared checkout.
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
    await Promise.race([done.catch(() => {}), sleep(2000)]);
    throw e;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseOptions(argv);
  mkdirSync(dirname(opts.out), { recursive: true });
  const bound = makeBound(opts.maxMinutes);
  const report = { status: 'incomplete', scope: 'packaged Linux desktop, virtual display, fake native provider, chat-only; no terminal/files/previews engaged', options: opts, cycles: [] };
  let display, app, fake;
  try {
    if (!assetsReady()) throw new Error('perf-lab assets not cached; provision separately');
    // A preserved package must carry the perf-lab build stamp, not an arbitrary binary.
    const build = opts.appDir ? { ...JSON.parse(readFileSync(join(opts.appDir, '.perf-lab-build.json'), 'utf8')), appDir: opts.appDir, binary: join(opts.appDir, 'youcoded') } : await buildBounded(opts.checkout, bound);
    if (!build.sha || !statSync(build.binary).isFile()) throw new Error('package missing build identity or executable');
    report.build = { sha: build.sha, dirty: build.dirty, builtAt: build.builtAt, appDir: build.appDir };
    // WHY: fixed roots are cleared by buildFixture. Check shared package before
    // touching disk, and give each owned run a fresh private fixture directory.
    refusePackageProcesses(build.appDir);
    const fixture = buildFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/short-lifecycle-fixture-')), { fakeProvider: true, log: () => {} });
    fake = await startOwned(() => startFakeProvider({ port: fixture.fakeProvider.port }), f => f.close(), bound, 'fake provider start');
    display = await startOwned(() => startXvfb(':99'), x => { if (x.proc) x.proc.kill('SIGTERM'); }, bound, 'virtual display');
    // launchOwned cleans late arrivals if the external deadline beats launchApp.
    app = await launchOwned(() => launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: display.display, cdpPort: 9569, refuseExisting: true }), (p, label) => bound(p, label, 90_000));
    await bound(app.cdp.send('Performance.enable'), 'enable metrics');
    // WHY: the first shakedown counted startup's copying of hundreds of seeded
    // transcripts as cycle growth. Wait for its real completion signals first.
    report.startup = await waitForLifecycleStartup(fixture, bound);
    const driver = makeDriver(app, fixture, fake, bound);
    // The anchor preserves the window when the cycle's final owned tab closes.
    const preAnchor = await bound(driver.state(), 'pre-anchor state');
    const anchor = await createOwnedSession(driver, 'lifecycle-anchor', bound, preAnchor.ids);
    await bound(driver.switchTo(anchor), 'anchor mounted');
    try {
      report.initialState = await bound(driver.state(), 'starting state');
      report.cycles = await runCycles(app, fixture, { cycles: opts.cycles, driver, bound, postGc: opts.postGc });
      Object.assign(report, summariseCycles(report.cycles));
    } finally { await bound(driver.close(anchor), 'anchor cleanup').catch(e => { report.status = 'incomplete'; report.cleanupError = e.message; }); }
  } catch (e) { report.status = 'incomplete'; report.error = String(e?.message ?? e); }
  finally {
    try { if (app) await Promise.race([app.kill(), new Promise((_, reject) => setTimeout(() => reject(new Error('app cleanup timeout')), 8000))]); }
    catch (e) { report.status = 'incomplete'; report.cleanupError = String(e?.message ?? e); }
    try { if (display?.proc) display.proc.kill('SIGTERM'); } catch (e) { report.status = 'incomplete'; report.displayCleanupError = String(e); }
    try { if (fake) await Promise.race([fake.close(), new Promise((_, reject) => setTimeout(() => reject(new Error('fake provider cleanup timeout')), 3000))]); }
    catch (e) { report.status = 'incomplete'; report.providerCleanupError = String(e?.message ?? e); }
    writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.status}: ${opts.out}`);
  if (report.status !== 'measured') process.exitCode = 2;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 2; });
