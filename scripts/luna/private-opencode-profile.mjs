import { chmod, copyFile, lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function privateDirectory(dir) {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o700 || await realpath(dir) !== dir) {
    throw new Error('Private OpenCode auth directory must be owned, real and mode 0700.');
  }
}

/** WHY: the one private OAuth login shares its initial state root with the
 * separate app sign-in. Clone ONLY that experiment credential into a clean
 * disposable OpenCode process root; never copy installed profile/history.
 * No credential content enters JS, logs or report data. */
export async function stagePrivateOpenCodeProfile({ sourceRoot }) {
  if (typeof sourceRoot !== 'string' || !path.isAbsolute(sourceRoot)) throw new Error('An absolute private experiment auth root is required.');
  const source = path.join(sourceRoot, 'data', 'opencode');
  for (const dir of [sourceRoot, path.join(sourceRoot, 'data'), source]) await privateDirectory(dir);
  const authPath = path.join(source, 'auth.json');
  const auth = await lstat(authPath);
  if (!auth.isFile() || auth.isSymbolicLink() || auth.uid !== process.getuid()
    || (auth.mode & 0o777) !== 0o600) throw new Error('Private OpenCode auth must be an owned regular mode 0600 file.');

  const root = await mkdtemp(path.join(os.tmpdir(), 'luna-opencode-stage-'));
  const cleanup = async () => rm(root, { recursive: true, force: true });
  try {
    await privateDirectory(root);
    const env = { PATH: process.env.PATH, OPENCODE_PURE: '1', YOUCODED_LUNA_EXPERIMENT: '1' };
    for (const [key, name] of [
      ['HOME', 'home'], ['XDG_CONFIG_HOME', 'config'], ['XDG_DATA_HOME', 'data'],
      ['XDG_CACHE_HOME', 'cache'], ['XDG_STATE_HOME', 'state'], ['TMPDIR', 'tmp'],
    ]) {
      env[key] = path.join(root, name);
      await mkdir(env[key], { mode: 0o700 });
    }
    const authRoot = path.join(env.XDG_DATA_HOME, 'opencode');
    await mkdir(authRoot, { mode: 0o700 });
    const copied = path.join(authRoot, 'auth.json');
    await copyFile(authPath, copied);
    await chmod(copied, 0o600);
    return { root, authRoot, env, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
