#!/usr/bin/env node
// Provisions a worktree component from the exact reusable dependency source.
// workspace-start uses the same step on create/resume. An unmanaged or locally
// modified installation is preserved and reported, never selectively patched.
//
//   node scripts/fill-missing-deps.mjs <worktree>/youcoded/desktop
//
// Never `npm install` for this: it writes node_modules/.package-lock.json in
// place through the shared inode (docs/PITFALLS.md → Worktrees).
import path from 'node:path';
import { fillMissingPackages } from './workspace-start.mjs';

const dir = path.resolve(process.argv[2] ?? '.');
const notes = fillMissingPackages(dir);
console.log(notes.length ? notes.join('\n') : 'nothing missing');
