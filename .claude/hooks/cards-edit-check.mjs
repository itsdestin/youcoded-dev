#!/usr/bin/env node
// cards-edit-check.mjs — PostToolUse hook on Edit|Write|MultiEdit.
//
// After a write under cards/, re-run `cards.mjs check` and hand any errors back to the session
// that made the write — the only session that knows what the card meant. Every other write:
// exit 0, say nothing.
//
// WHY (2026-10-15): the work cards replaced the old roadmap, and this replaced the roadmap's own
// edit check. A card with a bad stage, a "needs" naming no card, or two overlapping Planning cards
// is cheapest to fix in the chat that just wrote it.
//
// Protocol (Claude Code PostToolUse): exit 0 = nothing to report. exit 2 + stderr = the
// text on stderr goes back to the model. Plain stdout on exit 0 reaches the user's
// transcript only, never the model — which is why errors go to stderr with exit 2.
//
// This is a net with holes: writes made through the shell (including `cards.mjs new`, which
// checks before it writes), or by the app's own agent, never pass through here. CI
// (workspace-ci.yml) is the backstop.
//
// Registered in .claude/settings.json. Tests: node --test .claude/hooks/cards-edit-check.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
let filePath = '';
try { filePath = JSON.parse(input)?.tool_input?.file_path ?? ''; } catch { process.exit(0); }
if (!filePath) process.exit(0);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(here, '..', '..');
const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
if (!rel.startsWith('cards/')) process.exit(0);

// The script ships beside this hook in the workspace, whatever CLAUDE_PROJECT_DIR says.
const script = path.resolve(here, '..', '..', 'scripts', 'cards.mjs');
const r = spawnSync(process.execPath, [script, 'check', '--root', root], { encoding: 'utf8' });
if (r.status === 0) process.exit(0);
process.stderr.write(
  'cards: the card you just wrote breaks `node scripts/cards.mjs check` — fix it now. '
  + 'Stages are explore, planning, build, polish, merged; "needs" and "related" name card ids '
  + 'that exist; two Planning-or-later cards may not overlap (merge them into one).\n'
  + (r.stdout || '') + (r.stderr || ''),
);
process.exit(2);
