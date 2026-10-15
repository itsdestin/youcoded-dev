#!/usr/bin/env node
// cards.mjs — the work cards: one small file per piece of work, in cards/ at the workspace root.
//
// WHY (Destin, 2026-10-14, docs/active/specs/2026-10-14-work-cards.md): no single name followed a piece of work
// from idea to chat to merge, and nothing stopped two chats starting the same thing. Destin never thinks in
// cards ("i just want to be able to dump ideas as i have done previously, and you figure out how to
// group/organize"): the idea-intake skill reads `index`, proposes a filing, and on his yes runs `new`.
//
// Usage:
//   node scripts/cards.mjs index                 every card, then every open roadmap entry, one line each
//   node scripts/cards.mjs new --title "<t>" [--stage explore] [--tags a,b] [--needs 3,7] [--related 4]
//                              [--finish "<1-3 sentences>"] [--roadmap "<area>: <first words>"] [--why "<his words>"]
//                                                creates cards/<n>-<slug>.md with the next number; prints its path
//   node scripts/cards.mjs import-roadmap        one card per open roadmap entry not yet imported (re-runnable)
//   node scripts/cards.mjs check                 every card parses, every stage is one of the four, every
//                                                "needs" names a card that exists; exit 1 otherwise
//   node scripts/cards.mjs --root <dir> …        workspace root; defaults to the git checkout you are IN
//
// Card file: `key: value` lines between --- fences, then free text (progress note, chats).
// Lists are comma-separated on one line. Only these keys:
//   id, title, stage, tags, needs, related, branch, finish, roadmap, created, why
// "needed by" is never stored: it is computed from the other cards' needs, so it cannot go stale.
//
// Tests: node --test scripts/cards.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadRoadmap, headline } from './roadmap-check.mjs';

export const CARDS_DIR = 'cards';
// WHY these stages (Destin, 2026-10-14: "planning, agentic buildout, human polish & review, merged"; "ready to
// merge is a wasted state"). WHY 'explore' before them (Destin, idea-intake-trial Q-2, 2026-10-15): "a new
// pre-planning class of items, like 'Preliminary Exploration' for things that i really haven't yet fleshed
// out … a bunch of these might overlap/intersect/contradict eachother, whereas planning items … shouldnt be
// able to contradict or overlap eachother." Exploration items may overlap (say so with `related`); Planning
// items may not, and moving to Planning means consolidating the related explorations into one card.
// The words he sees are STAGE_WORD; the file stores the short key.
export const STAGES = ['explore', 'planning', 'build', 'polish', 'merged'];
export const STAGE_WORD = { explore: 'Preliminary exploration', planning: 'Planning', build: 'Agentic buildout', polish: 'Human polish & review', merged: 'Merged' };
// WHY priority / release / report (2026-10-15, moving the roadmap over): an old entry's priority, target
// release and linked report are facts Destin set; a card keeps them rather than losing them in the move.
export const KEYS = ['id', 'title', 'stage', 'priority', 'tags', 'needs', 'related', 'release', 'report', 'branch', 'finish', 'roadmap', 'created', 'why'];
const LISTS = new Set(['tags', 'needs', 'related']);

export function slug(title) {
  return title.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 5).join('-') || 'card';
}

export function parseCard(text, file) {
  const errors = [];
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { file, errors: ['no --- fenced header at the top'] };
  const card = { file, body: m[2].trim() };
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = line.match(/^([a-z]+):\s*(.*)$/);
    if (!kv) { errors.push(`not a "key: value" line: ${line}`); continue; }
    const [, k, v] = kv;
    if (!KEYS.includes(k)) { errors.push(`unknown key "${k}" (allowed: ${KEYS.join(', ')})`); continue; }
    card[k] = LISTS.has(k) ? v.split(',').map(s => s.trim()).filter(Boolean) : v.trim();
  }
  card.id = Number(card.id);
  if (!Number.isInteger(card.id) || card.id < 1) errors.push('id must be a whole number from 1');
  if (!card.title) errors.push('title is missing');
  if (!STAGES.includes(card.stage)) errors.push(`stage "${card.stage ?? ''}" is not one of ${STAGES.join(', ')}`);
  card.tags ??= []; card.needs ??= []; card.related ??= [];
  const want = `${card.id}-`;
  if (file && !path.basename(file).startsWith(want)) errors.push(`file name should start with "${want}"`);
  card.errors = errors;
  return card;
}

export function renderCard(c) {
  const head = KEYS.filter(k => c[k] !== undefined && c[k] !== null && c[k] !== '' && !(Array.isArray(c[k]) && !c[k].length))  // WHY null too: an entry with no linked report wrote 'report: null'
    .map(k => `${k}: ${Array.isArray(c[k]) ? c[k].join(', ') : c[k]}`);
  return `---\n${head.join('\n')}\n---\n${c.body ? c.body.trim() + '\n' : ''}`;
}

export function loadCards(root) {
  const dir = path.join(root, CARDS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^\d+-.*\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))
    .map(f => parseCard(fs.readFileSync(path.join(dir, f), 'utf8'), path.join(CARDS_DIR, f)));
}

export function neededBy(cards) {
  const by = new Map(cards.map(c => [String(c.id), []]));
  for (const c of cards) for (const n of c.needs) by.get(String(n))?.push(c.id);
  return by;
}

export function check(cards) {
  const errs = [];
  const ids = new Map();
  for (const c of cards) {
    for (const e of c.errors ?? []) errs.push(`${c.file}: ${e}`);
    if (ids.has(c.id)) errs.push(`${c.file}: id ${c.id} is also used by ${ids.get(c.id)}`);
    ids.set(c.id, c.file);
  }
  for (const c of cards) for (const n of c.needs) {
    if (!ids.has(Number(n))) errs.push(`${c.file}: needs ${n}, but no card has that id`);
    if (Number(n) === c.id) errs.push(`${c.file}: needs itself`);
  }
  const byId = new Map(cards.map(c => [c.id, c]));
  for (const c of cards) for (const r of c.related) {
    const o = byId.get(Number(r));
    if (!o) { errs.push(`${c.file}: related to ${r}, but no card has that id`); continue; }
    // WHY: overlap is allowed only while exploring; a Planning-or-later card that overlaps another must be merged first
    if (c.stage !== 'explore' && o.stage !== 'explore') errs.push(`${c.file}: overlaps ${o.file}, but neither is in exploration — consolidate them into one card`);
  }
  return errs;
}

export function nextId(cards) {
  return cards.reduce((m, c) => Math.max(m, c.id || 0), 0) + 1;
}

/** The one context idea intake reads: every card, then every open roadmap entry. */
export function index(root) {
  const cards = loadCards(root);
  const by = neededBy(cards);
  const out = [`# Cards (${cards.length})`];
  for (const c of cards) {
    const nb = by.get(String(c.id)) ?? [];
    out.push(`#${c.id} [${STAGE_WORD[c.stage] ?? c.stage}] ${c.title}` +
      (c.tags.length ? ` · tags: ${c.tags.join(', ')}` : '') +
      (c.needs.length ? ` · needs: ${c.needs.map(n => '#' + n).join(', ')}` : '') +
      (c.related.length ? ` · overlaps: ${c.related.map(n => '#' + n).join(', ')}` : '') +
      (nb.length ? ` · needed by: ${nb.map(n => '#' + n).join(', ')}` : '') +
      (c.priority ? ` · ${c.priority}` : ''));
  }
  if (!cards.length) out.push('(none yet)');
  const rm = loadRoadmap(root);
  // WHY skip imported entries: once an old entry has a card, listing it twice would invite a duplicate
  const done = new Set(cards.map(c => c.roadmap).filter(Boolean));
  const entries = (rm ? rm.areas.flatMap(a => a.entries) : []).filter(e => !done.has(roadmapRef(e)));
  out.push('', `# Open roadmap entries (${entries.length}) — area: headline · status · priority`);
  for (const e of entries) out.push(`${e.area}: ${headline(e, 140)} · ${e.status ?? ''} · ${e.priority ?? ''}`);
  return out.join('\n');
}

export function createCard(root, opts, today = new Date().toISOString().slice(0, 10)) {
  const cards = loadCards(root);
  const dir = path.join(root, CARDS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const card = {
    title: opts.title, stage: opts.stage || 'explore',
    tags: (opts.tags || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    needs: (opts.needs || '').split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean),
    related: (opts.related || '').split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean),
    finish: opts.finish, roadmap: opts.roadmap, created: today, why: opts.why,
    priority: opts.priority, release: opts.release, report: opts.report,
    body: opts.body ?? 'Progress\nDone: nothing yet.\nNext: ' + (opts.next || 'plan it.') + '\nBlocked: ' +
      ((opts.needs || '').trim() ? 'waits on ' + opts.needs.split(',').map(n => '#' + n.trim().replace(/^#/, '')).join(', ') + '.' : 'nothing.') +
      '\n\nChats\n',
  };
  const probe = check([...cards, { ...card, id: 0, file: '(new)', errors: [] }]).filter(e => e.startsWith('(new)') && !e.includes('id 0'));
  if (!card.title) throw new Error('a card needs --title');
  if (!STAGES.includes(card.stage)) throw new Error(`--stage must be one of ${STAGES.join(', ')}`);
  if (probe.length) throw new Error(probe.join('\n'));
  // WHY 'wx' and a retry: two chats filing at the same moment must never get the same number
  for (let id = nextId(cards); ; id++) {
    card.id = id; card.branch = `${id}-${slug(card.title)}`;
    const file = path.join(dir, `${card.branch}.md`);
    if (fs.readdirSync(dir).some(f => f.startsWith(`${id}-`))) continue;
    try { fs.writeFileSync(file, renderCard(card), { flag: 'wx' }); return path.join(CARDS_DIR, `${card.branch}.md`); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
}

/** "<area>: <first words>" — how a card names the old roadmap entry it came from. */
export function roadmapRef(e) {
  return `${e.area}: ${e.firstLine.replace(/\s+/g, ' ').slice(0, 60).trim()}`;
}

// WHY this mapping (Destin's stages, 2026-10-14/15): "decision" and "parked" entries are ideas nobody has
// settled — exploration. Confirmed, blocked and needs-verify entries are known work ready to plan. In-flight
// entries have a branch: a chat is building them.
export const STAGE_FROM_STATUS = { 'in-flight': 'build', confirmed: 'planning', blocked: 'planning', 'needs-verify': 'planning', decision: 'explore', parked: 'explore' };

/** One card per open roadmap entry not yet imported. Returns the paths written. Re-running adds only new entries. */
export function importRoadmap(root, today = new Date().toISOString().slice(0, 10)) {
  const rm = loadRoadmap(root);
  if (!rm) return [];
  const have = new Set(loadCards(root).map(c => c.roadmap).filter(Boolean));
  const written = [];
  for (const e of rm.areas.flatMap(a => a.entries)) {
    const ref = roadmapRef(e);
    if (have.has(ref)) continue;
    const tags = [e.area, e.section, e.surface, ['all', 'n/a'].includes(e.seenOn) ? null : e.seenOn, ...(e.flags || [])]
      .filter(Boolean).map(t => String(t).toLowerCase());
    // WHY the first sentence, not the first line (2026-10-15): entries wrap mid-sentence, so the first line
    // cut titles off ("…so the fixes are"); bold marks and the "vX release blocker." lead-in are stripped
    // (the blocker becomes a tag, the release is kept in its own field).
    const plain = e.symptom.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    const blocker = /^v\d+(\.\d+)+ release blocker\.\s*/i.exec(plain);
    const rest = blocker ? plain.slice(blocker[0].length) : plain;
    const first = (rest.match(/^.*?[.!?](?=\s|$)/) || [rest])[0];
    let title = first.replace(/[.:]\s*$/, '').trim();
    if (title.length > 110) title = title.slice(0, 110).replace(/\s+\S*$/, '') + '…';
    if (blocker) tags.push('release-blocker');
    const blocked = e.status === 'blocked' ? 'yes — the old roadmap marked it blocked; see below.' : 'nothing recorded.';
    const body = `Progress\nDone: nothing recorded.\nNext: ${e.status === 'needs-verify' ? 'check it still happens.' : 'not decided.'}\nBlocked: ${blocked}\n\nChats\n\n` +
      `From the old roadmap (${e.area}${e.section ? ' › ' + e.section : ''}, status ${e.status}, seen on ${e.seenOn}, last checked ${e.checked})\n${e.symptom}\n`;
    const path_ = createCard(root, { title, stage: STAGE_FROM_STATUS[e.status] || 'explore',
      tags: tags.join(','), roadmap: ref, priority: e.priority, release: e.release, report: e.link, body }, today);
    written.push(path_); have.add(ref);
  }
  return written;
}

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    else o._.push(argv[i]);
  }
  return o;
}

function main() {
  const o = args(process.argv.slice(2));
  const root = o.root || execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const cmd = o._[0];
  if (cmd === 'index') { console.log(index(root)); return; }
  if (cmd === 'check') {
    const errs = check(loadCards(root));
    if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
    console.log(`cards: ${loadCards(root).length} ok`); return;
  }
  if (cmd === 'new') { console.log(createCard(root, o)); return; }
  if (cmd === 'import-roadmap') { const w = importRoadmap(root); console.log(`imported ${w.length} roadmap entr${w.length === 1 ? 'y' : 'ies'} as cards`); return; }
  console.error('usage: node scripts/cards.mjs index | check | new --title "<t>" [--stage explore|planning|build|polish|merged] [--related 4] [--tags a,b] [--needs 3,7] [--finish "…"] [--roadmap "<area>: …"] [--why "…"]');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
