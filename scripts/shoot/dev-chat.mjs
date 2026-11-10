#!/usr/bin/env node
// Drive a DEV window's Claude Code chat: start a chat, set the permission mode, say something,
// click a button by its label, take a picture. For testing in a window `run-dev.sh` started.
//
// STATUS: UNPROVEN AGAINST A REAL WINDOW (written 2026-11-10 without launching one: a test copy
// currently shares the owner's real settings and chat history — his open decision). The unit test
// (scripts/shoot/tests/dev-chat.test.mjs) proves the verbs against a stub page only. What a first
// real run must confirm is in docs/local-dev.md -> "Driving a dev window's Claude Code chat".
//
// Usage (each call attaches, does one thing, detaches):
//   node scripts/shoot/dev-chat.mjs [--worktree <name|path>] [--offset <n>] new <folder>
//   node scripts/shoot/dev-chat.mjs [--worktree …] mode normal|auto
//   node scripts/shoot/dev-chat.mjs [--worktree …] say "<text>"
//   node scripts/shoot/dev-chat.mjs [--worktree …] click "<button label>"
//   node scripts/shoot/dev-chat.mjs [--worktree …] shot [file.png]
//
// WHY it cannot touch the installed app: it has no port option and no URL option. The ONLY way in
// is engine.mjs findDevWindow(), which returns a window only when the marker run-dev.sh writes
// (desktop/.dev-instances/*.json) names a live run-dev.sh process, then attachPage() to that
// marker's own port; dev-chat-lib.mjs re-checks the marker and that the page is the dev server's
// http://localhost:<vitePort>. A session created here is a REAL conversation in the profile's
// transcripts (docs/local-dev.md, "A session you create here…") — launch the dev window against a
// throwaway HOME first.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachPage, findDevWindow, resolveCheckout } from './engine.mjs';
import { attachDev, clickLabel, newChat, say, setMode, shot } from './dev-chat-lib.mjs';

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const die = (m) => { console.error(m); process.exit(1); };

const args = process.argv.slice(2);
let worktree = '';
// --offset picks one dev window when several run from the same checkout (the number run-dev.sh
// recorded in its marker); without it, more than one live window is refused.
let offset;
while (args[0] === '--worktree' || args[0] === '--offset') {
  const [flag, val] = args.splice(0, 2);
  if (val === undefined) die(`${flag} needs a value`);
  if (flag === '--worktree') worktree = val;
  else { if (!/^\d+$/.test(val)) die('--offset needs a whole number'); offset = val; }
}
const [verb, ...rest] = args;
const need = (n, what) => { if (rest.length < n || !rest[0]) die(`usage: dev-chat.mjs ${verb} ${what}`); };
if (!['new', 'mode', 'say', 'click', 'shot'].includes(verb)) die('usage: dev-chat.mjs [--worktree <w>] [--offset <n>] new <folder> | mode normal|auto | say "<text>" | click "<label>" | shot [file.png]');
if (verb === 'new') need(1, '<folder>');
if (verb === 'mode') need(1, 'normal|auto');
if (verb === 'say') need(1, '"<text>"');
if (verb === 'click') need(1, '"<button label>"');

// This workspace's own app checkout, as shoot/explore choose it.
const local = join(WORKSPACE, 'youcoded');
const checkout = worktree ? resolveCheckout(worktree) : existsSync(join(local, 'desktop')) ? local : resolveCheckout('');

let tab;
try {
  tab = await attachDev(checkout, { findDevWindow, attachPage, offset });
  let out;
  if (verb === 'new') out = await newChat(tab, rest[0]);
  else if (verb === 'mode') out = await setMode(tab, rest[0]);
  else if (verb === 'say') out = await say(tab, rest.join(' '));
  else if (verb === 'click') out = await clickLabel(tab, rest.join(' '));
  else {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const file = rest[0] ? resolve(rest[0]) : join(WORKSPACE, 'scratch', 'dev-chat', `${stamp}.png`);
    mkdirSync(dirname(file), { recursive: true });
    out = await shot(tab, file, { write: writeFileSync });
  }
  console.log(out);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await tab?.close?.();
}
process.exit(process.exitCode ?? 0);
