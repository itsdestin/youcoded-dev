import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FILES = Object.freeze({
  'AGENTS.md': `# Synthetic project instructions\nUse only this fixture. Keep changes minimal and run the local checks.\nStable facts: codename LUNA-MAPLE; release channel amber; module count 3.\n`,
  'README.md': `# Luna sample app\nThis deterministic offline fixture has no dependencies or network use.\nExpected retryLimit is 3; config.json intentionally disagrees.\nThe independent second change is the app greeting marker.\n`,
  'config.json': `{"theme":"light","retryLimit":1}\n`,
  'src/app.js': `export const greeting = 'LUNA-ORIGINAL';\nexport const modules = ['alpha', 'beta', 'gamma'];\n`,
  'check-config.mjs': `import assert from 'node:assert/strict';\nimport config from './config.json' with { type: 'json' };\nassert.equal(config.retryLimit, 3);\nconsole.log('config check passed');\n`,
  'check-greeting.mjs': `import assert from 'node:assert/strict';\nimport { greeting } from './src/app.js';\nassert.equal(greeting, 'LUNA-SECOND-CHANGE');\nconsole.log('greeting check passed');\n`,
  'check.mjs': `import assert from 'node:assert/strict';\nimport config from './config.json' with { type: 'json' };\nimport { greeting, modules } from './src/app.js';\nassert.equal(config.retryLimit, 3);\nassert.equal(greeting, 'LUNA-SECOND-CHANGE');\nassert.equal(modules.length, 3);\nconsole.log('fixture checks passed');\n`,
});

// WHY: future turns must not appear in the project the agent inspects on turn 1.
// The runner sends these exact immutable strings in both arms, in this order.
export const PROMPTS = Object.freeze([
  'Read AGENTS.md and inspect the app. Report its structure, module count, codename and release channel. Do not change files.',
  'Diagnose the retryLimit disagreement between README.md and config.json. Do not change files.',
  'Fix the retryLimit disagreement without changing any other settings. Run node check-config.mjs and report its outcome.',
  'Recall the codename and release channel from earlier. Change the app greeting to LUNA-SECOND-CHANGE without changing the modules. Run node check-greeting.mjs and report its outcome.',
  'After the full client-process restart, inspect the current project state. Say what was completed before the restart and recover the codename and release channel from the earlier work without being retold their values.',
  'Run node check.mjs and summarize both changes and all test outcomes. Do not change files unless needed to complete the requested fixes.',
]);
const INITIAL = Object.freeze({ config: '{"theme":"light","retryLimit":1}\n', app: "export const greeting = 'LUNA-ORIGINAL';\nexport const modules = ['alpha', 'beta', 'gamma'];\n" });
const APP_FIXED = "export const greeting = 'LUNA-SECOND-CHANGE';\nexport const modules = ['alpha', 'beta', 'gamma'];\n";
const generated = new Map();

async function assertNoLinks(dir) {
  for (const name of await readdir(dir)) {
    const entry = path.join(dir, name);
    const info = await lstat(entry);
    if (info.isSymbolicLink()) throw new Error(`Fixture symlink refused: ${entry}`);
    if (info.isDirectory()) await assertNoLinks(entry);
    else if (!info.isFile()) throw new Error(`Unsupported fixture entry refused: ${entry}`);
  }
}

export async function buildFixture(parentDirectory) {
  if (typeof parentDirectory !== 'string' || !path.isAbsolute(parentDirectory)) throw new TypeError('Use an absolute, caller-owned temporary directory.');
  const parentInfo = await lstat(parentDirectory);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error('Fixture parent must be a real private directory, not a symlink.');
  const parent = await realpath(parentDirectory);
  if ((parentInfo.mode & 0o077) !== 0) throw new Error('Fixture parent must be private (mode 0700 or stricter).');
  if ((await readdir(parent)).length !== 0) throw new Error('Fixture parent must be empty and caller-owned.');
  const fixtureRoot = path.join(parent, 'luna-six-turns');
  await mkdir(fixtureRoot, { mode: 0o700 });
  const roots = [];
  // WHY: writing one frozen template into each root avoids copy-tool metadata or platform-dependent archive differences between arms.
  for (let index = 1; index <= 6; index++) {
    const clone = path.join(fixtureRoot, `clone-${index}`);
    await mkdir(path.join(clone, 'src'), { recursive: true, mode: 0o700 });
    for (const [relative, contents] of Object.entries(FILES)) {
      const target = path.join(clone, relative);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    roots.push(clone);
  }
  // WHY: bind correctness reads to directories minted by this controller,
  // not a lookalike path an agent could point the verifier at.
  const rootInfo = await lstat(fixtureRoot);
  for (const clone of roots) {
    const info = await lstat(clone);
    generated.set(clone, { root: fixtureRoot, rootDev: rootInfo.dev, rootIno: rootInfo.ino, dev: info.dev, ino: info.ino });
  }
  return Object.freeze({ root: fixtureRoot, roots: Object.freeze(roots) });
}

export async function verifyFixture(cloneRoot) {
  if (typeof cloneRoot !== 'string' || !path.isAbsolute(cloneRoot)) throw new TypeError('Fixture clone path must be absolute.');
  const normalized = path.resolve(cloneRoot);
  if (!/^clone-[1-6]$/.test(path.basename(normalized)) || path.basename(path.dirname(normalized)) !== 'luna-six-turns') {
    throw new Error('Verifier accepts only clone roots inside a generated luna-six-turns fixture.');
  }
  const issued = generated.get(normalized);
  if (!issued) throw new Error('Fixture clone was not generated by this controller.');
  const [info, rootInfo] = await Promise.all([lstat(normalized), lstat(issued.root)]);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(normalized) !== normalized
      || info.dev !== issued.dev || info.ino !== issued.ino
      || rootInfo.dev !== issued.rootDev || rootInfo.ino !== issued.rootIno) {
    throw new Error('Fixture clone and its ancestors must be the generated real directories, not replacements or symlinks.');
  }
  await assertNoLinks(cloneRoot);
  // WHY: correctness must not be credited when the agent rewrites its own
  // instructions or verifier; the two intended edits are the only exceptions.
  for (const [relative, original] of Object.entries(FILES)) {
    if (relative === 'config.json' || relative === 'src/app.js') continue;
    if (await readFile(path.join(cloneRoot, relative), 'utf8') !== original) {
      throw new Error(`Altered fixture file: ${relative}`);
    }
  }
  const config = await readFile(path.join(cloneRoot, 'config.json'), 'utf8');
  const app = await readFile(path.join(cloneRoot, 'src/app.js'), 'utf8');
  // WHY: an agent may format JSON without changing its meaning; correctness
  // checks compare the declared keys and values, not one serialized spelling.
  let parsed;
  try { parsed = JSON.parse(config); } catch { throw new Error('Unexpected config state.'); }
  const intact = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.keys(parsed).sort().join(',') === 'retryLimit,theme' && parsed.theme === 'light';
  if (!intact || (parsed.retryLimit !== 1 && parsed.retryLimit !== 3)) throw new Error('Unexpected config state.');
  const configFixed = parsed.retryLimit === 3;
  const appFixed = app === APP_FIXED;
  if (!appFixed && app !== INITIAL.app) throw new Error('Unexpected app state.');
  if (configFixed && appFixed) return 'both-change';
  if (configFixed || appFixed) return 'one-change';
  return 'initial';
}
