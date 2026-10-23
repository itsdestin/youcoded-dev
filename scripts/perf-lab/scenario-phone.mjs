// scripts/perf-lab/scenario-phone.mjs — "a phone over a slow network", measured.
//
//   node scripts/perf-lab/scenario-phone.mjs [--checkout <app worktree>] [--repeats 3]
//        [--rtt 470] [--down-mbit 5] [--up-mbit 2] [--turns 300] [--label <text>] [--out perf-reports]
//        [--force-build]
//
// WHAT IT DOES
// Boots the PACKAGED app from the app worktree on Xvfb, in the lab's throwaway HOME, with
// remote access on and a throwaway password in THAT home's remote config (never the real
// ~/.claude). One Claude Code conversation (default 300 turns, resumed from a seeded
// transcript) is opened and its terminal is filled with 2,000 lines, so the phone has a
// realistic thing to open. Then, per repeat, a headless Chrome with a phone-sized touch
// screen and a FRESH profile talks to the app only through net-shape.mjs (RTT + bandwidth
// caps), and three legs are timed:
//   cold       load the page, type the password, wait until the conversation is drawn
//   reopen     reload the page (saved key, cached code), wait until drawn
//   revisit    open the page again from its address with the connections gone (a bookmark, minutes later)
//   resume     hide the page, silence the link 75 s, then show it again (a phone put down and picked up)
//   reconnect  the proxy hard-closes every connection while the page stays open; the page
//              reconnects by itself and redraws
//
// WHERE THE NUMBERS COME FROM (chosen on purpose)
// The app's own report: the phone page sends one `remote:timings` push per connection and
// the computer writes it to <home>/.claude/desktop.log as a `timings (...)` line, next to
// `conversation answered in N ms, N KB` lines (src/main/remote-timings.ts). The rig reads
// that file. WHY not the page's performance entries: the marks that matter (list, terminal,
// conversation, drawn) live in module-private state in renderer/remote-timings.ts and are
// not exposed on `window`, so reading them from the page would mean either editing app
// source or re-deriving them from the DOM; the log line is the app's own statement, it is
// what Destin's real phone also produces, and a log append is also the "I'm done" signal the
// rig waits on (no sleeps). Fragility: if the wording of those lines changes, parseTimings()
// returns null and the rig fails loudly with the Remote lines it did see.
// Rig-side wall clock (`wallMs`) is recorded beside it as a cross-check only; it is as coarse
// as the 100 ms poll.
//
// BANDWIDTH IS AN ASSUMPTION: the default 5 Mbit/s down, 2 Mbit/s up is a conservative
// mobile profile, not a measurement of Destin's phone (only his ~470 ms round trip is).
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { connect, listTargets, waitFor } from './cdp.mjs';
import { assetsReady, buildFixture, ccProjectSlug, CONTENT_SEED, stableUuid, transcriptBody } from './fixture.mjs';
import { launchApp, startXvfb } from './launch.mjs';
import { createShapedProxy } from './net-shape.mjs';
import { glyphCommand, GLYPH_LINES, GLYPH_SENTINEL } from './scenario-terminal.mjs';
import { waitForSessionReady } from './scenario-workload.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCRATCH = join(ROOT, 'scratch', 'perf-lab');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Lab ports. NOT 9900 (live app), 9950 (dev instance), 5223 (dev Vite), 9555 (the main lab's CDP).
export const APP_CDP_PORT = 9565;
export const CHROME_CDP_PORT = 9566;
export const REMOTE_PORT = 10070;
export const RIG_PASSWORD = 'perf-lab-phone-pw';        // throwaway; lives only in the fixture HOME
const DISPLAY = ':99';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

// ── pure helpers (unit-tested) ─────────────────────────────────────────────────────────

const toBytes = (num, unit) => Math.round(Number(num) * (unit === 'MB' ? 1024 * 1024 : 1024));

/** `timings (page navigate, 1.2 MB downloaded), ms: page 400 · code ran 800 · …` → fields, or null. */
export function parseTimings(msg) {
  const m = /^timings \((reconnect|page ([\w-]+)(?:, ([\d.]+) (KB|MB) downloaded)?)\), ms: (.+)$/.exec(msg ?? '');
  if (!m) return null;
  const marks = {};
  for (const part of m[5].split(' · ')) {
    const p = /^(.*?) (\d+)$/.exec(part.trim());
    if (p) marks[p[1]] = Number(p[2]);
  }
  return {
    kind: m[1] === 'reconnect' ? 'reconnect' : 'load',
    nav: m[2] ?? null,
    downloadedBytes: m[3] ? toBytes(m[3], m[4]) : null,
    marks,
  };
}

/** `conversation answered in 80 ms, 200 KB` → { what, ms, bytes }, or null. */
export function parseAnswer(msg) {
  const m = /^(conversation|terminal|list) answered in (\d+) ms, ([\d.]+) (KB|MB)$/.exec(msg ?? '');
  return m ? { what: m[1], ms: Number(m[2]), bytes: toBytes(m[3], m[4]) } : null;
}

export function median(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}
/** Median with the observed range: { median, min, max, n }. */
export function summarise(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? { median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : null;
}

/** Remote lines of the app's desktop.log written at or after `sinceIso`. */
export function remoteLinesSince(logText, sinceIso) {
  const out = [];
  for (const line of logText.split('\n')) {
    if (!line.includes('"component":"Remote"')) continue;
    try { const e = JSON.parse(line); if (e.ts >= sinceIso) out.push(e); } catch { /* a half-written last line */ }
  }
  return out;
}

// ── rig plumbing ───────────────────────────────────────────────────────────────────────

function tailscaleIp() {
  try {
    const ip = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).split('\n')[0].trim();
    if (ip) return ip;
  } catch { /* fall through */ }
  throw new Error('phone scenario: Tailscale has no address on this computer. Remote access only listens on the Tailscale address (remote-server.ts startOnce), so there is nothing to measure against.');
}

/** The lab's assets (engine + toy model) live in the main workspace's scratch; a session worktree has none. Link them, never download. */
function ensureAssets() {
  if (assetsReady()) return;
  const marker = `${join('/', 'worktrees', '')}`;
  const idx = ROOT.indexOf(marker);
  const main = idx > 0 ? ROOT.slice(0, idx) : null;
  const src = main && join(main, 'scratch', 'perf-lab', 'assets');
  if (src && existsSync(src)) {
    mkdirSync(SCRATCH, { recursive: true });
    symlinkSync(src, join(SCRATCH, 'assets'));
  }
}

/** Seed the long conversation and the remote config in the fixture HOME. */
function seedPhoneFixture(fixture, { turns, checkout }) {
  const cwd = fixture.projects.alpha;
  const sessionId = stableUuid(`${CONTENT_SEED}:phone`);
  const dir = join(fixture.home, '.claude', 'projects', ccProjectSlug(cwd));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sessionId}.jsonl`), transcriptBody({ content: 'realistic', sessionId, cwd, turns, startedAt: Date.now() - 3600_000 }).join('\n') + '\n');
  // bcryptjs is the app's own dependency (remote-config.ts); resolve it from the app checkout so the rig adds none.
  const bcrypt = createRequire(join(checkout, 'desktop', 'package.json'))('bcryptjs');
  const configPath = join(fixture.home, '.claude', 'youcoded-remote.json');
  // WHY this exact path: no YOUCODED_PROFILE (launchConfiguration deletes it), so remote-paths.ts picks
  // youcoded-remote.json under the app's HOME, which is the fixture's.
  if (!configPath.startsWith(fixture.home)) throw new Error('phone scenario: refusing to write a remote config outside the fixture home');
  writeFileSync(configPath, JSON.stringify({
    enabled: true, port: REMOTE_PORT, passwordHash: bcrypt.hashSync(RIG_PASSWORD, 4),
    keepAwakeHours: 0, everPaired: false,
  }, null, 2), { mode: 0o600 });
  return { cwd, sessionId, logPath: join(fixture.home, '.claude', 'desktop.log') };
}

async function waitTcp(host, port, { timeoutMs = 120_000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await new Promise((r) => { const s = net.connect(port, host, () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`phone scenario: nothing is listening on ${host}:${port} after ${timeoutMs} ms — remote access did not start (look at the Remote lines of desktop.log)`);
}

/** Open the long conversation in the desktop window and fill its terminal, so the phone has something full to open. */
async function prepareConversation(cdp, { cwd, sessionId }, { turns, glyphLines }) {
  const r = await cdp.evaluate(`(async () => {
    try { const s = await window.claude.session.create(${JSON.stringify({ name: 'phone', cwd, skipPermissions: true, resumeSessionId: sessionId })}); return { id: s.id }; }
    catch (e) { return { error: String(e && e.message || e) }; }
  })()`);
  if (r.error) throw new Error(`phone scenario: session.create failed in the app: ${r.error}`);
  await waitForSessionReady(cdp);
  await cdp.evaluate(`window.claude.session.sendInput(${JSON.stringify(r.id)}, ${JSON.stringify(`${glyphCommand(glyphLines)}\r`)})`);
  await waitFor(cdp, `(window.__terminalRegistry?.getScreenText(${JSON.stringify(r.id)}, 8) ?? '').includes(${JSON.stringify(GLYPH_SENTINEL(glyphLines))})`, { timeoutMs: 90_000, everyMs: 250 });
  // Settle, not sleep: the desktop window pages its history in, so wait (up to 15 s) until its entry count has held for
  // three looks. Informational only: the phone's answer comes from the computer's own copy, and a desktop window that
  // shows no timeline (0 here) does not stop the phone getting the whole conversation (its answer size is in the report).
  let last = -1; let still = 0;
  for (let i = 0; i < 30 && still < 3; i++) {
    const n = await cdp.evaluate(`document.querySelectorAll('.timeline-entry').length`);
    still = n > 0 && n === last ? still + 1 : 0; last = n;
    await sleep(500);
  }
  return { sessionId: r.id, desktopEntries: last, expectedEntries: turns * 2 };
}

// ── the phone ──────────────────────────────────────────────────────────────────────────

async function startPhone(profileDir) {
  const chrome = spawn('google-chrome-stable', [
    '--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CHROME_CDP_PORT}`,
    `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  chrome.stderr.on('data', (d) => { err = (err + d).slice(-4096); });
  let target = null;
  const t0 = Date.now();
  while (!target && Date.now() - t0 < 60_000 && chrome.exitCode === null) {
    try { target = (await listTargets(CHROME_CDP_PORT)).find((t) => t.type === 'page'); } catch { /* not up */ }
    if (!target) await sleep(200);
  }
  if (!target) { try { chrome.kill('SIGKILL'); } catch {} throw new Error(`phone scenario: headless Chrome never opened its debugging port: ${err}`); }
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  // PHONE_CONSOLE=1: echo the page's console (debugging the page itself; off by default).
  if (process.env.PHONE_CONSOLE) cdp.on('Runtime.consoleAPICalled', (e) => console.log(`[phone ${e.type}]`, (e.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)));
  // PHONE_NET=1: list each request the page makes, with when it started and finished (seconds, the browser's clock).
  if (process.env.PHONE_NET) {
    await cdp.send('Network.enable');
    const urls = new Map();
    cdp.on('Network.requestWillBeSent', (e) => { urls.set(e.requestId, e.request.url); console.log(`[net ${e.timestamp.toFixed(3)} start] ${e.request.url.slice(-70)} (${e.type ?? ''}, ${e.initiator?.type ?? ''})`); });
    cdp.on('Network.loadingFinished', (e) => console.log(`[net ${e.timestamp.toFixed(3)} done ] ${String(urls.get(e.requestId)).slice(-70)} ${e.encodedDataLength} B`));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: PHONE_UA });
  return { chrome, cdp, stop() { try { cdp.close(); } catch {} try { chrome.kill('SIGKILL'); } catch {} } };
}

/** Wait for the app to log a timings line (of `kind`) after `sinceIso`; returns it with the answers logged since. */
async function waitForReport(logPath, sinceIso, kind, { timeoutMs = 240_000 } = {}) {
  const t0 = Date.now();
  let seen = [];
  while (Date.now() - t0 < timeoutMs) {
    let text = '';
    try { text = readFileSync(logPath, 'utf8'); } catch { /* not written yet */ }
    seen = remoteLinesSince(text, sinceIso);
    for (const e of seen) {
      const t = parseTimings(e.msg);
      if (t && t.kind === kind) {
        return { timings: t, answers: seen.map((x) => parseAnswer(x.msg)).filter(Boolean), observedAfterMs: Date.now() - t0 };
      }
    }
    await sleep(100);
  }
  throw new Error(`phone scenario: no '${kind}' timings line within ${timeoutMs} ms. Remote lines seen since the leg began:\n${seen.map((e) => `  ${e.ts} ${e.msg}`).join('\n') || '  (none)'}`);
}

const diffStats = (a, b) => ({ downBytes: b.down - a.down, upBytes: b.up - a.up, connections: b.connections - a.connections });

async function tapSubmit(cdp) {
  const box = await cdp.evaluate(`(() => { const b = document.querySelector('form button[type=submit]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error('phone scenario: the sign-in button is not on the page');
  const pt = [{ x: box.x, y: box.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** How long the resume leg leaves the phone: past the computer's ~60 s of unanswered pings (remote-server MAX_MISSED_PINGS). */
const AWAY_MS = 75_000;

/** One full repeat: cold → reopen → revisit → reconnect → resume, each in its own record. */
async function oneRepeat({ proxy, logPath }) {
  const profile = mkdtempSync(join(tmpdir(), 'perf-lab-phone-'));
  const phone = await startPhone(profile);
  const { cdp } = phone;
  const url = `http://127.0.0.1:${proxy.port}/`;
  const legs = {};
  try {
    // ── cold ──
    let since = new Date().toISOString(); let s0 = proxy.stats(); let w0 = performance.now();
    await cdp.send('Page.navigate', { url });
    await waitFor(cdp, `!!document.querySelector('#remote-password')`, { timeoutMs: 180_000, everyMs: 100 });
    const formShownMs = Math.round(performance.now() - w0);
    await cdp.evaluate(`(() => { const i = document.querySelector('#remote-password'); i.focus(); return true; })()`);
    await cdp.send('Input.insertText', { text: RIG_PASSWORD });
    // The page's own clock at the tap: the report's marks run from page start, so "after sign-in was pressed" = mark - this.
    const submitAtPageMs = await cdp.evaluate(`Math.round(performance.now())`);
    await tapSubmit(cdp);
    let rep = await waitForReport(logPath, since, 'load');
    legs.cold = legRecord(rep, proxy.stats(), s0, performance.now() - w0, { formShownMs, submitAtPageMs });
    // Let the first connection's trailing traffic (acks, pings) finish before the next leg starts counting.
    await sleep(1000);

    // ── reopen ──
    since = new Date().toISOString(); s0 = proxy.stats(); w0 = performance.now();
    await cdp.send('Page.reload', { ignoreCache: false });
    rep = await waitForReport(logPath, since, 'load');
    legs.reopen = legRecord(rep, proxy.stats(), s0, performance.now() - w0, {});
    await sleep(1000);

    // ── revisit ── opening the page again from a bookmark or the home screen, minutes later: the radio's connections are gone
    // (dropped first), and the browser may use its kept copy of the page (a reload above always asks the computer for it).
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(300);
    proxy.dropConnections();
    since = new Date().toISOString(); s0 = proxy.stats(); w0 = performance.now();
    await cdp.send('Page.navigate', { url });
    rep = await waitForReport(logPath, since, 'load');
    legs.revisit = legRecord(rep, proxy.stats(), s0, performance.now() - w0, {});
    await sleep(1000);

    // ── reconnect ──
    since = new Date().toISOString(); s0 = proxy.stats(); w0 = performance.now();
    const dropped = proxy.dropConnections();
    rep = await waitForReport(logPath, since, 'reconnect');
    legs.reconnect = legRecord(rep, proxy.stats(), s0, performance.now() - w0, { droppedSockets: dropped });
    await sleep(1000);

    // ── resume ── the phone was put down for a while: the page hidden, the radio silent (no close reaches either side), and
    // the computer gives up on its unanswered pings. Then the phone is picked up again. WHY not also Page.setWebLifecycleState
    // 'frozen': a page frozen and resumed that way never drew another frame in headless Chrome, so its report never went out.
    // A hidden page does no checks of its own (remote-shim), so hidden is what matters here.
    const setVisible = (state) => cdp.evaluate(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => '${state}' }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
    await setVisible('hidden');
    proxy.goSilent();
    await sleep(AWAY_MS);
    since = new Date().toISOString(); s0 = proxy.stats(); w0 = performance.now();
    await setVisible('visible');
    rep = await waitForReport(logPath, since, 'reconnect');
    legs.resume = legRecord(rep, proxy.stats(), s0, performance.now() - w0, { awayMs: AWAY_MS });
  } finally {
    phone.stop();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
  return legs;
}

function legRecord(rep, stats1, stats0, wallMs, extra) {
  const conv = rep.answers.filter((a) => a.what === 'conversation').pop();
  const term = rep.answers.filter((a) => a.what === 'terminal').pop();
  return {
    marks: rep.timings.marks, nav: rep.timings.nav, pageReportedDownloadedBytes: rep.timings.downloadedBytes,
    conversationAnswer: conv ?? null, terminalAnswer: term ?? null,
    proxy: diffStats(stats0, stats1), wallMs: Math.round(wallMs), ...extra,
  };
}

// ── report ─────────────────────────────────────────────────────────────────────────────

const MARK_ORDER = ['waited after waking', 'page', 'code ran', 'first frame', 'connection code', 'connecting', 'connected', 'signed in', 'list', 'terminal', 'conversation', 'drawn'];
const fmtS = (s) => (s ? `${s.median}${s.n > 1 ? ` [${s.min}–${s.max}]` : ''}` : '—');
const mb = (b) => (b == null ? null : Math.round(b / 1024) / 1024);

export function buildSummary(runs) {
  const out = {};
  for (const leg of ['cold', 'reopen', 'revisit', 'reconnect', 'resume']) {
    const L = runs.map((r) => r[leg]).filter(Boolean);
    out[leg] = {
      marks: Object.fromEntries(MARK_ORDER.map((k) => [k, summarise(L.map((l) => l.marks[k]))]).filter(([, v]) => v)),
      // A resume's whole wait: how long after waking the new connection began, plus its own time to drawn.
      drawnAfterWaking: summarise(L.map((l) => (l.marks['waited after waking'] != null && l.marks.drawn != null ? l.marks['waited after waking'] + l.marks.drawn : null))),
      drawnAfterSignInPressed: summarise(L.map((l) => (l.submitAtPageMs != null && l.marks.drawn != null ? l.marks.drawn - l.submitAtPageMs : null))),
      wallMs: summarise(L.map((l) => l.wallMs)),
      conversationAnsweredMs: summarise(L.map((l) => l.conversationAnswer?.ms)),
      conversationAnswerKB: summarise(L.map((l) => (l.conversationAnswer ? Math.round(l.conversationAnswer.bytes / 1024) : null))),
      terminalAnswerKB: summarise(L.map((l) => (l.terminalAnswer ? Math.round(l.terminalAnswer.bytes / 1024) : null))),
      proxyDownKB: summarise(L.map((l) => Math.round(l.proxy.downBytes / 1024))),
      proxyUpKB: summarise(L.map((l) => Math.round(l.proxy.upBytes / 1024))),
      connections: summarise(L.map((l) => l.proxy.connections)),
    };
  }
  return out;
}

export function renderMarkdown(report) {
  const { meta, summary } = report;
  const legs = ['cold', 'reopen', 'revisit', 'reconnect', 'resume'];
  const row = (label, f) => `| ${label} | ${legs.map((l) => f(summary[l])).join(' | ')} |`;
  const lines = [
    `# Phone over a slow network — ${meta.label ?? meta.stamp}`,
    '',
    `Link: round trip ${meta.rttMs} ms, down ${meta.downMbit || 'unlimited'} / up ${meta.upMbit || 'unlimited'} Mbit/s (${meta.bandwidthNote}). ` +
    `Conversation: ${meta.turns} turns + a ${meta.glyphLines}-line terminal. ${meta.repeats} repeats, each a fresh Chrome profile; cells are median [min–max], milliseconds unless stated.`,
    `App ${meta.appSha} (${meta.appBranch}). Times are the phone page's own marks, from the app's log line, counted from page start (cold/reopen) or from the new connection (reconnect).`,
    '',
    `| step (ms) | ${legs.join(' | ')} |`, `|---|${legs.map(() => '---').join('|')}|`,
    ...MARK_ORDER.map((k) => row(k, (s) => fmtS(s.marks[k]))),
    row('drawn, counted from pressing Connect', (s) => fmtS(s.drawnAfterSignInPressed)),
    row('drawn, counted from waking', (s) => fmtS(s.drawnAfterWaking)),
    row('rig wall clock (coarse, ±100 ms)', (s) => fmtS(s.wallMs)),
    row('computer took to answer the conversation', (s) => fmtS(s.conversationAnsweredMs)),
    row('conversation answer, KB', (s) => fmtS(s.conversationAnswerKB)),
    row('terminal answer, KB', (s) => fmtS(s.terminalAnswerKB)),
    row('through the proxy, down, KB', (s) => fmtS(s.proxyDownKB)),
    row('through the proxy, up, KB', (s) => fmtS(s.proxyUpKB)),
    row('connections opened', (s) => fmtS(s.connections)),
    '',
    meta.notes.map((n) => `- ${n}`).join('\n'),
    '',
  ];
  return lines.join('\n');
}

// ── main ───────────────────────────────────────────────────────────────────────────────

export async function runPhoneScenario(opts) {
  const { checkout, repeats, rttMs, downMbit, upMbit, turns, label, outDir, forceBuild, log = (m) => console.error(m) } = opts;
  const host = tailscaleIp();
  ensureAssets();
  const build = await buildApp(checkout, { skipIfFresh: !forceBuild });
  log(`app ${build.sha.slice(0, 7)} (${build.branch}) → ${build.binary}`);
  await startXvfb(DISPLAY);

  const fixture = buildFixture(SCRATCH, { log });
  const seeded = seedPhoneFixture(fixture, { turns, checkout });
  const app = await launchApp({ binary: build.binary, appDir: build.appDir, fixture, cdpPort: APP_CDP_PORT, display: DISPLAY });
  let proxy;
  try {
    log('app is up; opening the long conversation…');
    const prep = await prepareConversation(app.cdp, seeded, { turns, glyphLines: GLYPH_LINES });
    log(`desktop shows ${prep.desktopEntries} entries (${prep.expectedEntries} on disk); waiting for remote access on ${host}:${REMOTE_PORT}`);
    await waitTcp(host, REMOTE_PORT);
    proxy = await createShapedProxy({ target: { host, port: REMOTE_PORT }, rttMs, downMbit, upMbit });

    const runs = [];
    for (let i = 0; i < repeats; i++) {
      const legs = await oneRepeat({ proxy, logPath: seeded.logPath });
      runs.push(legs);
      log(`repeat ${i + 1}/${repeats}: cold drawn ${legs.cold.marks.drawn} ms, reopen ${legs.reopen.marks.drawn} ms, revisit ${legs.revisit.marks.drawn} ms, reconnect ${legs.reconnect.marks.drawn} ms, resume ${legs.resume.marks['waited after waking'] ?? '?'}+${legs.resume.marks.drawn} ms`);
    }
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const report = {
      meta: {
        stamp, label: label ?? null, rttMs, downMbit, upMbit, turns, glyphLines: GLYPH_LINES, repeats,
        appSha: build.sha, appBranch: build.branch, appDirty: build.dirty, desktopEntries: prep.desktopEntries,
        bandwidthNote: 'ASSUMED mobile profile, not measured on a real phone',
        notes: [
          'One app boot serves all repeats; each repeat uses a new Chrome profile, so each cold open really is cold. The first cold open also pays the app\'s first-ever conversation answer.',
          'Reopen is Page.reload with the cache allowed (saved key, cached code). A phone tab revisited without a reload may be faster.',
          'Reconnect = the proxy closes every connection at once. The page marks count from the new connection; the rig wall clock also includes the page noticing the drop and its retry wait. A reconnect asks only for what it missed, so its conversation answer is ~0 KB.',
          'Resume = the page hidden and the link silent (nothing, not even a close, crosses it) for 75 s, then shown again. "Waited after waking" is the time before the new connection began (the page deciding the old one is dead); the other marks count from that connection.',
          'Not modelled: packet loss, jitter, TCP slow start. The server side is not slowed, only what crosses the link.',
        ],
      },
      runs, summary: buildSummary(runs),
    };
    mkdirSync(outDir, { recursive: true });
    const base = join(outDir, `${stamp}-${build.sha.slice(0, 7)}-phone${label ? `-${label}` : ''}`);
    writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
    writeFileSync(`${base}.md`, renderMarkdown(report));
    log(`wrote ${base}.json and .md`);
    return { report, base };
  } finally {
    try { await proxy?.close(); } catch {}
    await app.kill();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const { report, base } = await runPhoneScenario({
    checkout: resolve(opt('checkout', join(ROOT, 'youcoded'))),
    repeats: Number(opt('repeats', 3)), rttMs: Number(opt('rtt', 470)),
    downMbit: Number(opt('down-mbit', 5)), upMbit: Number(opt('up-mbit', 2)),
    turns: Number(opt('turns', 300)), label: opt('label', undefined),
    outDir: resolve(opt('out', join(ROOT, 'perf-reports'))), forceBuild: a.includes('--force-build'),
  });
  console.log(readFileSync(`${base}.md`, 'utf8'));
}
