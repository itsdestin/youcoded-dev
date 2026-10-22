#!/usr/bin/env node
// Tops up a worktree component's hardlinked node_modules against its
// package-lock.json — missing packages and native binaries fetched, major-version
// mismatches replaced, missing .bin commands linked. workspace-start runs the same
// step on create and resume; this is for a merge of master in between. When too
// many packages are behind, it replaces node_modules with a fresh install of its own.
//
//   node scripts/fill-missing-deps.mjs <worktree>/youcoded/desktop
//   node scripts/fill-missing-deps.mjs --fresh <worktree>/youcoded/desktop   (always a fresh install)
//
// Never `npm install` for this: it writes node_modules/.package-lock.json in
// place through the shared inode (docs/PITFALLS.md → Worktrees).
import path from 'node:path';
import { fillMissingPackages, freshInstall } from './workspace-start.mjs';

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const dir = path.resolve(args.find((a) => a !== '--fresh') ?? '.');
if (fresh) {
  freshInstall(dir);
  console.log(`${path.basename(dir)}/node_modules replaced with a fresh install of its own`);
} else {
  const notes = fillMissingPackages(dir, path.basename(dir));
  console.log(notes.length ? notes.join('\n') : 'nothing missing');
}
