// work-items-program.mjs — what the Work board page's program does, one request at a time.
//
// WHY (Destin, 2026-10-16: the management page becomes his own YouCoded page, using only abilities any page
// can use — "anything we build should be generalizable"): the page cannot read files or run git, so it runs
// this through the Pages `program` ability. One JSON request arrives on stdin; one JSON answer goes to
// stdout. The page's folder holds a two-line `work-items.mjs` that imports this file from the workspace
// (pages/work-board/), so the logic stays in the repo with its tests.
//
// Requests:
//   { op: 'page' }                                → { html }   the whole approved page, drawn from the items
//   { op: 'stage', ids, stage }                    → { ok, message }
//   { op: 'delete', ids } / { op: 'combine', ids, keep, title? }
//   { op: 'pause', id, reason }  (reason '' unpauses)
//   { op: 'pictures', names: ['thumbs/a.jpg', …] }  → { pictures: { name: dataUrl } }  (the page cannot load files)
// Every change saves straight to master once master carries the items (cards-master.mjs), else where it runs.
//
// Tests: node --test scripts/work-items-program.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setStage, deleteCards, combineCards, setPaused, STAGE_WORD } from './cards.mjs';
import { workspaceOf, masterHasCards, masterCopy, onMaster } from './cards-master.mjs';
import { buildPage, PAGE_DIR } from './manage.mjs';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// WHY a cap per answer: the app caps a program's output (2 MB); a picture batch stops short of it and the
// page asks again for the rest.
const PICTURE_BUDGET = 1_500_000;
const PICTURE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Where the items are read from: a fresh copy of master once master carries them, else `root`. */
function readRoot(root) {
  const ws = workspaceOf(root);
  if (!masterHasCards(ws)) return root;
  const dir = masterCopy(ws);
  execFileSync('git', ['-C', dir, 'fetch', '-q', 'origin', 'master']);
  execFileSync('git', ['-C', dir, 'reset', '-q', '--hard', 'origin/master']);
  return dir;
}

/** One change, saved: through master when it carries the items, else in `root` itself. */
function change(root, message, fn) {
  const ws = workspaceOf(root);
  if (masterHasCards(ws)) {
    const r = onMaster(ws, message, fn);
    return { result: r.result, saved: r.pushed ? 'Saved to master.' : 'Nothing changed.' };
  }
  return { result: fn(root), saved: 'Saved here (master does not carry the items yet).' };
}

const ids = (list) => (Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger);

/** Answer one request. Exported for the tests; `root` is any checkout inside the workspace. */
export function handle(root, req) {
  switch (req?.op) {
    case 'page':
      return { html: buildPage(readRoot(root), { pageMode: true }) };
    case 'stage': {
      const { result, saved } = change(root, `cards: ${ids(req.ids).map((i) => '#' + i).join(', ')} → ${STAGE_WORD[req.stage]} (Work board)`, (r) => setStage(r, ids(req.ids), req.stage));
      return { ok: true, result, saved, message: `Moved ${result.length} to ${STAGE_WORD[req.stage]}. ${saved}` };
    }
    case 'delete': {
      const { result, saved } = change(root, `cards: deleted ${ids(req.ids).map((i) => '#' + i).join(', ')} (Work board)`, (r) => deleteCards(r, ids(req.ids)));
      return { ok: true, result, saved, message: `Deleted ${result.length}. ${saved}` };
    }
    case 'combine': {
      const { result, saved } = change(root, `cards: combined ${ids(req.ids).map((i) => '#' + i).join(', ')} (Work board)`, (r) => combineCards(r, ids(req.ids), req.keep, req.title));
      return { ok: true, result, saved, message: `Combined into #${result.kept}. ${saved}` };
    }
    case 'pause': {
      const reason = typeof req.reason === 'string' ? req.reason.trim() : '';
      const { saved } = change(root, `cards: #${req.id} ${reason ? 'paused' : 'unpaused'} (Work board)`, (r) => setPaused(r, req.id, reason));
      return { ok: true, message: `${reason ? 'Paused' : 'Unpaused'} #${req.id}. ${saved}` };
    }
    case 'pictures': {
      const out = {}; let used = 0;
      for (const name of Array.isArray(req.names) ? req.names : []) {
        // WHY the containment check: only the page's own picture folders, never a path a page could aim elsewhere
        const file = path.resolve(PAGE_DIR, String(name));
        const type = PICTURE_TYPES[path.extname(file).toLowerCase()];
        if (!type || !(file.startsWith(path.join(PAGE_DIR, 'thumbs') + path.sep) || file.startsWith(path.join(PAGE_DIR, 'shots') + path.sep))) continue;
        if (!fs.existsSync(file)) continue;
        const data = fs.readFileSync(file).toString('base64');
        if (used + data.length > PICTURE_BUDGET && used > 0) break;
        used += data.length;
        out[name] = `data:${type};base64,${data}`;
      }
      return { pictures: out };
    }
    default:
      throw new Error(`The Work board asked for something this program does not know: ${String(req?.op)}`);
  }
}

/** Read one request from stdin, answer on stdout. An error is an answer too: { error }, exit code 1. */
export async function main(root = path.join(HERE, '..')) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    process.stdout.write(JSON.stringify(handle(root, raw.trim() ? JSON.parse(raw) : {})));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String(e?.message || e) }));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
