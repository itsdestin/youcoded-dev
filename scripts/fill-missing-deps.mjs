#!/usr/bin/env node
// Tops up a worktree component's hardlinked node_modules against its
// package-lock.json — missing packages and native binaries fetched, major-version
// mismatches replaced, missing .bin commands linked. workspace-start runs the same
// step on create and resume; this is for a merge of master in between.
//
//   node scripts/fill-missing-deps.mjs <worktree>/youcoded/desktop
//
// Never `npm install` for this: it writes node_modules/.package-lock.json in
// place through the shared inode (docs/PITFALLS.md → Worktrees).
import path from 'node:path';
import { fillMissingPackages } from './workspace-start.mjs';

const dir = path.resolve(process.argv[2] ?? '.');
const notes = fillMissingPackages(dir, path.basename(dir));
console.log(notes.length ? notes.join('\n') : 'nothing missing');
