#!/usr/bin/env node
// manage.mjs — the live management page: every work card, and the tick-box bulk edits, saved without a chat.
//
// WHY (Destin, 2026-10-15/16): "build the real page" — the approved mockup
// (docs/active/design/2026-10-12-management-surface/) read a hand-made Oct 12 snapshot; this reads cards/.
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
import { loadCards, neededBy, setStage, deleteCards, combineCards, STAGES, STAGE_WORD } from './cards.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

export function cardsPayload(root) {
  const cards = loadCards(root);
  const nb = neededBy(cards);
  return {
    stages: STAGES.map(s => ({ id: s, word: STAGE_WORD[s] })),
    cards: cards.map(c => ({ id: c.id, title: c.title, stage: c.stage, priority: c.priority || '', tags: c.tags, needs: c.needs.map(Number),
      related: c.related.map(Number), neededBy: nb.get(String(c.id)) || [], release: c.release || '', created: c.created || '',
      branch: c.branch || '', finish: c.finish || '', report: c.report || '', why: c.why || '', body: c.body || '', file: c.file })),
  };
}

function readBody(req) {
  return new Promise((res, rej) => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { rej(e); } }); });
}

export function makeServer(root, { useGit = true } = {}) {
  const page = () => fs.readFileSync(path.join(HERE, 'manage', 'page.html'), 'utf8')
    .replace('/*CC*/', fs.readFileSync(path.join(HERE, 'manage', 'cc.css'), 'utf8') + fs.readFileSync(path.join(HERE, 'manage', 'page.css'), 'utf8'));
  return http.createServer(async (req, res) => {
    const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    try {
      // WHY only 127.0.0.1 and same-origin posts: this server writes files; nothing else on the network or in another tab may drive it
      const origin = req.headers.origin;
      if (req.method === 'POST' && origin && origin !== `http://${req.headers.host}`) return send(403, { error: 'Refused: request came from another page.' });
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) return send(200, page(), 'text/html; charset=utf-8');
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
