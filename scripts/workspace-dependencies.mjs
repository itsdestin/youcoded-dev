// A reusable, exact npm installation; consumers never share writable inodes with it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const FORMAT = 1;
export const DEPENDENCY_INSTALL_TIMEOUT_MS = 600_000;
// WHY: a healthy waiter must outlive the owner's full install and publication budget.
export const DEPENDENCY_LOCK_WAIT_MS = DEPENDENCY_INSTALL_TIMEOUT_MS + 60_000;
const MARKER = '.youcoded-dependencies.json';
const INSTALL_FLAGS = ['ci', '--include=dev', '--include=optional', '--ignore-scripts=false', '--no-audit', '--no-fund'];
const exists = p => fs.existsSync(p);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function realDirectory(dir) {
  if (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Dependencies require a real directory: ${dir}`);
}

/** Hash contents, executable modes and relative symlinks; reject links escaping the tree. */
export function dependencyTreeHash(root, excludeMarker = true) {
  realDirectory(root);
  root = fs.realpathSync(root);
  const hash = crypto.createHash('sha256');
  const walk = dir => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), rel = path.relative(root, file);
      if (excludeMarker && rel === MARKER) continue;
      const stat = fs.lstatSync(file);
      hash.update(`${rel}\0${stat.mode & 0o777}\0`);
      if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(file), resolved = path.resolve(path.dirname(file), link);
        const outside = path.relative(root, resolved);
        if (path.isAbsolute(link) || outside === '..' || outside.startsWith(`..${path.sep}`)) throw new Error(`Dependency symlink escapes its installation: ${file}`);
        // WHY: lexical containment misses chains such as x -> .; y -> x/../outside.
        // Use native realpath: the JS variant can normalize '..' before following a link.
        let actual;
        try { actual = path.relative(root, fs.realpathSync.native(file)); }
        catch (error) { throw new Error(`Dependency symlink cannot be resolved: ${file} (${error.code})`); }
        if (actual === '..' || actual.startsWith(`..${path.sep}`)) throw new Error(`Dependency symlink escapes its installation: ${file}`);
        hash.update(`link\0${link}\0`);
      } else if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) hash.update(fs.readFileSync(file));
      else throw new Error(`Unsupported dependency file: ${file}`);
      hash.update('\0');
    }
  };
  walk(root);
  return hash.digest('hex');
}

function copyPrivate(source, destination) {
  // WHY: cp -al let an in-place postinstall patch change other sessions and their source.
  // Reflinks save physical space but have independent inodes; cp falls back to full copying.
  fs.cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
}

function npm(args, options = {}) {
  return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: DEPENDENCY_INSTALL_TIMEOUT_MS,
    ...(process.platform === 'win32' ? { shell: true } : {}), ...options,
  }).trim();
}

function inputState(component) {
  const names = ['package.json', 'package-lock.json', '.npmrc', 'scripts'];
  const inputs = {};
  for (const name of names) {
    const file = path.join(component, name);
    if (!exists(file)) continue;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Install input cannot be a symlink: ${file}`);
    inputs[name] = stat.isDirectory() ? dependencyTreeHash(file, false) : digest(fs.readFileSync(file));
  }
  if (!inputs['package.json'] && !inputs['package-lock.json']) return null;
  if (!inputs['package.json'] || !inputs['package-lock.json']) throw new Error(`Both package.json and package-lock.json are required: ${component}`);
  const pkg = readJson(path.join(component, 'package.json'));
  // Local/workspace sources need their own declared snapshot inputs before reuse is safe.
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (Object.values(pkg[group] ?? {}).some(v => /^(file:|link:|workspace:)/.test(v))) throw new Error(`Local dependency inputs are not supported by the reusable npm source: ${component}`);
  }
  const userConfig = process.env.NPM_CONFIG_USERCONFIG ?? process.env.npm_config_userconfig ?? path.join(os.homedir(), '.npmrc');
  const globalConfig = npm(['config', 'get', 'globalconfig'], { cwd: component });
  const report = process.platform === 'linux' ? process.report?.getReport?.() : null;
  const settings = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^npm_config_/i.test(key)).sort());
  const environment = {
    node: process.version, abi: process.versions.modules, npm: npm(['--version']),
    platform: process.platform, arch: process.arch,
    libc: report ? (report.header.glibcVersionRuntime ?? 'musl') : null,
    // Keep secrets out of metadata: only their hashes participate in invalidation.
    config: digest(JSON.stringify(settings)), userConfig: exists(userConfig) ? digest(fs.readFileSync(userConfig)) : null,
    globalConfig: exists(globalConfig) ? digest(fs.readFileSync(globalConfig)) : null,
    nodeEnv: process.env.NODE_ENV ?? null, flags: INSTALL_FLAGS,
    buildEnvironment: digest(JSON.stringify(Object.fromEntries(['CC', 'CXX', 'AR', 'CFLAGS', 'CXXFLAGS', 'LDFLAGS', 'PYTHON', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS'].map(name => [name, process.env[name] ?? null])))),
  };
  return { key: digest(JSON.stringify({ format: FORMAT, inputs, environment })), inputs, environment };
}

function platformAllows(list, value) {
  return !Array.isArray(list) || (!list.includes(`!${value}`) && (!list.some(v => !v.startsWith('!')) || list.includes(value)));
}

function verifyPackages(component, modules) {
  const lock = readJson(path.join(component, 'package-lock.json'));
  const libc = process.platform === 'linux' && !process.report?.getReport?.().header.glibcVersionRuntime ? 'musl' : 'glibc';
  for (const [rel, entry] of Object.entries(lock.packages ?? {})) {
    if (!rel.startsWith('node_modules/') || entry.inBundle) continue;
    if (entry.link) throw new Error(`Linked package requires declared local inputs: ${rel}`);
    if (!platformAllows(entry.os, process.platform) || !platformAllows(entry.cpu, process.arch) || !platformAllows(entry.libc, libc)) continue;
    const packageDir = path.join(modules, rel.slice('node_modules/'.length));
    const manifest = path.join(packageDir, 'package.json');
    if (!exists(manifest) && entry.optional && !entry.os && !entry.cpu && !entry.libc) continue;
    if (!exists(manifest) || readJson(manifest).version !== entry.version) throw new Error(`npm installation does not match lockfile: ${rel}@${entry.version}`);
    if (rel.indexOf('node_modules/', 1) === -1 && entry.bin && process.platform !== 'win32') {
      const bins = typeof entry.bin === 'string' ? [rel.split('/').pop()] : Object.keys(entry.bin);
      for (const bin of bins) if (!exists(path.join(modules, '.bin', bin))) throw new Error(`npm installation is missing command: ${bin}`);
    }
  }
  // Electron's npm package can exist even when its approved download script never ran.
  const electron = path.join(modules, 'electron');
  if (exists(electron) && !exists(path.join(electron, 'path.txt'))) throw new Error('Electron is installed without its runtime; its install script did not complete.');
}

function completed(generation, key) {
  try {
    const metadata = readJson(path.join(generation, 'node_modules', MARKER));
    return metadata.key === key && dependencyTreeHash(path.join(generation, 'node_modules')) === metadata.treeHash ? metadata : null;
  } catch { return null; }
}

/** Build once per fingerprint and materialize private consumers. Never edits shared checkout deps. */
export function provisionDependencies(component, cacheRoot, { lockWaitMs = DEPENDENCY_LOCK_WAIT_MS } = {}) {
  const state = inputState(component);
  if (!state) return [];
  fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  realDirectory(cacheRoot);
  const generation = path.join(cacheRoot, state.key), lock = `${generation}.lock`;
  const modules = path.join(component, 'node_modules');
  if (exists(modules)) {
    realDirectory(modules);
    const marker = path.join(modules, MARKER);
    if (exists(marker)) {
      const own = readJson(marker);
      if (dependencyTreeHash(modules) !== own.treeHash) throw new Error(`Locally modified dependencies preserved at ${modules}; startup will not overwrite them.`);
      if (own.key === state.key) { verifyPackages(component, modules); return ['node_modules (exact managed installation reused)']; }
    } else {
      throw new Error(`Unmanaged dependencies preserved at ${modules}. Move them aside before provisioning a verified private installation.`);
    }
  }
  let metadata = completed(generation, state.key);
  if (!metadata) {
    const deadline = Date.now() + lockWaitMs;
    while (true) {
      try { fs.mkdirSync(lock, { mode: 0o700 }); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        metadata = completed(generation, state.key);
        if (metadata) break;
        if (Date.now() >= deadline) throw new Error(`Dependency source is locked: ${lock}. Existing owner and incomplete files were preserved.`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
    if (!metadata) {
      let stage;
      try {
        stage = fs.mkdtempSync(path.join(cacheRoot, `${state.key}.building-`));
        fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
        metadata = completed(generation, state.key);
        if (!metadata) {
          for (const name of Object.keys(state.inputs)) copyPrivate(path.join(component, name), path.join(stage, name));
          try { npm(INSTALL_FLAGS, { cwd: stage }); }
          catch (error) { throw new Error(`Private npm ci failed (${component}): ${String(error.stderr || error.message).trim()}`); }
          verifyPackages(stage, path.join(stage, 'node_modules'));
          if (inputState(component)?.key !== state.key) throw new Error(`Install inputs changed during preparation: ${component}. Existing dependencies were preserved.`);
          metadata = { format: FORMAT, key: state.key, treeHash: dependencyTreeHash(path.join(stage, 'node_modules')), environment: state.environment };
          fs.writeFileSync(path.join(stage, 'node_modules', MARKER), JSON.stringify(metadata));
          // Credentials were needed only while fetching, never retained in the reusable source.
          fs.rmSync(path.join(stage, '.npmrc'), { force: true });
          if (exists(generation)) throw new Error(`Invalid dependency source preserved for inspection: ${generation}`);
          fs.renameSync(stage, generation);
        }
      } finally {
        try { if (stage) fs.rmSync(stage, { recursive: true, force: true, maxRetries: 3 }); }
        finally { fs.rmSync(lock, { recursive: true, force: true, maxRetries: 3 }); }
      }
    }
  }
  const staged = path.join(component, `.node_modules.prepared-${process.pid}`);
  if (exists(staged)) throw new Error(`Prepared dependency directory already exists: ${staged}`);
  try {
    copyPrivate(path.join(generation, 'node_modules'), staged);
    if (dependencyTreeHash(staged) !== metadata.treeHash || inputState(component)?.key !== state.key) throw new Error('Dependency inputs or copied contents changed during preparation.');
    if (exists(modules)) {
      // A matching marker proved these are an unchanged earlier managed installation.
      const own = readJson(path.join(modules, MARKER));
      if (dependencyTreeHash(modules) !== own.treeHash) throw new Error(`Dependencies changed during preparation: ${modules}`);
      const backup = path.join(component, `.node_modules.previous-${process.pid}`);
      if (exists(backup)) throw new Error(`Prior dependency backup already exists: ${backup}`);
      fs.renameSync(modules, backup);
      try { fs.renameSync(staged, modules); }
      catch (error) { fs.renameSync(backup, modules); throw error; }
      fs.rmSync(backup, { recursive: true, force: true });
    } else fs.renameSync(staged, modules);
  } finally { fs.rmSync(staged, { recursive: true, force: true }); }
  return ['node_modules (exact cached source; private copy-on-write/copy)'];
}
