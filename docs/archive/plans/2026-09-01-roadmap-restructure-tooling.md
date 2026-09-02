---
date: 2026-09-01
status: shipped
type: plan
topic: Roadmap restructure — roadmap-check tool, edit hook, CI wiring, skeleton, migration runbook
spec: docs/archive/specs/2026-09-01-roadmap-restructure-design.md
---

# Roadmap Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tool, hook and CI step that check the per-area roadmap (spec §5), merge them to master dormant, then run the migration (spec §6) on its own branch in its own session.

**Architecture:** One plain-Node script, `scripts/roadmap-check.mjs`, exports parsers and four job functions and runs them from a `main()` guarded the same way `scripts/audit-anchors.mjs` is. It reuses `checkAnchor`, `currentShas`, `harvestDocAnchors` and `REPOS` from that script; the only change to the existing script is an optional marker argument on `harvestDocAnchors`. A PostToolUse hook shells out to the script with `--structure`. Tests copy one fixture workspace into a temp dir and mutate it per case.

**Tech Stack:** Node 22, `node --test`, `node:assert/strict`. No dependencies.

## Global Constraints

- Every path in this plan is relative to the workspace repo root (`/home/destin/youcoded-dev`) unless it starts with `/`.
- Part 1 (Tasks 1–10) is done in a worktree of the **workspace repo** (`youcoded-dev`), branched off `origin/master`, and merged to master before Part 2 starts. Part 2 is a second session on its own branch.
- Stage files by explicit path. Never `git add -A` or `git add .` — other sessions keep untracked in-flight files in this repo.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The tool exits 1 **only** for structure errors. Claims, the symptom pass and index drift never exit 1 (spec §5).
- The tool is dormant when `docs/roadmap/` is absent: one line to stdout, exit 0 (spec §5).
- Vocabularies are closed lists in the script (spec §3.2 "The list in the tool is the authority"). Areas are **not** a list: they are the `.md` files in `docs/roadmap/` minus `shipped.md`.
- No `--json`, no `--strict` (spec §8).
- Nothing in the tool reads git history. `currentShas` (a `rev-parse HEAD`) is the only git call.
- Search with `rg`, never `grep`; quote every glob.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/roadmap-check.mjs` | Vocabularies, entry/area/index/shipped parsers, `loadRoadmap`, the four jobs, `--fix` writers, `main()` |
| `scripts/roadmap-check.test.mjs` | `node --test` suite; copies the fixture per case |
| `scripts/fixtures/roadmap/` | One valid fixture workspace: `ROADMAP.md`, `docs/roadmap/{sync,native-harness,shipped}.md`, `docs/active/investigations/2026-08-20-sync-gh-missing.md`, `youcoded/desktop/src/main/sync-service.ts` (the file the claim points at), `youcoded/.git/HEAD` (so the repo counts as present) |
| `scripts/audit-anchors.mjs` | `harvestDocAnchors(text, marker = 'verify')` — one-line generalisation |
| `.claude/hooks/roadmap-edit-check.mjs` + `.test.mjs` | PostToolUse hook; exits 2 with the errors on stderr |
| `.claude/settings.json` | New `PostToolUse` block |
| `.github/workflows/workspace-ci.yml` | Two new steps: the tool's tests, the tool |
| `.claude/commands/audit.md` | Step 5 becomes one command; step 6 wording |
| `scripts/roadmap-legacy-worksheet.mjs` | Throwaway parser of the single-file format → JSON worksheet |

---

# Part 1 — the tool (merge to master, dormant)

### Task 0: Worktree

- [ ] **Step 1: Sync and branch**

```bash
cd /home/destin/youcoded-dev && git fetch origin
git worktree add /home/destin/youcoded-dev-roadmap-check -b feat/roadmap-check origin/master
cd /home/destin/youcoded-dev-roadmap-check
```

The worktree has no sub-repo clones. Every command below that runs the tool against real data passes `--root /home/destin/youcoded-dev`; tests use the fixture and need nothing.

- [ ] **Step 2: Confirm the existing suite is green before touching it**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: all tests pass, exit 0.

---

### Task 1: Vocabularies and the metadata-line parser

**Files:**
- Create: `scripts/roadmap-check.mjs`
- Create: `scripts/roadmap-check.test.mjs`

**Interfaces:**
- Produces: `SEEN_ON`, `STATUS`, `FLAGS`, `SURFACES`, `SUBLEVELS`, `RELEASE_RE`, `CHECKED_RE`, `classifyToken(tok) → 'surface'|'seen-on'|'status'|'checked'|'flag'|null`, `parseMetadata(line) → { surface, seenOn, status, checked, flags, release, link, errors }`.

- [ ] **Step 1: Write the failing tests**

```js
// scripts/roadmap-check.test.mjs
// Tests for roadmap-check.mjs. Every fixture-based case copies scripts/fixtures/roadmap/
// into a temp dir and mutates ONE thing, so there is exactly one fixture to keep true.
// Run: node --test scripts/roadmap-check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEEN_ON, STATUS, FLAGS, SURFACES, classifyToken, parseMetadata,
} from './roadmap-check.mjs';

test('vocabularies are disjoint — a token can belong to exactly one', () => {
  const all = [...SEEN_ON, ...STATUS, ...FLAGS, ...SURFACES];
  assert.equal(new Set(all).size, all.length);
});

test('classifyToken: one kind per vocabulary, null for strangers', () => {
  assert.equal(classifyToken('settings/sync'), 'surface');
  assert.equal(classifyToken('android'), 'seen-on');
  assert.equal(classifyToken('needs-verify'), 'status');
  assert.equal(classifyToken('checked 2026-08-28'), 'checked');
  assert.equal(classifyToken('urgent'), 'flag');
  assert.equal(classifyToken('v1.3.1'), 'flag');
  assert.equal(classifyToken('v1'), null);
  assert.equal(classifyToken('setings'), null);
});

test('parseMetadata: full line with link', () => {
  const m = parseMetadata('`settings` `android` `needs-verify` `checked 2026-08-28` `v1.3.1` `urgent` → docs/active/investigations/2026-08-28-x.md');
  assert.deepEqual(m.errors, []);
  assert.equal(m.surface, 'settings');
  assert.equal(m.seenOn, 'android');
  assert.equal(m.status, 'needs-verify');
  assert.equal(m.checked, '2026-08-28');
  assert.deepEqual(m.flags, ['urgent']);
  assert.equal(m.release, 'v1.3.1');
  assert.equal(m.link, 'docs/active/investigations/2026-08-28-x.md');
});

test('parseMetadata: minimal line, no surface, no link', () => {
  const m = parseMetadata('`all` `confirmed` `checked 2026-07-01`');
  assert.deepEqual(m.errors, []);
  assert.equal(m.surface, null);
  assert.equal(m.link, null);
});

test('parseMetadata: unknown token is an error, never a surface', () => {
  const m = parseMetadata('`setings` `all` `confirmed` `checked 2026-07-01`');
  assert.equal(m.errors.length, 1);
  assert.match(m.errors[0], /unknown token `setings`/);
});

test('parseMetadata: missing status and missing checked are separate errors', () => {
  const m = parseMetadata('`all`');
  assert.ok(m.errors.some(e => /missing status/.test(e)));
  assert.ok(m.errors.some(e => /missing `checked/.test(e)));
});

test('parseMetadata: out-of-order tokens are an error', () => {
  const m = parseMetadata('`confirmed` `all` `checked 2026-07-01`');
  assert.ok(m.errors.some(e => /out of order/.test(e)));
});

test('parseMetadata: text outside backticks means this is not a metadata line', () => {
  const m = parseMetadata('and it also happens on `android` `confirmed` `checked 2026-07-01`');
  assert.ok(m.errors.some(e => /outside backticks/.test(e)));
});

test('parseMetadata: impossible date is an error', () => {
  const m = parseMetadata('`all` `confirmed` `checked 2026-13-40`');
  assert.ok(m.errors.some(e => /not a real date/.test(e)));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: fails at import — `Cannot find module './roadmap-check.mjs'`.

- [ ] **Step 3: Write the vocabularies and parser**

```js
#!/usr/bin/env node
// roadmap-check.mjs — the mechanical pass over the per-area roadmap.
//
// Four jobs, one run (spec §5, docs/archive/specs/2026-09-01-roadmap-restructure-design.md):
//   1. structure   — every entry parses, every token is in its vocabulary, links resolve
//   2. claims      — every linked report's `<!-- claim: … -->` anchors still hold
//   3. symptom pass — items nobody has confirmed in 60 days, for Destin
//   4. index       — ROADMAP.md's counts and Next-release list match the area files
//
// Usage:
//   node scripts/roadmap-check.mjs                     all four jobs; exit 1 only on structure errors
//   node scripts/roadmap-check.mjs --fix               also flip broken-claim items and rewrite the index
//   node scripts/roadmap-check.mjs --structure         job 1 only (the edit hook)
//   node scripts/roadmap-check.mjs --quiet             print only structure errors (CI)
//   node scripts/roadmap-check.mjs --root <dir>        workspace root (worktrees, tests)
//   node scripts/roadmap-check.mjs --today YYYY-MM-DD  "today" for the 60-day rule (tests)
//
// Dormant when docs/roadmap/ does not exist: prints one line, exits 0. That is what let the
// tool merge to master before the migration branch created the folder.
//
// Tests: node --test scripts/roadmap-check.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkAnchor, currentShas, harvestDocAnchors, REPOS } from './audit-anchors.mjs';

export const ROADMAP_DIR = 'docs/roadmap';
export const INDEX_FILE = 'ROADMAP.md';
export const SHIPPED_FILE = 'shipped.md';
export const OLD_FORMAT_HEADING = '## Shipped before 2026-09-01 (old format)';
export const STALE_DAYS = 60;

// ---------- vocabularies (spec §3) ----------
// Closed lists on purpose: a typo must be an error, never a new screen.

export const SEEN_ON = ['desktop', 'android', 'remote', 'all', 'n/a'];
export const STATUS = ['confirmed', 'needs-verify', 'in-flight', 'blocked', 'decision', 'parked'];
export const FLAGS = ['urgent', 'needs-repro', 'performance', 'security', 'regression'];
export const RELEASE_RE = /^v\d+\.\d+(\.\d+)?$/;
export const CHECKED_RE = /^checked (\d{4}-\d{2}-\d{2})$/;
export const SURFACES = [
  'chat', 'tool-cards', 'input-bar', 'quick-chips', 'status-bar', 'session-drawer',
  'resume-browser', 'settings', 'model-picker', 'local-models-screen', 'files-panel',
  'projects', 'marketplace-screen', 'library', 'terminal', 'themes-screen', 'buddy-window',
  'arcade', 'onboarding', 'window-chrome', 'specialists-chip',
  'settings/permissions', 'settings/themes', 'settings/local-models', 'settings/sync',
  'settings/specialists', 'settings/accounts', 'settings/defaults', 'settings/development',
];
// Which area files may carry `##` sublevel headings, and which (spec §3.1).
export const SUBLEVELS = {
  'native-harness': ['sessions', 'tools', 'permissions', 'cost', 'specialists', 'skills-mcp'],
  'dev-workspace': ['tests', 'rigs', 'knowledge', 'release'],
  'marketplace': ['catalog', 'backend', 'install'],
  'other-features': ['accounts', 'buddy', 'onboarding', 'misc'],
};

// ---------- entry grammar (spec §2) ----------

const KIND_ORDER = ['surface', 'seen-on', 'status', 'checked', 'flag'];

export function classifyToken(tok) {
  if (SURFACES.includes(tok)) return 'surface';
  if (SEEN_ON.includes(tok)) return 'seen-on';
  if (STATUS.includes(tok)) return 'status';
  if (CHECKED_RE.test(tok)) return 'checked';
  if (FLAGS.includes(tok) || RELEASE_RE.test(tok)) return 'flag';
  return null;
}

// A real calendar date, not just four-two-two digits: `2026-13-40` round-trips to something else.
function isRealDate(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

// Parses the LAST line of an entry: backticked tokens in vocabulary order, then `→ <path>`.
export function parseMetadata(line) {
  const errors = [];
  const meta = { surface: null, seenOn: null, status: null, checked: null, flags: [], release: null, link: null };
  const linkM = line.match(/→\s*(\S+)\s*$/);
  if (linkM) meta.link = linkM[1];
  const body = linkM ? line.slice(0, linkM.index) : line;
  const outside = body.replace(/`[^`]*`/g, '').trim();
  if (outside) errors.push(`metadata line has text outside backticks: "${outside.slice(0, 60)}" — the last line of an entry is tokens only`);
  const tokens = [...body.matchAll(/`([^`]+)`/g)].map(m => m[1]);
  if (tokens.length === 0) {
    errors.push('entry has no metadata line (last line must be backticked tokens: seen-on, status, checked)');
    return { ...meta, errors };
  }
  let lastKind = -1;
  for (const tok of tokens) {
    const kind = classifyToken(tok);
    if (!kind) { errors.push(`unknown token \`${tok}\` — not a surface, seen-on, status, checked date or flag (spec §3)`); continue; }
    const idx = KIND_ORDER.indexOf(kind);
    if (idx < lastKind) errors.push(`token \`${tok}\` is out of order (order is surface, seen-on, status, checked, flags)`);
    lastKind = Math.max(lastKind, idx);
    if (kind === 'surface') { if (meta.surface) errors.push('two surface tokens'); meta.surface = tok; }
    else if (kind === 'seen-on') { if (meta.seenOn) errors.push('two seen-on tokens'); meta.seenOn = tok; }
    else if (kind === 'status') { if (meta.status) errors.push('two status tokens'); meta.status = tok; }
    else if (kind === 'checked') { if (meta.checked) errors.push('two checked tokens'); meta.checked = tok.match(CHECKED_RE)[1]; }
    else if (RELEASE_RE.test(tok)) { if (meta.release) errors.push('two release flags'); meta.release = tok; }
    else meta.flags.push(tok);
  }
  if (!meta.seenOn) errors.push('missing seen-on token (desktop · android · remote · all · n/a)');
  if (!meta.status) errors.push(`missing status token (${STATUS.join(' · ')})`);
  if (!meta.checked) errors.push('missing `checked YYYY-MM-DD` token');
  else if (!isRealDate(meta.checked)) errors.push(`checked date ${meta.checked} is not a real date`);
  return { ...meta, errors };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/roadmap-check.mjs scripts/roadmap-check.test.mjs
git commit -m "feat(roadmap-check): vocabularies and the entry metadata parser

Spec §2–3. Closed lists so a typo is an error, never a new screen.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Area-file, index and shipped parsers

**Files:**
- Modify: `scripts/roadmap-check.mjs` (append)
- Modify: `scripts/roadmap-check.test.mjs` (append)

**Interfaces:**
- Consumes: `parseMetadata`, `SUBLEVELS`, `OLD_FORMAT_HEADING`.
- Produces: `parseAreaFile(text, fileName) → { area, heading, entries, errors }` where an entry is `{ area, section, line, metaLineNo, firstLine, symptom, surface, seenOn, status, checked, flags, release, link }` and an error is `{ line, message }`; `parseIndex(text) → { lines, target, targetLine, nextRelease, nrStart, nrEnd, rows, tableStart, tableEnd, errors }` where a row is `{ area, heading, open, needsVerify, decisions, parked, line }`; `parseShipped(text) → { errors }`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/roadmap-check.test.mjs`:

```js
import { parseAreaFile, parseIndex, parseShipped, OLD_FORMAT_HEADING } from './roadmap-check.mjs';

const AREA_OK = `# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.
Not here: nothing.

- [ ] Sync dead-ends on any machine without gh — the setup screen shows a spinner
      forever and never says what it is waiting for
      \`settings/sync\` \`desktop\` \`confirmed\` \`checked 2026-08-20\` \`v1.3\` → docs/active/investigations/2026-08-20-sync-gh-missing.md
- [ ] Android says "Synced" while the last push failed
      \`android\` \`needs-verify\` \`checked 2026-06-01\`
`;

test('parseAreaFile: heading, filing test, two entries with sections null', () => {
  const a = parseAreaFile(AREA_OK, 'sync.md');
  assert.deepEqual(a.errors, []);
  assert.equal(a.area, 'sync');
  assert.equal(a.heading, 'moving your stuff between devices');
  assert.equal(a.entries.length, 2);
  const [e1, e2] = a.entries;
  assert.equal(e1.line, 5);
  assert.equal(e1.metaLineNo, 7);
  assert.equal(e1.firstLine, 'Sync dead-ends on any machine without gh — the setup screen shows a spinner');
  assert.match(e1.symptom, /forever and never says/);
  assert.equal(e1.status, 'confirmed');
  assert.equal(e1.release, 'v1.3');
  assert.equal(e1.link, 'docs/active/investigations/2026-08-20-sync-gh-missing.md');
  assert.equal(e1.section, null);
  assert.equal(e2.status, 'needs-verify');
  assert.equal(e2.link, null);
});

test('parseAreaFile: wrong heading shape and missing Filing test are line 1 / line 2 errors', () => {
  const a = parseAreaFile('# sync\nsomething else\n', 'sync.md');
  assert.ok(a.errors.some(e => e.line === 1 && /# <area> — <one line>/.test(e.message)));
  assert.ok(a.errors.some(e => e.line === 2 && /Filing test:/.test(e.message)));
});

test('parseAreaFile: heading naming another area is an error', () => {
  const a = parseAreaFile('# themes — how it looks\nFiling test: x\n', 'sync.md');
  assert.ok(a.errors.some(e => /heading names themes but the file is sync\.md/.test(e.message)));
});

test('parseAreaFile: [x] in an area file is an error and is not an entry', () => {
  const a = parseAreaFile(AREA_OK + '- [x] fixed thing\n      `all` `confirmed` `checked 2026-08-01`\n', 'sync.md');
  assert.ok(a.errors.some(e => /\[x\]/.test(e.message) && /shipped\.md/.test(e.message)));
  assert.equal(a.entries.length, 2);
});

test('parseAreaFile: sublevel headings only where allowed, and only known ones', () => {
  const flat = parseAreaFile('# sync — x\nFiling test: x\n\n## sessions\n', 'sync.md');
  assert.ok(flat.errors.some(e => e.line === 4 && /has no sublevels/.test(e.message)));
  const bad = parseAreaFile('# native-harness — x\nFiling test: x\n\n## turns\n', 'native-harness.md');
  assert.ok(bad.errors.some(e => /unknown sublevel `turns`/.test(e.message)));
  const ok = parseAreaFile('# native-harness — x\nFiling test: x\n\n## tools\n- [ ] Bash output is cut mid-line\n      `all` `confirmed` `checked 2026-08-01`\n', 'native-harness.md');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.entries[0].section, 'tools');
});

test('parseAreaFile: an entry with one line has no metadata line — error carries the entry line', () => {
  const a = parseAreaFile('# sync — x\nFiling test: x\n\n- [ ] just a symptom\n', 'sync.md');
  assert.ok(a.errors.some(e => e.line === 4 && /no metadata line/.test(e.message)));
});

test('parseAreaFile: text after the filing-test block that is not an entry is an error', () => {
  const a = parseAreaFile('# sync — x\nFiling test: x\n\nSome paragraph.\n', 'sync.md');
  assert.ok(a.errors.some(e => e.line === 4 && /stray text/.test(e.message)));
});

const INDEX_OK = `# YouCoded roadmap

## Where the app stands
Prose Destin owns.

## Next release
Target: \`v1.3\`
- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 2 | 1 | 0 | 0 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 1 | 0 | 0 | 0 |

## Filing an item
Pick the file whose Filing test says yes.
`;

test('parseIndex: target, next-release lines, rows with line spans', () => {
  const ix = parseIndex(INDEX_OK);
  assert.deepEqual(ix.errors, []);
  assert.equal(ix.target, 'v1.3');
  assert.deepEqual(ix.nextRelease, ['- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner']);
  assert.equal(ix.nrStart, 7); assert.equal(ix.nrEnd, 7);
  assert.equal(ix.rows.length, 2);
  assert.deepEqual(ix.rows[0], { area: 'sync', heading: 'moving your stuff between devices', open: 2, needsVerify: 1, decisions: 0, parked: 0, line: 12 });
  assert.equal(ix.tableStart, 12); assert.equal(ix.tableEnd, 13);
});

test('parseIndex: missing Target line, entry in the index, closed item in the index', () => {
  const ix = parseIndex(INDEX_OK.replace('Target: `v1.3`\n', '') + '- [ ] filed in the wrong place\n- [x] closed in the wrong place\n');
  assert.ok(ix.errors.some(e => /no `Target:` line/.test(e.message)));
  assert.ok(ix.errors.some(e => /the index holds no entries/.test(e.message) && /docs\/roadmap\/<area>\.md/.test(e.message)));
  assert.ok(ix.errors.some(e => /closed items go to docs\/roadmap\/shipped\.md/.test(e.message)));
});

test('parseIndex: Target must be one release token', () => {
  const ix = parseIndex(INDEX_OK.replace('Target: `v1.3`', 'Target: soon'));
  assert.ok(ix.errors.some(e => /Target: must name one release token/.test(e.message)));
  assert.equal(ix.target, null);
});

const SHIPPED_OK = `# Shipped

- [x] 2026-09-02 sync — Sync no longer dead-ends without gh (youcoded#380)

${OLD_FORMAT_HEADING}
- [x] \`bug\` \`#sync\` **anything at all** — FIXED 2026-08-01
- [ ] this line is under the old-format heading and is skipped
`;

test('parseShipped: new-format lines validated, old-format block skipped entirely', () => {
  assert.deepEqual(parseShipped(SHIPPED_OK).errors, []);
  const bad = parseShipped('# Shipped\n\n- [x] sync fixed it\n- [ ] still open\n');
  assert.ok(bad.errors.some(e => e.line === 3 && /- \[x\] YYYY-MM-DD <area> — <headline>/.test(e.message)));
  assert.ok(bad.errors.some(e => e.line === 4 && /open items do not belong in shipped\.md/.test(e.message)));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: import error — `parseAreaFile` is not exported.

- [ ] **Step 3: Write the parsers**

Append to `scripts/roadmap-check.mjs`:

```js
// ---------- area file (spec §1.2) ----------
//
//   # <area> — <one line>          line 1, copied into the index by --fix
//   Filing test: …                 line 2 (may continue to the first blank line)
//   ## <sublevel>                  only in SUBLEVELS areas
//   - [ ] symptom line
//         continuation lines       indented; the LAST line of the block is the metadata line
export function parseAreaFile(text, fileName) {
  const area = path.basename(fileName, '.md');
  const lines = text.split('\n');
  const errors = [];
  const headM = (lines[0] ?? '').match(/^# (\S+) — (.+)$/);
  if (!headM) errors.push({ line: 1, message: 'first line must be `# <area> — <one line>`' });
  else if (headM[1] !== area) errors.push({ line: 1, message: `heading names ${headM[1]} but the file is ${area}.md` });
  const heading = headM ? headM[2].trim() : '';
  if (!(lines[1] ?? '').startsWith('Filing test:')) errors.push({ line: 2, message: 'second line must start with `Filing test:`' });

  // The filing-test block runs to the first blank line; nothing else is prose in an area file.
  let i = 2;
  while (i < lines.length && lines[i].trim() !== '') i++;

  const entries = [];
  let section = null;
  while (i < lines.length) {
    const l = lines[i];
    if (/^## /.test(l)) {
      section = l.slice(3).trim();
      const allowed = SUBLEVELS[area];
      if (!allowed) errors.push({ line: i + 1, message: `${area} has no sublevels; remove the \`## ${section}\` heading (spec §3.1)` });
      else if (!allowed.includes(section)) errors.push({ line: i + 1, message: `unknown sublevel \`${section}\` for ${area} (allowed: ${allowed.join(', ')})` });
      i++; continue;
    }
    if (/^#/.test(l)) { errors.push({ line: i + 1, message: 'only line 1 may be a `#` heading and only `##` sublevels are allowed after it' }); i++; continue; }
    const m = l.match(/^- \[( |x)\] (.*)$/);
    if (m) {
      const start = i;
      const block = [m[2].trim()];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !/^- \[/.test(lines[i]) && !/^#/.test(lines[i])) { block.push(lines[i].trim()); i++; }
      if (m[1] === 'x') { errors.push({ line: start + 1, message: '`[x]` belongs in shipped.md — delete the entry here and append one line there' }); continue; }
      if (block.length < 2) { errors.push({ line: start + 1, message: 'entry has no metadata line (last line must be backticked tokens: seen-on, status, checked)' }); continue; }
      const meta = parseMetadata(block[block.length - 1]);
      for (const e of meta.errors) errors.push({ line: start + 1, message: e });
      const { errors: _drop, ...fields } = meta;
      entries.push({
        area, section, line: start + 1, metaLineNo: start + block.length,
        firstLine: block[0], symptom: block.slice(0, -1).join(' '), ...fields,
      });
      continue;
    }
    if (l.trim() !== '') errors.push({ line: i + 1, message: `stray text outside an entry: "${l.trim().slice(0, 60)}" — indent continuation lines under their entry` });
    i++;
  }
  return { area, heading, entries, errors };
}

// ---------- index (spec §1.1) ----------
const ROW_RE = /^\| \[([^\]]+)\]\(docs\/roadmap\/([^)]+)\.md\) — (.*?) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/;
const TARGET_RE = /^Target:\s*`?(v\d+\.\d+(?:\.\d+)?)`?\s*$/;

export function parseIndex(text) {
  const lines = text.split('\n');
  const errors = [];
  let target = null;
  const targetLine = lines.findIndex(l => /^Target:/.test(l));
  if (targetLine === -1) errors.push({ line: 0, message: 'index has no `Target:` line under ## Next release — the tool cannot guess which release is next' });
  else {
    const tm = lines[targetLine].match(TARGET_RE);
    if (!tm) errors.push({ line: targetLine + 1, message: 'Target: must name one release token, e.g. Target: `v1.3`' });
    else target = tm[1];
  }
  // Next-release list: the `- ` lines between Target: and the next `## ` heading.
  const nextRelease = [];
  let nrStart = -1, nrEnd = -1;
  if (targetLine !== -1) {
    for (let j = targetLine + 1; j < lines.length && !/^## /.test(lines[j]); j++) {
      if (/^- /.test(lines[j])) { if (nrStart === -1) nrStart = j; nrEnd = j; nextRelease.push(lines[j]); }
    }
  }
  const rows = [];
  let tableStart = -1, tableEnd = -1;
  lines.forEach((l, idx) => {
    const rm = l.match(ROW_RE);
    if (rm) {
      if (rm[1] !== rm[2]) errors.push({ line: idx + 1, message: `row link text "${rm[1]}" does not match its file ${rm[2]}.md` });
      rows.push({ area: rm[2], heading: rm[3], open: +rm[4], needsVerify: +rm[5], decisions: +rm[6], parked: +rm[7], line: idx });
      if (tableStart === -1) tableStart = idx;
      tableEnd = idx;
    }
    if (/^- \[ \]/.test(l)) errors.push({ line: idx + 1, message: 'the index holds no entries — file this in docs/roadmap/<area>.md, the file whose Filing test says yes (see "Filing an item" at the bottom of ROADMAP.md)' });
    if (/^- \[x\]/.test(l)) errors.push({ line: idx + 1, message: 'closed items go to docs/roadmap/shipped.md, one line each' });
  });
  if (rows.length === 0) errors.push({ line: 0, message: 'index has no backlog table rows (| [area](docs/roadmap/area.md) — heading | n | n | n | n |)' });
  return { lines, target, targetLine, nextRelease, nrStart, nrEnd, rows, tableStart, tableEnd, errors };
}

// ---------- shipped.md (spec §1.3) ----------
const SHIPPED_LINE_RE = /^- \[x\] \d{4}-\d{2}-\d{2} \S+ — .+$/;

export function parseShipped(text) {
  const errors = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === OLD_FORMAT_HEADING) break;   // everything below is the pre-migration copy: never parsed
    const l = lines[i];
    if (/^- \[ \]/.test(l)) errors.push({ line: i + 1, message: 'open items do not belong in shipped.md' });
    else if (/^- \[x\]/.test(l) && !SHIPPED_LINE_RE.test(l)) errors.push({ line: i + 1, message: 'shipped line must be `- [x] YYYY-MM-DD <area> — <headline> (<commit or PR>)`' });
  }
  return { errors };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: 20 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/roadmap-check.mjs scripts/roadmap-check.test.mjs
git commit -m "feat(roadmap-check): area-file, index and shipped parsers

Spec §1. Areas are the files on disk, not a list; the index holds no entries.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The fixture workspace and job 1 (structure)

**Files:**
- Create: `scripts/fixtures/roadmap/ROADMAP.md`
- Create: `scripts/fixtures/roadmap/docs/roadmap/sync.md`
- Create: `scripts/fixtures/roadmap/docs/roadmap/native-harness.md`
- Create: `scripts/fixtures/roadmap/docs/roadmap/shipped.md`
- Create: `scripts/fixtures/roadmap/docs/active/investigations/2026-08-20-sync-gh-missing.md`
- Create: `scripts/fixtures/roadmap/youcoded/desktop/src/main/sync-service.ts` (git will not track a nested `.git`, so the test helper creates `youcoded/.git/HEAD` in the temp copy to mark the repo present)
- Modify: `scripts/roadmap-check.mjs`, `scripts/roadmap-check.test.mjs`

**Interfaces:**
- Produces: `loadRoadmap(root) → null | { root, areas, index, shipped }`, `checkStructure(rm) → [{ file, line, message }]`, and the test helper `withFixture(mutate) → tmpRoot`.

- [ ] **Step 1: Create the fixture files**

`scripts/fixtures/roadmap/ROADMAP.md`:

```markdown
# YouCoded roadmap

## Where the app stands
Fixture prose. The tool never touches this section.

## Next release
Target: `v1.3`
- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 3 | 1 | 0 | 1 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 1 | 0 | 1 | 0 |

## Filing an item
Pick the file whose Filing test says yes. Fixture copy of the filing rule.
```

`scripts/fixtures/roadmap/docs/roadmap/sync.md`:

```markdown
# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.

- [ ] Sync dead-ends on any machine without gh — the setup screen shows a spinner
      forever and never says what it is waiting for
      `settings/sync` `desktop` `confirmed` `checked 2026-08-20` `v1.3` → docs/active/investigations/2026-08-20-sync-gh-missing.md
- [ ] Android says "Synced" while the last push failed
      `android` `needs-verify` `checked 2026-06-01`
- [ ] Sync a whole project folder, not only conversations — an idea for later
      `all` `parked` `checked 2026-01-15`
```

`scripts/fixtures/roadmap/docs/roadmap/native-harness.md`:

```markdown
# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist.

## tools
- [ ] Should Bash keep its working directory across turns, or reset every call?
      `all` `decision` `checked 2026-08-25`
```

`scripts/fixtures/roadmap/docs/roadmap/shipped.md`:

```markdown
# Shipped

- [x] 2026-08-30 sync — Sync no longer loses the last message on reconnect (youcoded#370)

## Shipped before 2026-09-01 (old format)
- [x] `bug` `#sync` **Old-format line, copied verbatim** — FIXED 2026-07-01 (added 2026-06-01)
  Detail lines in the old style, never parsed.
```

`scripts/fixtures/roadmap/docs/active/investigations/2026-08-20-sync-gh-missing.md`:

```markdown
---
date: 2026-08-20
status: active
type: investigation
topic: Sync setup spins forever when gh is missing
---

# Sync setup spins forever when gh is missing

The setup step shells out to `gh auth status` and waits on a promise that never settles
when the binary is absent.

`sync-service.ts` awaits `gh auth status` with no timeout.
<!-- claim: {"path": "youcoded/desktop/src/main/sync-service.ts", "contains": "execFile\\('gh', \\['auth', 'status'\\]"} -->
```

`scripts/fixtures/roadmap/youcoded/desktop/src/main/sync-service.ts`:

```ts
// Fixture for roadmap-check tests. The claim anchor in the fixture report points here.
export async function checkGh() {
  return execFile('gh', ['auth', 'status']);
}
```

- [ ] **Step 2: Write the failing tests**

Append to `scripts/roadmap-check.test.mjs`:

```js
import { loadRoadmap, checkStructure } from './roadmap-check.mjs';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'roadmap');

// Copies the fixture to a temp dir, marks `youcoded/` as a present repo (a nested .git
// cannot be committed, so it is created here), applies one mutation, returns the root.
function withFixture(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-check-'));
  fs.cpSync(FIXTURE, root, { recursive: true });
  fs.mkdirSync(path.join(root, 'youcoded', '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'youcoded', '.git', 'HEAD'), 'ref: refs/heads/master\n');
  mutate(root);
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const edit = (root, rel, from, to) => { const t = read(root, rel); assert.ok(t.includes(from), `fixture lacks "${from}"`); write(root, rel, t.replace(from, to)); };

test('loadRoadmap: null when docs/roadmap is absent (pre-migration master)', () => {
  const root = withFixture(r => fs.rmSync(path.join(r, 'docs', 'roadmap'), { recursive: true }));
  assert.equal(loadRoadmap(root), null);
});

test('loadRoadmap: areas are the files on disk minus shipped.md, sorted', () => {
  const rm = loadRoadmap(withFixture());
  assert.deepEqual(rm.areas.map(a => a.area), ['native-harness', 'sync']);
  assert.equal(rm.index.target, 'v1.3');
  assert.deepEqual(rm.shipped.errors, []);
});

test('checkStructure: the valid fixture is clean', () => {
  assert.deepEqual(checkStructure(loadRoadmap(withFixture())), []);
});

test('checkStructure: dead link', () => {
  const root = withFixture(r => edit(r, 'docs/roadmap/sync.md', '2026-08-20-sync-gh-missing.md', '2026-08-20-gone.md'));
  const errs = checkStructure(loadRoadmap(root));
  assert.equal(errs.length, 1);
  assert.equal(errs[0].file, 'docs/roadmap/sync.md');
  assert.equal(errs[0].line, 4);
  assert.match(errs[0].message, /link does not resolve: docs\/active\/investigations\/2026-08-20-gone\.md/);
});

test('checkStructure: index row for a file that does not exist, and a file with no row', () => {
  const root = withFixture(r => edit(r, 'ROADMAP.md', '[native-harness](docs/roadmap/native-harness.md)', '[themes](docs/roadmap/themes.md)'));
  const msgs = checkStructure(loadRoadmap(root)).map(e => e.message);
  assert.ok(msgs.some(m => /index row for themes but docs\/roadmap\/themes\.md does not exist/.test(m)));
  assert.ok(msgs.some(m => /docs\/roadmap\/native-harness\.md has no row in the index/.test(m)));
});

test('checkStructure: missing index, missing shipped.md', () => {
  const root = withFixture(r => { fs.rmSync(path.join(r, 'ROADMAP.md')); fs.rmSync(path.join(r, 'docs/roadmap/shipped.md')); });
  const msgs = checkStructure(loadRoadmap(root)).map(e => e.message);
  assert.ok(msgs.some(m => /ROADMAP\.md is missing/.test(m)));
  assert.ok(msgs.some(m => /docs\/roadmap\/shipped\.md is missing/.test(m)));
});

test('checkStructure: area-file and index parse errors carry file and line', () => {
  const root = withFixture(r => {
    edit(r, 'docs/roadmap/sync.md', '`android` `needs-verify`', '`android` `needs-verifyy`');
    edit(r, 'ROADMAP.md', '## Filing an item', '- [ ] stray entry\n\n## Filing an item');
  });
  const errs = checkStructure(loadRoadmap(root));
  assert.ok(errs.some(e => e.file === 'docs/roadmap/sync.md' && e.line === 7 && /unknown token `needs-verifyy`/.test(e.message)));
  assert.ok(errs.some(e => e.file === 'ROADMAP.md' && /holds no entries/.test(e.message)));
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: import error — `loadRoadmap` is not exported.

- [ ] **Step 4: Write `loadRoadmap` and `checkStructure`**

Append to `scripts/roadmap-check.mjs`:

```js
// ---------- loading ----------

export function loadRoadmap(root) {
  const dir = path.join(root, ROADMAP_DIR);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== SHIPPED_FILE).sort();
  const areas = files.map(f => parseAreaFile(fs.readFileSync(path.join(dir, f), 'utf8'), f));
  const indexPath = path.join(root, INDEX_FILE);
  const index = fs.existsSync(indexPath) ? parseIndex(fs.readFileSync(indexPath, 'utf8')) : null;
  const shippedPath = path.join(dir, SHIPPED_FILE);
  const shipped = fs.existsSync(shippedPath) ? parseShipped(fs.readFileSync(shippedPath, 'utf8')) : null;
  return { root, areas, index, shipped };
}

// ---------- job 1: structure (spec §5) ----------

export function checkStructure(rm) {
  const errors = [];
  const areaFile = a => `${ROADMAP_DIR}/${a.area}.md`;
  for (const a of rm.areas) {
    for (const e of a.errors) errors.push({ file: areaFile(a), line: e.line, message: e.message });
    for (const e of a.entries) {
      if (e.link && !fs.existsSync(path.join(rm.root, e.link))) {
        errors.push({ file: areaFile(a), line: e.line, message: `link does not resolve: ${e.link}` });
      }
    }
  }
  if (!rm.index) errors.push({ file: INDEX_FILE, line: 0, message: `${INDEX_FILE} is missing` });
  else {
    for (const e of rm.index.errors) errors.push({ file: INDEX_FILE, line: e.line, message: e.message });
    const onDisk = new Set(rm.areas.map(a => a.area));
    const inIndex = new Set(rm.index.rows.map(r => r.area));
    for (const r of rm.index.rows) if (!onDisk.has(r.area)) errors.push({ file: INDEX_FILE, line: r.line + 1, message: `index row for ${r.area} but ${ROADMAP_DIR}/${r.area}.md does not exist` });
    for (const a of rm.areas) if (!inIndex.has(a.area)) errors.push({ file: INDEX_FILE, line: 0, message: `${areaFile(a)} has no row in the index (run --fix)` });
  }
  if (!rm.shipped) errors.push({ file: `${ROADMAP_DIR}/${SHIPPED_FILE}`, line: 0, message: `${ROADMAP_DIR}/${SHIPPED_FILE} is missing` });
  else for (const e of rm.shipped.errors) errors.push({ file: `${ROADMAP_DIR}/${SHIPPED_FILE}`, line: e.line, message: e.message });
  return errors;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: 27 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/fixtures/roadmap scripts/roadmap-check.mjs scripts/roadmap-check.test.mjs
git commit -m "feat(roadmap-check): fixture workspace and the structure job

Spec §5 job 1. One fixture; every malformed case is a mutation of it in the test.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Job 2 (claims) and the `--fix` flip

**Files:**
- Modify: `scripts/audit-anchors.mjs:122-130` (`harvestDocAnchors` marker argument)
- Modify: `scripts/audit-anchors.test.mjs` (append one test)
- Modify: `scripts/roadmap-check.mjs`, `scripts/roadmap-check.test.mjs`

**Interfaces:**
- Consumes: `checkAnchor(root, anchor)`, `currentShas(root)`, `REPOS` from `audit-anchors.mjs`.
- Produces: `harvestDocAnchors(text, marker = 'verify')`; `countMatches(root, anchor) → number|null`; `checkClaims(rm) → { results: [{ area, entry, anchor, ok, reason, matches, skipped }], warnings: [{ area, line, message }], shas }`; `applyClaimFixes(rm, claims) → [{ area, line }]` (the flipped entries).

- [ ] **Step 1: Write the failing test for the marker argument**

Append to `scripts/audit-anchors.test.mjs`:

```js
test('harvestDocAnchors: marker argument — claim: anchors are invisible to the verify: pass', () => {
  const text = 'x\n<!-- verify: {"path": "a.ts"} -->\ny\n<!-- claim: {"path": "b.ts", "contains": "z"} -->\n';
  assert.deepEqual(harvestDocAnchors(text), [{ path: 'a.ts' }]);
  assert.deepEqual(harvestDocAnchors(text, 'claim'), [{ path: 'b.ts', contains: 'z' }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: the new test fails — second call returns `[{ path: 'a.ts' }]`.

- [ ] **Step 3: Generalise the harvester**

In `scripts/audit-anchors.mjs`, replace the function (keep the comment above it):

```js
// `marker` is the word before the colon: 'verify' (depth docs, this script) or 'claim'
// (roadmap reports, scripts/roadmap-check.mjs). The default keeps every existing caller as is.
// A broken verify: is doc drift and fails CI; a broken claim: is a roadmap item to re-verify
// and must NOT — which is why they are different words (spec §4).
export function harvestDocAnchors(text, marker = 'verify') {
  const anchors = [];
  const re = new RegExp(`<!--\\s*${marker}:\\s*(\\{[\\s\\S]*?\\})\\s*-->`, 'g');
  for (const m of stripMarkdownCode(text).matchAll(re)) {
    try { anchors.push(JSON.parse(m[1])); }
    catch { anchors.push({ malformed: m[1] }); }
  }
  return anchors;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/audit-anchors.test.mjs`
Expected: all pass, including the new one.

- [ ] **Step 5: Write the failing claims tests**

Append to `scripts/roadmap-check.test.mjs`:

```js
import { checkClaims, applyClaimFixes, countMatches } from './roadmap-check.mjs';

test('countMatches: number of places the contains regex matches, null without contains', () => {
  const root = withFixture();
  assert.equal(countMatches(root, { path: 'youcoded/desktop/src/main/sync-service.ts', contains: "execFile\\('gh'" }), 1);
  assert.equal(countMatches(root, { path: 'youcoded/desktop/src/main/sync-service.ts', contains: 'e' }) > 1, true);
  assert.equal(countMatches(root, { path: 'youcoded/desktop/src/main/sync-service.ts' }), null);
});

test('checkClaims: the fixture claim holds, one match, no warnings', () => {
  const c = checkClaims(loadRoadmap(withFixture()));
  assert.equal(c.results.length, 1);
  assert.equal(c.results[0].ok, true);
  assert.equal(c.results[0].matches, 1);
  assert.deepEqual(c.warnings, []);
  assert.equal(typeof c.shas, 'object');
});

test('checkClaims: a rotted claim is reported broken with the checkAnchor reason', () => {
  const root = withFixture(r => edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']"));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results[0].ok, false);
  assert.match(c.results[0].reason, /not found in youcoded\/desktop\/src\/main\/sync-service\.ts/);
});

test('checkClaims: a claim matching in two places is a warning', () => {
  const root = withFixture(r => write(r, 'youcoded/desktop/src/main/sync-service.ts', read(r, 'youcoded/desktop/src/main/sync-service.ts').repeat(2)));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results[0].ok, true);
  assert.equal(c.results[0].matches, 2);
  assert.ok(c.warnings.some(w => /matches 2 places/.test(w.message)));
});

test('checkClaims: confirmed entry whose report has no claim anchor is a warning', () => {
  const root = withFixture(r => edit(r, 'docs/active/investigations/2026-08-20-sync-gh-missing.md', '<!-- claim:', '<!-- note:'));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results.length, 0);
  assert.ok(c.warnings.some(w => w.area === 'sync' && w.line === 4 && /confirmed but .* has no claim: anchor/.test(w.message)));
});

test('checkClaims: a claim into a repo that is not on disk is skipped, not broken', () => {
  const root = withFixture(r => fs.rmSync(path.join(r, 'youcoded', '.git'), { recursive: true }));
  const c = checkClaims(loadRoadmap(root));
  assert.equal(c.results[0].skipped, 'repo youcoded not on disk');
  assert.equal(c.results[0].ok, undefined);
});

test('applyClaimFixes: flips exactly the broken confirmed item, leaves checked alone', () => {
  const root = withFixture(r => edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']"));
  const rm = loadRoadmap(root);
  const flipped = applyClaimFixes(rm, checkClaims(rm));
  assert.deepEqual(flipped, [{ area: 'sync', line: 4 }]);
  const after = read(root, 'docs/roadmap/sync.md');
  assert.match(after, /`settings\/sync` `desktop` `needs-verify` `checked 2026-08-20` `v1\.3`/);
  assert.equal((after.match(/needs-verify/g) || []).length, 2);   // the flipped one + the Android one
  // a second run finds nothing left to flip
  const rm2 = loadRoadmap(root);
  assert.deepEqual(applyClaimFixes(rm2, checkClaims(rm2)), []);
});

test('applyClaimFixes: a needs-verify item with a broken claim is only listed', () => {
  const root = withFixture(r => {
    edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']");
    edit(r, 'docs/roadmap/sync.md', '`desktop` `confirmed`', '`desktop` `needs-verify`');
  });
  const rm = loadRoadmap(root);
  const claims = checkClaims(rm);
  assert.equal(claims.results[0].ok, false);
  assert.deepEqual(applyClaimFixes(rm, claims), []);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: import error — `checkClaims` is not exported.

- [ ] **Step 7: Write the claims job**

Append to `scripts/roadmap-check.mjs`:

```js
// ---------- job 2: claims (spec §4, §5) ----------

// How many places the anchor's `contains` matches in its file. The spec's own example
// (`min={0.3}`) matched three sliders; a claim that pins more than one place stays green
// when the wrong one is fixed, so >1 is a warning.
export function countMatches(root, anchor) {
  if (anchor.contains === undefined || !anchor.path) return null;
  let re;
  try { re = new RegExp(anchor.contains, 'g'); } catch { return null; }
  const abs = path.join(root, anchor.path);
  if (!fs.existsSync(abs)) return null;
  return [...fs.readFileSync(abs, 'utf8').matchAll(re)].length;
}

export function checkClaims(rm) {
  const results = [];
  const warnings = [];
  const present = new Set(REPOS.filter(r => fs.existsSync(path.join(rm.root, r, '.git'))));
  for (const a of rm.areas) {
    for (const e of a.entries) {
      if (!e.link) continue;
      const abs = path.join(rm.root, e.link);
      if (!fs.existsSync(abs)) continue;   // structure already reported it
      const anchors = harvestDocAnchors(fs.readFileSync(abs, 'utf8'), 'claim');
      if (anchors.length === 0) {
        if (e.status === 'confirmed') warnings.push({ area: a.area, line: e.line, message: `confirmed but ${e.link} has no claim: anchor — nothing a machine can re-check (spec §3.3)` });
        continue;
      }
      for (const anchor of anchors) {
        const repo = String(anchor.path ?? anchor.test ?? '').split('/')[0];
        if (REPOS.includes(repo) && !present.has(repo)) {
          results.push({ area: a.area, entry: e, anchor, skipped: `repo ${repo} not on disk` });
          continue;
        }
        const r = checkAnchor(rm.root, anchor);
        const matches = r.ok ? countMatches(rm.root, anchor) : null;
        if (matches !== null && matches > 1) warnings.push({ area: a.area, line: e.line, message: `claim /${anchor.contains}/ matches ${matches} places in ${anchor.path} — pin one (spec §4)` });
        results.push({ area: a.area, entry: e, anchor, ok: r.ok, reason: r.reason, matches });
      }
    }
  }
  return { results, warnings, shas: currentShas(rm.root) };
}

// --fix half of job 2: confirmed + broken anchor → needs-verify. `checked` is left alone:
// it records the last confirmation, and this is not one. Returns the flipped entries.
export function applyClaimFixes(rm, claims) {
  const toFlip = new Map();   // area → Set(metaLineNo)
  const flipped = [];
  for (const r of claims.results) {
    if (r.skipped || r.ok || r.entry.status !== 'confirmed') continue;
    if (!toFlip.has(r.area)) toFlip.set(r.area, new Set());
    if (!toFlip.get(r.area).has(r.entry.metaLineNo)) {
      toFlip.get(r.area).add(r.entry.metaLineNo);
      flipped.push({ area: r.area, line: r.entry.line });
    }
  }
  for (const [area, lineNos] of toFlip) {
    const file = path.join(rm.root, ROADMAP_DIR, `${area}.md`);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const n of lineNos) lines[n - 1] = lines[n - 1].replace('`confirmed`', '`needs-verify`');
    fs.writeFileSync(file, lines.join('\n'));
  }
  return flipped;
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `node --test scripts/roadmap-check.test.mjs && node --test scripts/audit-anchors.test.mjs`
Expected: both suites pass (35 + the existing count).

- [ ] **Step 9: Commit**

```bash
git add scripts/audit-anchors.mjs scripts/audit-anchors.test.mjs scripts/roadmap-check.mjs scripts/roadmap-check.test.mjs
git commit -m "feat(roadmap-check): claim anchors — check, count, skip absent repos, --fix flip

harvestDocAnchors takes the marker word (default verify, so the anchor pass is untouched).
A broken claim: never turns CI red; it flips confirmed → needs-verify under --fix. Spec §4–5.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Job 3 (symptom pass) and job 4 (index recount, diff, rewrite)

**Files:**
- Modify: `scripts/roadmap-check.mjs`, `scripts/roadmap-check.test.mjs`

**Interfaces:**
- Produces: `symptomPass(rm, todayYmd) → { decisions: [entry], stale: [entry] }`; `expectedIndex(rm) → { rows, nextRelease }`; `renderRow(row) → string`; `diffIndex(rm) → [{ message }]`; `rewriteIndex(rm) → string` (the new ROADMAP.md text).

- [ ] **Step 1: Write the failing tests**

Append to `scripts/roadmap-check.test.mjs`:

```js
import { symptomPass, expectedIndex, renderRow, diffIndex, rewriteIndex } from './roadmap-check.mjs';

test('symptomPass: decisions always; confirmed/needs-verify older than 60 days; parked never', () => {
  const rm = loadRoadmap(withFixture());
  const sp = symptomPass(rm, '2026-09-01');
  assert.deepEqual(sp.decisions.map(e => e.area), ['native-harness']);
  // Android item checked 2026-06-01 is 92 days old; the confirmed one (08-20) is 12 days old;
  // the parked one (01-15) is 229 days old and must NOT appear.
  assert.deepEqual(sp.stale.map(e => e.firstLine), ['Android says "Synced" while the last push failed']);
  const later = symptomPass(rm, '2026-11-01');
  assert.equal(later.stale.length, 2);
  assert.ok(later.stale.every(e => e.status !== 'parked'));
});

test('symptomPass: exactly 60 days is not stale; 61 is', () => {
  const rm = loadRoadmap(withFixture());
  assert.equal(symptomPass(rm, '2026-07-31').stale.length, 0);   // 06-01 + 60 days
  assert.equal(symptomPass(rm, '2026-08-01').stale.length, 1);
});

test('expectedIndex: counts, headings, order by Open desc then name, next-release from flags', () => {
  const ex = expectedIndex(loadRoadmap(withFixture()));
  assert.deepEqual(ex.rows, [
    { area: 'sync', heading: 'moving your stuff between devices', open: 3, needsVerify: 1, decisions: 0, parked: 1 },
    { area: 'native-harness', heading: "the app's own agent doing work", open: 1, needsVerify: 0, decisions: 1, parked: 0 },
  ]);
  assert.deepEqual(ex.nextRelease, ['- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner']);
  assert.equal(renderRow(ex.rows[0]), '| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 3 | 1 | 0 | 1 |');
});

test('diffIndex: clean fixture has no drift', () => {
  assert.deepEqual(diffIndex(loadRoadmap(withFixture())), []);
});

test('diffIndex: a wrong count, a changed heading, a stale next-release list', () => {
  const root = withFixture(r => {
    edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 2 | 1 | 0 | 1 |');
    edit(r, 'docs/roadmap/native-harness.md', "the app's own agent doing work", 'the native agent');
    edit(r, 'docs/roadmap/sync.md', '`checked 2026-08-20` `v1.3`', '`checked 2026-08-20` `v1.3.1`');
  });
  const msgs = diffIndex(loadRoadmap(root)).map(d => d.message);
  assert.ok(msgs.some(m => /row sync:/.test(m)));
  assert.ok(msgs.some(m => /row native-harness:/.test(m)));
  assert.ok(msgs.some(m => /Next release list/.test(m)));
});

test('rewriteIndex: touches only the table rows and the next-release lines', () => {
  const root = withFixture(r => {
    edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 9 | 9 | 9 | 9 |');
    edit(r, 'docs/roadmap/sync.md', '`checked 2026-08-20` `v1.3`', '`checked 2026-08-20` `v1.3.1`');
  });
  const before = read(root, 'ROADMAP.md');
  const after = rewriteIndex(loadRoadmap(root));
  assert.equal(after.includes('| 9 | 9 | 9 | 9 |'), false);
  assert.ok(after.includes('| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 3 | 1 | 0 | 1 |'));
  assert.equal(after.includes('- sync: Sync dead-ends'), false);   // no v1.3 items any more
  // everything outside those two regions is byte-identical
  const strip = t => t.split('\n').filter(l => !/^\| \[/.test(l) && !/^- /.test(l)).join('\n');
  assert.equal(strip(after), strip(before));
  fs.writeFileSync(path.join(root, 'ROADMAP.md'), after);
  assert.deepEqual(diffIndex(loadRoadmap(root)), []);
});

test('rewriteIndex: an index with no next-release lines yet gets them inserted after Target:', () => {
  const root = withFixture(r => edit(r, 'ROADMAP.md', '- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner\n', ''));
  const after = rewriteIndex(loadRoadmap(root));
  assert.match(after, /Target: `v1\.3`\n- sync: Sync dead-ends on any machine without gh — the setup screen shows a spinner\n/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: import error — `symptomPass` is not exported.

- [ ] **Step 3: Write jobs 3 and 4**

Append to `scripts/roadmap-check.mjs`:

```js
// ---------- job 3: symptom pass (spec §3.3, §5) ----------
// Only confirmed and needs-verify age. parked is "deliberately not now"; blocked and
// in-flight name what they wait on. decision is listed on every pass regardless of age.

export function symptomPass(rm, todayYmd) {
  const cutoff = new Date(`${todayYmd}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - STALE_DAYS);
  const decisions = [];
  const stale = [];
  for (const a of rm.areas) {
    for (const e of a.entries) {
      if (e.status === 'decision') decisions.push(e);
      else if ((e.status === 'confirmed' || e.status === 'needs-verify') && e.checked
               && new Date(`${e.checked}T00:00:00Z`) < cutoff) stale.push(e);
    }
  }
  return { decisions, stale };
}

// ---------- job 4: index (spec §1.1, §5) ----------

export function expectedIndex(rm) {
  const rows = rm.areas.map(a => ({
    area: a.area,
    heading: a.heading,
    open: a.entries.length,
    needsVerify: a.entries.filter(e => e.status === 'needs-verify').length,
    decisions: a.entries.filter(e => e.status === 'decision').length,
    parked: a.entries.filter(e => e.status === 'parked').length,
  })).sort((x, y) => y.open - x.open || (x.area < y.area ? -1 : 1));
  const target = rm.index?.target ?? null;
  const nextRelease = rm.areas.flatMap(a => a.entries.filter(e => e.release === target).map(e => `- ${a.area}: ${e.firstLine}`));
  return { rows, nextRelease };
}

export function renderRow(r) {
  return `| [${r.area}](${ROADMAP_DIR}/${r.area}.md) — ${r.heading} | ${r.open} | ${r.needsVerify} | ${r.decisions} | ${r.parked} |`;
}

export function diffIndex(rm) {
  if (!rm.index) return [];
  const ex = expectedIndex(rm);
  const drift = [];
  const actualRows = rm.index.tableStart === -1 ? [] : rm.index.lines.slice(rm.index.tableStart, rm.index.tableEnd + 1);
  const wantRows = ex.rows.map(renderRow);
  if (actualRows.length !== wantRows.length) drift.push({ message: `Backlogs table has ${actualRows.length} rows, area files give ${wantRows.length}` });
  else {
    for (let i = 0; i < wantRows.length; i++) {
      if (actualRows[i] !== wantRows[i]) drift.push({ message: `row ${ex.rows[i].area}: index says "${actualRows[i]}", files give "${wantRows[i]}"` });
    }
  }
  const actualNr = rm.index.nextRelease.join('\n');
  const wantNr = ex.nextRelease.join('\n');
  if (actualNr !== wantNr) drift.push({ message: `Next release list is stale — flags give:\n${wantNr || '(no items carry the target flag)'}` });
  return drift;
}

// Rewrites ONLY the table rows and the next-release lines. Everything else — the
// "where the app stands" prose, the filing rule — is byte-identical afterwards.
export function rewriteIndex(rm) {
  const ex = expectedIndex(rm);
  const lines = [...rm.index.lines];
  // Table first (it sits below Next release, so its line numbers are the ones that must not shift yet).
  if (rm.index.tableStart !== -1) lines.splice(rm.index.tableStart, rm.index.tableEnd - rm.index.tableStart + 1, ...ex.rows.map(renderRow));
  if (rm.index.nrStart !== -1) lines.splice(rm.index.nrStart, rm.index.nrEnd - rm.index.nrStart + 1, ...ex.nextRelease);
  else if (rm.index.targetLine !== -1) lines.splice(rm.index.targetLine + 1, 0, ...ex.nextRelease);
  return lines.join('\n');
}
```

Note on ordering in `rewriteIndex`: the table is spliced first because it is *below* the next-release list in the index. Splicing the list first could change the table's line numbers. If the table were ever moved above the list this would need reversing; the byte-identical test catches it.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: 42 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/roadmap-check.mjs scripts/roadmap-check.test.mjs
git commit -m "feat(roadmap-check): symptom pass and index recount/rewrite

Spec §5 jobs 3–4. parked never ages; --fix rewrites only the table and the next-release list.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The CLI — `main()`, output, flags, exit codes

**Files:**
- Modify: `scripts/roadmap-check.mjs`, `scripts/roadmap-check.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: `render(report) → string` (markdown), `run({ root, fix, quiet, structureOnly, today }) → { exitCode, text }`, and the `main()` guard. The hook (Task 7) and CI (Task 8) call the file, not these functions.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/roadmap-check.test.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { run } from './roadmap-check.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'roadmap-check.mjs');
const cli = (root, ...args) => spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

test('run: dormant when docs/roadmap is absent — one line, exit 0', () => {
  const root = withFixture(r => fs.rmSync(path.join(r, 'docs', 'roadmap'), { recursive: true }));
  const r = cli(root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /docs\/roadmap\/ not found .* nothing to check/);
});

test('run: clean fixture — all four sections, exit 0', () => {
  const r = run({ root: withFixture(), today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /### Structure — clean/);
  assert.match(r.text, /### Claims — 1 checked, 0 broken/);
  assert.match(r.text, /### For Destin/);
  assert.match(r.text, /native-harness:6 .*Should Bash keep/);     // decision first
  assert.match(r.text, /sync:7 .*Android says "Synced"/);            // 92 days old
  assert.match(r.text, /### Index — matches the area files/);
});

test('run: structure errors → exit 1, later jobs do not run, --quiet prints only them', () => {
  const root = withFixture(r => edit(r, 'docs/roadmap/sync.md', '`android` `needs-verify`', '`android` `needs-verifyy`'));
  const r = cli(root, '--quiet');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /docs\/roadmap\/sync\.md:7 unknown token `needs-verifyy`/);
  assert.doesNotMatch(r.stdout, /### Claims/);
  assert.doesNotMatch(r.stdout, /For Destin/);
});

test('run: --structure runs job 1 alone', () => {
  const r = run({ root: withFixture(), structureOnly: true, today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /### Structure — clean/);
  assert.doesNotMatch(r.text, /### Claims/);
});

test('run: broken claim is listed with the sha it was checked against, exit 0, no flip without --fix', () => {
  const root = withFixture(r => edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']"));
  const r = run({ root, today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /### Claims — 1 checked, 1 broken/);
  assert.match(r.text, /sync:4 .*not found in youcoded\/desktop\/src\/main\/sync-service\.ts/);
  assert.match(r.text, /checked against: /);   // the temp fixture is not a git repo, so this reads "(no git)"
  assert.match(read(root, 'docs/roadmap/sync.md'), /`desktop` `confirmed`/);
});

test('run: --fix flips the broken claim, rewrites the index, and says what it did', () => {
  const root = withFixture(r => {
    edit(r, 'youcoded/desktop/src/main/sync-service.ts', "['auth', 'status']", "['auth', 'login']");
    edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 3 | 0 | 0 | 1 |');
  });
  const r = run({ root, fix: true, today: '2026-09-01' });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /flipped to needs-verify: sync:4/);
  assert.match(r.text, /index rewritten/);
  assert.match(read(root, 'docs/roadmap/sync.md'), /`desktop` `needs-verify` `checked 2026-08-20`/);
  assert.match(read(root, 'ROADMAP.md'), /\| 3 \| 2 \| 0 \| 1 \|/);   // needs-verify went 1 → 2 after the flip
  assert.deepEqual(diffIndex(loadRoadmap(root)), []);
});

test('run: index drift without --fix is a warning, exit 0', () => {
  const root = withFixture(r => edit(r, 'ROADMAP.md', '| 3 | 1 | 0 | 1 |', '| 4 | 1 | 0 | 1 |'));
  const r = cli(root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /### Index — drift \(run --fix\)/);
});

test('run: --today is validated; --root needs an argument', () => {
  assert.equal(cli(withFixture(), '--today', 'yesterday').status, 1);
  const r = spawnSync(process.execPath, [SCRIPT, '--root'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--root requires an argument/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: import error — `run` is not exported.

- [ ] **Step 3: Write `run`, `render`, `main`**

Append to `scripts/roadmap-check.mjs`:

```js
// ---------- the run ----------

const where = e => `${e.area}:${e.line}`;
const cut = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function run({ root, fix = false, quiet = false, structureOnly = false, today }) {
  let rm = loadRoadmap(root);
  if (!rm) return { exitCode: 0, text: `roadmap-check: ${ROADMAP_DIR}/ not found under ${root} — nothing to check (pre-migration)\n` };
  const out = [];
  const say = (...l) => { if (!quiet) out.push(...l); };

  // 1. structure — the only job that can exit 1, and the only one --quiet prints
  const structure = checkStructure(rm);
  say('## Roadmap check', '');
  if (structure.length) {
    out.push(`### Structure — ${structure.length} error(s)`);
    for (const e of structure) out.push(`- ${e.file}:${e.line} ${e.message}`);
    out.push('', 'Later jobs did not run: fix the structure first.');
    return { exitCode: 1, text: out.join('\n') + '\n' };
  }
  say('### Structure — clean');
  if (structureOnly) return { exitCode: 0, text: out.join('\n') + '\n' };

  // 2. claims
  const claims = checkClaims(rm);
  let flipped = [];
  if (fix) {
    flipped = applyClaimFixes(rm, claims);
    if (flipped.length) rm = loadRoadmap(root);   // counts below must see the flips
  }
  const checked = claims.results.filter(r => !r.skipped);
  const broken = checked.filter(r => !r.ok);
  say('', `### Claims — ${checked.length} checked, ${broken.length} broken`);
  say(`checked against: ${Object.entries(claims.shas).map(([k, v]) => `${k}=${v.slice(0, 8)}`).join(' ') || '(no git)'}`);
  for (const r of broken) say(`- ${where({ area: r.area, line: r.entry.line })} ${cut(r.entry.firstLine)} — ${r.reason} (${r.entry.link})`);
  if (flipped.length) say(`- flipped to needs-verify: ${flipped.map(where).join(', ')}`);
  for (const r of claims.results.filter(r => r.skipped)) say(`- skipped ${where({ area: r.area, line: r.entry.line })}: ${r.skipped}`);
  for (const w of claims.warnings) say(`- warning ${where(w)}: ${w.message}`);

  // 3. symptom pass
  const sp = symptomPass(rm, today);
  say('', `### For Destin — ${sp.decisions.length} decision(s), ${sp.stale.length} item(s) unconfirmed for ${STALE_DAYS}+ days`);
  for (const e of sp.decisions) say(`- decision ${where(e)} ${cut(e.firstLine)}`);
  const byArea = new Map();
  for (const e of sp.stale) { if (!byArea.has(e.area)) byArea.set(e.area, []); byArea.get(e.area).push(e); }
  for (const [area, list] of byArea) {
    say(`- ${area}:`);
    for (const e of list) say(`  - ${where(e)} ${cut(e.firstLine)} (${e.status}, checked ${e.checked})`);
  }

  // 4. index
  let drift = diffIndex(rm);
  if (fix && drift.length) {
    fs.writeFileSync(path.join(root, INDEX_FILE), rewriteIndex(rm));
    say('', '### Index — drift, index rewritten');
    for (const d of drift) say(`- was: ${d.message.split('\n')[0]}`);
    drift = [];
  } else if (drift.length) {
    say('', '### Index — drift (run --fix)');
    for (const d of drift) say(`- ${d.message}`);
  } else {
    say('', '### Index — matches the area files');
  }
  return { exitCode: 0, text: out.join('\n') + '\n' };
}

function main() {
  const args = process.argv.slice(2);
  const flag = name => args.includes(name);
  const value = name => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    if (args[i + 1] === undefined || args[i + 1].startsWith('--')) {
      console.error(`roadmap-check: ${name} requires an argument`);
      process.exit(1);
    }
    return args[i + 1];
  };
  const rootArg = value('--root');
  const root = rootArg ? path.resolve(rootArg) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const today = value('--today') ?? new Date().toISOString().slice(0, 10);
  if (!isRealDate(today)) { console.error(`roadmap-check: --today must be YYYY-MM-DD, got "${today}"`); process.exit(1); }
  const r = run({ root, fix: flag('--fix'), quiet: flag('--quiet'), structureOnly: flag('--structure'), today });
  process.stdout.write(r.text);
  process.exit(r.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/roadmap-check.test.mjs`
Expected: 50 tests pass.

- [ ] **Step 5: Confirm dormancy against the real workspace**

Run: `node scripts/roadmap-check.mjs --root /home/destin/youcoded-dev; echo "exit $?"`
Expected:

```
roadmap-check: docs/roadmap/ not found under /home/destin/youcoded-dev — nothing to check (pre-migration)
exit 0
```

- [ ] **Step 6: Commit**

```bash
git add scripts/roadmap-check.mjs scripts/roadmap-check.test.mjs
git commit -m "feat(roadmap-check): CLI — four jobs, --fix, --quiet, --structure, dormant pre-migration

Exit 1 only on structure errors; claims and index drift never turn CI red. Spec §5.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The edit hook

**Files:**
- Create: `.claude/hooks/roadmap-edit-check.mjs`
- Create: `.claude/hooks/roadmap-edit-check.test.mjs`
- Modify: `.claude/settings.json`

**Interfaces:**
- Consumes: `scripts/roadmap-check.mjs --structure --quiet --root <dir>` (exit 1 + stdout on errors).
- Produces: a PostToolUse hook. Protocol: exit 0 = silent; exit 2 + stderr = the message goes back to the model.

- [ ] **Step 1: Write the failing tests**

```js
// .claude/hooks/roadmap-edit-check.test.mjs
// The hook must be SILENT for every write that is not a roadmap file — a hook that
// speaks on unrelated edits gets ignored within a week. Run: node --test .claude/hooks/roadmap-edit-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, 'roadmap-edit-check.mjs');
const FIXTURE = path.join(HERE, '..', '..', 'scripts', 'fixtures', 'roadmap');

function fixtureRoot(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-hook-'));
  fs.cpSync(FIXTURE, root, { recursive: true });
  mutate(root);
  return root;
}

function runHook(root, toolInput, tool_name = 'Edit') {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name, tool_input: toolInput }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

test('silent on a write outside the roadmap', () => {
  const r = runHook(fixtureRoot(), { file_path: '/somewhere/else/App.tsx', content: 'x' }, 'Write');
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('silent on malformed or empty stdin', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: fixtureRoot() } });
  assert.equal(r.status, 0);
});

test('silent on a clean roadmap edit', () => {
  const root = fixtureRoot();
  const r = runHook(root, { file_path: path.join(root, 'docs', 'roadmap', 'sync.md') });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('exit 2 with the errors on stderr for a malformed area file', () => {
  const root = fixtureRoot(r => {
    const p = path.join(r, 'docs', 'roadmap', 'sync.md');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('`android` `needs-verify`', '`android` `needs-verifyy`'));
  });
  const r = runHook(root, { file_path: path.join(root, 'docs', 'roadmap', 'sync.md') });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /docs\/roadmap\/sync\.md:7 unknown token `needs-verifyy`/);
  assert.match(r.stderr, /spec/);
});

test('an entry filed in ROADMAP.md itself is caught too', () => {
  const root = fixtureRoot(r => {
    const p = path.join(r, 'ROADMAP.md');
    fs.appendFileSync(p, '- [ ] filed in the index by a stale session\n');
  });
  const r = runHook(root, { file_path: 'ROADMAP.md' });   // relative path, as Edit sometimes passes
  assert.equal(r.status, 2);
  assert.match(r.stderr, /the index holds no entries/);
});

test('silent (exit 0) when docs/roadmap does not exist yet', () => {
  const root = fixtureRoot(r => fs.rmSync(path.join(r, 'docs', 'roadmap'), { recursive: true }));
  const r = runHook(root, { file_path: 'ROADMAP.md' });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test .claude/hooks/roadmap-edit-check.test.mjs`
Expected: fails — hook file not found.

- [ ] **Step 3: Write the hook**

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test .claude/hooks/roadmap-edit-check.test.mjs`
Expected: 6 tests pass.

- [ ] **Step 5: Register the hook**

In `.claude/settings.json`, add a `PostToolUse` block after the existing `PreToolUse` block (keep the file's existing entries exactly as they are):

```json
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/roadmap-edit-check.mjs\"",
            "timeout": 10
          }
        ]
      }
    ]
```

Validate: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"` → `ok`.

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/roadmap-edit-check.mjs .claude/hooks/roadmap-edit-check.test.mjs .claude/settings.json
git commit -m "feat(hooks): roadmap-edit-check — structure errors go back to the session that wrote them

PostToolUse on Edit|Write|MultiEdit; exit 2 + stderr is the only protocol that reaches
the model. Silent for every non-roadmap write and while docs/roadmap/ does not exist. Spec §5.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: CI and `/audit` wiring

**Files:**
- Modify: `.github/workflows/workspace-ci.yml` (two steps)
- Modify: `.claude/commands/audit.md:93-113` (steps 5 and 6)

- [ ] **Step 1: Add the CI steps**

In `.github/workflows/workspace-ci.yml`, change the "Test the workspace hooks" step to include the new hook test, and add the tool's test and run after the anchor step:

```yaml
      - name: Test the workspace hooks
        if: ${{ !cancelled() }}
        run: node --test .claude/hooks/context-inject.test.mjs .claude/hooks/glob-guard.test.mjs .claude/hooks/roadmap-edit-check.test.mjs
```

and, directly after the "Verify anchors, MAP paths, and store budgets" step:

```yaml
      # The roadmap tool's own tests gate its run, same reasoning as the anchor checker.
      - name: Test roadmap-check
        if: ${{ !cancelled() }}
        run: node --test scripts/roadmap-check.test.mjs

      # Structure errors fail CI. Broken claims and count drift are LISTED and never fail
      # it — a rotted claim is the roadmap asking to be re-verified, which is the design
      # working, and a count drift must not go red for every other session (spec §5).
      # Dormant (one line, exit 0) until the migration branch creates docs/roadmap/.
      - name: Roadmap structure
        if: ${{ !cancelled() }}
        run: node scripts/roadmap-check.mjs --quiet
```

Validate the YAML parses: `node -e "const y=require('fs').readFileSync('.github/workflows/workspace-ci.yml','utf8'); console.log(y.split('\n').filter(l=>/^      - name:/.test(l)).length)"` → prints the named-step count (was 6, now 8).

- [ ] **Step 2: Rewrite `/audit` step 5 and touch step 6**

Replace the "### 5. Roadmap verification" section of `.claude/commands/audit.md` with:

```markdown
### 5. Roadmap verification

One command: `node scripts/roadmap-check.mjs --fix`. Paste its output into the report
under `## Roadmap`. Then:

- **Structure errors** (exit 1): fix the file it names, re-run. Nothing else runs until it is clean.
- **Broken claims**: `--fix` already flipped them to `needs-verify`. Re-read each report
  it names against the code; if the diagnosis still holds, update the anchor and set the
  item back to `confirmed` with `checked` = today. If not, rewrite the report or close the item.
- **Claim warnings** (confirmed with no anchor; anchor matching more than one place): fix the
  report's anchor.
- **For Destin**: hand him the list as is — decisions first, then symptoms unconfirmed for
  60+ days grouped by area. Yes / no / don't know per item. Apply his answers: yes →
  re-stamp `checked` (and `needs-verify` → `confirmed`); no → move to `shipped.md` with
  "no longer reproduces"; don't know → `needs-verify`.
- **Index**: already rewritten by `--fix`.

Dedup near-identical items across area files by hand (one entry, one report, keep the
older date in the report's history line). Filing rule and grammar: the bottom of
`ROADMAP.md` and the spec, `docs/archive/specs/2026-09-01-roadmap-restructure-design.md` §2.
```

In step 6, change the auto-memory bullet's last sentence from `Planning content moves to ROADMAP.md —` to `Planning content moves to the area file under docs/roadmap/ whose Filing test says yes —`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/workspace-ci.yml .claude/commands/audit.md
git commit -m "ci+audit: run roadmap-check in CI (structure only fails) and make /audit step 5 one command

Spec §5 wiring. The step that had never run is now the tool plus a short reading of its output.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The legacy worksheet script (throwaway, no tests)

**Files:**
- Create: `scripts/roadmap-legacy-worksheet.mjs`

**Interfaces:**
- Produces: `node scripts/roadmap-legacy-worksheet.mjs <path-to-old-ROADMAP.md> [--root <workspace>]` → JSON array on stdout, one object per open item: `{ line, section, type, tags, added, headline, words, defaultArea, defaultFlags, defaultSeenOn, citedFiles: [{ path, repo, exists, lastCommit }], sharesFilesWith: [line, …], text }`.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// roadmap-legacy-worksheet.mjs — THROWAWAY. Parses the single-file ROADMAP.md format
// (pre-2026-09 migration) into the migration worksheet the area agents work from
// (spec §6.1.3). Deleted when the migration ships; git history keeps it.
//
// Usage: node scripts/roadmap-legacy-worksheet.mjs <ROADMAP.md> [--root <workspace>] > worksheet.json
//   Run it against the migration branch's BASE copy: git show <base>:ROADMAP.md > /tmp/x/ROADMAP.md
//
// Reads git history (last commit per cited file) — fine here, this never runs in CI.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPOS, listTrackedFiles } from './audit-anchors.mjs';

// Spec §6.4 — tag → default area. Flags / seen-on / surface tags map to the metadata instead.
const TAG_AREA = {
  'native-runtime': 'native-harness', harness: 'native-harness', permissions: 'native-harness', specialists: 'native-harness',
  pricing: 'native-harness', cost: 'native-harness', skills: 'native-harness', mcp: 'native-harness', sessions: 'native-harness',
  context: 'native-harness', memory: 'native-harness', slugs: 'native-harness', leases: 'native-harness',
  tooling: 'dev-workspace', tests: 'dev-workspace', ci: 'dev-workspace', build: 'dev-workspace', release: 'dev-workspace',
  workbench: 'dev-workspace', 'harness-eval': 'dev-workspace', docs: 'dev-workspace', infra: 'dev-workspace',
  'tech-debt': 'dev-workspace', 'landing-page': 'dev-workspace',
  'android-runtime': 'android-only',
  marketplace: 'marketplace', 'marketplace-ui': 'marketplace', worker: 'marketplace', catalog: 'marketplace',
  wecoded: 'marketplace', plugins: 'marketplace', install: 'marketplace',
  ui: 'user-interface', ux: 'user-interface', 'ui-consistency': 'user-interface', a11y: 'user-interface',
  animation: 'user-interface', copy: 'user-interface', markdown: 'user-interface',
  artifacts: 'files', 'project-view': 'files', git: 'files',
  sync: 'sync',
  conversations: 'chat-data', chatsearch: 'chat-data', 'conversation-store': 'chat-data', chat: 'chat-data',
  'chat-ui': 'chat-data', 'chat-reducer': 'chat-data',
  themes: 'themes',
  remote: 'remote-access', 'remote-access': 'remote-access',
  'local-models': 'local-models', engine: 'local-models',
  hooks: 'claude-code-integration', 'pty-io': 'claude-code-integration', 'pty-writes': 'claude-code-integration',
  terminal: 'claude-code-integration', 'terminal-parser': 'claude-code-integration', 'transcript-watcher': 'claude-code-integration',
  games: 'games',
  social: 'other-features', accounts: 'other-features', announcements: 'other-features', buddy: 'other-features', onboarding: 'other-features',
};
// Weak defaults: only used when nothing stronger matched.
const WEAK_AREA = { renderer: 'user-interface', android: 'android-only' };
const TAG_FLAG = { performance: 'performance', perf: 'performance', security: 'security', safety: 'security' };
const TAG_SEEN = { desktop: 'desktop', linux: 'desktop', android: 'android' };

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: roadmap-legacy-worksheet.mjs <ROADMAP.md> [--root <workspace>]'); process.exit(1); }
const rootIdx = args.indexOf('--root');
const root = rootIdx !== -1 ? path.resolve(args[rootIdx + 1]) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const tracked = new Set(listTrackedFiles(root));
const lines = fs.readFileSync(file, 'utf8').split('\n');

// Old entry: `- [ ] \`type\` \`#tag\` … **headline** … (added YYYY-MM-DD…)`, continuation lines indented.
const items = [];
let section = null;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^## /.test(l)) { section = l.slice(3).trim(); continue; }
  const m = l.match(/^- \[ \] (.*)$/);
  if (!m) continue;
  const block = [m[1]];
  let j = i + 1;
  while (j < lines.length && /^\s+\S/.test(lines[j]) && !/^\s*- \[/.test(lines[j])) { block.push(lines[j].trim()); j++; }
  const text = block.join('\n');
  const tags = [...text.matchAll(/`#([a-z0-9-]+)`/g)].map(x => x[1]);
  const type = (block[0].match(/`(bug|feature|idea|chore|task|docs)`/) || [])[1] ?? null;
  const added = (text.match(/\(added (\d{4}-\d{2}-\d{2})/) || [])[1] ?? null;
  const headline = (block[0].match(/\*\*(.+?)\*\*/) || [])[1]
    ?? block[0].replace(/`[^`]*`/g, '').replace(/\(added.*$/, '').trim();
  const cited = [...new Set([...text.matchAll(/`([\w@./-]+\.(?:tsx?|kt|kts|mjs|cjs|js|md|json|sh|py|toml|ya?ml|html|css))(?::\d+(?:-\d+)?)?`/g)].map(x => x[1]))];
  const citedFiles = cited.map(p => {
    const hit = [...tracked].find(t => t === p || t.endsWith('/' + p)) ?? null;
    let lastCommit = null;
    if (hit) {
      const repo = REPOS.find(r => hit.startsWith(r + '/'));
      const dir = repo ? path.join(root, repo) : root;
      const rel = repo ? hit.slice(repo.length + 1) : hit;
      try { lastCommit = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cs', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { /* leave null */ }
    }
    return { path: p, resolved: hit, exists: hit !== null, lastCommit };
  });
  const strong = tags.map(t => TAG_AREA[t]).find(Boolean);
  const weak = tags.map(t => WEAK_AREA[t]).find(Boolean);
  items.push({
    line: i + 1, section, type, tags, added, headline,
    words: text.split(/\s+/).filter(Boolean).length,
    defaultArea: strong ?? weak ?? null,
    defaultFlags: [...new Set(tags.map(t => TAG_FLAG[t]).filter(Boolean))],
    defaultSeenOn: tags.map(t => TAG_SEEN[t]).find(Boolean) ?? null,
    defaultSurface: tags.includes('settings') ? 'settings' : null,
    citedFiles, sharesFilesWith: [], text,
  });
}
// Duplicate candidates: items citing the same resolved file.
const byFile = new Map();
for (const it of items) for (const c of it.citedFiles) if (c.resolved) { if (!byFile.has(c.resolved)) byFile.set(c.resolved, []); byFile.get(c.resolved).push(it.line); }
for (const it of items) {
  const s = new Set();
  for (const c of it.citedFiles) if (c.resolved) for (const l of byFile.get(c.resolved)) if (l !== it.line) s.add(l);
  it.sharesFilesWith = [...s].sort((a, b) => a - b);
}
process.stdout.write(JSON.stringify(items, null, 2) + '\n');
```

- [ ] **Step 2: Smoke-run it against today's file**

`SCRATCH` below is your session scratchpad directory (the one named in your system prompt).

```bash
node scripts/roadmap-legacy-worksheet.mjs /home/destin/youcoded-dev/ROADMAP.md --root /home/destin/youcoded-dev > "$SCRATCH/worksheet.json"
node -e "const w=require(process.argv[1]); console.log('items', w.length, 'no area', w.filter(i=>!i.defaultArea).length, 'no file', w.filter(i=>!i.citedFiles.length).length)" "$SCRATCH/worksheet.json"
```

Expected: `items 258 no area 7 no file 71` (measured 2026-09-01 by running exactly this script against the file; the spec's hand counts were 6 and 72 — the cited-file regex is heuristic, so ±2 is fine). The per-area distribution it prints will differ from the handoff's estimate (dev-workspace 44, android-only 9) because `#android` and `#renderer` are weak defaults here on purpose (spec §6.4); the filing test decides.

- [ ] **Step 3: Commit**

```bash
git add scripts/roadmap-legacy-worksheet.mjs
git commit -m "chore(roadmap): legacy worksheet script for the migration (throwaway)

Parses the single-file format into per-item JSON with default area, cited files and their
last commit, and duplicate candidates. Spec §6.1.3. Deleted when the migration ships.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Verify, merge, push, clean up

- [ ] **Step 1: Everything green**

```bash
node --test scripts/audit-anchors.test.mjs scripts/roadmap-check.test.mjs .claude/hooks/context-inject.test.mjs .claude/hooks/glob-guard.test.mjs .claude/hooks/roadmap-edit-check.test.mjs
node scripts/audit-anchors.mjs --root /home/destin/youcoded-dev --no-diff
node scripts/roadmap-check.mjs --root /home/destin/youcoded-dev
```

Expected: all tests pass; the anchor pass reports the same result it did before this branch; the roadmap tool prints its dormant line and exits 0.

- [ ] **Step 2: Open the PR, merge, push**

```bash
git push -u origin feat/roadmap-check
gh pr create --title "roadmap-check: the tool, hook and CI step (dormant until migration)" --body "$(cat <<'EOF'
Spec: docs/archive/specs/2026-09-01-roadmap-restructure-design.md §5.

- scripts/roadmap-check.mjs — structure / claims / symptom pass / index, --fix, dormant while docs/roadmap/ is absent
- .claude/hooks/roadmap-edit-check.mjs — PostToolUse; exit 2 + stderr on structure errors
- CI: tests + `--quiet` run; only structure errors fail
- /audit step 5 is now one command
- scripts/roadmap-legacy-worksheet.mjs — throwaway for the migration session

Nothing here touches ROADMAP.md. Master stays green because the tool is dormant.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After CI is green: merge, then

```bash
cd /home/destin/youcoded-dev && git pull origin master
git worktree remove /home/destin/youcoded-dev-roadmap-check
git branch -D feat/roadmap-check
git push origin --delete feat/roadmap-check   # skip if auto-deleted
```

- [ ] **Step 3: Hand off**

Append to `docs/archive/handoffs/2026-09-01-roadmap-restructure-handoff.md` §6: a row for this plan, and the sentence "Part 1 merged <date>, commit <sha>. Part 2 (migration) is the next session."

---

# Part 2 — the migration (its own session, its own branch)

This part is a runbook, not a TDD task list: it moves prose, and the tool is the test.
Read spec §6 first; this section only adds the commands and the subagent brief.

### M1: Branch and skeleton (spec §6.1.2)

- [ ] **Step 1: Branch**

```bash
cd /home/destin/youcoded-dev && git fetch origin
git worktree add /home/destin/youcoded-dev-migration -b feat/roadmap-migration origin/master
cd /home/destin/youcoded-dev-migration
git rev-parse origin/master > .migration-base   # NOT committed; used in M4
```

- [ ] **Step 2: The worksheet, from the base copy**

```bash
# SCRATCH = your session scratchpad directory
git show "$(cat .migration-base):ROADMAP.md" > "$SCRATCH/roadmap-base.md"
node scripts/roadmap-legacy-worksheet.mjs "$SCRATCH/roadmap-base.md" --root /home/destin/youcoded-dev > "$SCRATCH/worksheet.json"
```

- [ ] **Step 3: `docs/roadmap/shipped.md`**

```bash
mkdir -p docs/roadmap
{
  printf '# Shipped\n\nOne line per closed item, newest at the bottom: `- [x] YYYY-MM-DD <area> — <headline> (<commit or PR>)`.\n\n'
  printf '## Shipped before 2026-09-01 (old format)\n'
  sed -n '/^## Shipped/,$p' "$SCRATCH/roadmap-base.md" | tail -n +2
} > docs/roadmap/shipped.md
rg -c '^\s*- \[x\]' docs/roadmap/shipped.md   # expect 150
```

- [ ] **Step 4: The 14 area files** — exactly this content (heading = spec §3.1, filing test = spec §3.1 both columns, sublevel headings = spec §3.1):

`docs/roadmap/native-harness.md`
```markdown
# native-harness — the app's own agent doing work
Filing test: the app's own agent is doing work — a turn, a tool call, a permission, a cost
figure, a specialist. Not here: a chat you already had (chat-data); getting a model onto disk
(local-models); Claude Code is doing the work (claude-code-integration).

## sessions

## tools

## permissions

## cost

## specialists

## skills-mcp
```

`docs/roadmap/dev-workspace.md`
```markdown
# dev-workspace — building the app, not the app
Filing test: it's about building the app, not the app. Could a normal user ever see it? No.
seen-on is always n/a here.

## tests

## rigs

## knowledge

## release
```

`docs/roadmap/android-only.md`
```markdown
# android-only — bugs in Android's own code
Filing test: if you fixed this on desktop, would Android still be broken? Yes — the bug is in
Android's own code. Not here: the code is shared and the phone is just where it shows — file
that in the shared area with android as seen-on.
```

`docs/roadmap/marketplace.md`
```markdown
# marketplace — finding, installing and rating plugins and themes
Filing test: finding, listing, installing, rating plugins or themes, and the Worker behind
them. Not here: the theme renders wrong (themes).

## catalog

## backend

## install
```

`docs/roadmap/user-interface.md`
```markdown
# user-interface — shared primitives, chrome, layout, copy
Filing test: does the fix change more than one screen? Yes — shared primitives, chrome,
layout, copy. Not here: one screen only — that screen's area, with the surface token.
```

`docs/roadmap/files.md`
```markdown
# files — documents the user opens, edits or organises
Filing test: documents the user opens, edits or organises — files panel, project files, the
git surface, and the per-chat record of which files a session produced. Not here: a
workspace guidance doc (dev-workspace); the transcript itself, or how it is titled, tagged,
searched or resumed (chat-data).
```

`docs/roadmap/sync.md`
```markdown
# sync — moving your stuff between devices
Filing test: moving your stuff between devices, and the GitHub transport under it.
```

`docs/roadmap/other-features.md`
```markdown
# other-features — real features too small for their own area
Filing test: a real user-facing feature too small for its own area. Not here: its sublevel
has passed ~8 items — graduate it to its own file.

## accounts

## buddy

## onboarding

## misc
```

`docs/roadmap/chat-data.md`
```markdown
# chat-data — everything kept about a chat
Filing test: everything kept about a chat — transcript, title, tags, notes, search index,
resume state. Not here: the model is running right now (native-harness); the files a chat
produced and the panel that shows them (files).
```

`docs/roadmap/themes.md`
```markdown
# themes — how the app looks under a theme
Filing test: how the app looks under a theme — engine, editor, a theme rendering wrong. Not
here: installing or browsing themes (marketplace).
```

`docs/roadmap/remote-access.md`
```markdown
# remote-access — reaching the app from another device
Filing test: reaching the app from another device — the protocol, the browser client.
```

`docs/roadmap/local-models.md`
```markdown
# local-models — getting a model onto this machine and serving it
Filing test: getting a model onto this machine and serving it — downloads, disk, the engine
process. Would this break the same way on a cloud model? No. (Yes → native-harness.)
```

`docs/roadmap/claude-code-integration.md`
```markdown
# claude-code-integration — the app steering Claude Code's terminal
Filing test: Claude Code is doing the work and the app is steering its terminal — the
terminal pane, the PTY, fake keystrokes, hooks the app plants, install and login checks. Not
here: the app's own agent (native-harness); chat bubbles shared by both (user-interface /
chat-data).
```

`docs/roadmap/games.md`
```markdown
# games — the arcade
Filing test: the arcade — the games, leaderboards, head-to-head, match relay.
```

- [ ] **Step 5: The index skeleton** — replace `ROADMAP.md` with:

```markdown
# YouCoded roadmap

## Where the app stands
<!-- Destin's prose: one paragraph per pillar — Social AI · Personalization · Comprehensive
     Workspace · Accessibility · Platforms — what has shipped, what is blocking. The tool
     never touches this section. Written in M3 step 3. -->

## Next release
Target: `v1.3`

## Backlogs
| Area | Open | Needs verify | Decisions | Parked |
|---|---|---|---|---|
| [android-only](docs/roadmap/android-only.md) — bugs in Android's own code | 0 | 0 | 0 | 0 |
| [chat-data](docs/roadmap/chat-data.md) — everything kept about a chat | 0 | 0 | 0 | 0 |
| [claude-code-integration](docs/roadmap/claude-code-integration.md) — the app steering Claude Code's terminal | 0 | 0 | 0 | 0 |
| [dev-workspace](docs/roadmap/dev-workspace.md) — building the app, not the app | 0 | 0 | 0 | 0 |
| [files](docs/roadmap/files.md) — documents the user opens, edits or organises | 0 | 0 | 0 | 0 |
| [games](docs/roadmap/games.md) — the arcade | 0 | 0 | 0 | 0 |
| [local-models](docs/roadmap/local-models.md) — getting a model onto this machine and serving it | 0 | 0 | 0 | 0 |
| [marketplace](docs/roadmap/marketplace.md) — finding, installing and rating plugins and themes | 0 | 0 | 0 | 0 |
| [native-harness](docs/roadmap/native-harness.md) — the app's own agent doing work | 0 | 0 | 0 | 0 |
| [other-features](docs/roadmap/other-features.md) — real features too small for their own area | 0 | 0 | 0 | 0 |
| [remote-access](docs/roadmap/remote-access.md) — reaching the app from another device | 0 | 0 | 0 | 0 |
| [sync](docs/roadmap/sync.md) — moving your stuff between devices | 0 | 0 | 0 | 0 |
| [themes](docs/roadmap/themes.md) — how the app looks under a theme | 0 | 0 | 0 | 0 |
| [user-interface](docs/roadmap/user-interface.md) — shared primitives, chrome, layout, copy | 0 | 0 | 0 | 0 |

## Filing an item
Pick the file under `docs/roadmap/` whose `Filing test:` line says yes. Write what you saw,
in one or two lines, no file paths and no mechanism. If you investigated, put that in a
report under `docs/active/investigations/` with a `<!-- claim: … -->` anchor and link it with
`→ <path>`. The last line of an entry is its tokens: optional surface, then seen-on, status,
`checked YYYY-MM-DD`, then flags (`urgent` `needs-repro` `performance` `security` `regression`
or a release like `v1.3.1`). New items start `needs-verify` unless you reproduced it or your
report anchors the cause. To close an item: delete it from the area file, append one line to
`docs/roadmap/shipped.md`, archive its report. Run `node scripts/roadmap-check.mjs --fix`
before committing. Grammar and vocabularies:
`docs/archive/specs/2026-09-01-roadmap-restructure-design.md` §2–3.
```

- [ ] **Step 6: The tool passes on the empty roadmap**

Run: `node scripts/roadmap-check.mjs --root /home/destin/youcoded-dev-migration --fix; echo "exit $?"`
Expected: `### Structure — clean`, `### Claims — 0 checked, 0 broken`, `### For Destin — 0 decision(s), 0 item(s)…`, `### Index — matches the area files`, `exit 0`. (The sub-repo clones are absent in the worktree; that only matters for claims, of which there are none yet. From M2 on, run the tool with `--root` pointing at a checkout that has the sub-repos — copy `docs/roadmap/`, `ROADMAP.md` and the new reports into the main checkout for the check, or add the sub-repos to the worktree with `cp -al`.)

- [ ] **Step 7: Commit the skeleton**

```bash
git add ROADMAP.md docs/roadmap
git commit -m "roadmap: index skeleton, 14 area files, shipped.md — empty, tool passes

First commit of the migration (spec §6.1.2). The old single-file roadmap is the parent
commit of this one; the last single-file commit on master is $(cat .migration-base).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### M2: Fan-out (spec §6.2)

- [ ] **Step 1: Build each agent's packet** from `worksheet.json`: the items whose `defaultArea` is its area (for `native-harness`, split further by the tag → sublevel guess: `sessions`/`context`/`memory`/`slugs`/`leases` → sessions; `harness`/`native-runtime` with tool words → tools; `permissions` → permissions; `pricing`/`cost` → cost; `specialists` → specialists; `skills`/`mcp` → skills-mcp; the coordinator eyeballs the rest), plus the six untagged items handed to the `user-interface` agent to classify, plus the rows from `docs/active/reviews/2026-08-31-roadmap-open-item-difficulty-ranking.md` for those items.

- [ ] **Step 2: Dispatch 19 subagents in parallel** (13 areas + 6 native-harness sublevels), each `general-purpose`, each with this brief (fill the three bracketed slots):

```
You are migrating roadmap items into docs/roadmap/[AREA].md[, section ## [SUBLEVEL]] in the
worktree /home/destin/youcoded-dev-migration. Read the spec first:
docs/archive/specs/2026-09-01-roadmap-restructure-design.md — §2 (entry grammar), §3 (your
area's filing test and the vocabularies), §3.3 (what confirmed means), §4 (claim anchors),
§6.2 (your procedure). Your items are in [PACKET PATH] (JSON: line, headline, text, tags,
added, citedFiles with lastCommit, sharesFilesWith, and the ranking doc's verdict where one
exists).

For EACH item, in order:
1. Classify by the filing test, not the tag. If it belongs elsewhere, put it under "moved"
   in your report with the area you think is right, and skip it.
2. Verify against the code at /home/destin/youcoded/ (the main checkout, up to date) — read
   what the entry cites; `git -C /home/destin/youcoded-dev/youcoded log --since=<added> -- <file>`
   for each cited file. Decide: shipped / no longer true / still open.
   - Shipped or no longer true → append ONE line to docs/roadmap/shipped.md ABOVE the
     "## Shipped before" heading: `- [x] YYYY-MM-DD [AREA] — <headline> (<commit, PR, or
     "no longer reproduces: <why>">)`. Use today's date.
   - Still open and the entry has a real diagnosis (a cause, not just a file name) → write a
     report at docs/active/investigations/YYYY-MM-DD-<slug>.md (frontmatter: date, status:
     active, type: investigation, topic) holding the mechanism, cleaned up, and ONE
     `<!-- claim: {"path": "...", "contains": "..."} -->` on the load-bearing line, regex
     specific enough to match in exactly one place. Then a two-line symptom entry linking it.
     Status `confirmed` ONLY if you found the cause in the current code and anchored it;
     otherwise `needs-verify`. `checked` = today.
   - Still open, no diagnosis (only a symptom, or a file name with no cause) → two-line
     symptom entry, NO report, `needs-verify`, `checked` = the item's `added` date.
3. A question for Destin, not work → status `decision`. An idea → status `parked`.
4. Items in sharesFilesWith that are the same defect → one entry, one report; note the older
   `added` in the report's history line.
5. An item from the old v1.3 or v1.3.1 sections keeps that as a release flag.

Entry shape (the last line is tokens only, in this order; surface optional):
- [ ] <what you saw, on which platform, when — Destin's words where they exist; no paths, no
      mechanism, no "because">
      `<surface>` `<seen-on>` `<status>` `checked YYYY-MM-DD` `<flags>` → <report path>

seen-on for [AREA] is [n/a for dev-workspace; android for android-only; otherwise choose].
After every few entries run:
  node /home/destin/youcoded-dev/scripts/roadmap-check.mjs --structure --root /home/destin/youcoded-dev-migration
and fix what it reports. Do not touch any other area file. Do not run --fix.

Report back, tersely: items moved (line → area), items you could not classify, items you
could not verify either way (these go to Destin), reports written, shipped lines added.
```

- [ ] **Step 3: While they run**, the coordinator writes nothing into area files.

### M3: Coordinator (spec §6.3)

- [ ] **Step 1: Place the moved items and resolve the unclassifiable ones** by hand, using the filing tests. Re-run `--structure` until clean.

- [ ] **Step 2: Check claims against the real sub-repos.** Copy the branch's `ROADMAP.md`, `docs/roadmap/` and new `docs/active/investigations/*.md` into a scratch copy of the main checkout, or `cp -al` the sub-repos into the worktree, then:

```bash
node scripts/roadmap-check.mjs --root <checkout-with-subrepos> --fix
```

Expected: structure clean; zero broken claims on day one (every anchor was written today against today's code — a broken one means the agent's regex is wrong, fix the report); index rewritten.

- [ ] **Step 3: Destin's pass.** A question deck (`python3 scripts/questions/serve.py <spec.json>`, see CLAUDE.md → "Asking Destin many questions at once"): every `decision` item and every "could not verify" item from the agents' reports, each written for a reader with no context (today / problem / proposal / options with user-experience pros and cons). Not a chat list — that was rejected 2026-09-01. Apply the answers (yes → `checked` today and `confirmed`; no → `shipped.md` "no longer reproduces"; don't know → `needs-verify`, `checked` = its `added`). Ask him for the "Where the app stands" paragraphs in the same sitting, or draft them from `youcoded-feature-fact-sheet.md` and the shipped list for him to edit.

- [ ] **Step 4: Late arrivals.**

```bash
cd /home/destin/youcoded-dev && git fetch origin
git diff "$(cat /home/destin/youcoded-dev-migration/.migration-base)" origin/master -- ROADMAP.md
```

Every added `- [ ]` block goes through M2's procedure by hand. Every flipped `[x]` gets a `shipped.md` line.

- [ ] **Step 5: Doc sweep.** Re-run the spec §6.3.5 command and edit every live instruction site it lists to point at the filing rule (`ROADMAP.md` → "Filing an item") or the area file. The three section-pointers (`youcoded/docs/native-runtime.md:572`, `youcoded/docs/harness-evaluator-internals.md:96`, `scripts/resize-bench.mjs:41`) become pointers at the item's new area file. Sub-repo doc edits (`youcoded/CLAUDE.md`, `youcoded/docs/*`) are a separate PR in `youcoded` — open it, note its number in the migration PR body.

- [ ] **Step 6: Delete the worksheet script**, `git rm scripts/roadmap-legacy-worksheet.mjs` — git history keeps it (spec §1).

- [ ] **Step 7: `/audit` once, end to end.** Its step 5 is now the tool; confirm the report's `## Roadmap` section matches what M3 step 2 printed.

- [ ] **Step 8: Merge, push, archive.** PR → merge → push. Then, on master: move this plan, the spec, the taxonomy draft (already in archive) and the handoff to `docs/archive/`, flipping their `status:` to `shipped`. Remove the worktree and branch.

---

## Self-review

**Executed, not estimated.** Every code block in Part 1 was assembled from this document and run on 2026-09-01: 50/50 tool tests, 6/6 hook tests, 27/27 anchor-checker tests (with the marker change), the dormant run against the real workspace, and the worksheet script against today's `ROADMAP.md`. The test counts in each task's "Expected" line are the observed ones.

**Spec coverage.** §1 files → Tasks 2–3, M1. §1.1 index grammar, no-entries rule, row order → Tasks 2, 5. §1.3 shipped → Task 2. §2 entry grammar → Task 1–2. §3 vocabularies and sublevels → Task 1. §3.3 aging rules → Task 5; confirmed-without-anchor warning → Task 4. §4 claim marker, match count, absent repo → Task 4. §5 four jobs, exit codes, dormancy, flags, wiring, tests → Tasks 3–8. §6.1–6.4 → M1–M3, Task 9. §7 first-pass cliff → M3 step 3 ("answer generously"). §8 exclusions → nothing implements them.

**Placeholder scan.** The only bracketed slots are in the subagent brief (three, deliberately filled per dispatch) and the skeleton's HTML comment for Destin's prose (written in M3 step 3).

**Type consistency.** `parseMetadata` returns `seenOn`/`checked`/`release`/`flags`/`link`; `parseAreaFile` spreads those onto entries and adds `area`/`section`/`line`/`metaLineNo`/`firstLine`/`symptom` — `checkClaims`, `applyClaimFixes`, `symptomPass`, `expectedIndex`, `run` read exactly those names. `parseIndex` exposes `lines`/`target`/`targetLine`/`nextRelease`/`nrStart`/`nrEnd`/`rows`/`tableStart`/`tableEnd`/`errors`; `diffIndex` and `rewriteIndex` read exactly those. `checkStructure` errors are `{ file, line, message }`; `run` prints them as `file:line message`, which the hook test asserts on. `withFixture`/`read`/`write`/`edit` are defined once in Task 3 and used by Tasks 4–6 in the same file.
