#!/usr/bin/env node
// Prints the folder of the photo-only practice app for a checkout, building it first when the
// source changed (engine.mjs → ensureBuild; cached, so an unchanged tree answers at once).
// For tools that are not JavaScript — the review deck's server (Python) serves this folder
// under /app/ — and for anything that wants the built app without starting a browser.
//
//   node scripts/shoot/build.mjs [<worktree name|branch|path>]   → prints the absolute folder
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuild, resolveCheckout } from './engine.mjs';

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = process.argv[2];
try {
  const checkout = target ? resolveCheckout(target)
    : existsSync(join(WORKSPACE, 'youcoded', 'desktop')) ? join(WORKSPACE, 'youcoded') : resolveCheckout('');
  console.log(await ensureBuild(checkout, (m) => console.error(`[build] ${m}`)));
} catch (e) {
  console.error(`build: ${e.message}`);
  process.exit(1);
}
