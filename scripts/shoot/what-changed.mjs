#!/usr/bin/env node
// what-changed — "what changed since the last release", in one command.
//
//   node scripts/shoot/what-changed.mjs [--since v1.3.3] [--after .] [--themes a,b|all] [--out <dir>] [--only 'settings/*' …]
//
// Makes (or reuses) a checkout of the release tag, photographs every screen of it and of the
// current code with `shoot` (each picture also gets its element list), then compares the two
// (what-changed/compare.mjs) into <out>/changes.json. Format: scripts/shoot/what-changed/FORMAT.md.
//   --since   release tag to compare against (default: the newest v* tag of youcoded/)
//   --after   the current code: a worktree or folder, as for shoot (default: this workspace's youcoded/)
//   --only    screen names/globs to limit the run (default: every screen); repeatable
//   --out     run folder (default: scratch/what-changed/<since>-<timestamp>)
//   --compare-only <run>   skip the shooting and redo only the comparison of an existing run (uses its before-2/ after-2/ repeat pictures if present)
// Remove the release checkout when done:  git -C youcoded worktree remove --force scratch/release-<tag>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { latestReleaseTag, prepareReleaseCheckout } from './what-changed/release-checkout.mjs';
import { compareRun, summaryLine } from './what-changed/compare.mjs';
import { resolveCheckout } from './engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');
const die = (m) => { console.error(`what-changed: ${m}`); process.exit(2); };

const opt = { since: null, after: null, themes: null, out: null, only: [], compareOnly: null };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i]; const next = () => args[++i] ?? die(`${a} needs a value`);
  if (a === '--since') opt.since = next(); else if (a === '--after') opt.after = next(); else if (a === '--themes') opt.themes = next();
  else if (a === '--out') opt.out = resolve(next()); else if (a === '--only') opt.only.push(next()); else if (a === '--compare-only') opt.compareOnly = resolve(next());
  else if (a === '-h' || a === '--help') { console.log(spawnSync('sed', ['-n', '2,16p', fileURLToPath(import.meta.url)], { encoding: 'utf8' }).stdout.replace(/^\/\/ ?/gm, '')); process.exit(0); }
  else die(`unknown option ${a}`);
}

const appRepo = join(WORKSPACE, 'youcoded');
const t0 = Date.now();
// WHY a second pass (flicker filter): a few spots change between two pictures of the SAME code (a
// glow, a late image, an Office cursor). Every changed screen x theme is shot once more on each side,
// and compare.mjs drops differences that also differ between a side's own two pictures. One shoot per
// side, so the browser starts twice, not once per screen. Pictures already in before-2/ and after-2/
// are reused, so a repeated --compare-only costs nothing.
function repeatPass(out, result, beforeDir, afterDir) {
  const have = (side, s) => existsSync(join(out, side, ...s.name.split('/'), `${s.theme}.png`));
  const flagged = result.screens.filter((s) => s.status === 'changed' && !(have('before-2', s) && have('after-2', s)));
  if (!flagged.length) return result;
  const names = [...new Set(flagged.map((s) => s.name))];
  const themes = [...new Set(flagged.map((s) => s.theme))];
  console.error(`[what-changed] flicker check: ${flagged.length} changed picture(s) shot once more per side`);
  for (const [dir, folder] of [[beforeDir, 'before-2'], [afterDir, 'after-2']]) {
    const r = spawnSync(process.execPath, [join(HERE, 'shoot.mjs'), ...names, '--worktree', dir, '--themes', themes.join(','), '--out', join(out, folder), '--no-montage', '--freeze'], { stdio: 'inherit' });
    if (r.status !== 0) console.error(`[what-changed] the repeat pictures (${folder}) did not finish; their flicker check is skipped`);
  }
  return compareRun(out);
}
if (opt.compareOnly) {
  let res = compareRun(opt.compareOnly);
  const meta = JSON.parse(readFileSync(join(opt.compareOnly, 'run.json'), 'utf8'));
  res = repeatPass(opt.compareOnly, res, meta.before.dir, meta.after.dir);
  console.log(`${summaryLine(res)}\n${join(opt.compareOnly, 'changes.json')}`);
  process.exit(0);
}

const tag = opt.since ?? latestReleaseTag(appRepo) ?? die('no v* release tag in youcoded/ — pass --since <tag>');
let afterCheckout;
try { afterCheckout = opt.after ? resolveCheckout(opt.after) : resolveCheckout(WORKSPACE); } catch (e) { die(e.message); }
let before;
try { before = prepareReleaseCheckout({ appRepo, tag, afterCheckout, scratchRoot: join(WORKSPACE, 'scratch') }); } catch (e) { die(e.message); }

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const out = opt.out ?? join(WORKSPACE, 'scratch', 'what-changed', `${tag}-${stamp}`);
mkdirSync(out, { recursive: true });
const rev = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).stdout.trim();
// WHY run.json: the comparer names both sides in changes.json from it (labels and commits).
writeFileSync(join(out, 'run.json'), JSON.stringify({
  before: { label: tag, commit: rev(before.dir, 'rev-parse', '--short', 'HEAD'), dir: before.dir },
  after: { label: rev(afterCheckout, 'branch', '--show-current') || 'current code', commit: rev(afterCheckout, 'rev-parse', '--short', 'HEAD'), dir: afterCheckout },
}, null, 1));

console.error(`[what-changed] ${tag} (${before.dir}) vs ${afterCheckout} → ${out}`);
const shootArgs = [join(HERE, 'shoot.mjs'), ...(opt.only.length ? opt.only : ['--all']), '--before', before.dir, '--after', afterCheckout, '--out', out, '--no-montage', '--freeze', ...(opt.themes ? ['--themes', opt.themes] : [])];
const shot = spawnSync(process.execPath, shootArgs, { stdio: 'inherit' });
if (shot.status !== 0) die(`shoot stopped with exit code ${shot.status} — see above`);

let result = compareRun(out);

result = repeatPass(out, result, before.dir, afterCheckout);
const unstable = result.screens.reduce((n, s) => n + (s.unstable ?? 0), 0);
console.log(`\n${summaryLine(result)}${unstable ? ` · ${unstable} flickering spot(s) ignored` : ''}\nrun folder: ${out}\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
