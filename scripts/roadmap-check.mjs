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
//   node scripts/roadmap-check.mjs --fix               also rewrite the index (ROADMAP.md) to match the area files
//   node scripts/roadmap-check.mjs --fix-claims        also flip confirmed items whose claim anchor broke to needs-verify
//   node scripts/roadmap-check.mjs --structure         job 1 only (the edit hook)
//   node scripts/roadmap-check.mjs --close <area>:<line or text> --ref "<commit or PR>" [--headline "<text>"]
//                                                      close one item: delete it, append its shipped.md line, rewrite the index
//   node scripts/roadmap-check.mjs --vocab             print every closed token list, then exit
//   node scripts/roadmap-check.mjs --quiet             print only structure errors (CI)
//   node scripts/roadmap-check.mjs --root <dir>        workspace root; defaults to the git checkout you are IN
//   node scripts/roadmap-check.mjs --today YYYY-MM-DD  "today" for the 60-day rule (tests)
//
// WHY --fix no longer flips claims (2026-09-16): every session is told to run --fix before
// committing, and the flip touched EVERY area file — so a session filing one item shipped
// another session's silent downgrade (three times in a week), and reverting took three
// steps because re-running --fix re-applied it. Flipping is now its own deliberate flag.
// WHY the root follows the working directory: the old default was the script's own
// location, so run from a worktree it silently rewrote the SHARED checkout's files.
//
// Dormant when docs/roadmap/ does not exist: prints one line, exits 0. That is what let the
// tool merge to master before the migration branch created the folder.
//
// Tests: node --test scripts/roadmap-check.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkAnchor, currentShas, harvestDocAnchors, REPOS } from './audit-anchors.mjs';

export const ROADMAP_DIR = 'docs/roadmap';
export const INDEX_FILE = 'ROADMAP.md';
export const SHIPPED_FILE = 'shipped.md';
export const OLD_FORMAT_HEADING = '## Shipped before 2026-09-01 (old format)';
export const STALE_DAYS = 60;
export const SHIPPED_MAX = 300;   // characters per shipped.md line; see parseShipped

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
  // WHY: remote-access work splits into items scheduled in the one-core phases (R0–R6/A0–A6,
  // docs/active/handoffs/2026-09-24-one-core-START-HERE.md) and items that can land any time.
  'remote-access': ['one-core', 'standalone'],
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

// Every closed list, rendered. Built from the constants above so it can never drift from
// what classifyToken actually accepts. `--vocab` prints it; the unknown-token error quotes
// the short half of it inline.
//
// Fix: a rejection used to say only "not a surface, seen-on, status, checked date or flag
// (spec §3)" — which sent Destin off to an ARCHIVED spec to find out what the words were.
// A validator that knows the answer must say the answer.
export function vocabHelp() {
  return [
    `surface (optional, one of ${SURFACES.length}): ${SURFACES.join(' · ')}`,
    `seen-on: ${SEEN_ON.join(' · ')}`,
    `status: ${STATUS.join(' · ')}`,
    'checked: `checked YYYY-MM-DD`',
    `flags: ${FLAGS.join(' · ')} — or a release like v1.3.1`,
    ...Object.entries(SUBLEVELS).map(([a, subs]) => `## sublevels in ${a}.md: ${subs.join(' · ')}`),
  ].join('\n');
}

// One-line form for an error message: the four short vocabularies spelled out, the 29
// surfaces behind a command, so the message stays readable inside a hook's stderr.
export function tokenVocabLine() {
  return `allowed tokens are a surface (\`node scripts/roadmap-check.mjs --vocab\` lists all ${SURFACES.length}), `
    + `seen-on (${SEEN_ON.join(' · ')}), status (${STATUS.join(' · ')}), `
    + '`checked YYYY-MM-DD`, then flags '
    + `(${FLAGS.join(' · ')}) or a release like \`v1.3.1\``;
}

// Cheap edit distance, capped: `needs-repo` should suggest `needs-repro`, `release-methods`
// should suggest nothing rather than a confident wrong guess.
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function suggestToken(tok) {
  const best = [...SURFACES, ...SEEN_ON, ...STATUS, ...FLAGS]
    .map(c => ({ c, d: editDistance(tok, c) }))
    .sort((x, y) => x.d - y.d)[0];
  return best && best.d <= 2 && best.d < tok.length ? best.c : null;
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
  let saidVocab = false;   // one line, many strangers: spell the vocabulary out once
  for (const tok of tokens) {
    const kind = classifyToken(tok);
    if (!kind) {
      const near = suggestToken(tok);
      const tail = saidVocab ? 'same vocabulary as above' : tokenVocabLine();
      saidVocab = true;
      errors.push(`unknown token \`${tok}\`${near ? ` (did you mean \`${near}\`?)` : ''} — ${tail}`);
      continue;
    }
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
    // WHY a cap (2026-09-23): "one line per item" had grown into 1,000-character essays, and
    // the log reached 73,000 words — twice the open backlog. The story belongs in the commit or PR.
    else if (/^- \[x\]/.test(l) && l.length > SHIPPED_MAX) errors.push({ line: i + 1, message: `shipped line is ${l.length} characters (max ${SHIPPED_MAX}) — keep the headline and the commit or PR; the detail belongs in the commit message or PR` });
  }
  return { errors };
}

// ---------- --close: one step from open item to shipped line ----------
// WHY (2026-09-23): closing was three hand steps — delete the entry, append to shipped.md,
// re-run --fix — written out in ROADMAP.md, CLAUDE.md, close-out.sh and the wrap-up skill,
// and sessions regularly did one or two of them. `which` is `<area>:<line>` or
// `<area>:<text>` (text must match exactly one entry's symptom; line numbers shift as other
// sessions edit, text does not).
export function closeEntry(rm, which, { ref, today, headlineText } = {}) {
  const m = String(which).match(/^([^:]+):(.+)$/);
  if (!m) throw new Error('--close takes <area>:<line> or <area>:<text from the entry>');
  const [, areaName, key] = m;
  const area = rm.areas.find(a => a.area === areaName);
  if (!area) throw new Error(`no area file ${ROADMAP_DIR}/${areaName}.md (areas: ${rm.areas.map(a => a.area).join(', ')})`);
  const hits = /^\d+$/.test(key)
    ? area.entries.filter(e => e.line === Number(key))
    : area.entries.filter(e => e.symptom.toLowerCase().includes(key.toLowerCase()));
  if (hits.length !== 1) {
    const near = hits.length ? hits.map(e => `  ${areaName}:${e.line} ${headline(e, 90)}`).join('\n') : '  (none)';
    throw new Error(`--close ${which} matched ${hits.length} entries — it must match exactly one:\n${near}`);
  }
  if (!ref) throw new Error('--close needs --ref "<commit or PR>" — the shipped line cites where the work landed');
  const e = hits[0];

  // Remove the entry's lines plus one neighbouring blank line, so no double gap is left.
  const areaPath = path.join(rm.root, ROADMAP_DIR, `${areaName}.md`);
  const lines = fs.readFileSync(areaPath, 'utf8').split('\n');
  let from = e.line - 1, to = e.metaLineNo - 1;
  if (lines[to + 1] === '') to++;
  else if (from > 0 && lines[from - 1] === '') from--;
  lines.splice(from, to - from + 1);
  fs.writeFileSync(areaPath, lines.join('\n'));

  // Newest at the bottom of the new-format lines (above the old-format block if one exists).
  const shippedPath = path.join(rm.root, ROADMAP_DIR, SHIPPED_FILE);
  const sLines = fs.readFileSync(shippedPath, 'utf8').split('\n');
  const line = `- [x] ${today} ${areaName} — ${headlineText || headline(e, 160)} (${ref})`;
  const old = sLines.findIndex(l => l.trim() === OLD_FORMAT_HEADING);
  let at = old === -1 ? sLines.length : old;
  while (at > 0 && sLines[at - 1].trim() === '') at--;
  sLines.splice(at, 0, line);
  fs.writeFileSync(shippedPath, sLines.join('\n'));
  return { entry: e, line };
}

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
  // WHY a missing or extra index row is NOT a structure error (2026-09-23): structure errors
  // stop the run before --fix rewrites the index, so adding a new area file meant hand-typing
  // its table row first. diffIndex reports the row mismatch as drift and --fix repairs it.
  else for (const e of rm.index.errors) errors.push({ file: INDEX_FILE, line: e.line, message: e.message });
  if (!rm.shipped) errors.push({ file: `${ROADMAP_DIR}/${SHIPPED_FILE}`, line: 0, message: `${ROADMAP_DIR}/${SHIPPED_FILE} is missing` });
  else for (const e of rm.shipped.errors) errors.push({ file: `${ROADMAP_DIR}/${SHIPPED_FILE}`, line: e.line, message: e.message });
  // WHY (2026-09-23): a lone `<<<<<<< HEAD` sat above the ROADMAP.md backlog table for
  // weeks after a half-finished conflict repair (a3cd5cae). The row parser skips any
  // non-row line, so the check read "clean" and every --fix rewrite carried the debris
  // forward. Conflict markers are never legitimate in these files — make them an error.
  const files = [INDEX_FILE, `${ROADMAP_DIR}/${SHIPPED_FILE}`, ...rm.areas.map(areaFile)];
  for (const rel of files) {
    const abs = path.join(rm.root, rel);
    if (!fs.existsSync(abs)) continue;
    fs.readFileSync(abs, 'utf8').split('\n').forEach((text, i) => {
      if (/^(<{7}|={7}|>{7})( |$)/.test(text)) {
        errors.push({ file: rel, line: i + 1, message: `leftover merge-conflict marker: ${text.slice(0, 20)}` });
      }
    });
  }
  return errors;
}

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
  const nextRelease = rm.areas.flatMap(a => a.entries.filter(e => e.release === target).map(e => `- ${a.area}: ${headline(e)}`));
  return { rows, nextRelease };
}

// An entry's headline: its first sentence, cut at a word boundary.
// WHY not the first physical line (2026-09-23): entries wrap at ~100 columns, so the Next
// release list read "…behind an", "…eaten over" — every line ended mid-sentence. A leading
// "**v1.3.1 release blocker.**" is dropped too: the list is already the release's blockers.
export function headline(e, max = 110) {
  let s = e.symptom.replace(/\*\*/g, '').replace(/^v\d+(\.\d+)* release blocker\s*[.:—-]*\s*/i, '');
  const end = s.search(/[.;](\s|$)| — /);
  if (end >= 20) s = s.slice(0, end);
  if (s.length > max) s = s.slice(0, s.lastIndexOf(' ', max - 1)) + '…';
  return s;
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

// ---------- the run ----------

const where = e => `${e.area}:${e.line}`;
const cut = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function run({ root, fix = false, fixClaims = false, quiet = false, structureOnly = false, today }) {
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
  if (fixClaims) {
    flipped = applyClaimFixes(rm, claims);
    if (flipped.length) rm = loadRoadmap(root);   // counts below must see the flips
  }
  const checked = claims.results.filter(r => !r.skipped);
  const broken = checked.filter(r => !r.ok);
  // WHY the skipped count is in the header (2026-09-23): run from a workspace-only worktree,
  // 81 of 87 claims were skipped (their repo not checked out) and the header read "6 checked,
  // 0 broken" — 11 broken claims stayed invisible until the app worktree was added.
  const skipped = claims.results.length - checked.length;
  say('', `### Claims — ${checked.length} checked, ${broken.length} broken`
    + (skipped ? `, ${skipped} skipped (repo not checked out here — add it with workspace-start to check them)` : ''));
  say(`checked against: ${Object.entries(claims.shas).map(([k, v]) => `${k}=${v.slice(0, 8)}`).join(' ') || '(no git)'}`);
  for (const r of broken) say(`- ${where({ area: r.area, line: r.entry.line })} ${cut(r.entry.firstLine)} — ${r.reason} (${r.entry.link})`);
  if (flipped.length) say(`- flipped to needs-verify: ${flipped.map(where).join(', ')}`);
  else if (broken.some(r => r.entry.status === 'confirmed')) say('- a confirmed item with a broken claim is only listed; `--fix-claims` flips it to needs-verify');
  for (const r of claims.results.filter(r => r.skipped)) say(`- skipped ${where({ area: r.area, line: r.entry.line })}: ${r.skipped}`);
  for (const w of claims.warnings) say(`- warning ${where(w)}: ${w.message}`);

  // 3. symptom pass
  const sp = symptomPass(rm, today);
  say('', `### For Destin — ${sp.decisions.length} decision(s), ${sp.stale.length} item(s) unconfirmed for ${STALE_DAYS}+ days`);
  for (const e of sp.decisions) say(`- decision ${where(e)} ${headline(e, 90)}`);
  const byArea = new Map();
  for (const e of sp.stale) { if (!byArea.has(e.area)) byArea.set(e.area, []); byArea.get(e.area).push(e); }
  for (const [area, list] of byArea) {
    say(`- ${area}:`);
    for (const e of list) say(`  - ${where(e)} ${headline(e, 90)} (${e.status}, checked ${e.checked})`);
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
  // Answers "what words am I allowed to write?" without opening an archived spec.
  if (flag('--vocab')) { process.stdout.write(vocabHelp() + '\n'); process.exit(0); }
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
  const root = rootArg ? path.resolve(rootArg) : defaultRoot();
  const today = value('--today') ?? new Date().toISOString().slice(0, 10);
  if (!isRealDate(today)) { console.error(`roadmap-check: --today must be YYYY-MM-DD, got "${today}"`); process.exit(1); }
  // --close: remove one entry, append its shipped line, then fall through to a --fix run so
  // the index is rewritten in the same step.
  const closeArg = value('--close');
  if (closeArg !== undefined) {
    const rm = loadRoadmap(root);
    if (!rm) { console.error(`roadmap-check: no ${ROADMAP_DIR}/ under ${root}`); process.exit(1); }
    try {
      const { entry, line } = closeEntry(rm, closeArg, { ref: value('--ref'), today, headlineText: value('--headline') });
      process.stdout.write(`roadmap-check: closed ${entry.area}:${entry.line} under ${root}\nshipped.md gained: ${line}\n`);
      if (entry.link) process.stdout.write(`its report ${entry.link} — move it to docs/archive/ unless another entry still links it\n`);
    } catch (err) { console.error(`roadmap-check: ${err.message}`); process.exit(1); }
  }
  const fix = flag('--fix') || closeArg !== undefined;
  const fixClaims = flag('--fix-claims');
  // A write names the checkout it lands in, so a run from the wrong directory is visible.
  if (fix || fixClaims) process.stdout.write(`roadmap-check: writing under ${root}\n`);
  const r = run({ root, fix, fixClaims, quiet: flag('--quiet'), structureOnly: flag('--structure'), today });
  process.stdout.write(r.text);
  process.exit(r.exitCode);
}

/** The checkout the caller is standing in — its git top-level when that holds a
 *  ROADMAP.md — else the script's own workspace. See the header for why. */
export function defaultRoot(cwd = process.cwd()) {
  try {
    const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (top && fs.existsSync(path.join(top, INDEX_FILE))) return top;
  } catch { /* not in a git checkout — fall through */ }
  return path.resolve(fileURLToPath(new URL('..', import.meta.url)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
