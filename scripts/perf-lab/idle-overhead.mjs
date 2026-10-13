// scripts/perf-lab/idle-overhead.mjs — one private packaged-app boot left ALONE, to price a
// background feature (built for the hitch recorder A/B, 2026-10-05).
//   node scripts/perf-lab/idle-overhead.mjs --checkout <abs app worktree> --out <abs json> [--settle 20] [--seconds 120]
// Run it twice with and without an env switch (e.g. YOUCODED_HITCH_LOG=0) and compare cpuPct
// (whole process family, % of ONE core, summed) and the PSS figures. Xvfb :97 (virtual), fixture
// HOME; never touches the live app. A quiet result means only "nothing periodic in this window".
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture, assetsReady } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { cpuSnapshot, cpuPercent, pssMb } from './procs.mjs';
import { buildBounded, bounded } from './suspects.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const checkout = arg('--checkout', join(ROOT, 'youcoded'));
const out = arg('--out');
const settle = Number(arg('--settle', 20)), seconds = Number(arg('--seconds', 120));
if (!out || !out.startsWith('/')) { console.error('--out <absolute path> required'); process.exit(2); }

const report = { status: 'incomplete', hitchLogEnv: process.env.YOUCODED_HITCH_LOG ?? '(unset)', settle, seconds, loadStart: readFileSync('/proc/loadavg', 'utf8').trim() };
let x, app;
try {
  if (!assetsReady()) throw Error('perf-lab assets not cached');
  const bound = bounded(15);
  const build = await buildBounded(checkout, bound);
  report.build = { sha: build.sha, dirty: build.dirty };
  const fixture = buildFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/idle-fixture-')), { fakeProvider: false, log: () => {} });
  x = await startXvfb(':97');
  app = await launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: x.display, cdpPort: 9578, refuseExisting: true });
  await sleep(settle * 1000);
  const family = app.family();
  const c0 = cpuSnapshot(family), p0 = pssMb(family);
  const t0 = Date.now();
  await sleep(seconds * 1000);
  const c1 = cpuSnapshot(family);
  const secs = (Date.now() - t0) / 1000;
  const cp = cpuPercent(c0, c1, secs);
  report.cpuPct = Math.round(cp.totalPct * 100) / 100;
  // Per process KIND (main/renderer/gpu/utility), so a difference can be pinned on a process.
  const kindOf = (pid) => { try { const c = readFileSync(`/proc/${pid}/cmdline`, 'latin1'); const m = /--type=([a-z-]+)/.exec(c); return m ? m[1] : 'main'; } catch { return 'gone'; } };
  report.cpuPctByKind = {};
  for (const [pid, pct] of cp.perPid) { const k = kindOf(pid); report.cpuPctByKind[k] = Math.round(((report.cpuPctByKind[k] ?? 0) + pct) * 100) / 100; }
  report.pssMbStart = p0; report.pssMbEnd = pssMb(family);
  report.loadEnd = readFileSync('/proc/loadavg', 'utf8').trim();
  const f = join(fixture.userData, 'perf', 'hitches.jsonl');
  report.hitchFile = existsSync(f) ? { bytes: readFileSync(f).length, kinds: Object.fromEntries(Object.entries(readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).reduce((m, l) => { const k = JSON.parse(l).kind; m[k] = (m[k] ?? 0) + 1; return m; }, {}))) } : null;
  report.status = 'measured';
} catch (e) { report.error = String(e.message ?? e); }
finally {
  if (app) await Promise.race([app.kill(), sleep(8000)]).catch(() => {});
  if (x?.proc) x.proc.kill('SIGTERM');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(report.status, out);
}
