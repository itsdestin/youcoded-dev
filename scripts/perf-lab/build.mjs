// scripts/perf-lab/build.mjs — production-style build of a youcoded checkout.
// WHY packaged: main.ts picks loadFile vs the Vite dev URL by app.isPackaged, and
// dev mode loads hundreds of unbundled modules — its startup numbers are fiction.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, createReadStream, promises as fs, lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireDiskHeadroom } from './disk-budget.mjs';
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// WHY async + 'pipe' instead of execFileSync with stdio inherit: execFileSync's
// thrown error on a non-zero exit is just "Command failed" with no detail, which
// is a terrible experience for a 1-3 min build that dies at step 4 of 6. Piping
// both streams lets us echo them live (so a long build still shows progress) AND
// buffer them, so a failure can quote the real stderr/stdout instead of a guess.
// Project rule: never replace a real error with a hardcoded guess.
// WHY `quiet`: the CLI's only stdout contract is the final JSON blob (a caller
// may pipe it into JSON.parse), but treeFingerprint's `git` calls also go
// through this same helper. Without `quiet` their stdout (a commit sha, a
// branch name) would print *above* the JSON on every invocation, including the
// fresh-path no-op, and break that contract. Only the long build steps stream.
function sh(cmd, args, cwd, step, { quiet = false, raw = false, env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], ...(env ? { env } : {}) });
    let out = '';
    let err = '';
    // Preserve UTF-8 names even when a character crosses a pipe chunk boundary.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; if (!quiet) process.stdout.write(d); });
    child.stderr.on('data', (d) => { err += d; if (!quiet) process.stderr.write(d); });
    child.on('error', (e) => reject(new Error(`[${step}] failed to launch "${cmd} ${args.join(' ')}": ${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = (err || out).trim() || '(command produced no output)';
        reject(new Error(`[${step}] "${cmd} ${args.join(' ')}" exited ${code}:\n${detail}`));
      } else {
        resolvePromise(raw ? out : out.trim());
      }
    });
  });
}

export async function treeFingerprint(checkout) {
  const sha = await sh('git', ['rev-parse', 'HEAD'], checkout, 'git rev-parse HEAD', { quiet: true });
  const branch = await sh('git', ['branch', '--show-current'], checkout, 'git branch --show-current', { quiet: true });
  const status = await sh('git', ['status', '--porcelain', '-z'], checkout, 'git status --porcelain', { quiet: true, raw: true });
  const diff = status ? await sh('git', ['diff', '--full-index', '--no-ext-diff', '--no-textconv', 'HEAD'], checkout, 'git diff HEAD', { quiet: true, raw: true }) : '';
  // WHY ls-files -z: porcelain groups new directories and quotes unusual names.
  // Reading those display strings missed edits inside new folders and files with
  // spaces. UTF-8 decoding binary input also collapsed distinct bytes to U+FFFD.
  const paths = await sh('git', ['ls-files', '--others', '--exclude-standard', '-z'], checkout, 'git ls-files --others', { quiet: true, raw: true });
  const hash = createHash('sha1').update('perf-lab-tree-v2\0').update(status).update(diff);
  for (const relPath of paths.split('\0').filter(Boolean).sort()) {
    const full = join(checkout, relPath);
    const info = await fs.lstat(full);
    // Do not follow an untracked link outside the checkout, read a FIFO forever,
    // or certify an input that could not actually be fingerprinted.
    if (!info.isFile()) throw new Error(`Cannot fingerprint non-regular file or symlink: ${relPath}`);
    hash.update(JSON.stringify({ path: relPath, size: info.size, mode: info.mode & 0o777 })).update('\0');
    for await (const chunk of createReadStream(full)) hash.update(chunk);
    hash.update('\0');
  }
  const dirty = hash.digest('hex').slice(0, 12);
  return { sha, branch, dirty };
}

/** WHY cached-only validates at execution: --check cannot reserve a package or
 * certify a later source tree. Refuse before any allocation/build command; never
 * repair/update stamps. Regular paths and exact fingerprint are necessary but do
 * not attest packaged bytes (the existing stamp has no binary content manifest). */
function cachedBuild(checkout, fp) {
  if (!/^[a-f0-9]{40}$/.test(fp?.sha ?? '') || !/^[a-f0-9]{12}$/.test(fp?.dirty ?? '') || typeof fp?.branch !== 'string' || !fp.branch) throw Error('invalid current fingerprint');
  const appDir = join(checkout, 'desktop/release/linux-unpacked'), binary = join(appDir, 'youcoded'), stamp = join(checkout, 'desktop/release/.perf-lab-build.json');
  const identities = new Map();
  for (const target of [stamp, binary]) {
    let current = parse(target).root;
    for (const part of target.slice(current.length).split(/[\\/]/)) {
      current = join(current, part); const info = lstatSync(current);
      if (info.isSymbolicLink() || (current !== target && !info.isDirectory()) || (current === target && (!info.isFile() || info.size === 0))) throw Error(`empty/non-regular or symlink cached path: ${current}`);
      identities.set(current, { dev: info.dev, ino: info.ino });
    }
  }
  const fd = openSync(stamp, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let prev;
  try {
    const info = fstatSync(fd), expected = identities.get(stamp);
    if (!info.isFile() || info.size > 65536 || info.dev !== expected.dev || info.ino !== expected.ino) throw Error('invalid cached stamp identity/size');
    const bytes = Buffer.alloc(65537); let n = 0;
    while (n < bytes.length) { const read = readSync(fd, bytes, n, bytes.length - n, n); if (!read) break; n += read; }
    if (n > 65536) throw Error('cached stamp byte cap exceeded');
    prev = JSON.parse(bytes.subarray(0, n).toString('utf8'));
  } finally { closeSync(fd); }
  for (const [path, old] of identities) {
    const now = lstatSync(path);
    if (now.isSymbolicLink() || now.dev !== old.dev || now.ino !== old.ino) throw Error('cached path identity changed during validation');
  }
  if (['sha', 'dirty', 'branch'].some(key => prev[key] !== fp[key])) throw Error('cached stamp does not match current source fingerprint');
  if ((prev.binary !== undefined && prev.binary !== binary) || (prev.appDir !== undefined && prev.appDir !== appDir)) throw Error('cached stamp paths point outside expected package');
  if (typeof prev.builtAt !== 'string' || !Number.isFinite(Date.parse(prev.builtAt)) || !Number.isFinite(prev.buildMs) || prev.buildMs < 0) throw Error('cached stamp build metadata missing/invalid');
  return { ...prev, ...fp, binary, appDir, cachedOnly: true };
}

// WHY the inspect switch is turned back on HERE, and only here (2026-11-11): the 2026-10-30 security hardening set
// `electronFuses.enableNodeCliInspectArguments: false` in youcoded desktop/electron-builder.yml, so a packaged app now
// ignores `--inspect`. The kit's `suspects.mjs --main-inspect 1` (the `minimized`/`cut` legs) hides and shows the window
// through that main-process debugger. electron-builder's `-c.<key>=<value>` overrides one key of the loaded config for
// THIS invocation only: electron-builder.yml is not edited, and release builds (desktop-release.yml runs the package.json
// `build`/`dist` scripts from a clean checkout) never run this file, so they keep the switch off. These kit packages
// live only under the checkout's desktop/release/ next to the kit stamp and are never published.
export const KIT_BUILDER_ARGS = Object.freeze(['--linux', 'dir', '-c.electronFuses.enableNodeCliInspectArguments=true']);

export async function buildApp(checkout = join(ROOT, 'worktrees', 'perf-lab'), { skipIfFresh = true, cachedOnly = false, perfCounters = false, checkSpace = requireDiskHeadroom, _deps = {} } = {}) {
  if (typeof cachedOnly !== 'boolean') throw Error('cached-only must be boolean');
  if (typeof perfCounters !== 'boolean') throw Error('perfCounters must be boolean');
  if (cachedOnly && !skipIfFresh) throw Error('cached-only conflicts with forced rebuild');
  checkout = resolve(checkout);
  const fingerprint = _deps.fingerprint ?? treeFingerprint;
  const exec = _deps.exec ?? sh;
  if (cachedOnly) {
    try { return cachedBuild(checkout, await fingerprint(checkout)); }
    catch (error) { throw new Error(`cached-only refused (no build attempted): ${error.message}`, { cause: error }); }
  }
  const desktop = join(checkout, 'desktop');
  const appDir = join(desktop, 'release', 'linux-unpacked');
  const binary = join(appDir, 'youcoded');
  const stamp = join(desktop, 'release', '.perf-lab-build.json');
  const fp = await fingerprint(checkout);
  if (skipIfFresh && existsSync(binary) && existsSync(stamp)) {
    const prev = JSON.parse(readFileSync(stamp, 'utf8'));
    // WHY the flag is part of freshness: a counters build and a normal build of the same source are different packages.
    // WHY kitInspect too: a package built before the override below cannot be driven by `suspects.mjs --only cut`.
    if (prev.sha === fp.sha && prev.dirty === fp.dirty && Boolean(prev.perfCounters) === perfCounters && prev.kitInspect === true) return { binary, appDir, ...prev };
  }
  // WHY: the measured package alone is ~540 MB; allow staging as well as the
  // shared disk reserve. Reusing a verified cached build needs no new allocation.
  checkSpace(desktop, { additionalBytes: 2 * 1024 ** 3 });
  const t0 = Date.now();
  const node = (js, step) => exec('node', ['-e', js], desktop, step);
  await exec('npx', ['tsc'], desktop, 'tsc');
  await node("require('fs').cpSync('src/main/pty-worker.js','dist/main/pty-worker.js')", 'copy pty-worker.js');
  await node("require('fs').mkdirSync('dist/renderer/data',{recursive:true})", 'mkdir dist/renderer/data');
  await node("require('fs').cpSync('src/renderer/data/skill-registry.json','dist/renderer/data/skill-registry.json')", 'copy skill-registry.json');
  // WHY: VITE_PERF_COUNTERS=1 compiles in the transcript-batcher counters + window.__transcriptBatcherCounters
  // (renderer/state/transcript-batch-counters.ts). Absent for every normal build, so a lab candidate without the flag
  // measures the shipping code path.
  await exec('npx', ['vite', 'build'], desktop, 'vite build', perfCounters ? { env: { ...process.env, VITE_PERF_COUNTERS: '1' } } : undefined);
  await exec('npx', ['electron-builder', ...KIT_BUILDER_ARGS], desktop, 'electron-builder');
  if (!existsSync(binary)) throw new Error(`build finished but ${binary} is missing`);
  const info = { ...fp, perfCounters, kitInspect: true, builtAt: new Date().toISOString(), buildMs: Date.now() - t0 };
  writeFileSync(stamp, JSON.stringify(info, null, 2));
  return { binary, appDir, ...info };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildApp(process.argv[2] ? resolve(process.argv[2]) : undefined, { skipIfFresh: !process.argv.includes('--force'), perfCounters: process.argv.includes('--perf-counters') });
  console.log(JSON.stringify(r, null, 2));
}
