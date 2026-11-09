import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, lstat, readdir, readlink, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function durableCreate(path, bytes, mode = 0o600) {
  const handle = await open(path, 'wx', mode);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Stage private candidates and byte-exact backups; this never changes a transcript. */
export async function stageRecovery(directory, changes) {
  directory = resolve(directory);
  if (!changes.length) throw new Error('No recovery changes supplied');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const entries = [];
  const seen = new Set();
  for (const [index, change] of changes.entries()) {
    const target = resolve(change.target);
    if (seen.has(target)) throw new Error(`Duplicate recovery target: ${target}`);
    seen.add(target);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || !target.endsWith('.jsonl'))
      throw new Error(`Recovery target must be a regular JSONL file: ${target}`);
    if (!/^[a-f0-9]{64}$/.test(change.expectedOriginalSha256 ?? ''))
      throw new Error(`Candidate producer must supply its source checksum: ${target}`);
    const original = await readFile(target);
    // WHY: the candidate was derived before this read; refuse intervening appends
    // rather than blessing a stale candidate with the newer source's checksum.
    if (change.expectedOriginalSha256 && digest(original) !== change.expectedOriginalSha256)
      throw new Error(`Transcript changed while preparing candidate: ${target}`);
    const candidate = Buffer.from(change.contents);
    if (digest(original) === digest(candidate)) throw new Error(`Unchanged recovery target: ${target}`);
    const backup = join(directory, `${index}.original`);
    const repaired = join(directory, `${index}.repaired`);
    await durableCreate(backup, original);
    await durableCreate(repaired, candidate);
    entries.push({ target, backup, candidate: repaired, originalSha256: digest(original),
      candidateSha256: digest(candidate), mode: info.mode & 0o777, reason: change.reason });
  }
  const manifest = join(directory, 'manifest.json');
  await durableCreate(manifest, JSON.stringify({ version: 1, entries }, null, 2) + '\n');
  // WHY: file fsync alone does not durably publish the backup/manifest names.
  await syncDirectory(directory);
  await syncDirectory(dirname(directory));
  return manifest;
}

/** External process observation only: no IPC, DevTools, signals or app access. */
export async function appIsRunning({ io = { readdir, readlink, lstat, readFile }, uid = process.getuid?.() } = {}) {
  if (process.platform !== 'linux') throw new Error('Automatic recovery process guard supports Linux only');
  const pids = await io.readdir('/proc');
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if ((await io.lstat(`/proc/${pid}`)).uid !== uid) continue;
      let executable;
      // A running binary replaced on disk keeps the kernel's " (deleted)" suffix.
      try { executable = basename(await io.readlink(`/proc/${pid}/exe`)).replace(/ \(deleted\)$/, '').toLowerCase(); }
      catch (error) {
        if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
        // WHY: protected user daemons deny exe links even to their owner. Allow
        // only independently matched OS identities, never an unknown/app role.
        const comm = (await io.readFile(`/proc/${pid}/comm`)).toString().trim();
        const argv0 = (await io.readFile(`/proc/${pid}/cmdline`)).toString().split('\0')[0];
        const protectedDaemons = new Map([
          ['systemd', '/usr/lib/systemd/systemd'], ['(sd-pam)', '(sd-pam)'],
          ['gpg-agent', 'gpg-agent'], ['scdaemon', 'scdaemon'],
          ['kwin_wayland', '/usr/bin/kwin_wayland'],
          ['polkit-kde-auth', '/usr/lib/polkit-kde-authentication-agent-1'],
        ]);
        if (protectedDaemons.get(comm) === argv0) continue;
        throw error;
      }
      if (!executable.includes('youcoded') && executable !== 'electron') continue;
      const args = (await io.readFile(`/proc/${pid}/cmdline`)).toString().split('\0');
      const type = args.find(arg => arg.startsWith('--type='))?.slice('--type='.length);
      // WHY: the main process owns session persistence. Orphan Chromium helpers
      // can survive it indefinitely; treating them as the app prevented recovery
      // after a real quit. Unknown process roles still block conservatively.
      if (!type || !['zygote', 'gpu-process', 'renderer', 'utility'].includes(type)) return true;
      // Never replace a transcript held open by a surviving helper either.
      for (const fd of await io.readdir(`/proc/${pid}/fd`)) {
        try {
          const target = await io.readlink(`/proc/${pid}/fd/${fd}`);
          if (target.includes('/.youcoded/sessions/') || target.includes('/Conversations/native/')) return true;
        } catch (error) {
          if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
        }
      }
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) continue;
      // A same-user process we cannot inspect is not evidence the app exited.
      throw new Error(`Cannot inspect process ${pid}; refusing recovery: ${error.message}`);
    }
  }
  return false;
}

async function inspectEntry(entry) {
  const info = await lstat(entry.target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Recovery target changed type: ${entry.target}`);
  const [current, candidate, backup] = await Promise.all([
    readFile(entry.target), readFile(entry.candidate), readFile(entry.backup),
  ]);
  if (digest(candidate) !== entry.candidateSha256) throw new Error(`Recovery candidate changed: ${entry.target}`);
  if (digest(backup) !== entry.originalSha256) throw new Error(`Recovery backup changed: ${entry.target}`);
  const currentSha = digest(current);
  if (currentSha === entry.candidateSha256) return { candidate, alreadyApplied: true };
  if (currentSha !== entry.originalSha256) throw new Error(`Transcript changed after staging; refusing to overwrite: ${entry.target}`);
  return { candidate, alreadyApplied: false };
}

/** Refuse observed writers or stale input, then atomically replace each target.
 * OPERATIONAL PRECONDITION: keep YouCoded/Electron closed until this command has
 * finished. Process observation cannot exclude a concurrent relaunch; this is
 * an offline maintenance operation, not an app startup lock. */
export async function applyRecovery(manifestPath, options = {}) {
  const isRunning = options.appIsRunning ?? appIsRunning;
  if (await isRunning()) throw new Error('YouCoded/Electron is still running; no transcript was changed');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.entries) || !manifest.entries.length)
    throw new Error('Invalid recovery manifest');
  // WHY: preflight ALL source hashes before the first replacement. One resumed
  // conversation changing must not cause a half-applied stale recovery batch.
  for (const entry of manifest.entries) await inspectEntry(entry);
  const results = [];
  for (const entry of manifest.entries) {
    if (await isRunning()) throw new Error('YouCoded/Electron is running; remaining replacements were refused');
    const { candidate, alreadyApplied } = await inspectEntry(entry);
    if (alreadyApplied) { results.push({ target: entry.target, status: 'already-applied' }); continue; }
    const temporary = join(dirname(entry.target), `.${basename(entry.target)}.recovery-${randomUUID()}`);
    try {
      await durableCreate(temporary, candidate, entry.mode);
      // Recheck after staging the same-directory file, immediately before rename.
      if (await isRunning()) throw new Error('YouCoded/Electron is running; replacement refused');
      await inspectEntry(entry);
      await rename(temporary, entry.target);
      const parent = await open(dirname(entry.target), 'r');
      try { await parent.sync(); } finally { await parent.close(); }
      if (digest(await readFile(entry.target)) !== entry.candidateSha256)
        throw new Error(`Post-replacement verification failed: ${entry.target}`);
      results.push({ target: entry.target, status: 'applied' });
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, manifest] = process.argv.slice(2);
  if (!['--apply', '--wait'].includes(mode) || !manifest) {
    console.error('Usage: node scripts/apply-session-recovery.mjs <--apply|--wait> <private-manifest.json>');
    process.exitCode = 2;
  } else {
    try {
      if (mode === '--wait') {
        console.log('Waiting for YouCoded/Electron to exit. No live files will be modified.');
        while (await appIsRunning()) await new Promise(resolveWait => setTimeout(resolveWait, 1000));
      }
      const results = await applyRecovery(resolve(manifest));
      console.log(JSON.stringify(results, null, 2));
      await durableCreate(join(dirname(resolve(manifest)), `outcome-${Date.now()}.json`),
        JSON.stringify({ completedAt: new Date().toISOString(), results }, null, 2) + '\n');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
