#!/usr/bin/env node
// Dev only: opens the page in a headless browser with sample tasks and clicks through every
// main journey (dev/smoke-flow.js). Exits 1 naming each check that failed.
//   node pages/tasks/dev/smoke.mjs --app <youcoded checkout> [--size 1400x860]
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : f; };
const out = join(mkdtempSync(join(tmpdir(), 'tasks-smoke-')), 'preview.html');
execFileSync('node', [join(here, '..', 'build.mjs'), '--check'], { stdio: 'inherit' });
execFileSync('node', [join(here, 'preview.mjs'), '--app', arg('app', ''), '--out', out], { stdio: 'ignore' });
const res = execFileSync('node', [join(root, 'scripts/ui-probe.mjs'), 'file://' + out, '--size', arg('size', '1400x860'), '--wait', "document.querySelector('.t-task')", '--eval', readFileSync(join(here, 'smoke-flow.js'), 'utf8'), '--json', '--keep-going'], { encoding: 'utf8', maxBuffer: 1 << 26 });
let fails = null, errors = [];
try {
  // ui-probe --json: one entry per size, each with its evals' values and the page's console errors.
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (Array.isArray(v.errors)) errors.push(...v.errors); if (typeof v.value === 'string' && v.value.startsWith('[')) fails = JSON.parse(v.value); Object.values(v).forEach(walk); } };
  walk(JSON.parse(res));
} catch (e) {}
if (errors.length) { console.error('the page logged errors:\n - ' + errors.map((e) => JSON.stringify(e)).join('\n - ')); process.exit(1); }
if (!fails) { console.error('could not read the result:\n' + res.slice(0, 3000)); process.exit(2); }
if (fails.length) { console.error(fails.length + ' check(s) failed:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('all journeys passed');
