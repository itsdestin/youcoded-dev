// Isolated Node/core evidence only. This never launches or attaches to the app.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { once } from 'node:events';
import { assertSafeNeedles } from './launch.mjs';
import { OwnedProcesses, CONTAINMENT_LIMITS } from './owned-processes.mjs';
import { buildStallFixtures } from './stall-fixtures.mjs';

const SELF = fileURLToPath(import.meta.url);
const CAP = 16 * 1024 * 1024;
const OUTPUT_CAP = 128 * 1024;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const emptyMetrics = () => ({ operationMs: null, cpuMs: null, maxLoopDelayMs: null, samples: null, peakRssMb: null });
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const inside = (root, file) => { const r = relative(root, file); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };

/** Timer is armed BEFORE work and drained AFTER it, including an initial-tick block. */
export function createLoopSampler({ now = () => performance.now(), schedule = (fn) => setTimeout(fn, 10), cancel = clearTimeout } = {}) {
  let last, timer, samples = 0, maxLoopDelayMs = 0, finish;
  const tick = () => {
    const time = now(); maxLoopDelayMs = Math.max(maxLoopDelayMs, time - last - 10);
    last = time; samples++;
    if (finish) { const done = finish; finish = null; done({ samples, maxLoopDelayMs }); }
    else timer = schedule(tick);
  };
  return {
    arm() { last = now(); timer = schedule(tick); },
    drain() { return new Promise((done) => { finish = done; }); },
    cancel() { cancel(timer); },
  };
}

/** Pure fail-closed verdict; exported so policy is tested without wall-clock races. */
export function assessCoreResult(result, observed) {
  if (!observed.cleanupConfirmed) return { status: 'failed', error: 'Owned-process cleanup unconfirmed' };
  if (observed.forcedStatus) return { status: observed.forcedStatus, error: observed.error ?? observed.forcedStatus };
  if (!observed.ready || !observed.memorySamples || observed.missingMemory || observed.exitCode !== 0 || observed.signal) {
    return { status: 'failed', error: result?.error ?? observed.error ?? 'Missing readiness/memory evidence or abnormal child exit' };
  }
  const m = result?.metrics;
  const valid = result?.proof?.attempted === true && result.proof.correctTarget === true && result.proof.correctResult === true
    && m && ['operationMs', 'cpuMs', 'maxLoopDelayMs', 'peakRssMb'].every((k) => finite(m[k]))
    && Number.isInteger(m.samples) && m.samples > 0
    && typeof result?.runtime?.node === 'string' && result.runtime.sourceHashes?.length > 0
    && result.runtime.sourceHashes.every((s) => typeof s.file === 'string' && /^[a-f0-9]{64}$/.test(s.sha256));
  return valid ? { status: 'measured' } : { status: 'failed', error: result?.error ?? 'Missing result proof, heartbeat or runtime identity' };
}

function validateOptions({ checkout, outDir, timeoutMs, maxRssMb }) {
  if (!checkout || !outDir) throw new Error('Explicit checkout and outDir required');
  if (!finite(timeoutMs) || timeoutMs < 50 || timeoutMs > 60000) throw new Error('timeoutMs must be 50..60000');
  if (!finite(maxRssMb) || maxRssMb < 64 || maxRssMb > 1024) throw new Error('maxRssMb must be 64..1024');
}

function syntheticCases() {
  return [
    ...['gpu', 'rocm', 'rocm-slow-helper'].map((kind) => ({ id: `hardware-${kind}`, kind, shape: { helperWaitMs: kind === 'rocm-slow-helper' ? 250 : 0 } })),
    ...[32, 256].map((directories) => ({ id: `watcher-${directories}`, kind: 'watcher', shape: { directories, files: directories } })),
  ].map((c) => ({ ...c, ...syntheticIdentity(c) }));
}

function syntheticIdentity(fixture) {
  const data = fixture.kind === 'watcher' ? 'initial'.repeat(fixture.shape.directories) : '';
  // Synthetic tree digest covers file contents in dir-number order, excluding
  // the job's absolute path. Directory/file counts live alongside it in shape.
  return { bytes: Buffer.byteLength(data), sha256: hash(data) };
}

export async function runCoreStallCases({ checkout, manifest, outDir, timeoutMs = 15000, maxRssMb = 512, _execute } = {}) {
  validateOptions({ checkout, outDir, timeoutMs, maxRssMb });
  if (manifest?.schema !== 1 || !Array.isArray(manifest.cases) || !manifest.root) throw new Error('Invalid fixture manifest');
  const cases = [];
  for (const fixture of [...manifest.cases, ...syntheticCases()]) {
    if (fixture.file && !inside(resolve(manifest.root), resolve(fixture.file))) throw new Error('Fixture outside manifest root');
    const row = await runCoreStallCase({ checkout, fixture, outDir, timeoutMs, maxRssMb, _execute });
    cases.push(row);
    if (row.proof.cleanupConfirmed === false) throw new Error(`Cleanup failed for ${row.id}; refusing further cases`);
  }
  const report = { schema: 1, scope: 'isolated-core', cases };
  await writeFile(join(resolve(outDir), 'core-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  return report;
}

/** Each call owns a fresh child/job directory, even for a repeated fixture. */
export async function runCoreStallCase({ checkout, fixture, outDir, timeoutMs = 15000, maxRssMb = 512, _execute } = {}) {
  validateOptions({ checkout, outDir, timeoutMs, maxRssMb });
  if (!fixture || !/^[\w-]+$/.test(fixture.id) || !finite(fixture.bytes) || fixture.bytes > CAP) throw new Error('Invalid or oversized fixture');
  if (fixture.kind === 'watcher' && ![32, 256].includes(fixture.shape?.directories)) throw new Error('Unsafe watcher tree size');
  if (!fixture.file && ['gpu', 'rocm', 'rocm-slow-helper', 'watcher'].includes(fixture.kind)) {
    fixture = { ...fixture, ...syntheticIdentity(fixture) };
  }
  await mkdir(resolve(outDir), { recursive: true });
  const base = { id: fixture.id, kind: fixture.kind, status: 'unreviewed',
    runtime: { node: process.version, platform: process.platform, arch: process.arch, sourceHashes: [] },
    fixture: { bytes: fixture.bytes, sha256: fixture.sha256, shape: fixture.shape }, metrics: emptyMetrics(),
    proof: { attempted: false, correctTarget: false, correctResult: false, cleanupConfirmed: true } };
  if (fixture.kind.startsWith('html-') || process.platform !== 'linux') {
    base.error = fixture.kind.startsWith('html-') ? 'browser-only: HTML requires parent browser measurement' : 'unsupported platform: external /proc RSS/ownership probes require Linux';
    await writeFile(join(resolve(outDir), `${fixture.id}.json`), JSON.stringify(base, null, 2), { flag: 'wx' });
    return base;
  }
  const jobDir = await mkdtemp(join(resolve(outDir), `${fixture.id}-job-`));
  const home = join(jobDir, 'home'); await mkdir(home);
  const jobFile = join(jobDir, 'job.json');
  await writeFile(jobFile, JSON.stringify({ checkout: resolve(checkout), fixture, jobDir, home, maxRssMb }), { flag: 'wx' });
  const { result, observed } = await (_execute ?? executeOwned)({ jobFile, jobDir, home, fixture, timeoutMs, maxRssMb });
  const verdict = assessCoreResult(result, observed);
  const row = { ...base, ...result, ...verdict, id: fixture.id, kind: fixture.kind,
    fixture: base.fixture, runtime: { ...base.runtime, ...result?.runtime },
    metrics: verdict.status === 'measured' ? { ...result.metrics, peakRssMb: Math.max(result.metrics.peakRssMb, observed.peakRssMb) } : emptyMetrics(),
    proof: { ...base.proof, ...result?.proof, cleanupConfirmed: observed.cleanupConfirmed },
    limits: { timeoutMs, maxRssMb, heapMb: Math.max(32, Math.floor(maxRssMb * 0.6)) },
    diagnostics: { memorySamples: observed.memorySamples, peakRssMb: observed.peakRssMb ?? null,
      peakMemoryMembers: observed.peakMemoryMembers ?? [],
      exitCode: observed.exitCode ?? null, signal: observed.signal ?? null, stderr: observed.stderr ?? '', jobDir,
      cleanupError: observed.cleanupError ?? null, survivors: observed.survivors ?? [],
      containmentLimits: observed.containmentLimits ?? CONTAINMENT_LIMITS,
      leaderIdentity: observed.leaderIdentity ?? null, leaderExited: observed.leaderExited ?? false,
      pipesClosed: observed.pipesClosed ?? false } };
  await writeFile(join(resolve(outDir), `${fixture.id}.json`), JSON.stringify(row, null, 2), { flag: 'wx' });
  return row;
}

export async function executeOwned({ jobFile, jobDir, home, timeoutMs, maxRssMb, entry = SELF }) {
  assertSafeNeedles([jobDir]);
  const child = spawn(process.execPath, [`--max-old-space-size=${Math.max(32, Math.floor(maxRssMb * 0.6))}`, entry, '--child', jobFile], {
    detached: true, cwd: jobDir, env: { PATH: process.env.PATH, HOME: home, TMPDIR: jobDir,
      XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const observed = { ready: false, memorySamples: 0, peakRssMb: null, missingMemory: false,
    cleanupConfirmed: false, leaderExited: false, pipesClosed: false, containmentLimits: CONTAINMENT_LIMITS };
  let stdout = '', stderr = '', stopping, released = false, family, finished;
  const completion = new Promise(done => { finished = done; });
  // WHY: 'exit' reaps the leader; 'close' waits for inherited helper pipes and can
  // hang indefinitely. Family disappearance and pipe draining are separate facts.
  let pipeDone;
  const pipes = new Promise(done => { pipeDone = done; });
  child.once('close', () => { observed.pipesClosed = true; pipeDone(); });
  child.once('exit', (code, signal) => {
    observed.leaderExited = true; observed.exitCode = code; observed.signal = signal; finished();
  });
  child.once('error', e => { observed.error = e.message; finished(); });
  const cleanup = async () => {
    if (!family?.leader) {
      observed.cleanupError ??= 'Private leader identity was not captured; cleanup authority unavailable';
      return;
    }
    Object.assign(observed, await family.cleanup());
  };
  const stop = (status, error) => {
    observed.forcedStatus ??= status; observed.error ??= error;
    if (!stopping) stopping = cleanup().catch(e => { observed.cleanupError = e.message; }).finally(finished);
  };
  const onExit = () => {
    if (family?.leader) { try { family.sample(); } catch {} family.signalAll('SIGKILL'); }
  };
  const onSignal = signal => { onExit(); process.exit(signal === 'SIGINT' ? 130 : 143); };
  const onTerm = () => onSignal('SIGTERM'), onInt = () => onSignal('SIGINT');
  process.once('exit', onExit); process.once('SIGTERM', onTerm); process.once('SIGINT', onInt);
  const sampleMemory = () => {
    if (released || stopping || !family?.leader) return;
    try {
      const { rssMb: total, members } = family.sample();
      if (!members.length && !observed.leaderExited) throw new Error('Owned family disappeared before leader exit');
      observed.memorySamples++;
      if (total >= (observed.peakRssMb ?? 0)) {
        observed.peakRssMb = total;
        observed.peakMemoryMembers = members.map(({ pid, starttime, state, rssMb }) => ({ pid, starttime, state, rssMb }));
      }
      if (total > maxRssMb) stop('memory-limit', `Owned family RSS ${total} MiB exceeds ${maxRssMb}`);
    } catch (e) { observed.missingMemory = true; stop('failed', e.message); }
  };
  // Capture before readiness can release work; a fast exit never earns ownership
  // by finding somebody else's process with the same numeric PID afterwards.
  try {
    family = new OwnedProcesses({ leaderPid: child.pid, jobDir }); family.capture();
    observed.leaderIdentity = family.leader;
  } catch (e) { observed.leaderIdentity = family?.leader ?? null; stop('failed', e.message); }
  const watchdog = setTimeout(() => stop('timeout', `Wall deadline ${timeoutMs} ms exceeded`), timeoutMs);
  const rssTimer = setInterval(sampleMemory, 25);
  child.stdout.on('data', (b) => {
    if (Buffer.byteLength(stdout) + b.length > OUTPUT_CAP) { stop('failed', 'Controller JSON output exceeded cap'); return; }
    stdout += b.toString('utf8');
  });
  child.stderr.on('data', (b) => { stderr = (stderr + b.toString('utf8')).slice(-8192); });
  child.on('message', (msg) => {
    if (msg?.type === 'ready') {
      observed.ready = true; sampleMemory();
      if (!stopping) child.send({ type: 'go' });
    } else if (msg?.type === 'change') {
      // External writer only ever writes the exact private synthetic tree path.
      const expected = join(jobDir, 'tree', 'dir-0', 'file.txt');
      if (msg.file !== expected) { stop('failed', 'Unsafe external-change request'); return; }
      writeFile(expected, `external-${msg.phase}`).then(() => child.connected && child.send({ type: 'changed' }))
        .catch((e) => stop('failed', e.message));
    } else if (msg?.type === 'result-ready') {
      sampleMemory(); released = true;
      if (!stopping && child.connected) child.send({ type: 'exit' });
    }
  });
  await completion;
  clearTimeout(watchdog); clearInterval(rssTimer);
  if (stopping) await stopping;
  else { try { await cleanup(); } catch (e) { observed.cleanupError = e.message; } }
  let drainTimer;
  await Promise.race([pipes, new Promise(done => { drainTimer = setTimeout(done, 250); })]);
  clearTimeout(drainTimer);
  if (!observed.pipesClosed) {
    observed.cleanupError ??= 'Inherited pipes did not close within bounded drain';
    observed.cleanupConfirmed = false;
  }
  // Never keep unbounded inherited pipe/IPC handles alive after a refused cleanup.
  child.stdout.destroy(); child.stderr.destroy(); if (child.connected) child.disconnect(); child.unref();
  if (!observed.leaderExited) {
    observed.cleanupError ??= 'Leader exit/reaping unconfirmed'; observed.cleanupConfirmed = false;
  }
  observed.survivors ??= family?.survivors() ?? [];
  if (observed.cleanupConfirmed) {
    process.removeListener('exit', onExit); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
  }
  observed.stderr = stderr;
  let result = null;
  try { result = JSON.parse(stdout); } catch { observed.error ??= 'Empty or malformed child JSON'; }
  return { result, observed };
}

async function childMain(jobFile) {
  const job = JSON.parse(await readFile(jobFile, 'utf8'));
  const { checkout, fixture: f, jobDir, home } = job;
  const require = createRequire(join(checkout, 'desktop/package.json'));
  const sourceHashes = [{ file: SELF, sha256: hash(readFileSync(SELF)) }], versions = {};
  const runtime = { node: process.version, platform: process.platform, arch: process.arch, home, sourceHashes, versions,
    evidence: 'Node core only; no browser sanitizer, DOM, input or app-loop measurement' };
  const stages = [];
  const proof = { attempted: false, correctTarget: false, correctResult: false };
  let watcherModule, closePromises = [];
  const load = (file, ts = false) => {
    const text = readFileSync(file, 'utf8'); sourceHashes.push({ file, sha256: hash(text) });
    if (!ts) return require(file);
    const typescript = require('typescript'); versions.typescript = require('typescript/package.json').version;
    const output = typescript.transpileModule(text, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', output)(createRequire(file), module, module.exports);
    return module.exports;
  };
  const dependency = (name) => {
    const entry = require.resolve(name); sourceHashes.push({ file: entry, sha256: hash(readFileSync(entry)) });
    versions[name] = require(`${name}/package.json`).version;
    return require(name);
  };
  const main = (name) => {
    const source = join(checkout, 'desktop/src/main', name + '.ts');
    sourceHashes.push({ file: source, sha256: hash(readFileSync(source)) });
    // Existing compiled output is the runtime authority; preserve its hash and
    // the optional packaging stamp rather than silently building or substituting TS.
    const stamp = join(checkout, 'desktop/release/.perf-lab-build.json');
    try { const bytes = readFileSync(stamp); runtime.buildStamp = { file: stamp, sha256: hash(bytes), value: JSON.parse(bytes) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; runtime.buildStamp = null; }
    return load(join(checkout, 'desktop/dist/main', name + '.js'));
  };
  const renderer = (name) => load(join(checkout, 'desktop/src/renderer', name + '.ts'), true);
  const timed = async (name, op, timedCore = true) => {
    const loop = createLoopSampler(); loop.arm(); const cpu = process.cpuUsage(), start = performance.now();
    let result;
    try { result = await op(); }
    finally {
      const operationMs = performance.now() - start, used = process.cpuUsage(cpu);
      const sample = await loop.drain();
      stages.push({ name, timedCore, operationMs, cpuMs: (used.user + used.system) / 1000, ...sample });
    }
    return result;
  };
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (type) => {
    for (;;) { const [msg] = await once(process, 'message'); if (msg?.type === type) return; }
  };
  let result;
  try {
    let data, api, ExcelJS, mammoth, wb, text;
    await timed('dependency-load-and-source-transpile', async () => {
      if (f.kind.startsWith('csv-')) api = renderer('components/artifact-views/csv-parse');
      else if (f.kind.startsWith('xlsx-')) { ExcelJS = dependency('exceljs'); api = renderer('components/artifact-views/exceljs-cell'); }
      else if (f.kind.startsWith('docx-')) mammoth = dependency('mammoth');
      else if (f.kind === 'path-list') api = renderer('hooks/useInlineFilepathDetector');
      else if (f.kind === 'gpu') api = main('models/gpu-detector');
      else if (f.kind.startsWith('rocm')) {
        if (f.kind === 'rocm-slow-helper') {
          const cp = require('node:child_process'), original = cp.execFileSync;
          const helper = join(jobDir, 'bounded-helper.cjs');
          await writeFile(helper, 'setTimeout(()=>process.stdout.write(""),250);');
          let calls = 0;
          cp.execFileSync = () => { calls++; return original(process.execPath, [helper, jobFile], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'pipe'] }); };
          proof.helperCalls = () => calls;
        }
        api = main('engine/rocm-prereqs');
      } else if (f.kind === 'watcher') {
        const chokidar = require('chokidar'), original = chokidar.FSWatcher.prototype.close;
        // Observe (do not replace) the real close promise: production shutdown
        // returns void, but this child must await all its OS handles closing.
        chokidar.FSWatcher.prototype.close = function (...args) {
          const p = original.apply(this, args); closePromises.push(p); return p;
        };
        watcherModule = api = main('artifacts/project-watcher');
      } else throw new Error(`Unsupported core kind ${f.kind}`);
    }, false);
    if (f.file) await timed('file-read-and-identity-validation', async () => {
      const byteCap = f.kind.startsWith('csv-') ? 3 * 1024 * 1024 + 10000 : f.kind === 'path-list' ? 2 * 1024 * 1024 : CAP;
      check(f.bytes <= byteCap, 'Core input byte cap exceeded');
      const path = await realpath(f.file);
      check(path === resolve(f.file), 'Fixture symlink refused');
      check((await stat(path)).size === f.bytes && f.bytes <= CAP, 'Fixture size identity mismatch');
      data = await readFile(path); check(hash(data) === f.sha256, 'Fixture hash identity mismatch');
      if (f.kind.startsWith('csv-') || f.kind === 'path-list') text = data.toString('utf8');
      if (/^(xlsx|docx)-/.test(f.kind)) {
        const JSZip = dependency('jszip'), zip = await JSZip.loadAsync(data);
        let expanded = 0, mergeCells = 0, sheets = 0;
        for (const [name, entry] of Object.entries(zip.files)) {
          expanded += entry._data?.uncompressedSize ?? 0;
          check(expanded <= CAP, 'Expanded XML cap exceeded');
          if (/xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
            sheets++;
            const xml = await entry.async('string');
            for (const m of xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
              const col = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
              mergeCells += (col(m[3]) - col(m[1]) + 1) * (Number(m[4]) - Number(m[2]) + 1);
            }
            check(mergeCells <= 200000 && mergeCells >= 0 && sheets <= 32, 'Unsafe XLSX shape');
          }
        }
        check(expanded === f.shape.expandedXmlBytes, 'Expanded XML shape mismatch');
      }
    }, false);
    if (f.kind === 'watcher') await timed('synthetic-tree-setup', async () => {
      check([32, 256].includes(f.shape.directories), 'Unsafe watcher tree size');
      const inputs = [];
      for (let i = 0; i < f.shape.directories; i++) {
        const dir = join(jobDir, 'tree', `dir-${i}`); await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'file.txt'), 'initial');
        inputs.push(await readFile(join(dir, 'file.txt')));
      }
      const bytes = Buffer.concat(inputs);
      check(bytes.length === f.bytes && hash(bytes) === f.sha256, 'Synthetic tree identity mismatch');
      proof.inputDigestBasis = 'concatenated initial file bytes in ascending directory-number order';
    }, false);
    process.send({ type: 'ready' }); await waitFor('go');
    proof.attempted = true; proof.correctTarget = true;
    if (f.kind.startsWith('csv-')) {
      const rows = await timed('parseDelimited', () => api.parseDelimited(text, api.detectDelimiter(text, 'csv')));
      check(rows.length === f.shape.rows && rows.every((r) => r.length === f.shape.columns) && rows[0][0] === f.marker, 'CSV marker/count mismatch');
      proof.rows = rows.length; proof.columns = f.shape.columns;
    } else if (f.kind.startsWith('xlsx-')) {
      wb = new ExcelJS.Workbook(); await timed('exceljs-load', () => wb.xlsx.load(data));
      check(wb.worksheets.length === f.shape.sheets && wb.worksheets[0].getCell('A1').value === f.marker, 'Workbook marker/sheet mismatch');
      check(wb.worksheets.filter((s) => s.state === 'hidden').length === f.shape.hiddenSheets, 'Hidden-sheet mismatch');
      const merges = await timed('parseMerges', () => wb.worksheets.map((sheet) => api.parseMerges(sheet.model.merges)));
      const covered = merges.reduce((n, m) => n + m.covered.size, 0);
      check(covered === (f.shape.mergeCells ? f.shape.mergeCells - 1 : 0), 'Merge coverage mismatch');
      proof.covered = covered; proof.sheets = wb.worksheets.length;
    } else if (f.kind.startsWith('docx-')) {
      const converted = await timed('mammoth-conversion', () => mammoth.convertToHtml({ buffer: data }));
      check(converted.value.includes(f.marker), 'DOCX marker missing');
      const count = (converted.value.match(/<p>/g) ?? []).length;
      check(count === f.shape.paragraphs, 'DOCX paragraph count mismatch');
      if (f.shape.rows) check((converted.value.match(/<tr>/g) ?? []).length === f.shape.rows && (converted.value.match(/<td>/g) ?? []).length === f.shape.cells, 'DOCX table count mismatch');
      proof.paragraphs = count; proof.sanitizerAndDom = 'not measured';
    } else if (f.kind === 'path-list') {
      check(f.shape.paths <= 20000 && f.shape.paths > 0, 'Unsafe path count');
      const matches = await timed('detectFilepaths', () => api.detectFilepaths(text));
      const expected = text.trimEnd().split('\n');
      check(matches.length === f.shape.paths && matches.every((m, i) => m.path === expected[i] && text.slice(m.start, m.end) === m.path), 'Path matches/count mismatch');
      proof.matches = matches.length;
    } else if (f.kind === 'gpu') {
      check(['linux', 'darwin', 'win32'].includes(process.platform), 'Unsupported GPU platform');
      const first = await timed('detectGpu-first', () => api.detectGpu());
      const cached = await timed('detectGpu-cached', () => api.detectGpu());
      check(first && Object.hasOwn(first, 'vendor') && cached === first, 'GPU cache/result proof missing');
      proof.result = first; proof.cachedIdentity = true;
    } else if (f.kind.startsWith('rocm')) {
      check(process.platform === 'linux', 'Unsupported ROCm platform for this core probe');
      const first = await timed('checkRocmPrereqs-first', () => api.checkRocmPrereqs());
      const cached = await timed('checkRocmPrereqs-cached', () => api.checkRocmPrereqs());
      const refresh = await timed('checkRocmPrereqs-refresh', () => api.checkRocmPrereqs({ refresh: true }));
      check(first && cached === first && typeof first.satisfied === 'boolean' && typeof refresh.satisfied === 'boolean', 'ROCm result/cache proof missing');
      if (proof.helperCalls) { proof.helperCalls = proof.helperCalls(); check(proof.helperCalls === 2, 'Slow control did not traverse helper twice'); }
      proof.cachedIdentity = true; proof.result = first;
    } else if (f.kind === 'watcher') {
      const root = join(jobDir, 'tree'), file = join(root, 'dir-0', 'file.txt');
      let eventResolve;
      api.initProjectWatchers((event, subscribers) => {
        if (event.projectRoot === root && event.artifactId === 'dir-0/file.txt' && event.by === 'external' && event.kind === 'edit' && subscribers.includes(101)) eventResolve?.(event);
      });
      for (const phase of ['cold', 'warm']) {
        const watch = await timed(`watchProject-${phase}`, () => api.watchProject(root, 101));
        check(watch.ok, 'watchProject not ready');
        const event = new Promise((done) => { eventResolve = done; });
        process.send({ type: 'change', file, phase });
        await timed(`external-event-${phase}`, () => event, false);
        api.unwatchProject(root, 101);
      }
      check(api.__watchersStartedForTest() === 1, 'Warm watch rebuilt instead of reusing');
      proof.externalEvents = 2; proof.watchersStarted = 1;
    }
    proof.correctResult = true;
  } catch (error) { result = { error: error.stack ?? String(error) }; }
  finally {
    if (watcherModule) { watcherModule.stopProjectWatchers(); await Promise.all(closePromises); proof.watchersClosed = true; }
  }
  const core = stages.filter((s) => s.timedCore);
  const metrics = core.length ? { operationMs: core.reduce((n, s) => n + s.operationMs, 0), cpuMs: core.reduce((n, s) => n + s.cpuMs, 0),
    maxLoopDelayMs: Math.max(...core.map((s) => s.maxLoopDelayMs)), samples: core.reduce((n, s) => n + s.samples, 0),
    peakRssMb: process.resourceUsage().maxRSS / 1024 } : emptyMetrics();
  const output = { runtime, stages, proof, metrics, ...result };
  const exitMessage = waitFor('exit');
  process.stdout.write(JSON.stringify(output), () => process.send({ type: 'result-ready' }));
  await exitMessage; process.disconnect();
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  if (process.argv[2] === '--child') {
    childMain(process.argv[3]).catch((error) => { process.stderr.write(String(error.stack ?? error)); process.exitCode = 1; process.disconnect?.(); });
  } else {
    const args = process.argv.slice(2), value = (flag) => args[args.indexOf(flag) + 1];
    if (!args.includes('--checkout') || !args.includes('--out')) throw new Error('Required: --checkout <app repo> --out <new output directory> [--profile smoke|stress]');
    const checkout = resolve(value('--checkout')), outDir = resolve(value('--out'));
    const manifest = await buildStallFixtures(join(outDir, 'fixtures'), { checkout, profile: args.includes('--profile') ? value('--profile') : 'smoke' });
    const report = await runCoreStallCases({ checkout, manifest, outDir });
    console.log(JSON.stringify({ file: join(outDir, 'core-report.json'), cases: report.cases.map((c) => ({ id: c.id, status: c.status, metrics: c.metrics, error: c.error })) }, null, 2));
  }
}
