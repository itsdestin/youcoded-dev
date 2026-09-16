#!/usr/bin/env node
// Fetches the packages a worktree component's package-lock.json requires but
// its hardlinked node_modules lacks — the step workspace-start runs when it
// CREATES a worktree, for the case it cannot see: merging master into an
// existing worktree later, which can bring a new dependency with it.
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
