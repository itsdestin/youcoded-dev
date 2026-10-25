import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Both checkpoints and final reports must publish without truncating the last
// readable JSON. A unique, exclusively-created sibling avoids following a stale
// temp symlink or deleting another writer's temp during error cleanup.
export function publishReportJson(outDir, stem, report, { rename = renameSync } = {}) {
  if (typeof stem !== 'string' || !/^[\w-]+$/.test(stem)) throw Error('Invalid report stem');
  const contents = JSON.stringify(report, null, 2);
  mkdirSync(outDir, { recursive: true });
  const root = realpathSync(outDir);
  const target = join(root, `${stem}.json`);
  const checkTarget = () => {
    let stat;
    try { stat = lstatSync(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw Error('Report target must be a regular file, not a symlink');
  };
  checkTarget();
  const temp = join(root, `.${stem}.${randomUUID()}.tmp`);
  let fd, ownedTemp = false;
  try {
    fd = openSync(temp, 'wx', 0o600); ownedTemp = true;
    writeFileSync(fd, contents);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    checkTarget();
    rename(temp, target);
    ownedTemp = false;
  } finally {
    try { if (fd !== undefined) closeSync(fd); }
    finally { if (ownedTemp) unlinkSync(temp); }
  }
  return target;
}

// WHY (acceptance A5): stemFor() is minute-resolution date + sha + label, so a rerun of the
// same commit in the same minute used to overwrite the earlier report. Pick the first free
// stem (stem, stem-2, stem-3, ...) so earlier results are never lost. A stem is taken when
// its json, md or screenshot dir exists, or when `extraTaken` (e.g. archived logs) says so.
// The run lock guarantees no concurrent writer between this check and the first write.
export function uniqueStem(outDir, stem, { extraTaken = () => false, exists = existsSync } = {}) {
  const taken = (s) => exists(join(outDir, `${s}.json`)) || exists(join(outDir, `${s}.md`)) || exists(join(outDir, 'shots', s)) || extraTaken(s);
  if (!taken(stem)) return stem;
  for (let n = 2; n < 1000; n++) if (!taken(`${stem}-${n}`)) return `${stem}-${n}`;
  throw new Error(`no free report stem after ${stem}-999`);
}
