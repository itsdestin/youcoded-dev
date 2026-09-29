// The engine under `shoot` (and later `explore`): build the photo-only copy of the
// practice app, serve it on a free port, drive a pool of headless Chrome tabs.
// Nothing here is configured by the caller beyond "which checkout".
//
// Spec: docs/archive/specs/2026-09-24-shoot-and-explore.md → "The engine".
// Evidence for every choice below: docs/archive/investigations/2026-09-24-screenshot-infra-speed.md.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME_FLAGS } from '../ui-review/cdp-helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');
const CACHE = join(tmpdir(), 'youcoded-shoot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Which checkout ──────────────────────────────────────────────────────────

/** A worktree name, branch, or path → the checkout folder holding desktop/. Same names run-workbench.sh takes. */
export function resolveCheckout(target) {
  if (target && existsSync(join(target, 'desktop'))) return resolve(target);
  // A workspace worktree's own folder (`.` from its root): its app checkout is youcoded/.
  // WHY: a fresh session tried `--after .` and got "no checkout matches" (2026-09-26).
  if (target && existsSync(join(target, 'youcoded', 'desktop'))) return resolve(target, 'youcoded');
  try {
    return execFileSync('bash', ['-c', 'source "$1/scripts/lib/resolve-checkout.sh"; resolve_youcoded_checkout "$2" "$1"', '_', WORKSPACE, target ?? ''], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new Error(`no youcoded checkout matches "${target}"\n${e.stderr ?? ''}`);
  }
}

// ─── The photo-only build ───────────────────────────────────────────────────

// A cheap fingerprint of everything that changes the build: every file's size and
// mtime under src/renderer and src/shared, plus the build config. WHY not git: an
// uncommitted edit must rebuild too, and a picture must never show stale code.
function fingerprint(desktop) {
  const h = createHash('sha1');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name); const st = statSync(p);
      if (st.isDirectory()) walk(p); else h.update(`${p}:${st.size}:${st.mtimeMs}\n`);
    }
  };
  for (const d of ['src/renderer', 'src/shared']) if (existsSync(join(desktop, d))) walk(join(desktop, d));
  for (const f of ['vite.config.ts', 'package.json', 'package-lock.json']) {
    const p = join(desktop, f); if (existsSync(p)) { const st = statSync(p); h.update(`${p}:${st.size}:${st.mtimeMs}\n`); }
  }
  return h.digest('hex');
}

/** Builds (or reuses) the photo-only copy for a checkout. Returns its folder. */
export async function ensureBuild(checkout, log = () => {}) {
  const desktop = join(checkout, 'desktop');
  const key = createHash('sha1').update(desktop).digest('hex').slice(0, 12);
  const home = join(CACHE, 'builds', key); mkdirSync(home, { recursive: true });
  const dist = join(home, 'dist'); const stampFile = join(home, 'stamp');
  const want = fingerprint(desktop);
  if (existsSync(join(dist, 'index.html')) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === want) return dist;

  // One build at a time per checkout: a second `shoot` waits instead of racing the same folder.
  const lock = join(home, 'lock');
  for (let t0 = Date.now(); ; await sleep(200)) {
    try { mkdirSync(lock); break; } catch {
      if (Date.now() - t0 > 120_000) { rmSync(lock, { recursive: true, force: true }); continue; } // a crashed builder's lock
      if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === want && existsSync(join(dist, 'index.html'))) return dist;
    }
  }
  try {
    // WHY re-check after taking the lock (2026-09-26): shoot --check and journeys start
    // together in verify.sh; the second waited for the first's build, then rebuilt anyway —
    // and --emptyOutDir wiped the folder the first was already serving (ENOENT index.html).
    if (existsSync(join(dist, 'index.html')) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === want) return dist;
    log(`building the photo-only copy of ${checkout}`);
    const t0 = Date.now();
    const vite = join(desktop, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!existsSync(vite)) throw new Error(`${desktop}/node_modules is missing — run workspace-start for this checkout first`);
    // NODE_ENV and any VITE_* from the caller's shell are dropped: vitest's NODE_ENV=test
    // turns a build into a development build, and a stray VITE_ flag changes what ships.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_') && k !== 'NODE_ENV'));
    await new Promise((res, rej) => {
      const p = spawn(process.execPath, [vite, 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], { cwd: desktop, env: { ...env, VITE_WORKBENCH: '1', VITE_SHOOT: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = ''; p.stderr.on('data', (d) => { err += d; });
      const timer = setTimeout(() => { p.kill(); rej(new Error('build took over 3 minutes')); }, 180_000);
      p.on('close', (code) => { clearTimeout(timer); code === 0 ? res() : rej(new Error(`build failed:\n${err.slice(-2000)}`)); });
    });
    writeFileSync(stampFile, want);
    log(`built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return dist;
  } finally { rmSync(lock, { recursive: true, force: true }); }
}

// ─── Serving it ─────────────────────────────────────────────────────────────

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.jsonl': 'application/json' };

/** Serves a folder on a port the computer picks. WHY: fixed ports collided between sessions. */
export function serve(dist) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = resolve(dist, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
    res.end(readFileSync(file));
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, close: () => server.close() })));
}

// ─── Leftovers ──────────────────────────────────────────────────────────────

const PIDS = join(CACHE, 'pids');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/**
 * Stops browsers a crashed run left behind. Each run records its Chrome pids and
 * profile folders; a record whose owner is gone is swept. A pid is only signalled
 * if its command line still names that profile, so a reused pid is never touched.
 */
export function sweepLeftovers() {
  mkdirSync(PIDS, { recursive: true });
  for (const f of readdirSync(PIDS)) {
    let rec; try { rec = JSON.parse(readFileSync(join(PIDS, f), 'utf8')); } catch { rmSync(join(PIDS, f), { force: true }); continue; }
    if (alive(rec.owner)) continue;
    for (const { pid, profile } of rec.browsers ?? []) {
      let cmd = ''; try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { /* gone */ }
      if (cmd.includes(profile)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
      rmSync(profile, { recursive: true, force: true });
    }
    rmSync(join(PIDS, f), { force: true });
  }
}

// ─── Browsers ───────────────────────────────────────────────────────────────

/** How many browsers and tabs, from the core count — not a setting. Measured: 8×2 on 32 threads left the machine ~half free. */
export function poolSize(jobs) {
  const cores = cpus().length;
  const browsers = Math.max(1, Math.min(8, Math.floor(cores / 4)));
  const tabs = Math.max(1, Math.min(jobs, browsers * 2));
  return { browsers: Math.min(browsers, tabs), tabs };
}

/** Waits while the computer is busier than 85% (load average vs cores), up to 10 s. */
export async function backOff() {
  const cores = cpus().length;
  for (let t0 = Date.now(); loadavg()[0] / cores > 0.85 && Date.now() - t0 < 10_000;) await sleep(250);
}

async function launchBrowser(width, height, record) {
  const profile = mkdtempSync(join(tmpdir(), 'youcoded-shoot-'));
  // Port 0 = Chrome picks a free debugging port and writes it to DevToolsActivePort.
  const proc = spawn('google-chrome-stable', CHROME_FLAGS(width, height, 0, profile), { stdio: 'ignore' });
  record.browsers.push({ pid: proc.pid, profile }); record.save();
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { await sleep(100); }
  }
  if (!port) { proc.kill('SIGKILL'); throw new Error('Chrome did not start within 10 s'); }
  const conn = await connect(port);
  return { ...conn, close: () => { conn.close(); proc.kill('SIGKILL'); rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } };
}

/** One DevTools connection to a browser's debugging port: `send` with a time limit, per-tab event routing. */
async function connect(port) {
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) })).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('could not connect to Chrome')); });
  let id = 0; const pending = new Map(); const sessions = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.sessionId) sessions.get(m.sessionId)?.(m);
  };
  // WHY every command has a time limit: without one a single stuck page hung a whole
  // run forever (3 screens in the prototype; 16 of 303 jobs in the 9/23 sweep).
  const send = (method, params = {}, sessionId, ms = 15_000) => new Promise((res, rej) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); rej(new Error(`${method} timed out after ${ms / 1000}s`)); }, ms);
    pending.set(i, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { send, sessions, close: () => { try { ws.close(); } catch { /* gone */ } } };
}

// "Still": no fetch in flight, no finite animation running, every image on the page finished
// loading, two frames painted — capped. WHY images: theme cards drew blank when a picture was
// taken before their previews arrived — the run-to-run differences the investigation measured.
const STILL = (cap) => `new Promise((res) => { const t0 = performance.now(); const tick = () => {
  const busy = document.getAnimations().some((a) => a.playState === 'running' && isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity))
    || [...document.images].some((i) => !i.complete);
  if ((!busy && (window.__shootInflight | 0) === 0) || performance.now() - t0 > ${cap}) requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0))));
  else setTimeout(tick, 16); }; tick(); })`;
const INFLIGHT = `(() => { if (window.__shootInflight !== undefined) return; window.__shootInflight = 0;
  const f = window.fetch; window.fetch = function (...a) { window.__shootInflight++; return f.apply(this, a).finally(() => window.__shootInflight--); }; })();`;

// One tab on a connected browser, attached to `targetId`. `ownContext` is the tab's private
// browser context when the engine made it (closed with the tab); an attached dev window has none.
async function makeTab(b, targetId) {
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  let errors = []; const listeners = new Set();
  b.sessions.set(sessionId, (m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?');
    for (const f of listeners) f(m);
  });
  const send = (method, params, ms) => b.send(method, params, sessionId, ms);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INFLIGHT });
  await send('Runtime.evaluate', { expression: INFLIGHT }).catch(() => {});
  const evaluate = async (expression, ms) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, ms);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  let themeScript = null; let size = '';
  return {
    send, evaluate,
    /** Every protocol event for this tab (console messages, navigations…). Returns an unsubscribe. */
    on: (f) => { listeners.add(f); return () => listeners.delete(f); },
    still: (cap) => evaluate(STILL(cap), cap + 5000).catch(() => -1),
    takeErrors: () => { const e = errors; errors = []; return [...new Set(e)].slice(0, 5); },
    async prepare({ theme, width: w, height: h }) {
      if (`${w}x${h}` !== size) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); size = `${w}x${h}`; }
      if (themeScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeScript });
      themeScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(theme)});}catch{}` })).identifier;
    },
    navigate: (url) => send('Page.navigate', { url }),
    png: async (params = {}) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...params }, 30_000)).data, 'base64'),
    detach: () => { b.sessions.delete(sessionId); return b.send('Target.detachFromTarget', { sessionId }).catch(() => {}); },
  };
}

// A new tab in its own private browser context — like a separate private window.
async function privateTab(b) {
  const { browserContextId } = await b.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const tab = await makeTab(b, targetId);
  return { ...tab, close: () => b.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}) };
}

function pidRecord() {
  sweepLeftovers();
  const recFile = join(PIDS, `${process.pid}.json`);
  return { owner: process.pid, browsers: [], file: recFile, save() { writeFileSync(recFile, JSON.stringify({ owner: this.owner, browsers: this.browsers })); } };
}

/**
 * A pool of tabs across a few browsers. Every tab is its own browser context — like a
 * separate private window — so saved settings (the theme above all) never leak
 * between tabs that load the same address.
 */
export async function openPool({ tabs, browsers, width = 1440, height = 900 }) {
  const record = pidRecord();
  const bs = await Promise.all(Array.from({ length: browsers }, () => launchBrowser(width, height, record)));
  const pool = await Promise.all(Array.from({ length: tabs }, (_, i) => privateTab(bs[i % bs.length])));
  return {
    tabs: pool,
    close() { for (const b of bs) b.close(); rmSync(record.file, { force: true }); },
  };
}

/** One browser that hands out fresh private tabs on request — `explore` starts over with a new one on `back`. */
export async function openBrowser({ width = 1440, height = 900 } = {}) {
  const record = pidRecord();
  const b = await launchBrowser(width, height, record);
  return { newTab: () => privateTab(b), close() { b.close(); rmSync(record.file, { force: true }); } };
}

/**
 * The dev window `run-dev.sh` started from `checkout`, from the marker it leaves in
 * desktop/.dev-instances/. It is the ONLY way to a real app: the marker must name a live
 * run-dev.sh process. Destin's installed app is never started by run-dev.sh, so it never
 * has one. Throws, naming the command to start one, when none qualifies.
 */
export function findDevWindow(checkout) {
  const dir = join(checkout, 'desktop', '.dev-instances');
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
    let m; try { m = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (!m.pid || !alive(m.pid) || !m.devtoolsPort || !m.vitePort) continue;
    let cmd = null; try { cmd = readFileSync(`/proc/${m.pid}/cmdline`, 'utf8'); } catch { /* no /proc (Windows): the live pid is the check */ }
    if (cmd !== null && !cmd.includes('run-dev.sh')) continue;
    return m;
  }
  // run-dev.sh takes a branch or worktree name, not a path.
  let branch = checkout; try { branch = execFileSync('git', ['-C', checkout, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* the path it is */ }
  throw new Error(`no dev window is running from ${checkout} — start one with: bash scripts/run-dev.sh ${branch} --label "<what you test>" (explore attaches only to a window run-dev.sh started)`);
}

/**
 * Attaches to the page of an already-running isolated dev app on `port`, whose address
 * starts with `urlPrefix`. Nothing is launched and nothing is closed: `close` only detaches.
 * The caller must have proved the port belongs to a dev app (explore's marker check).
 */
export async function attachPage(port, urlPrefix) {
  const b = await connect(port);
  const { targetInfos } = await b.send('Target.getTargets');
  // The main window's address EXACTLY: the buddy floater is its own page at the same
  // address plus `?mode=buddy-mascot`, and a starts-with match could pick it.
  const pages = targetInfos.filter((t) => t.type === 'page');
  const page = pages.find((t) => t.url === `${urlPrefix}/` || t.url === urlPrefix) ?? pages.find((t) => t.url.startsWith(urlPrefix) && !t.url.includes('mode='));
  if (!page) { b.close(); throw new Error(`no window at ${urlPrefix} on port ${port}`); }
  const tab = await makeTab(b, page.targetId);
  return { ...tab, close: async () => { await tab.detach(); b.close(); } };
}

/** Runs `work(tab, job)` over every job with the pool's tabs, backing off when the computer is busy. */
export async function runQueue(pool, jobs, work) {
  const queue = [...jobs]; const results = [];
  await Promise.all(pool.tabs.map(async (tab) => {
    while (queue.length) { const job = queue.shift(); await backOff(); results.push(await work(tab, job)); }
  }));
  return results;
}
