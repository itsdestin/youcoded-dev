// scripts/perf-lab/identity.mjs — "what exactly was measured" for every report.
//
// WHY: a report used to record sha/branch/dirty and the machine, but not WHICH
// instrument code produced the numbers, which fixture options fed it, which
// packaged bytes ran, or how many repeats were executed. Two runs that differ in
// any of those can both look plausible and still not be rankable, so
// comparability.mjs now refuses them (and refuses older reports that lack this
// block) instead of silently comparing. Pure functions + injected IO so unit
// tests need no app, no build and no machine state.
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IDENTITY_REVISION = 1;
export const LAB_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));

// WHY excluded: these files only READ finished reports or orchestrate runs; they cannot
// change a measured number. Hashing them would make every comparison-tool edit retire all
// earlier evidence for no measurement reason.
const ANALYSIS_ONLY = new Set(['compare.mjs', 'comparability.mjs', 'ab.mjs', 'explain.mjs', 'find-diagnostic.mjs', 'summarise-profile.mjs', 'README.md', 'bg-run.sh', 'wait-json.sh']);
const SKIP_DIRS = new Set(['tests', '__pycache__', 'node_modules']);
const SOURCE_EXT = /\.(mjs|cjs|js|py|html|json)$/;

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX64 = /^[a-f0-9]{64}$/;

/** sha256 of named files under `root` (shared with the stream diagnostic's own provenance). */
export function hashFiles(root, names, { read = readFileSync } = {}) {
  return Object.fromEntries(names.map((name) => [name, sha256Hex(read(join(root, name)))]));
}

/** Sorted relative paths of the lab source that makes up the measuring instrument. */
export function listInstrumentFiles(dir = LAB_DIR, { list = readdirSync } = {}) {
  const out = [];
  const walk = (current) => {
    for (const entry of list(current, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(join(current, entry.name)); continue; }
      if (!entry.isFile() || !SOURCE_EXT.test(entry.name) || ANALYSIS_ONLY.has(entry.name)) continue;
      out.push(relative(dir, join(current, entry.name)).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function instrumentIdentity(dir = LAB_DIR, deps = {}) {
  const hashes = hashFiles(dir, listInstrumentFiles(dir, deps), deps);
  // The combined hash is only a convenient one-line label; comparison uses per-file hashes
  // so a mismatch can name the exact file.
  return { hashes, combined: sha256Hex(JSON.stringify(Object.entries(hashes))) };
}

/** Stream a (possibly 200 MB) file through sha256 without loading it into memory. */
export function hashFileStream(path, { open = createReadStream } = {}) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = open(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

/** Bytes of the packaged app that actually ran: the executable and its app.asar. */
export async function packageIdentity(appDir, { hash = hashFileStream } = {}) {
  return {
    executableSha256: await hash(join(appDir, 'youcoded')),
    asarSha256: await hash(join(appDir, 'resources', 'app.asar')),
  };
}

/** Everything that decides WHAT work a run did (never when/where/how-verbosely). */
export function executionIdentity(cfg) {
  return {
    only: [...cfg.only].sort(),
    runs: cfg.runs, historyRepeats: cfg.historyRepeats, workloadRepeats: cfg.workloadRepeats,
    stallRepeats: cfg.stallRepeats, artifactRepeats: cfg.artifactRepeats, projectsRepeats: cfg.projectsRepeats,
    terminalRepeats: cfg.terminalRepeats, nativeStreamRepeats: cfg.nativeStreamRepeats,
    nativeResumeRepeats: cfg.nativeResumeRepeats, scrollbackRepeats: cfg.scrollbackRepeats,
    documentCaseIds: [...cfg.documentCaseIds],
    streamCompletionDiagnostics: cfg.streamCompletionDiagnostics === true,
  };
}

// WHY environment lives in identity: the power profile ("quiet" vs "performance") and mains power change
// clocks and power caps, so two runs under different ones measured different machines. Recording it with
// the rest of identity means compare/ab refuse the pair through the same path as every other identity gap.
export function buildIdentity({ cfg, fixture, instrument, pkg, control = null, environment = null }) {
  return { revision: IDENTITY_REVISION, instrument, fixture, package: pkg, execution: executionIdentity(cfg), control, environment };
}

/** Why one report's identity block cannot certify a comparison. Empty = well formed. */
export function identityProblems(report) {
  const id = report?.identity;
  if (!record(id)) return ['no identity block (report predates instrument/fixture/package/execution identity); remeasure with the current lab'];
  const problems = [];
  if (id.revision !== IDENTITY_REVISION) problems.push(`identity revision ${String(id.revision)} is not ${IDENTITY_REVISION}`);
  const hashes = id.instrument?.hashes;
  if (!record(hashes) || !Object.keys(hashes).length || !Object.values(hashes).every((h) => HEX64.test(h ?? ''))) problems.push('instrument source hashes missing or malformed');
  if (!record(id.fixture) || !record(id.fixture.options) || !Object.keys(id.fixture.options).length) problems.push('fixture identity missing');
  if (!HEX64.test(id.package?.executableSha256 ?? '') || !HEX64.test(id.package?.asarSha256 ?? '')) problems.push('candidate package hashes (executable + app.asar) missing or malformed');
  if (!record(id.execution) || !Array.isArray(id.execution.only) || !id.execution.only.length) problems.push('execution options / repeat counts missing');
  else {
    for (const [key, v] of Object.entries(id.execution)) {
      if (/Repeats$|^runs$/.test(key) && !(Number.isInteger(v) && v >= 1)) problems.push(`execution.${key} must be a whole number >= 1`);
    }
  }
  const env = id.environment;
  if (!record(env) || !('platformProfile' in env) || !('acOnline' in env)) problems.push('environment snapshot (power profile, charger state) missing');
  return problems;
}

/** Why two well-formed identities describe different measurements. */
export function identityMismatches(a, b) {
  const reasons = [];
  const ha = a?.instrument?.hashes ?? {}, hb = b?.instrument?.hashes ?? {};
  if (!isDeepStrictEqual(ha, hb)) {
    const names = [...new Set([...Object.keys(ha), ...Object.keys(hb)])].filter((n) => ha[n] !== hb[n]).sort();
    reasons.push(`instrument source differs (${names.slice(0, 6).join(', ')}${names.length > 6 ? `, +${names.length - 6} more` : ''}); remeasure both sides with the same lab revision`);
  }
  if (!isDeepStrictEqual(a?.fixture, b?.fixture)) reasons.push('fixture identity/options differ');
  if (!isDeepStrictEqual(a?.execution, b?.execution)) {
    const ea = a?.execution ?? {}, eb = b?.execution ?? {};
    const keys = [...new Set([...Object.keys(ea), ...Object.keys(eb)])].filter((k) => !isDeepStrictEqual(ea[k], eb[k]));
    reasons.push(`execution options / repeat counts differ (${keys.join(', ')})`);
  }
  // WHY null counts as a value: a machine with no readable profile on BOTH sides is the same environment;
  // readable-vs-unreadable is a difference we cannot call equal.
  const ea = a?.environment ?? {}, eb = b?.environment ?? {};
  for (const [key, what] of [['platformProfile', 'power profile'], ['acOnline', 'charger state']]) {
    if (ea[key] !== eb[key]) reasons.push(`${what} differs (${String(ea[key])} vs ${String(eb[key])}); remeasure both sides under the same ${what}`);
  }
  // package and control are deliberately NOT compared: differing packages are the point of an
  // A/B run, and a control run is compared (and labelled) on purpose.
  return reasons;
}

/** Fixed, well-formed identity for tests and fixtures (never used by real runs). */
export function sampleIdentity(overrides = {}) {
  const h = (s) => sha256Hex(s);
  return {
    revision: IDENTITY_REVISION,
    instrument: { hashes: { 'run.mjs': h('run'), 'fixture.mjs': h('fixture') }, combined: h('combined') },
    fixture: { options: { default: {}, artifacts: { seedEngine: false } } },
    package: { executableSha256: h('exe'), asarSha256: h('asar') },
    execution: { only: ['history'], runs: 5, historyRepeats: 3, workloadRepeats: 3, stallRepeats: 3, artifactRepeats: 3, projectsRepeats: 3, terminalRepeats: 3, nativeStreamRepeats: 3, nativeResumeRepeats: 3, scrollbackRepeats: 3, documentCaseIds: ['a'], streamCompletionDiagnostics: false },
    control: null,
    environment: { platformProfile: 'performance', acOnline: true },
    ...overrides,
  };
}
