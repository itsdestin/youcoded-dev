#!/usr/bin/env node
// scripts/perf-lab/history-gen.mjs — a GENERATED chat history the size of a real, heavily used machine.
//
// WHY (2026-11-28, remote realistic perf lane): the lab used to run on ~600 tiny files and said "nothing slow" while the
// real app froze thousands of times. Costs that scale with how MANY files sit in the history (the folder scan at launch and
// on a timer, the Resume list) only show up at real size. This builds that size WITHOUT copying a single private chat:
// every byte is filler produced by content.mjs (code blocks, tool calls, long and short replies, in realistic proportions).
//
// What it writes, inside a target HOME (never anywhere else):
//   <home>/.claude/projects/<slug>/<id>.jsonl      Claude Code transcripts (the formats the app's session browser parses)
//   <home>/.youcoded/sessions/<slug>/<id>.jsonl    the app's own (native) session files
//   <home>/projects/proj-NNN/                      one real, empty folder per project (cwd of its sessions)
// Defaults mirror the owner's Z13: 136 project folders, ~1,800 session files, ~870 MB. Only those three COUNTS were taken
// from the real machine, never names or content.
//
// DETERMINISTIC: same options + same seed give byte-identical files (paths and bytes). File modified-times are the one thing
// relative to "now" (so "3 days ago" labels read the same run to run) and are NOT part of the bytes.
//
// SAFETY: refuses a target that is, contains, or sits inside the real home's app/Claude folders. It only ever creates files
// below the target and never reads any existing history.
//
// Usage: node scripts/perf-lab/history-gen.mjs --home <dir> [--projects 136] [--sessions 1800] [--target-mb 870] [--seed s] [--manifest <file>]
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { mkdirSync, utimesSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ccProjectSlug, nativeStoreSlug, nativeSessionLines, stableUuid } from './fixture.mjs';
import { realisticTranscriptLines } from './content.mjs';
import { rng } from './realism-stats.mjs';
import { FAKE_MODEL_ID, FAKE_PROVIDER_ID } from './fake-provider.mjs';

export const DEFAULTS = Object.freeze({
  projects: 136,
  sessions: 1800,
  targetMB: 870,
  // Share of the session files that are the app's own (native) sessions, and the share of BYTES they hold. Native files are
  // many and small; the Claude Code transcripts carry the bulk, as on the real machine.
  nativeShare: 0.15,
  nativeByteShare: 0.04,
  // log-normal spread of file sizes: most files small, a long tail of very large ones.
  sigma: 1.4,
  // No single transcript larger than this many turns (~10 KB each): keeps one outlier from eating the whole byte budget.
  maxTurns: 6000,
  seed: 'perf-lab-lane-v1',
  // Fixed epoch for the TEXT inside the files (so bytes never depend on the day it was generated).
  baseTime: Date.UTC(2026, 10, 1),
});

const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
const pad = (n, w = 3) => String(n).padStart(w, '0');

/** Refuse any target that could land in the owner's real app or Claude state. Pure given `realHome`. */
export function assertSafeTargetHome(home, realHome = resolve(process.env.HOME || homedir())) {
  const h = resolve(home);
  if (h === realHome || realHome.startsWith(h + sep)) throw new Error(`history-gen: refusing ${h}: it is the real home or contains it`);
  const bad = ['.claude', '.youcoded', join('.config', 'youcoded')];
  for (const b of bad) {
    const real = join(realHome, b);
    if (h === real || h.startsWith(real + sep)) throw new Error(`history-gen: refusing ${h}: it is inside the real ${b} folder`);
    if (h.split(sep).includes(b.split(sep)[0]) && b === '.claude') throw new Error(`history-gen: refusing ${h}: path contains a .claude segment`);
  }
  return h;
}

function resolveOptions(opts = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  for (const k of ['projects', 'sessions', 'maxTurns']) {
    if (!Number.isSafeInteger(o[k]) || o[k] < 1) throw new Error(`history-gen: ${k} must be a whole number >= 1 (got ${o[k]})`);
  }
  if (!(o.targetMB > 0)) throw new Error('history-gen: targetMB must be > 0');
  if (o.sessions < o.projects) throw new Error('history-gen: need at least one session per project');
  return o;
}

/** Spread `total` turns over the weights, each file between 1 and `max`, re-sharing what clamping freed (a few passes converge). */
export function allocateTurns(weights, total, max) {
  const n = weights.length;
  const turns = new Array(n).fill(0);
  let free = weights.map((_, i) => i);
  let remaining = Math.max(total, n);
  for (let pass = 0; pass < 8 && free.length; pass++) {
    const wsum = free.reduce((a, i) => a + weights[i], 0);
    let changed = false;
    const next = [];
    for (const i of free) {
      const t = (weights[i] / wsum) * remaining;
      if (t < 1) { turns[i] = 1; remaining -= 1; changed = true; } else if (t > max) { turns[i] = max; remaining -= max; changed = true; } else next.push(i);
    }
    if (!changed) { for (const i of next) turns[i] = Math.max(1, Math.round((weights[i] / wsum) * remaining)); return turns; }
    free = next;
  }
  for (const i of free) turns[i] = Math.max(1, Math.min(max, Math.round(remaining / Math.max(1, free.length))));
  return turns;
}

/**
 * PURE plan: which files exist, which project each belongs to and how many turns each holds. `bytesPerTurn` is
 * { cc, native } so the byte target converts to turns (calibrate() measures it from the real generators).
 */
export function planHistory(options = {}, bytesPerTurn) {
  const o = resolveOptions(options);
  if (!bytesPerTurn?.cc > 0 || !bytesPerTurn?.native > 0) throw new Error('history-gen: planHistory needs bytesPerTurn { cc, native }');
  const r = rng(`${o.seed}:plan`);
  const nNative = Math.min(o.sessions - o.projects, Math.round(o.sessions * o.nativeShare));
  const nCc = o.sessions - nNative;
  const totalBytes = o.targetMB * 1048576;
  // Projects: the first `projects` Claude Code files give every project one; the rest follow a Zipf-like pattern (a few busy projects).
  const zipf = Array.from({ length: o.projects }, (_, k) => 1 / Math.pow(k + 1, 0.9));
  const zsum = zipf.reduce((a, b) => a + b, 0);
  const pickProject = () => { let x = r() * zsum; for (let k = 0; k < o.projects; k++) { x -= zipf[k]; if (x <= 0) return k; } return o.projects - 1; };
  const files = [];
  for (let i = 0; i < nCc; i++) files.push({ kind: 'cc', index: i, project: i < o.projects ? i : pickProject() });
  for (let i = 0; i < nNative; i++) files.push({ kind: 'native', index: i, project: pickProject() });
  const weights = files.map(() => Math.exp(o.sigma * gauss(r)));
  const ccIdx = files.map((f, i) => (f.kind === 'cc' ? i : -1)).filter((i) => i >= 0);
  const nvIdx = files.map((f, i) => (f.kind === 'native' ? i : -1)).filter((i) => i >= 0);
  const ccTurns = allocateTurns(ccIdx.map((i) => weights[i]), (totalBytes * (1 - o.nativeByteShare)) / bytesPerTurn.cc, o.maxTurns);
  const nvTurns = nvIdx.length ? allocateTurns(nvIdx.map((i) => weights[i]), (totalBytes * o.nativeByteShare) / bytesPerTurn.native, Math.min(o.maxTurns, 400)) : [];
  ccIdx.forEach((fi, k) => { files[fi].turns = ccTurns[k]; });
  nvIdx.forEach((fi, k) => { files[fi].turns = nvTurns[k]; });
  for (const f of files) { f.ageDays = Math.round(Math.pow(r(), 2) * 900) / 10; f.id = stableUuid(`${o.seed}:${f.kind}:${f.index}`); }
  return { options: o, files, projects: o.projects, plannedBytes: files.reduce((a, f) => a + f.turns * (f.kind === 'cc' ? bytesPerTurn.cc : bytesPerTurn.native), 0) };
}

const projectCwd = (home, k) => join(home, 'projects', `proj-${pad(k + 1)}`);
const nativeBinding = Object.freeze({ providerId: FAKE_PROVIDER_ID, modelId: FAKE_MODEL_ID });

function ccBody(o, f, cwd) {
  return realisticTranscriptLines({ sessionId: f.id, cwd, turns: f.turns, startedAt: o.baseTime + f.index * 3_600_000, seed: `${o.seed}:${f.id}` });
}
function nativeBody(o, f, cwd) {
  return nativeSessionLines({ sessionId: f.id, cwd, turns: f.turns, startedAt: o.baseTime + f.index * 3_600_000, binding: nativeBinding, seed: `${o.seed}:${f.id}` });
}

/** Measure bytes per turn from the real generators on a fixed sample (deterministic), so the byte target is honest. */
export function calibrate(options = {}) {
  const o = resolveOptions(options);
  const cwd = '/calibration/proj';
  const sample = 400;
  const cc = Buffer.byteLength(ccBody(o, { id: stableUuid(`${o.seed}:calib`), turns: sample, index: 0 }, cwd).join('\n') + '\n') / sample;
  const nvSample = 100;
  const nv = Buffer.byteLength(nativeBody(o, { id: stableUuid(`${o.seed}:calib-n`), turns: nvSample, index: 0 }, cwd).join('\n') + '\n') / nvSample;
  return { cc, native: nv };
}

/**
 * Write the whole history under `home`. Returns a manifest of every file (kind, project, cwd, id, path, turns, bytes, ageDays)
 * plus totals. `now` only sets modified-times.
 */
export function generateHistory(home, options = {}, { now = Date.now(), bytesPerTurn = calibrate(options), log = () => {} } = {}) {
  const target = assertSafeTargetHome(home);
  const plan = planHistory(options, bytesPerTurn);
  const o = plan.options;
  const manifestFiles = [];
  for (let k = 0; k < o.projects; k++) mkdirSync(projectCwd(target, k), { recursive: true });
  let bytes = 0;
  for (const f of plan.files) {
    const cwd = projectCwd(target, f.project);
    const dir = f.kind === 'cc' ? join(target, '.claude', 'projects', ccProjectSlug(cwd)) : join(target, '.youcoded', 'sessions', nativeStoreSlug(cwd));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${f.id}.jsonl`);
    writeFileSync(path, `${(f.kind === 'cc' ? ccBody(o, f, cwd) : nativeBody(o, f, cwd)).join('\n')}\n`);
    const size = statSync(path).size;
    const mtime = new Date(now - f.ageDays * 86_400_000);
    utimesSync(path, mtime, mtime);
    bytes += size;
    manifestFiles.push({ kind: f.kind, project: f.project, cwd, id: f.id, path, turns: f.turns, bytes: size, ageDays: f.ageDays });
  }
  log(`history-gen: ${manifestFiles.length} files, ${(bytes / 1048576).toFixed(0)} MB, ${o.projects} projects`);
  return {
    seed: o.seed,
    options: o,
    files: manifestFiles,
    totals: {
      files: manifestFiles.length, projects: o.projects, bytes,
      ccFiles: manifestFiles.filter((f) => f.kind === 'cc').length,
      nativeFiles: manifestFiles.filter((f) => f.kind === 'native').length,
      targetBytes: o.targetMB * 1048576,
    },
  };
}

/**
 * Choose `count` Claude Code sessions to open in the app: mid-sized files (big enough to be real, small enough to open fast),
 * spread across the size range and across projects, in a fixed order. Pure.
 */
export function pickLaneSessions(manifest, count, { minBytes = 150_000, maxBytes = 12_000_000, seed = 'lane-pick' } = {}) {
  const eligible = manifest.files.filter((f) => f.kind === 'cc' && f.bytes >= minBytes && f.bytes <= maxBytes).sort((a, b) => a.bytes - b.bytes || (a.id < b.id ? -1 : 1));
  if (eligible.length < count) throw new Error(`history-gen: only ${eligible.length} Claude Code files between ${minBytes} and ${maxBytes} bytes; need ${count}. Generate a larger history.`);
  const r = rng(seed);
  const picks = [];
  const seenProjects = new Set();
  // Evenly spaced through the size-ordered list, taking the first unused project at or after each point.
  for (let k = 0; k < count; k++) {
    let i = Math.floor(((k + 0.5) / count) * eligible.length);
    for (let step = 0; step < eligible.length; step++) {
      const c = eligible[(i + step) % eligible.length];
      if (!picks.includes(c) && (!seenProjects.has(c.project) || step > eligible.length / 2)) { picks.push(c); seenProjects.add(c.project); break; }
    }
  }
  // Fixed shuffle so the strip order is not size-sorted (a person's strip is in the order they opened chats).
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
  return picks;
}

/**
 * Fixture settings that keep the test app inside the fixture: set up as finished, no sync, no remote-access server,
 * automatic update install off. The app has no sync configured unless a config file says so (real-scale-startup.mjs relies on
 * the same absence). Returns the extra environment the launcher must carry (analytics off).
 */
export function writeFixtureSettings(home) {
  const target = assertSafeTargetHome(home);
  const put = (rel, obj) => { const p = join(target, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj)); };
  put('.claude/toolkit-state/config.json', { setup_completed: true });
  put('.claude/settings.json', {});
  put('.claude/youcoded-remote.json', { enabled: false, port: 10000, passwordHash: null, trustTailscale: false, keepAwakeHours: 0, everPaired: false });
  // Merge into config.json if buildFixture already wrote one (engine section), else create it.
  const cfgPath = join(target, '.youcoded', 'config.json');
  let cfg = { v: 1 };
  try { if (existsSync(cfgPath)) cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { cfg = { v: 1 }; }
  cfg.updates = { ...(cfg.updates ?? {}), autoInstall: false };
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(cfg));
  return { env: { YOUCODED_NO_ANALYTICS: '1' }, settings: { sync: 'none configured', remoteAccess: 'off', autoInstall: false, analytics: 'off (env)' } };
}

/** Count files and bytes below `dir` (used by tests and the CLI's closing line). */
export function measureTree(dir) {
  let files = 0, bytes = 0;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += statSync(p).size; } } };
  if (existsSync(dir)) walk(dir);
  return { files, bytes };
}

function parseArgs(argv) {
  const a = { home: null, manifest: null };
  const num = new Set(['projects', 'sessions', 'target-mb', 'max-turns']);
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k?.startsWith('--') || argv[i + 1] === undefined) throw new Error(`history-gen: bad argument ${k}`);
    const name = k.slice(2);
    const key = name === 'target-mb' ? 'targetMB' : name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (name === 'home' || name === 'manifest' || name === 'seed') a[key] = argv[i + 1];
    else if (num.has(name)) a[key] = Number(argv[i + 1]);
    else throw new Error(`history-gen: unknown option ${k}`);
  }
  if (!a.home) throw new Error('history-gen: --home <dir> is required');
  return a;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { home, manifest: manifestPath, ...opts } = parseArgs(process.argv.slice(2));
    const m = generateHistory(resolve(home), opts, { log: (s) => console.error(s) });
    if (manifestPath) writeFileSync(resolve(manifestPath), JSON.stringify(m, null, 2));
    console.log(JSON.stringify(m.totals));
  } catch (e) { console.error(String(e.message ?? e)); process.exitCode = 2; }
}
