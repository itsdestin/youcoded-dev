#!/usr/bin/env node
// scripts/command-center/render-grid.mjs — inline scratch/command-center/grid.json into
// grid.tpl.html and write the self-contained map page, then (unless --no-shot) screenshot
// both views with ui-probe.
//
// WHY: the first render of this page was done by hand from a scratchpad template, which
// is exactly the "generated once, drifts forever" failure the command center exists to
// end. Regenerating is one command: aggregate.mjs → render-grid.mjs.
//
//   node scripts/command-center/aggregate.mjs
//   node scripts/command-center/render-grid.mjs [--out <dir>] [--no-shot]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const outDir = args.includes('--out')
  ? path.resolve(args[args.indexOf('--out') + 1])
  : path.join(root, 'docs/active/design/2026-10-06-master-plan/map');
const noShot = args.includes('--no-shot');

const data = fs.readFileSync(path.join(root, 'scratch/command-center/grid.json'), 'utf8');
const tpl = fs.readFileSync(path.join(here, 'grid.tpl.html'), 'utf8');
if (!tpl.includes('__DATA__')) throw new Error('grid.tpl.html has no __DATA__ slot');
// WHY split/join, not replace: the JSON may contain "$&"-style sequences that
// String.replace would interpret as replacement patterns.
const html = tpl.split('__DATA__').join(data);
fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, 'grid.html');
fs.writeFileSync(htmlPath, html);
console.log(`wrote ${path.relative(root, htmlPath)} (${(html.length / 1024).toFixed(0)} KB)`);

if (noShot) process.exit(0);
const probe = path.join(root, 'scripts/ui-probe.mjs');
const shots = [
  ['grid.png', `file://${htmlPath}`, '1600x2000'],
  ['grid-branches.png', `file://${htmlPath}?view=branches`, '1600x2700'],
];
for (const [name, url, size] of shots) {
  const shot = path.join(outDir, name);
  const r = spawnSync('node', [probe, url, '--size', size, '--shot', shot, '--no-motion', '--settle', '800'], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`ui-probe failed for ${name}`); process.exit(r.status ?? 1); }
  // WHY pngquant when present: the deck tooling and the owner's harness choke on big
  // images; the first renders were 250 KB only because the agent quantised them.
  if (spawnSync('which', ['pngquant']).status === 0) {
    spawnSync('pngquant', ['--force', '--ext', '.png', '--quality', '60-85', shot], { stdio: 'inherit' });
  }
  console.log(`${name}: ${(fs.statSync(shot).size / 1024).toFixed(0)} KB`);
}
