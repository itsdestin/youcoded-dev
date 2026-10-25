import { userInfo } from 'node:os';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export function accountHome({ platform = process.platform, uid = () => process.getuid(),
  euid = () => process.geteuid(), account: readAccount = userInfo, realpath = realpathSync } = {}) {
  if (platform !== 'linux') return null;
  // WHY: worker HOME is already the fixture at import time. Linux userInfo reads
  // the current UID's account record, not HOME, SUDO_USER or a caller's plan.
  // Refuse credential changes/invalid records rather than trusting a claimed home.
  // Require filesystem-canonical spelling too: symlinks in the home or its
  // ancestors must not leave the protected markers pointing at an alias.
  const account = readAccount(), ownerUid = uid();
  if (account.uid !== ownerUid || euid() !== ownerUid
    || typeof account.homedir !== 'string' || !isAbsolute(account.homedir)
    || resolve(account.homedir) !== account.homedir || account.homedir === '/'
    || realpath(account.homedir) !== account.homedir) {
    throw Error('Unverified Linux owner account home');
  }
  return account.homedir;
}
export const LINUX_OWNER_HOME = accountHome();
export const OWNER_MARKERS = Object.freeze(LINUX_OWNER_HOME
  ? ['.config/youcoded', '.youcoded', '.claude'].map(path => `${LINUX_OWNER_HOME}/${path}`)
  : []);
