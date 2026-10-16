#!/usr/bin/env node
// manage.mjs — the live management page: every work card, and the tick-box bulk edits, saved without a chat.
//
// WHY (Destin, 2026-10-15/16): "build the real page" — the approved management page
// (docs/active/design/2026-10-12-management-surface/, all three tabs) with Today read from cards/.
// Bulk edit is in v1 by his call ("you should build the bulk edit into v1"): tick items, then Combine,
// Move to stage or Delete. Edits go through cards.mjs (all-or-nothing, rules checked), then are committed
// and pushed so nothing lives only on this computer.
//
// Usage:
//   node scripts/manage.mjs [--root <dir>] [--port 0] [--no-git]
//     --root    the checkout whose cards/ to show and edit; defaults to the git checkout you are IN
//     --no-git  edit files only; no pull, commit or push (tests, trying it out)
//   Prints "[manage] http://127.0.0.1:<port>/" — open that. Stops with Ctrl+C.
//
// API (JSON): GET /api/cards · POST /api/stage {ids, stage} · POST /api/delete {ids}
//             POST /api/combine {ids, keep, title?}
// Tests: node --test scripts/manage.test.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { loadCards, neededBy, setStage, deleteCards, combineCards, STAGES, STAGE_WORD } from './cards.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// WHY the design folder (Destin, 2026-10-16: "what happened to the real full page with all of our earlier design
// work?"): the live page IS the approved management page — Today, Screens, Big picture — built by its own
// build.py, with Today drawn from cards/. Its pictures (thumbs/, shots/) are served from the same folder.
export const PAGE_DIR = path.join(HERE, '..', 'docs', 'active', 'design', '2026-10-12-management-surface');
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.webp': 'image/webp' };

/** Build the full page from the cards. Cached until a card file changes. */
let cache = { key: '', html: '' };
export function buildPage(root) {
  const dir = path.join(root, 'cards');
  const key = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => f + fs.statSync(path.join(dir, f)).mtimeMs).join('|') : '';
  if (key === cache.key && cache.html) return cache.html;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manage-page-'));
  try {
    fs.writeFileSync(path.join(tmp, 'cards.json'), JSON.stringify(cardsPayload(root)));
    execFileSync('python3', [path.join(PAGE_DIR, 'build.py'), '--cards-json', path.join(tmp, 'cards.json'), '--out', path.join(tmp, 'page.html')], { cwd: PAGE_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    cache = { key, html: fs.readFileSync(path.join(tmp, 'page.html'), 'utf8') };
    return cache.html;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

/** Pull first, so an edit never lands on top of a stale list. Quiet when there is nothing to pull from. */
function pull(root) {
  try { git(root, ['rev-parse', '--abbrev-ref', '@{u}']); } catch { return 'no upstream'; }
  try { git(root, ['pull', '--ff-only', '-q']); return 'pulled'; } catch (e) { return 'pull failed: ' + String(e.stderr || e.message).split('\n')[0]; }
}

/** Commit only cards/ and push. Returns a plain sentence for the page. */
function save(root, message) {
  try {
    git(root, ['add', '--', 'cards']);
    if (!git(root, ['status', '--porcelain', '--', 'cards'])) return 'Nothing changed on disk.';
    git(root, ['commit', '-q', '-m', message, '--', 'cards']);
  } catch (e) { return 'Saved to the files, but the commit failed: ' + String(e.stderr || e.message).split('\n')[0]; }
  try { git(root, ['rev-parse', '--abbrev-ref', '@{u}']); } catch { return 'Saved and committed (no upstream to push to).'; }
  try { git(root, ['push', '-q']); return 'Saved and backed up.'; }
  catch (e) { return 'Saved and committed, but the push failed: ' + String(e.stderr || e.message).split('\n')[0]; }
}

/** The last day each card file was committed, from one `git log` (empty when root is not a git checkout). */
function lastTouched(root) {
  const out = new Map();
  try {
    let day = '';
    for (const line of git(root, ['log', '--format=@%cs', '--name-only', '--', 'cards']).split('\n')) {
      if (line.startsWith('@')) day = line.slice(1);
      else if (line && !out.has(line)) out.set(line, day);
    }
  } catch { /* not a checkout: rows fall back to the card's created date */ }
  return out;
}

// ---------- live facts from each item's own branches ----------
// WHY (Destin, 2026-10-16: "still missing the colored status chips we decided on"): the approved Today shows
// Checks failing, Not backed up and Working markers and a next-step button. Nothing is typed in by hand: they
// are worked out here from the branches a card lists under `work`, in both the workspace and the app repo.
const LIVE_TTL = 60_000;
let liveCache = { at: 0, root: '', facts: null };

function sh(cmd, args, cwd) {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 }).trim(); } catch { return ''; }
}

/** The main workspace folder (where youcoded/ lives), even when root is a session worktree. */
function workspaceOf(root) {
  const common = sh('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], root);
  return common ? path.dirname(common) : root;
}

export function liveFacts(root, { now = Date.now(), useGh = true } = {}) {
  if (liveCache.facts && liveCache.root === root && now - liveCache.at < LIVE_TTL) return liveCache.facts;
  const ws = workspaceOf(root);
  const repos = [{ name: 'youcoded-dev', dir: ws }, { name: 'youcoded', dir: path.join(ws, 'youcoded') }].filter(r => fs.existsSync(path.join(r.dir, '.git')));
  const branches = new Map();   // "session/x" → { date, subject, repo }
  for (const r of repos) {
    for (const line of sh('git', ['-C', r.dir, 'for-each-ref', '--format=%(committerdate:iso-strict)\t%(refname:lstrip=3)\t%(contents:subject)', 'refs/remotes/origin'], r.dir).split('\n')) {
      const [date, name, subject] = line.split('\t');
      if (!name || name === 'HEAD') continue;
      const prev = branches.get(name);
      // WHY every repo is kept (Destin, 2026-10-16: "can the git tag include the parent repo?"): one piece of work
      // often has a branch of the same name in both the app and the workspace
      const repos_ = [...new Set([...(prev?.repos || []), r.name])];
      if (!prev || prev.date < date) branches.set(name, { date, subject, repo: r.name, repos: repos_ });
      else prev.repos = repos_;
    }
  }
  // a copy of the work on this computer with changes not committed, or committed but not pushed
  const unsaved = new Set();
  const worktrees = new Map();   // branch → the folder on this computer that has it checked out
  for (const r of repos) {
    let wt = null;
    for (const line of sh('git', ['-C', r.dir, 'worktree', 'list', '--porcelain'], r.dir).split('\n')) {
      if (line.startsWith('worktree ')) wt = line.slice(9);
      else if (line.startsWith('branch refs/heads/') && wt) {
        const b = line.slice(18);
        if (!worktrees.has(b)) worktrees.set(b, path.relative(ws, wt) || '.');
        const dirty = sh('git', ['-C', wt, 'status', '--porcelain', '--untracked-files=no'], wt);
        const ahead = sh('git', ['-C', wt, 'rev-list', '--count', '@{u}..HEAD'], wt);
        if (dirty || (ahead && ahead !== '0')) unsaved.add(b);
      }
    }
  }
  const prs = new Map();   // branch → { repo, number, failing, approved }
  if (useGh) for (const repo of ['youcoded-dev', 'youcoded']) {
    const out = sh('gh', ['pr', 'list', '-R', `itsdestin/${repo}`, '--state', 'open', '--limit', '100', '--json', 'number,headRefName,statusCheckRollup,reviewDecision'], ws);
    let list = []; try { list = JSON.parse(out || '[]'); } catch { /* gh missing or offline: no pull-request facts */ }
    for (const p of list) {
      const states = (p.statusCheckRollup || []).map(c => c.conclusion || c.state);
      const failing = states.some(s => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(s));
      const passing = states.length > 0 && !failing && states.every(s => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(s));
      const arr = prs.get(p.headRefName) || [];
      arr.push({ repo, number: p.number, failing, passing, approved: p.reviewDecision === 'APPROVED' });
      prs.set(p.headRefName, arr);
    }
  }
  liveCache = { at: now, root, facts: { branches, unsaved, prs, worktrees, now } };
  return liveCache.facts;
}

/** The live facts for one card, from the branches it lists under `work`. */
export function factsFor(card, f) {
  const chats = []; const pulls = []; let unsaved = false; let working = false;
  for (const b of card.work || []) {
    const br = f.branches.get(b);
    const live = br ? f.now - Date.parse(br.date) < 24 * 3600_000 : false;
    working ||= live;
    if (br) chats.push({ date: br.date.slice(0, 10), name: b, result: br.subject || '', live });
    if (f.unsaved.has(b)) unsaved = true;
    for (const p of f.prs.get(b) || []) pulls.push(p);
  }
  chats.sort((a, b) => (a.date < b.date ? 1 : -1));
  // WHY (Destin, 2026-10-16: "a tag on each card that has its git worktree/branch, kinda similar to the one in
  // the youcoded status bar"): every branch that is this item's work, newest first, with its folder when a copy
  // is open on this computer
  const branchList = (card.work || []).filter(b => f.branches.has(b) || (f.worktrees || new Map()).has(b))
    .map(b => ({ name: b, repos: f.branches.get(b)?.repos || [], date: f.branches.get(b)?.date || '', worktree: (f.worktrees || new Map()).get(b) || '' }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return {
    branches: branchList,
    chats, unsaved, working, prs: pulls.map(p => `${p.repo === 'youcoded' ? '' : 'workspace '}#${p.number}`),
    failing: pulls.some(p => p.failing), mergeable: pulls.length > 0 && pulls.every(p => p.passing && p.approved),
    lastWork: chats[0]?.date || '',
  };
}

export function cardsPayload(root, { live = true } = {}) {
  const cards = loadCards(root);
  const nb = neededBy(cards);
  // WHY (approved Today: one date per row, at the far right): a card's last commit is when it was last worked on
  const touched = lastTouched(root);
  const f = live ? liveFacts(root) : null;
  return {
    stages: STAGES.map(s => ({ id: s, word: STAGE_WORD[s] })),
    cards: cards.map(c => {
      const live_ = f ? factsFor(c, f) : { chats: [], unsaved: false, working: false, prs: [], failing: false, mergeable: false, lastWork: '' };
      return { id: c.id, title: c.title, stage: c.stage, priority: c.priority || '', summary: c.summary || '', area: c.area || '', side: c.side || '',
        platform: c.platform || '', paused: c.paused || '', tags: c.tags, needs: c.needs.map(Number), related: c.related.map(Number), work: c.work,
        neededBy: nb.get(String(c.id)) || [], release: c.release || '', created: c.created || '', branch: c.branch || '', finish: c.finish || '',
        // WHY the later of the two: work on its branches is when it was last worked on; the card's own edit counts too
        updated: [touched.get(c.file) || '', live_.lastWork].sort().pop(), report: c.report || '', why: c.why || '', body: c.body || '', file: c.file, live: live_ };
    }),
  };
}

function readBody(req) {
  return new Promise((res, rej) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { rej(e); } }); });
}

export function makeServer(root, { useGit = true } = {}) {
  return http.createServer(async (req, res) => {
    const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    try {
      // WHY only 127.0.0.1 and same-origin posts: this server writes files; nothing else on the network or in another tab may drive it
      const origin = req.headers.origin;
      if (req.method === 'POST' && origin && origin !== `http://${req.headers.host}`) return send(403, { error: 'Refused: request came from another page.' });
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { if (useGit) pull(root); return send(200, buildPage(root), 'text/html; charset=utf-8'); }
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        // WHY the containment check: only files inside the page's own folder are served, never ../ outside it
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(PAGE_DIR, rel);
        if (!file.startsWith(path.resolve(PAGE_DIR) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, { error: 'Not found.' });
        res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'max-age=3600' });
        return fs.createReadStream(file).pipe(res);
      }
      if (req.method === 'GET' && req.url === '/api/cards') { if (useGit) pull(root); return send(200, cardsPayload(root)); }
      if (req.method !== 'POST') return send(404, { error: 'Not found.' });
      const body = await readBody(req);
      if (useGit) pull(root);
      let result, msg;
      if (req.url === '/api/stage') { result = setStage(root, body.ids, body.stage); msg = `cards: moved ${result.map(i => '#' + i).join(', ')} to ${STAGE_WORD[body.stage]} (management page)`; }
      else if (req.url === '/api/delete') { result = deleteCards(root, body.ids); msg = `cards: deleted ${result.map(i => '#' + i).join(', ')} (management page)`; }
      else if (req.url === '/api/combine') { result = combineCards(root, body.ids, body.keep, body.title); msg = `cards: combined ${result.merged.map(i => '#' + i).join(', ')} into #${result.kept} (management page)`; }
      else return send(404, { error: 'Not found.' });
      const saved = useGit ? save(root, msg + '\n\nCo-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>') : 'Saved to the files.';
      return send(200, { ok: true, result, saved, ...cardsPayload(root) });
    } catch (e) {
      // WHY the rule text as-is: check() already words each refusal for a person ("…consolidate them into one card")
      return send(400, { error: String(e.message || e) });
    }
  });
}

function main() {
  const argv = process.argv.slice(2);
  const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = opt('--root') || execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const srv = makeServer(root, { useGit: !argv.includes('--no-git') });
  srv.listen(Number(opt('--port') || 0), '127.0.0.1', () => console.log(`[manage] http://127.0.0.1:${srv.address().port}/`));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
