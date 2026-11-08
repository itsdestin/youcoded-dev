// The release's "photo copy": the release's own app code, with TODAY's photo machinery laid over it.
//
// WHY (Destin, 2026-11-08: "i think we should get the screenshots from 1.3.3 for everything so we can do a full
// honest comparison"): a release can only photograph the screens its own screen list knows, and the list (with
// its practice pages, sample data and fake backend) has grown since the release shipped — 73 situations of the
// v1.3.3 comparison had no release picture. Those files are photo-only: they never ship in the app (the shoot
// build alone loads them). So the release copy gets today's versions of them and keeps every file of its own
// app code. A practice page that needs something only today's app has fails to build or to open, and that
// screen is then listed as failed — never shown as a picture of the wrong code.
//
// What is laid over (from the after checkout):
//   desktop/src/renderer/dev/**        the screen list, practice pages, sample data, fake backend
//   desktop/src/renderer/shoot-mode.tsx the screen driver the photographer talks to
//   desktop/src/renderer/index.tsx      only its photo-only start-up block (the app's own start-up is the release's)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '.css', '/index.ts', '/index.tsx'];
/** Relative imports of the photo-only files (dev/**, shoot-mode, index.tsx) that point at nothing in this copy. */
function missingImports(rendererDir) {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
  walk(join(rendererDir, 'dev')); files.push(join(rendererDir, 'shoot-mode.tsx'), join(rendererDir, 'index.tsx'));
  const out = new Map();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)) {
    const t = normalize(join(dirname(f), m[1]));
    if (EXT.some((e) => existsSync(t + e))) continue;
    for (const e of EXT.slice(1, 5)) out.set(relative(rendererDir, t + e), true);
  }
  return [...out.keys()].map((file) => ({ file }));
}

/** Builds the copy; returns null when it builds, else the names it misses ({ name, importer }). */
function missingExports(desktopDir) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_') && k !== 'NODE_ENV'));
  const out = join(desktopDir, '.photo-copy-build');
  const r = spawnSync(process.execPath, [join(desktopDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: desktopDir, env: { ...env, VITE_WORKBENCH: '1', VITE_SHOOT: '1' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0) return null;
  const text = (r.stderr + r.stdout).replace(/\x1b\[[0-9;]*m/g, '');
  const found = [];
  for (const m of text.matchAll(/"([\w$]+)" is not exported by "[^"]+"\.\s*\n\s*╭─\[\s*([^:\s]+):/g)) found.push({ name: m[1], importer: m[2] });
  return found.filter((f, i) => found.findIndex((g) => g.name === f.name && g.importer === f.importer) === i);
}
/** Drops `name` from the file's import braces and declares a stand-in that throws when it is used. */
function standIn(file, name) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(new RegExp(`(import\\s*(?:type\\s*)?\\{[^}]*?)\\b(?:type\\s+)?${name}\\b\\s*,?`), '$1');
  // At the end, as a function: a function is usable anywhere in its file (even above it), and throws when used.
  src += `\n// photo copy (what-changed/photo-copy.mjs): "${name}" is not in this release\nfunction ${name}(..._: any[]): any { throw new Error('${name} is not in this release'); }\n`;
  writeFileSync(file, src);
}

const EXCLUDE = ['.git', 'desktop/node_modules', 'desktop/dist', 'desktop/office-addon', 'desktop/release', 'desktop/.dev-instances', 'app/build', 'app/.gradle', '.gradle', 'build'];
const R = 'desktop/src/renderer';

/** The block of index.tsx between the start of the dev-only views and the end of the shoot block. */
const DEV_START = /\n\s*if \(\(import\.meta\.env\.DEV \|\| import\.meta\.env\.VITE_WORKBENCH === '1'\)/;
export function spliceDevBlock(releaseIndex, todayIndex) {
  const a = releaseIndex.search(DEV_START), b = todayIndex.search(DEV_START);
  if (a < 0 || b < 0) throw new Error('index.tsx: could not find the dev-only start-up block on both sides');
  return releaseIndex.slice(0, a) + todayIndex.slice(b);
}

export function preparePhotoCopy({ releaseDir, afterCheckout, root }) {
  const key = createHash('sha1').update(releaseDir + '\n' + afterCheckout).digest('hex').slice(0, 12);
  const dest = join(root, `photo-${key}`);
  mkdirSync(dest, { recursive: true });
  const rs = (args) => { const r = spawnSync('rsync', args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`photo copy: rsync failed: ${r.stderr || r.error}`); };
  rs(['-a', '--delete', ...EXCLUDE.flatMap((e) => ['--exclude', `/${e}`]), `${releaseDir}/`, `${dest}/`]);
  // Today's photo machinery over it. No --delete: the release's own practice files that today no longer has stay.
  rs(['-a', `${afterCheckout}/${R}/dev/`, `${dest}/${R}/dev/`]);
  rs(['-a', `${afterCheckout}/${R}/shoot-mode.tsx`, `${dest}/${R}/shoot-mode.tsx`]);
  const idx = join(dest, R, 'index.tsx');
  writeFileSync(idx, spliceDevBlock(readFileSync(join(releaseDir, R, 'index.tsx'), 'utf8'), readFileSync(join(afterCheckout, R, 'index.tsx'), 'utf8')));
  // WHY borrowed pieces: a practice page may import a module the release did not have (the Tailscale-only message,
  // the buddy's mood table). Without it the whole copy fails to build. Today's module is copied in — nothing of the
  // release's own app imports it, so no release screen changes — and listed in photo-copy.json. The screens that
  // show such a piece are new since the release (newIn: 'after'), so the release side skips them anyway.
  const borrowed = [];
  for (let round = 0; round < 5; round++) {
    const missing = missingImports(join(dest, R)).filter((m) => existsSync(join(afterCheckout, R, m.file)));
    if (!missing.length) break;
    for (const m of missing) { mkdirSync(dirname(join(dest, R, m.file)), { recursive: true }); writeFileSync(join(dest, R, m.file), readFileSync(join(afterCheckout, R, m.file))); borrowed.push(m.file); }
  }
  // Dependencies as a hardlink farm, once — the workspace's own pattern (never a symlink).
  const nm = join(releaseDir, 'desktop', 'node_modules');
  if (existsSync(nm) && !existsSync(join(dest, 'desktop', 'node_modules'))) {
    const cp = spawnSync('cp', ['-al', nm, join(dest, 'desktop', 'node_modules')], { encoding: 'utf8' });
    if (cp.status !== 0) throw new Error(`photo copy: linking node_modules failed: ${cp.stderr}`);
  }
  // WHY stand-ins (2026-11-08: today's practice pages name three parts 1.3.3's files do not have — the voice
  // "listening" strip, the buddy's separate bar buttons, the buddy window's large size): each missing name is
  // replaced, in the importing practice file only, by a stand-in that throws "not in this release" when used.
  // A practice page draws only when its own screen is asked for, so every other screen is untouched, and a
  // screen that needs the part fails on the release side — listed as failed, never pictured wrong.
  const standIns = [];
  for (let round = 0; round < 6; round++) {
    const missing = missingExports(join(dest, 'desktop'));
    if (missing === null) break;
    if (!missing.length) throw new Error('photo copy: the build failed for a reason other than a missing name — see `vite build` in ' + dest);
    for (const { name, importer } of missing) { standIn(join(dest, 'desktop', importer), name); standIns.push(`${importer}: ${name}`); }
  }
  writeFileSync(join(dest, 'photo-copy.json'), JSON.stringify({ release: releaseDir, today: afterCheckout, borrowed, standIns }, null, 1));
  return dest;
}
