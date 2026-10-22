#!/usr/bin/env node
// scripts/perf-lab/ab.mjs — compare two app candidates with ONE command.
//
//   node scripts/perf-lab/ab.mjs --a <checkout> --b <checkout> [--mode quick|full] [--only a,b]
//        [--repeat-a] [--control-b-delay-ms N] [--build] [--check]
//
// WHY it exists: run.mjs measures one checkout and compare.mjs judged two hand-picked JSON
// files. This runs the SAME selected work against A then B (sequentially — never two stress
// runs competing), in this process through run.mjs's own main(), then writes one readable
// comparison. Nothing is rebuilt unless --build is given: a stale or missing cached build is
// refused, because silently rebuilding is a 1-3 minute surprise per side. Earlier results are
// never overwritten: every comparison gets a fresh perf-reports/ab/<stem>[-N]/ directory.
//
// Package-only candidates (--a-package/--b-package) are NOT supported: run.mjs identifies a
// candidate by a git checkout plus its build stamp (source fingerprint), and a bare package
// directory has no verifiable source identity. Point --a/--b at a stamped checkout instead.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTROL_ENV, CONTROL_MAX_MS } from './control.mjs';
import { ENERGY_PATHS, PRIMARY, WORKLOAD_PATHS, compareAll, renderComparisonMarkdown } from './compare.mjs';
import { requireDiskHeadroom } from './disk-budget.mjs';
import { LAB_DIR, instrumentIdentity, packageIdentity } from './identity.mjs';
import { acquireRunLock } from './run-lock.mjs';
import { EXIT, PHASES, ROOT, SCRATCH, assetPreflight, bootPlan, buildFreshness, dirtyNote, main as runLab, parseArgs, stemFor } from './run.mjs';

export const MODES = {
  // WHY these: quick is the edit-measure loop (two cheap phases, 3 samples each so a spread
  // exists); full is every phase at run.mjs's own defaults. Neither claims a duration — the
  // first measured durations are recorded in README after real runs, not promised here.
  quick: { only: 'startup,history', flags: ['--runs', '3', '--history-repeats', '3'] },
  full: { only: PHASES.join(','), flags: [] },
  // Lane C alone (quiet machine, ~10-15 min per side). Opt-in; never part of quick/full.
  energy: { only: 'energy', flags: [] },
  // Lane F alone (quiet machine, ~1-2 h per side at 3 passes). Opt-in; never part of quick/full.
  workloads: { only: 'workloads', flags: [] },
};

export const AB_USAGE = `perf-lab ab — run the same work against two app candidates and compare.

  node scripts/perf-lab/ab.mjs --a <checkout> --b <checkout> [options]

  --a, --b <dir>             stamped youcoded checkouts (a build in desktop/release/ + .perf-lab-build.json)
  --mode quick|full|energy|workloads   workloads = lane F alone (--only workloads: file-size ladders, CSV full read, path list, large diff, index refresh, original JPEG) · energy = lane C alone (--only energy: ESTIMATE of whole-chip power difference) · quick = ${MODES.quick.only} x3 samples (default) · full = every phase, run.mjs defaults
  --only a,b,c               replace the mode's phases: ${PHASES.join(', ')}
  --repeat-a                 run A, B, then A again, and print the A1-vs-A2 noise table
  --control-b-delay-ms <n>   known-change control: inject an n ms delay (1..${CONTROL_MAX_MS}) into B's terminal scenario
                             (use with --only terminal); the comparison is labelled CONTROL
  --build                    allow building a stale/missing candidate (default: refuse, never silently rebuild)
  --check                    print both candidates' identities, build validity, work, boots and bounds; launch nothing
  --max-minutes <n>          per-run measurement cap passed to run.mjs (default 90); quiet-machine waiting is NOT counted
  --max-quiet-wait-minutes <n>  longest each run waits for a quiet machine before stopping, before launching (default 20)
  --allow-asset-download     explicitly authorize downloading the ~490 MB model + engine archive if missing (default: refuse)
  --label <text>             appended to the comparison directory name
  --out <dir>                parent directory (default perf-reports/ab/)
  --help`;

export function parseAbArgs(argv, { root = ROOT } = {}) {
  const valueFlags = ['a', 'b', 'mode', 'only', 'control-b-delay-ms', 'max-minutes', 'max-quiet-wait-minutes', 'label', 'out'];
  const boolFlags = ['repeat-a', 'build', 'check', 'help', 'allow-asset-download'];
  const raw = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) throw new Error(`ab: unexpected argument ${JSON.stringify(tok)}`);
    const name = tok.slice(2);
    if (name === 'a-package' || name === 'b-package') throw new Error('ab: --a-package/--b-package are not supported (a package alone has no verifiable source identity); use --a/--b with a stamped checkout');
    if (boolFlags.includes(name)) { raw[name] = true; continue; }
    if (!valueFlags.includes(name)) throw new Error(`ab: unknown option --${name}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`ab: --${name} needs a value`);
    raw[name] = value;
  }
  if (raw.help) return { help: true };
  if (!raw.a || !raw.b) throw new Error('ab: both --a and --b are required');
  const mode = raw.mode ?? 'quick';
  if (!Object.hasOwn(MODES, mode)) throw new Error(`ab: --mode must be quick, full, energy or workloads, got ${JSON.stringify(mode)}`);
  let controlMs = null;
  if (raw['control-b-delay-ms'] !== undefined) {
    controlMs = Number(raw['control-b-delay-ms']);
    if (!Number.isInteger(controlMs) || controlMs < 1 || controlMs > CONTROL_MAX_MS) throw new Error(`ab: --control-b-delay-ms must be a whole number in 1..${CONTROL_MAX_MS}`);
  }
  // WHY identical args for every run: the comparison is only fair when A and B executed the
  // same work. Only --checkout/--out/--label differ per run (added in runStep below).
  const only = raw.only ?? MODES[mode].only;
  const common = ['--only', only, ...MODES[mode].flags,
    ...(raw['max-minutes'] ? ['--max-minutes', raw['max-minutes']] : []),
    ...(raw['max-quiet-wait-minutes'] ? ['--max-quiet-wait-minutes', raw['max-quiet-wait-minutes']] : []),
    // WHY forwarded verbatim: the opt-in must reach BOTH runs, and absent means refuse (never download).
    ...(raw['allow-asset-download'] ? ['--allow-asset-download'] : []), ...(raw.build ? [] : ['--cached-only'])];
  // Validate with run.mjs's own parser so a bad --only fails here, before any lock or run.
  const cfg = parseArgs([...common, '--checkout', resolve(raw.a)], { root });
  return {
    a: resolve(raw.a), b: resolve(raw.b), mode, common, cfg, controlMs, repeatA: raw['repeat-a'] === true,
    build: raw.build === true, check: raw.check === true, label: raw.label ?? '',
    out: resolve(raw.out ?? join(root, 'perf-reports', 'ab')),
  };
}

/** The ordered runs: A, B, and (optionally) A again. */
export function sequenceFor(plan) {
  return [
    { key: 'a', checkout: plan.a, label: 'a', control: false },
    { key: 'b', checkout: plan.b, label: 'b', control: plan.controlMs !== null },
    ...(plan.repeatA ? [{ key: 'a2', checkout: plan.a, label: 'a2', control: false }] : []),
  ];
}

/** Claim a fresh comparison directory; mkdir (not recursive) is the atomic "first free" test. */
export function claimComparisonDir(parent, stem, { mkdir = mkdirSync } = {}) {
  mkdir(parent, { recursive: true });
  for (let n = 1; n < 1000; n++) {
    const dir = join(parent, n === 1 ? stem : `${stem}-${n}`);
    try { mkdir(dir); return dir; } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  throw new Error(`no free comparison directory after ${stem}-999`);
}

const short = (s) => (typeof s === 'string' ? s.slice(0, 12) : '—');

export async function preflight(plan, deps = {}) {
  const fresh = deps.buildFreshness ?? buildFreshness;
  const hashPackage = deps.packageIdentity ?? packageIdentity;
  const candidates = [];
  for (const [side, checkout] of [['A', plan.a], ['B', plan.b]]) {
    const f = await fresh(checkout, { cachedOnly: !plan.build });
    let pkg = null;
    if (f.haveBinary && f.appDir) { try { pkg = await hashPackage(f.appDir); } catch (e) { pkg = { error: e.message }; } }
    candidates.push({ side, checkout, fresh: f, pkg, usable: plan.build ? !f.error : f.fresh === true });
  }
  return candidates;
}

export function describePlan(plan, candidates, { disk, instrument, assetFn } = {}) {
  const boots = bootPlan(plan.cfg);
  const runs = sequenceFor(plan).length;
  const lines = ['perf-lab ab --check — nothing was launched', '',
    `  mode              ${plan.mode}${plan.controlMs ? `  (KNOWN-CHANGE CONTROL: +${plan.controlMs} ms terminal delay injected into B only)` : ''}`,
    `  work              phases ${[...plan.cfg.only].join(', ')}; runs ${plan.cfg.runs}, history ${plan.cfg.historyRepeats}, workload ${plan.cfg.workloadRepeats}, terminal ${plan.cfg.terminalRepeats}`,
    `  sequence          ${sequenceFor(plan).map((s) => s.key.toUpperCase()).join(' -> ')} (one at a time, identical options)`,
    `  boots             ${boots.total} per run x ${runs} runs = ${boots.total * runs} boots`,
    `  time bound        hard cap ${plan.cfg.maxMinutes} min per run = ${plan.cfg.maxMinutes * runs} min total (actual duration not yet measured)`,
    `  quiet-wait bound  ${plan.cfg.maxQuietWaitMinutes} min per run waiting for a quiet machine, separate from the time bound above; past it a run stops before launching and is INCOMPLETE`,
    `  model assets      ${(() => { const a = (assetFn ?? assetPreflight)(plan.cfg); return a.state === 'present' ? `present+verified, no network (${a.detail})` : a.state === 'missing' ? `MISSING — would REFUSE before any launch: ${a.detail}. Pass --allow-asset-download or choose model-free phases` : a.state === 'authorized' ? `download AUTHORIZED (--allow-asset-download): ${a.detail}` : a.detail; })()}`,
    `  disk              ${disk ? `${Math.round(disk.availableBytes / 1024 ** 3)} GiB free at ${disk.checkedPath}; reports are small (screenshots only with phase shots)` : 'unknown'}`,
    `  build policy      ${plan.build ? 'building allowed (--build)' : 'cached builds only — a stale/missing build is REFUSED, never silently rebuilt'}`,
    `  instrument        ${short(instrument?.combined)} (sha256 of the lab source; must match for A and B, it is one process)`, ''];
  for (const c of candidates) {
    const f = c.fresh;
    lines.push(`  candidate ${c.side}       ${c.checkout}`,
      `    source          ${f.error ? `cannot fingerprint: ${f.error}` : `${f.sha?.slice(0, 7)} (${f.branch}${dirtyNote(f.dirty)})`}`,
      `    cached build    ${c.usable ? `usable (built ${f.builtAt ?? 'unknown'})` : `NOT usable — ${f.error ?? 'stale or missing'}${plan.build ? '' : '; pass --build to allow a rebuild'}`}`,
      `    package         ${c.pkg?.error ? `hash failed: ${c.pkg.error}` : c.pkg ? `executable ${short(c.pkg.executableSha256)}, app.asar ${short(c.pkg.asarSha256)}` : 'not present'}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function runAb(argv, deps = {}) {
  const log = deps.log ?? ((...a) => console.log(...a));
  const run = deps.main ?? runLab;
  let plan;
  try { plan = parseAbArgs(argv, deps.root ? { root: deps.root } : undefined); } catch (e) { console.error(e.message); return EXIT.ERROR; }
  if (plan.help) { log(AB_USAGE); return EXIT.OK; }
  let candidates;
  try { candidates = await preflight(plan, deps); } catch (e) { console.error(`ab: preflight failed: ${e.message}`); return EXIT.ERROR; }
  let disk = null;
  try { disk = (deps.requireDiskHeadroom ?? requireDiskHeadroom)(plan.out); } catch (e) { console.error(`ab: ${e.message}`); return EXIT.ERROR; }
  const instrument = (deps.instrumentIdentity ?? instrumentIdentity)(LAB_DIR);
  log(describePlan(plan, candidates, { disk, instrument, assetFn: deps.assetPreflight }));
  const unusable = candidates.filter((c) => !c.usable);
  if (unusable.length) { console.error(`ab: refusing to run — ${unusable.map((c) => `${c.side}: ${c.fresh.error ?? 'build is stale or missing'}`).join('; ')}`); return EXIT.ERROR; }
  // WHY before the lock/any run: missing model assets without the opt-in would fail inside run A anyway;
  // say so once, here, with zero network calls.
  const assets = (deps.assetPreflight ?? assetPreflight)(plan.cfg);
  if (assets.state === 'missing') { console.error(`ab: refusing to run — model assets ${assets.detail}. Pass --allow-asset-download or choose model-free phases (--only artifacts).`); return plan.check ? EXIT.OK : EXIT.ERROR; }
  if (plan.check) return EXIT.OK;

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const slug = String(plan.label).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const stem = `${stemFor({ timestamp: now, sha: candidates[0].fresh.sha, label: '' })}-vs-${String(candidates[1].fresh.sha ?? 'nosha').slice(0, 7)}${plan.controlMs ? '-CONTROL' : ''}${slug ? `-${slug}` : ''}`;
  let lock;
  try { lock = (deps.acquireRunLock ?? acquireRunLock)(join(SCRATCH, 'run.lock'), { label: `ab ${stem}` }); } catch (e) { console.error(`ab: ${e.message}`); return EXIT.ERROR; }
  let dir;
  const results = {};
  let exit = EXIT.OK;
  const env = deps.env ?? process.env;
  try {
    dir = claimComparisonDir(plan.out, stem, deps);
    log(`comparison directory: ${dir}`);
    for (const step of sequenceFor(plan)) {
      const ctx = { lockHeld: true };
      const priorControl = env[CONTROL_ENV];
      // WHY set/restore around ONE call: the control must reach B's scenario only, and must
      // never leak into A or into a later normal run in the same process.
      if (step.control) env[CONTROL_ENV] = String(plan.controlMs); else delete env[CONTROL_ENV];
      log(`--- run ${step.key.toUpperCase()}: ${step.checkout}`);
      let code;
      try { code = await run([...plan.common, '--checkout', step.checkout, '--out', dir, '--label', step.label], ctx); }
      finally { if (priorControl === undefined) delete env[CONTROL_ENV]; else env[CONTROL_ENV] = priorControl; }
      results[step.key] = { code, ctx };
      if (code !== EXIT.OK && code !== EXIT.INCOMPLETE) { exit = code; log(`run ${step.key.toUpperCase()} ended with exit ${code}; remaining runs skipped`); break; }
      if (code === EXIT.INCOMPLETE && exit === EXIT.OK) exit = code;
    }
    const readReport = deps.readReport ?? ((path) => JSON.parse(readFileSync(path, 'utf8')));
    if (results.a?.ctx.jsonPath && results.b?.ctx.jsonPath) {
      const a = readReport(results.a.ctx.jsonPath), b = readReport(results.b.ctx.jsonPath);
      // WHY: an energy-only selection has no PRIMARY phases; comparing PRIMARY would print only 'phase not run' rows.
      const paths = plan.cfg.only.has('energy') ? ENERGY_PATHS : plan.cfg.only.has('workloads') ? WORKLOAD_PATHS : PRIMARY;
      const result = compareAll(a, b, { paths, evidence: { a: results.a.ctx.jsonPath, b: results.b.ctx.jsonPath } });
      const md = renderComparisonMarkdown(result, { title: `A/B comparison — ${stem}`, aLabel: plan.a, bLabel: plan.b });
      writeFileSync(join(dir, 'comparison.md'), md);
      writeFileSync(join(dir, 'comparison.json'), JSON.stringify(result, null, 2));
      log(`comparison: ${join(dir, 'comparison.md')}`);
      log(`counts: ${Object.entries(result.counts).map(([k, v]) => `${v} ${k}`).join(', ')}${result.comparability.comparable ? '' : '  (INCOMPARABLE: not ranked)'}`);
      if (results.a2?.ctx.jsonPath) {
        // A1 vs A2: the same candidate twice. Anything flagged here is the lab's own noise.
        const noise = compareAll(a, readReport(results.a2.ctx.jsonPath), { paths, evidence: { a: results.a.ctx.jsonPath, b: results.a2.ctx.jsonPath } });
        writeFileSync(join(dir, 'noise-a1-vs-a2.md'), renderComparisonMarkdown(noise, { title: `Noise: A run 1 vs A run 2 — ${stem}`, aLabel: 'A run 1', bLabel: 'A run 2' }));
        log('A1-vs-A2 noise table:');
        for (const r of noise.rows.filter((x) => x.status !== 'missing')) log(`  ${r.path.padEnd(48)} ${String(r.a).padStart(9)} -> ${String(r.b).padStart(9)}  ${r.deltaPct === null ? '—' : `${r.deltaPct}%`}  ${r.status}`);
        log(`noise file: ${join(dir, 'noise-a1-vs-a2.md')}`);
      }
    } else {
      console.error('ab: no comparison written — a run did not produce its report');
      if (exit === EXIT.OK) exit = EXIT.ERROR;
    }
  } finally { lock.release(); }
  return exit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = await runAb(process.argv.slice(2));
  process.exitCode = code;
  setTimeout(() => process.exit(code), 10_000).unref();
}
