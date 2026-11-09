#!/usr/bin/env node
// scripts/perf-lab/queue.mjs — run a list of lab invocations, one at a time, while the owner is away.
//
//   node scripts/perf-lab/queue.mjs <queue.json> [--until HH:MM] [--quiet-wait-hours N] [--out <dir>] [--stamp S] [--dry-run]
//
// WHY (owner decision Q-6, 2026-10-21): official measurements must not be skewed by other programs, and the owner's own
// live YouCoded/Claude sessions count as interference. So official runs happen UNATTENDED, each one waiting (through
// run.mjs's own quiet-machine gate) for a genuinely quiet machine. Thresholds are NOT loosened here; this file only
// sequences runs, gives each a long quiet-wait bound, and records honestly what happened to each.
//
// QUEUE FILE: { "name": "...", "notes": "...", "items": [ { "label": "...", "tool": "run"|"ab", "argv": [...],
//   "timeoutMinutes": N, "measureMinutes": N? } ] }
//   - argv is exactly what run.mjs / ab.mjs take (minus --max-minutes and --max-quiet-wait-minutes: the queue owns both).
//   - timeoutMinutes is a HARD wall-clock cap for the whole item, quiet-machine waiting included.
//   - measureMinutes (default 90) is the per-run measurement budget handed to --max-minutes.
//   The per-run quiet wait handed to --max-quiet-wait-minutes is min(--quiet-wait-hours, what the hard cap leaves after
//   the measurement budget), so the wait can never push an item past its cap.
//
// GUARANTEES: strictly one item at a time; an item that cannot finish by --until (now + timeoutMinutes) is never started
// (status skipped-deadline); a child past its cap is stopped by exact pid (SIGTERM, then SIGKILL after a grace period);
// before every item the lab fixture HOME is checked for leftover app processes and, if any remain, the queue STOPS
// instead of measuring on top of them. One queue at a time (queue.lock, via run-lock.mjs). It never touches the live app.
//
// LAUNCHING DETACHED (so it survives the terminal/session closing) — run once, then walk away:
//   systemd-run --user --unit perf-lab-queue-$(date +%Y%m%d-%H%M) --working-directory=<worktree root> \
//     --property=KillMode=process --property=TimeoutStopSec=120 \
//     node scripts/perf-lab/queue.mjs scripts/perf-lab/queues/overnight.example.json --until 07:00 --quiet-wait-hours 6
//   follow:  journalctl --user -u perf-lab-queue-<stamp> -f     stop:  systemctl --user stop perf-lab-queue-<stamp>
//   (KillMode=process: stopping the unit signals only this node process, which then stops its own child by pid.)
// Results: perf-reports/queue/<stamp>/queue-summary.md and .json (rewritten after every item), one log per item beside it.
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { acquireRunLock } from './run-lock.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const QUEUE_SCRATCH = join(ROOT, 'scratch', 'perf-lab');
// run.mjs's EXIT.INCOMPLETE; duplicated (not imported) so this runner and its tests load none of the lab runtime.
const EXIT_INCOMPLETE = 4;
export const STATUS = Object.freeze({
  measured: 'measured', disturbed: 'incomplete-disturbed', neverQuiet: 'never-quiet', skippedDeadline: 'skipped-deadline',
  failed: 'failed', incompleteOther: 'incomplete-other', haltedSkip: 'skipped-halted',
});
const OWNED_FLAGS = ['--max-minutes', '--max-quiet-wait-minutes'];
const KILL_GRACE_MS = 60_000;

// ── parsing / planning (pure) ────────────────────────────────────────────────

export function parseQueueArgs(argv) {
  const out = { file: null, until: null, quietWaitHours: 6, outDir: join(ROOT, 'perf-reports', 'queue'), stamp: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--dry-run') { out.dryRun = true; continue; }
    if (['--until', '--quiet-wait-hours', '--out', '--stamp'].includes(t)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`queue: ${t} needs a value`);
      if (t === '--until') { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('queue: --until must be HH:MM (24-hour, local time)'); out.until = v; }
      else if (t === '--quiet-wait-hours') { const n = Number(v); if (!(n > 0 && n <= 48)) throw new Error('queue: --quiet-wait-hours must be a number in (0, 48]'); out.quietWaitHours = n; }
      else if (t === '--out') out.outDir = resolve(v);
      else { if (!/^[\w-]{1,64}$/.test(v)) throw new Error('queue: --stamp may contain only letters, digits, - and _'); out.stamp = v; }
      continue;
    }
    if (t.startsWith('--')) throw new Error(`queue: unknown option ${t}`);
    if (out.file) throw new Error(`queue: unexpected extra argument ${JSON.stringify(t)}`);
    out.file = resolve(t);
  }
  if (!out.file) throw new Error('queue: a queue JSON file is required');
  return out;
}

/** Validate a parsed queue file. Throws a plain sentence on the first problem so nothing starts half-understood. */
export function validateQueue(queue) {
  if (!queue || typeof queue !== 'object' || !Array.isArray(queue.items) || !queue.items.length) throw new Error('queue: the file needs a non-empty "items" array');
  queue.items.forEach((it, i) => {
    const where = `queue item ${i + 1}${it?.label ? ` (${it.label})` : ''}`;
    if (typeof it?.label !== 'string' || !it.label.trim()) throw new Error(`${where}: "label" is required`);
    if (!['run', 'ab'].includes(it.tool)) throw new Error(`${where}: "tool" must be "run" or "ab"`);
    if (!Array.isArray(it.argv) || it.argv.some((a) => typeof a !== 'string')) throw new Error(`${where}: "argv" must be an array of strings`);
    const owned = it.argv.filter((a) => OWNED_FLAGS.includes(a));
    if (owned.length) throw new Error(`${where}: argv must not contain ${owned.join(', ')} — the queue sets them from timeoutMinutes / --quiet-wait-hours`);
    if (!(Number.isFinite(it.timeoutMinutes) && it.timeoutMinutes >= 5)) throw new Error(`${where}: "timeoutMinutes" (hard cap, quiet waiting included) is required and must be >= 5`);
    if (it.measureMinutes !== undefined && !(Number.isInteger(it.measureMinutes) && it.measureMinutes >= 1)) throw new Error(`${where}: "measureMinutes" must be a whole number >= 1`);
  });
  return queue;
}

/** The exact argv and budgets each item will run with. Throws if an item's cap leaves no room to wait. */
export function planItem(item, { quietWaitHours }) {
  const runs = item.tool === 'ab' ? (item.argv.includes('--repeat-a') ? 3 : 2) : 1;
  const measure = item.measureMinutes ?? 90;
  const room = Math.floor((item.timeoutMinutes - runs * measure) / runs);
  const quietWaitMinutes = Math.min(Math.round(quietWaitHours * 60), room);
  if (quietWaitMinutes < 1) throw new Error(`queue item ${item.label}: timeoutMinutes ${item.timeoutMinutes} leaves no time to wait for a quiet machine after ${runs} run(s) of ${measure} min; raise timeoutMinutes or lower measureMinutes`);
  return { runs, measureMinutes: measure, quietWaitMinutes, argv: [...item.argv, '--max-minutes', String(measure), '--max-quiet-wait-minutes', String(quietWaitMinutes)] };
}

/** Next occurrence of local HH:MM strictly after `now`, as epoch ms; null when no deadline. */
export function resolveDeadline(until, now) {
  if (!until) return null;
  const [h, m] = until.split(':').map(Number);
  const d = new Date(now); d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function describePlan(queue, opts, now) {
  const deadline = resolveDeadline(opts.until, now);
  const lines = [`perf-lab queue — dry run, nothing launched`, '',
    `  queue file        ${opts.file}${queue.name ? `  (${queue.name})` : ''}`,
    `  deadline          ${deadline ? `${new Date(deadline).toString()} (items that cannot finish by then are skipped, never started)` : 'none'}`,
    `  quiet-wait bound  up to ${opts.quietWaitHours} h per run, shortened where an item's hard cap leaves less`,
    `  output            ${opts.outDir}/<stamp>/queue-summary.md + .json`,
    `  lock              ${join(QUEUE_SCRATCH, 'queue.lock')} (a second queue is refused)`,
    `  between items     the lab fixture HOME ${join(QUEUE_SCRATCH, 'home')} is checked for leftover app processes; any => the queue stops`, ''];
  let cursor = now;
  queue.items.forEach((it, i) => {
    const p = planItem(it, opts);
    const fits = deadline === null || cursor + it.timeoutMinutes * 60_000 <= deadline;
    lines.push(`  ${i + 1}. ${it.label}`,
      `       command      node scripts/perf-lab/${it.tool}.mjs ${p.argv.join(' ')}`,
      `       hard cap     ${it.timeoutMinutes} min total (measure ${p.measureMinutes} min x ${p.runs} run(s); quiet wait up to ${p.quietWaitMinutes} min per run)`,
      `       worst case   ends by ${new Date(cursor + it.timeoutMinutes * 60_000).toString()} if it starts right after the previous worst case${fits ? '' : '  — WOULD BE SKIPPED (past the deadline)'}`);
    if (it.notes) lines.push(`       notes        ${it.notes}`);
    if (fits) cursor += it.timeoutMinutes * 60_000;
  });
  if (queue.notes) lines.push('', `  queue notes: ${queue.notes}`);
  return lines.join('\n');
}

// ── classification (pure) ────────────────────────────────────────────────────

/** Report paths a run/ab printed. run.mjs prints the report .json path; ab prints "comparison directory: <dir>". */
export function extractOutputs(logText) {
  const lines = String(logText).split('\n').map((l) => l.trim()).filter(Boolean);
  const reports = lines.filter((l) => /^\/.*\.json$/.test(l));
  const dir = lines.map((l) => /^comparison directory: (.+)$/.exec(l)?.[1]).filter(Boolean).pop() ?? null;
  return { reports, comparisonDir: dir };
}

/** Plain-words status from the exit code and the reports the item wrote. */
export function classify({ code, timedOut, timeoutMinutes, reports, comparison = null, tail = '' }) {
  const base = { reports: reports.map((r) => r.path), offenders: [], reasons: [] };
  if (timedOut) return { ...base, status: STATUS.failed, reason: `stopped after the ${timeoutMinutes}-minute hard cap` };
  const quiet = reports.find((r) => r.json?.noise?.neverQuiet);
  if (quiet) { const n = quiet.json.noise.neverQuiet; return { ...base, status: STATUS.neverQuiet, reason: `machine never became quiet: load ${n.load}, ${n.busyPct}% cpu after ${n.waitedS} s`, offenders: n.blockedBy ? [n.blockedBy] : [] }; }
  const offenders = [], reasons = [];
  let disturbed = false;
  for (const { json } of reports) {
    for (const w of json?.interference?.windows ?? []) if (w.verdict !== 'clean') { disturbed = true; reasons.push(`${w.label}: ${w.verdict}`); for (const o of w.offenders ?? []) offenders.push(`${o.name}${o.pids ? ` (pid ${o.pids.join(',')})` : ''}`); }
    const e = json?.energy;
    if (e && e.status !== 'measured') {
      reasons.push(`energy ${e.status}: ${e.reason ?? ''}`);
      if (e.excluded?.length) { disturbed = true; for (const x of e.excluded) for (const v of (e.repeats ?? []).find((t) => t.index === x.repeat)?.verdicts ?? []) for (const o of v.offenders ?? []) offenders.push(o.name); }
    }
    for (const p of json?.incomplete ?? []) reasons.push(p);
  }
  const uniqueOffenders = [...new Set(offenders)];
  if (comparison && comparison.comparability?.comparable === false) reasons.push(...(comparison.comparability.reasons ?? []).slice(0, 5));
  const incomplete = code === EXIT_INCOMPLETE || reasons.length > 0;
  if (code !== 0 && code !== EXIT_INCOMPLETE) return { ...base, status: STATUS.failed, reason: `exit code ${code}${tail ? `: ${tail.trim().split('\n').slice(-3).join(' | ').slice(0, 400)}` : ''}`, offenders: uniqueOffenders };
  if (!incomplete) return { ...base, status: STATUS.measured, reason: '', offenders: [] };
  return { ...base, status: disturbed ? STATUS.disturbed : STATUS.incompleteOther, reason: [...new Set(reasons)].slice(0, 6).join('; ') || 'run reported INCOMPLETE', offenders: uniqueOffenders };
}

export function renderSummary(s) {
  const lines = [`# Perf-lab queue ${s.stamp}`, '',
    `State: **${s.state}**${s.haltedBecause ? ` — ${s.haltedBecause}` : ''}`,
    `Queue file: ${s.queueFile}${s.name ? ` (${s.name})` : ''}`,
    `Started ${s.startedAt}${s.finishedAt ? `, finished ${s.finishedAt}` : ''}${s.deadline ? `; deadline ${s.deadline}` : ''}; quiet-wait up to ${s.quietWaitHours} h per run`, '',
    '| # | Item | Status | Detail | Reports |', '|---|---|---|---|---|'];
  s.items.forEach((it, i) => lines.push(`| ${i + 1} | ${it.label} | **${it.status}** | ${[it.reason, it.offenders?.length ? `named: ${it.offenders.join(', ')}` : ''].filter(Boolean).join(' — ').replace(/\|/g, '/')} | ${[...(it.reports ?? []), ...(it.comparison ? [it.comparison] : [])].join('<br>') || '—'} |`));
  lines.push('', 'Statuses: measured = clean numbers; incomplete-disturbed = another program interfered (named); never-quiet = the machine never went quiet within the wait; skipped-deadline = could not finish before the deadline; failed = crashed, errored or hit its hard cap.', '');
  return lines.join('\n');
}

// ── the runner ───────────────────────────────────────────────────────────────

/** Spawn one child with output to a log file; resolves when it exits or after the hard cap (stopped by exact pid). */
export function runChild({ args, logPath, timeoutMs, onSpawn = () => {}, spawnFn = spawn, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return new Promise((resolveDone) => {
    const fd = openSync(logPath, 'a');
    const child = spawnFn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    onSpawn(child);
    let timedOut = false, killTimer = null;
    const cap = setTimer(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimer(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, KILL_GRACE_MS);
    }, timeoutMs);
    child.once('error', (e) => { clearTimer(cap); if (killTimer) clearTimer(killTimer); resolveDone({ code: null, timedOut, spawnError: e.message }); });
    child.once('exit', (code, signal) => { clearTimer(cap); if (killTimer) clearTimer(killTimer); resolveDone({ code, signal, timedOut }); });
  });
}

const iso = (ms) => new Date(ms).toISOString();

export async function runQueue(opts, queue, deps = {}) {
  const now = deps.now ?? Date.now;
  const stamp = opts.stamp ?? iso(now()).replace(/[-:]/g, '').slice(0, 13);
  const dir = join(opts.outDir, stamp);
  const mk = deps.mkdir ?? ((d) => mkdirSync(d, { recursive: true }));
  const readText = deps.readText ?? ((p) => readFileSync(p, 'utf8'));
  const readJson = deps.readJson ?? ((p) => JSON.parse(readFileSync(p, 'utf8')));
  const listDir = deps.listDir ?? ((p) => readdirSync(p));
  const writeAtomic = deps.writeAtomic ?? ((p, text) => { const t = `${p}.tmp`; writeFileSync(t, text); renameSync(t, p); });
  const leftovers = deps.leftovers ?? defaultLeftovers;
  const execute = deps.runChild ?? runChild;
  const log = deps.log ?? ((m) => console.log(m));
  const deadline = resolveDeadline(opts.until, now());
  mk(dir);
  const summary = { stamp, queueFile: opts.file, name: queue.name ?? null, state: 'running', startedAt: iso(now()), finishedAt: null, deadline: deadline ? iso(deadline) : null, quietWaitHours: opts.quietWaitHours, haltedBecause: null,
    items: queue.items.map((it) => ({ label: it.label, tool: it.tool, status: 'pending', reason: '', reports: [], offenders: [] })) };
  const save = () => { writeAtomic(join(dir, 'queue-summary.json'), JSON.stringify(summary, null, 2)); writeAtomic(join(dir, 'queue-summary.md'), renderSummary(summary)); };
  save();
  let stopRequested = false, current = null;
  deps.registerStop?.(() => { stopRequested = true; try { current?.kill('SIGTERM'); } catch { /* gone */ } });

  for (let i = 0; i < queue.items.length; i++) {
    const item = queue.items[i], row = summary.items[i];
    if (summary.haltedBecause || stopRequested) { Object.assign(row, { status: STATUS.haltedSkip, reason: summary.haltedBecause ?? 'queue was stopped' }); continue; }
    // Never start an item that cannot finish by the deadline; later (shorter) items are still considered.
    if (deadline !== null && now() + item.timeoutMinutes * 60_000 > deadline) {
      Object.assign(row, { status: STATUS.skippedDeadline, reason: `needs up to ${item.timeoutMinutes} min but only ${Math.max(0, Math.floor((deadline - now()) / 60_000))} min remain before ${iso(deadline)}` });
      save(); continue;
    }
    // Leftover owned app processes would be measured on top of: stop rather than continue.
    const left = await leftovers();
    if (left.length) {
      summary.haltedBecause = `lab app processes (pids ${left.join(', ')}) were still running before "${item.label}"; stopped the queue rather than measure on top of them`;
      Object.assign(row, { status: STATUS.haltedSkip, reason: summary.haltedBecause }); save(); continue;
    }
    const plan = planItem(item, opts);
    const logPath = join(dir, `${String(i + 1).padStart(2, '0')}-${item.label.replace(/[^\w.-]+/g, '-').slice(0, 40)}.log`);
    row.status = 'running'; row.startedAt = iso(now()); row.log = logPath; save();
    log(`[queue] ${i + 1}/${queue.items.length} ${item.label}: starting (hard cap ${item.timeoutMinutes} min)`);
    const result = await execute({ args: [join(ROOT, 'scripts', 'perf-lab', `${item.tool}.mjs`), ...plan.argv], logPath, timeoutMs: item.timeoutMinutes * 60_000, onSpawn: (c) => { current = c; } });
    current = null;
    row.endedAt = iso(now()); row.exitCode = result.code;
    let text = ''; try { text = readText(logPath); } catch { /* no log */ }
    const out = extractOutputs(text);
    const reports = [];
    const load = (path) => { try { reports.push({ path, json: readJson(path) }); } catch { reports.push({ path, json: null }); } };
    out.reports.forEach(load);
    let comparison = null;
    if (out.comparisonDir) {
      try {
        for (const f of listDir(out.comparisonDir).sort()) if (f.endsWith('.json') && f !== 'comparison.json' && !out.reports.includes(join(out.comparisonDir, f))) load(join(out.comparisonDir, f));
        comparison = readJson(join(out.comparisonDir, 'comparison.json')); row.comparison = join(out.comparisonDir, 'comparison.md');
      } catch { /* comparison not written */ }
    }
    const verdict = result.spawnError ? { status: STATUS.failed, reason: `could not start: ${result.spawnError}`, reports: [], offenders: [] }
      : classify({ code: result.code, timedOut: result.timedOut, timeoutMinutes: item.timeoutMinutes, reports, comparison, tail: text.slice(-1500) });
    Object.assign(row, verdict);
    log(`[queue] ${item.label}: ${row.status}${row.reason ? ` — ${row.reason}` : ''}`);
    if (stopRequested) summary.haltedBecause = 'queue was stopped by a signal';
    save();
  }
  // A final look: an item that left processes behind should be visible in the summary even when nothing follows it.
  try { const left = await leftovers(); if (left.length && !summary.haltedBecause) summary.haltedBecause = `lab app processes (pids ${left.join(', ')}) were still running after the last item`; } catch { /* check unavailable */ }
  summary.state = summary.haltedBecause ? 'halted' : 'finished';
  summary.finishedAt = iso(now());
  save();
  return summary;
}

/** Lab fixture-HOME family still alive (read-only listing; nothing is signalled). */
async function defaultLeftovers() {
  const { killableFamily, assertSafeNeedles } = await import('./launch.mjs');
  const needles = [join(QUEUE_SCRATCH, 'home')];
  assertSafeNeedles(needles);
  return killableFamily(needles).pids;
}

export async function main(argv, deps = {}) {
  let opts, queue;
  try {
    opts = parseQueueArgs(argv);
    queue = validateQueue(JSON.parse(readFileSync(opts.file, 'utf8')));
    queue.items.forEach((it) => planItem(it, opts));   // fail on an impossible budget before anything starts
  } catch (e) { console.error(e.message); return 2; }
  const now = deps.now ?? Date.now;
  if (opts.dryRun) { console.log(describePlan(queue, opts, now())); return 0; }
  let lock;
  try { lock = (deps.acquireRunLock ?? acquireRunLock)(join(QUEUE_SCRATCH, 'queue.lock'), { label: `queue ${opts.file}` }); }
  catch (e) { console.error(`[queue] ${e.message}`); return 2; }
  let stop = () => {};
  const onSignal = () => stop();
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  try {
    const s = await runQueue(opts, queue, { ...deps, registerStop: (fn) => { stop = fn; } });
    console.log(`[queue] ${s.state}: ${join(opts.outDir, s.stamp, 'queue-summary.md')}`);
    return s.state === 'finished' ? 0 : 3;
  } finally { lock.release(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
