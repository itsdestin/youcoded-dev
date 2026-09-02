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
