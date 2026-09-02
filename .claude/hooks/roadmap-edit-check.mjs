#!/usr/bin/env node
// roadmap-edit-check.mjs — PostToolUse hook on Edit|Write|MultiEdit.
//
// After a write under docs/roadmap/ or to ROADMAP.md, re-run the roadmap structure check
// and hand any errors back to the session that made the write — the only session that
// knows what the entry meant. Every other write: exit 0, say nothing.
//
// Protocol (Claude Code PostToolUse): exit 0 = nothing to report. exit 2 + stderr = the
// text on stderr goes back to the model. Plain stdout on exit 0 reaches the user's
// transcript only, never the model — which is why errors go to stderr with exit 2.
//
// This is a net with holes: writes made through the shell, or by the app's own agent,
// never pass through here. CI (workspace-ci.yml) is the backstop.
//
// Registered in .claude/settings.json. Tests: node --test .claude/hooks/roadmap-edit-check.test.mjs

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
if (!(rel === 'ROADMAP.md' || rel.startsWith('docs/roadmap/'))) process.exit(0);

// The script ships beside this hook in the workspace, whatever CLAUDE_PROJECT_DIR says.
const script = path.resolve(here, '..', '..', 'scripts', 'roadmap-check.mjs');
const r = spawnSync(process.execPath, [script, '--structure', '--quiet', '--root', root], { encoding: 'utf8' });
if (r.status === 0) process.exit(0);
process.stderr.write(
  'roadmap-check: the roadmap file you just wrote has structure errors — fix them now '
  + '(entry grammar: docs/archive/specs/2026-09-01-roadmap-restructure-design.md §2; '
  + 'filing rule: the bottom of ROADMAP.md)\n' + (r.stdout || '') + (r.stderr || ''),
);
process.exit(2);
