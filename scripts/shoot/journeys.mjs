#!/usr/bin/env node
// journeys — replay every saved journey (or the named ones) in the practice app, several at
// once, and say which step broke. A journey is a short path through the app ending in a
// check of the result ("Settings › Appearance › Midnight" → the theme chip says Midnight),
// recorded with `explore` and saved beside the app's tests (desktop/tests/journeys/).
//
//   journeys.mjs                        all of them (scripts/verify.sh runs this on renderer changes)
//   journeys.mjs send-message theme     just these
//   journeys.mjs --worktree <name|path> another checkout
//
// A failure names the step, what it looked for, and what WAS on screen, with a picture.
// When a button was simply renamed, change that label in the journey's JSON — the journey
// lives in the same repo as the button, so the fix rides in the same commit.
// Spec: docs/active/specs/2026-09-24-shoot-and-explore.md → "Saved journeys".
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, openPool, poolSize, resolveCheckout, runQueue, serve } from './engine.mjs';
import { makeDriver, openApp, stepText } from './driver.mjs';
import { inPage, listLayers } from './explore-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(HERE, '..', '..');
const args = process.argv.slice(2);
let worktree = null; const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--worktree') worktree = args[++i];
  else if (args[i] === '-h' || args[i] === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else names.push(args[i].replace(/\.json$/, ''));
}
const checkout = worktree ? resolveCheckout(worktree) : existsSync(join(WORKSPACE, 'youcoded', 'desktop')) ? join(WORKSPACE, 'youcoded') : resolveCheckout('');
// JOURNEYS_DIR: tests point the runner at a folder of their own journeys.
const dir = process.env.JOURNEYS_DIR ?? join(checkout, 'desktop', 'tests', 'journeys');
const all = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
const unknown = names.filter((n) => !all.includes(n));
if (unknown.length) { console.error(`journeys: no journey named ${unknown.join(', ')} (have: ${all.join(', ') || 'none'})`); process.exit(2); }
const chosen = names.length ? names : all;
if (!chosen.length) { console.log('journeys: none saved yet'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const out = join(WORKSPACE, 'scratch', 'journeys', stamp);
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const server = await serve(await ensureBuild(checkout, (m) => console.error(`[journeys] ${m}`)));
const base = `http://127.0.0.1:${server.port}/index.html`;
const pool = await openPool({ ...poolSize(chosen.length), width: 1440, height: 900 });

const results = await runQueue(pool, chosen, async (tab, name) => {
  const journey = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  const start = journey.start ?? {};
  const r = { name, ok: false, steps: journey.steps.length };
  let i = -1;
  try {
    await openApp(tab, base, start);
    const driver = makeDriver(tab, start);
    for (i = 0; i < journey.steps.length; i++) await driver.perform(journey.steps[i]);
    r.ok = true;
  } catch (e) {
    const s = journey.steps[i];
    r.at = i < 0 ? 'opening the app' : `step ${i + 1} of ${journey.steps.length}: ${stepText(s)}`;
    r.why = e.message;
    r.layers = await tab.evaluate(inPage(listLayers)).then((l) => [...l.layers.map((x) => `${x.kind} "${x.name}"`), 'the app'].join(' › ')).catch(() => '?');
    r.picture = join(out, `${name}.png`);
    writeFileSync(r.picture, await tab.png().catch(() => Buffer.alloc(0)));
  }
  r.errors = tab.takeErrors();
  console.error(`${r.ok ? 'ok  ' : 'FAIL'} ${name}${r.ok ? '' : ` — ${r.at}`}`);
  return r;
});
pool.close(); server.close();

const bad = results.filter((r) => !r.ok);
for (const r of bad) {
  console.log(`\n✗ ${r.name} — ${r.at}\n  ${r.why}\n  layers: ${r.layers}\n  picture: ${r.picture}`);
  if (r.errors.length) console.log(`  page errors: ${r.errors.join(' | ')}`);
  console.log(`  fix: if the app changed on purpose, edit desktop/tests/journeys/${r.name}.json (or re-record with explore); otherwise the app broke.`);
}
console.log(`\njourneys: ${results.length - bad.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(bad.length ? 1 : 0);
