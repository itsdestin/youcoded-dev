// `shoot --before-file <path>@<ref>`: the "before" side of a before/after is THIS checkout with
// only the named files taken from an older commit — no worktree of the old commit needed.
//
// WHY (submit-ticket friction, proposal 12): a before/after of a one-file change (the shared
// FoldRow) meant swapping the file to HEAD by hand, shooting, and swapping it back — three
// files at once in round 4 — in a checkout another session was also using. `--before` wants a
// whole worktree of an old commit, which also rewinds every other change on the branch.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** `desktop/src/x.tsx@HEAD~1` → { path, ref }. A path may also be written from the workspace
 *  root (`youcoded/desktop/…`); it is always read from the app checkout. */
export function parseBeforeFile(spec) {
  const at = String(spec).lastIndexOf('@');
  if (at <= 0 || at === spec.length - 1) throw new Error(`--before-file takes <path>@<ref> (e.g. desktop/src/renderer/components/ui/FoldRow.tsx@HEAD), not "${spec}"`);
  return { path: spec.slice(0, at).replace(/^youcoded\//, '').replace(/^\.\//, ''), ref: spec.slice(at + 1) };
}

// What the photo-only build never reads and is large: kept out of the copy. node_modules is
// linked separately (below); excluded paths are also safe from rsync's --delete.
const EXCLUDE = ['.git', 'desktop/node_modules', 'desktop/dist', 'desktop/office-addon', 'desktop/release', 'desktop/.dev-instances', 'app/build', 'app/.gradle', '.gradle', 'build'];

/**
 * Makes (or refreshes) a copy of `checkout` under `root` with `overrides` ({ path, ref }[])
 * taken from git, and returns its folder. The same checkout and overrides reuse one folder,
 * and an overridden file keeps the time of its commit, so the photo-only build — fingerprinted
 * by file sizes and times — is only rebuilt when something really changed. The real checkout
 * is only read.
 */
export function prepareBeforeCopy(checkout, overrides, root) {
  const files = [];
  for (const { path, ref } of overrides) {
    const r = spawnSync('git', ['-C', checkout, 'show', `${ref}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`--before-file: ${path} is not in ${ref} (${String(r.stderr).trim().split('\n')[0]})`);
    const when = Number(execFileSync('git', ['-C', checkout, 'log', '-1', '--format=%ct', ref], { encoding: 'utf8' }).trim()) || 0;
    files.push({ path, content: r.stdout, when });
  }
  const key = createHash('sha1').update(checkout + '\n' + overrides.map((o) => `${o.path}@${o.ref}`).sort().join('\n')).digest('hex').slice(0, 12);
  const dest = join(root, key);
  mkdirSync(dest, { recursive: true });
  const sync = spawnSync('rsync', ['-a', '--delete', ...EXCLUDE.flatMap((e) => ['--exclude', `/${e}`]), `${checkout}/`, `${dest}/`], { encoding: 'utf8' });
  if (sync.status !== 0) throw new Error(`--before-file: copying ${checkout} failed: ${sync.stderr || sync.error}`);
  // Dependencies as a hardlink farm, once — the workspace's own pattern (never a symlink).
  const nm = join(checkout, 'desktop', 'node_modules');
  if (existsSync(nm) && !existsSync(join(dest, 'desktop', 'node_modules'))) {
    const cp = spawnSync('cp', ['-al', nm, join(dest, 'desktop', 'node_modules')], { encoding: 'utf8' });
    if (cp.status !== 0) throw new Error(`--before-file: linking node_modules failed: ${cp.stderr}`);
  }
  for (const f of files) {
    const p = join(dest, f.path);
    mkdirSync(dirname(p), { recursive: true });
    rmSync(p, { force: true });   // a fresh file, so nothing shared is written through
    writeFileSync(p, f.content);
    if (f.when) utimesSync(p, f.when, f.when);
  }
  return dest;
}
