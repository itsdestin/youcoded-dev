import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function privateDirectory(dir) {
  const info = lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new Error('Luna shell requires an owned private real directory.');
  }
}

function fixtureRoot() {
  if (process.platform !== 'linux' || process.argv.length !== 4 || process.argv[2] !== '-c') {
    throw new Error('Luna shell requires Linux and one -c command.');
  }
  const raw = process.env.LUNA_FIXTURE_ROOT;
  if (!raw || !path.isAbsolute(raw)) throw new Error('Luna shell requires an absolute fixture root.');
  const root = path.resolve(raw);
  const parent = path.dirname(root);
  const owner = path.dirname(parent);
  const tmp = realpathSync(os.tmpdir());
  // WHY: only an owned, one-run clone may be writable. A host-root bind or a
  // symlinked ancestor would expose real profiles to an arbitrary shell call.
  if (!/^clone-[1-6]$/.test(path.basename(root)) || path.basename(parent) !== 'luna-six-turns'
    || path.dirname(owner) !== tmp || realpathSync(root) !== root) {
    throw new Error('Luna shell fixture path is not a private generated clone.');
  }
  for (const dir of [owner, parent, root]) privateDirectory(dir);
  const cwd = process.cwd();
  const relative = path.relative(root, cwd);
  if (relative.startsWith('..') || path.isAbsolute(relative) || realpathSync(cwd) !== cwd) {
    throw new Error('Luna shell cwd must stay inside its clone.');
  }
  return { root, cwd, tmp };
}

function mountParents(root, tmp) {
  const parts = path.relative(tmp, path.dirname(root)).split(path.sep);
  let at = tmp;
  return parts.flatMap((part) => {
    at = path.join(at, part);
    return ['--dir', at];
  });
}

try {
  const { root, cwd, tmp } = fixtureRoot();
  const args = [
    '--unshare-user', '--unshare-net', '--unshare-pid', '--unshare-ipc', '--die-with-parent',
    '--clearenv', '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin',
    '--setenv', 'HOME', '/tmp', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', 'C',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64', '--ro-bind', '/bin', '/bin',
    '--tmpfs', tmp, ...mountParents(root, tmp), '--bind', root, root,
    '--proc', '/proc', '--dev', '/dev', '--chdir', cwd, '--', '/bin/bash', '-c', process.argv[3],
  ];
  const child = spawn('/usr/bin/bwrap', args, { stdio: 'inherit', env: { PATH: '/usr/bin:/bin' } });
  child.on('error', (error) => { console.error(`Luna shell isolation unavailable: ${error.message}`); process.exitCode = 70; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 128 : 70); });
} catch (error) {
  console.error(`Luna shell isolation refused: ${error.message}`);
  process.exitCode = 70;
}
