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
//   { op: 'page', cached: true }                  → { html, at } the last page drawn on this computer, at once (or {})
//     either with gzip: true                      → { gz, at? }  the same page gzipped, base64 (the shell unpacks it)
//   { op: 'stage', ids, stage }                    → { ok, message }
//   { op: 'delete', ids } / { op: 'combine', ids, keep, title? }
//   { op: 'pause', id, reason }  (reason '' unpauses)
//   { op: 'pictures', names: ['thumbs/a.jpg', …] }  → { pictures: { name: dataUrl } }  (the page cannot load files)
// Every change saves straight to master once master carries the items (cards-master.mjs), else where it runs.
//
// Tests: node --test scripts/work-items-program.test.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setStage, deleteCards, combineCards, setPaused, loadCards, STAGE_WORD } from './cards.mjs';
import { workspaceOf, masterHasCards, masterCopy, onMaster } from './cards-master.mjs';
import { buildPage, PAGE_DIR, prefetch, prefetched, LIVE_GH_CALLS } from './manage.mjs';
import { execFileSync } from 'node:child_process';
import { scan } from './prune-worktrees.mjs';

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
  // WHY clear an old index.lock: the app stops a page's program the moment the page closes, and leaving the board
  // mid-reset left git's lock behind, failing every later open. Only this program and cards-master use this copy,
  // and none of their git steps takes a minute, so a lock that old is a leftover.
  try {
    const lock = path.join(execFileSync('git', ['-C', dir, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim(), 'index.lock');
    if (Date.now() - fs.statSync(lock).mtimeMs > 60_000) fs.rmSync(lock, { force: true });
  } catch { /* no lock: the usual case */ }
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

const DAY = 24 * 3600_000;
function quiet(cmd, args, cwd) {
  const pre = prefetched(cmd, args);
  if (pre !== undefined) return pre;
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 }).trim(); } catch { return ''; }
}

/**
 * Tidy up, live (plan deck Q-10): automatic dependency updates whose checks fail, and copies of work on this
 * computer idle 2+ weeks that are unmerged or unsaved and belong to no item. Read-only: the scan never removes
 * anything (sweep() does, and is not used here). WHY "belong to no item": a copy on an item's branch already
 * shows on that item's row as "Not backed up".
 */
const TIDY_GH_CALLS = ['youcoded', 'youcoded-dev'].map((repo) => ['gh', ['pr', 'list', '-R', `itsdestin/${repo}`, '--author', 'app/dependabot', '--state', 'open', '--limit', '50', '--json', 'number,title,statusCheckRollup']]);

// WHY a cache folder on this computer only (2026-10-23, Destin: the board "takes wayyyy too long"): opening the
// board drew everything from scratch, ~13s. The last page drawn is kept here so the next open shows it at once
// while a fresh one is drawn; the copies scan (below) is kept an hour. Not the Pages folder: that one syncs to
// his other devices, and these facts are about this computer.
// Read on each use, so the tests can point it at a throwaway folder
const cacheDir = () => process.env.WORK_BOARD_CACHE || path.join(os.homedir(), '.cache', 'youcoded-work-board');
const SCAN_TTL = 3600_000;

/** The copies scan, reused for an hour. WHY it may be: Tidy up lists copies idle two weeks or more, so an hour
 *  late changes nothing it shows; the scan itself reads ~80 copies and costs ~6s. */
function scanCached(ws, inventory, now) {
  const file = path.join(cacheDir(), 'copies-scan.json');
  try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.ws === ws && now - c.at < SCAN_TTL) return c.report; } catch { /* none yet */ }
  let report = { notSafe: [] };
  try { report = scan({ root: ws, inventory, fetch: false, skipProcessCheck: false }); } catch { return report; /* no worktrees to scan */ }
  const keep = { notSafe: report.notSafe };
  try { fs.mkdirSync(cacheDir(), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ ws, at: now, report: keep })); } catch { /* still answers, just not cached */ }
  return keep;
}

const lockFile = () => path.join(cacheDir(), 'drawing.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** Take the drawing lock. Resolves true if another drawing held it (and has now finished), false if none did.
 *  A lock whose process is gone (the app stops a page's program when the page closes) is taken over. */
async function drawLock() {
  fs.mkdirSync(cacheDir(), { recursive: true });
  let waited = false;
  for (const until = Date.now() + 90_000; Date.now() < until;) {
    try { fs.writeFileSync(lockFile(), String(process.pid), { flag: 'wx' }); return waited; } catch { /* held */ }
    let pid = 0;
    try { pid = Number(fs.readFileSync(lockFile(), 'utf8').trim()); } catch { continue; /* just released */ }
    if (!pid || !alive(pid)) { fs.rmSync(lockFile(), { force: true }); continue; }
    waited = true;
    await new Promise((r) => setTimeout(r, 250));
  }
  fs.rmSync(lockFile(), { force: true });
  fs.writeFileSync(lockFile(), String(process.pid));
  return waited;
}

export function tidyFacts(root, cards, { now = Date.now(), useGh = true, cacheScan = false } = {}) {
  const ws = workspaceOf(root);
  const deps = [];
  if (useGh) for (const [repo, [cmd, args]] of [['youcoded', TIDY_GH_CALLS[0]], ['youcoded-dev', TIDY_GH_CALLS[1]]]) {
    let list = [];
    try { list = JSON.parse(quiet(cmd, args, ws) || '[]'); } catch { /* offline */ }
    for (const p of list) {
      const failing = (p.statusCheckRollup || []).some((c) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(c.conclusion || c.state));
      deps.push({ repo, number: p.number, title: p.title, failing });
    }
  }
  const linked = new Set(cards.flatMap((c) => c.work || []));
  const inventory = JSON.parse(fs.readFileSync(path.join(HERE, 'workspace-repos.json'), 'utf8'));
  let report = { notSafe: [] };
  if (cacheScan) report = scanCached(ws, inventory, now);
  else try { report = scan({ root: ws, inventory, fetch: false, skipProcessCheck: false }); } catch { /* no worktrees to scan */ }
  const live = new Set(['in-use', 'current-session', 'excluded']);
  const idle = [];
  for (const g of report.notSafe) {
    if (g.reasons.some((r) => live.has(r)) || !g.lastActive || now - g.lastActive < 14 * DAY) continue;
    if (g.entries.some((e) => e.branch && linked.has(e.branch))) continue;
    // WHY "only notes": every changed or unmerged file of the workspace copy is under docs/, and no app copy is inside
    const wsEntry = g.entries.find((e) => e.repo === 'workspace');
    let notesOnly = false;
    if (wsEntry && g.entries.length === 1) {
      const base = quiet('git', ['-C', wsEntry.path, 'merge-base', 'HEAD', 'origin/master']);
      const files = [...quiet('git', ['-C', wsEntry.path, 'diff', '--name-only', base || 'HEAD']).split('\n'),
        ...quiet('git', ['-C', wsEntry.path, 'status', '--porcelain']).split('\n').map((l) => l.slice(3))].filter(Boolean);
      notesOnly = files.length > 0 && files.every((f) => f.startsWith('docs/'));
    }
    idle.push({ name: path.relative(ws, g.dir), reasons: g.reasons, last: new Date(g.lastActive).toISOString().slice(0, 10), notesOnly });
  }
  return { deps, idle };
}

const ids = (list) => (Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger);

/** Answer one request. Exported for the tests; `root` is any checkout inside the workspace. */
export function handle(root, req) {
  switch (req?.op) {
    case 'page': {
      const pack = (html, extra = {}) => (req.gzip ? { gz: zlib.gzipSync(html).toString('base64'), ...extra } : { html, ...extra });
      const file = path.join(cacheDir(), 'page.html');
      if (req.cached) {
        // The last page drawn, or nothing: the shell then waits for a fresh one, with its spinner
        try { return pack(fs.readFileSync(file, 'utf8'), { at: fs.statSync(file).mtimeMs }); } catch { return {}; }
      }
      return (async () => {
        // WHY one drawing at a time: two at once both reset the master copy and one fails on git's index.lock
        // (seen 2026-10-23 opening the board twice quickly). A second request waits and answers with the first's page.
        const waited = await drawLock();
        if (waited) { try { const html = fs.readFileSync(file, 'utf8'); fs.rmSync(lockFile(), { force: true }); return pack(html); } catch { /* the first failed: draw here */ } }
        try {
          // WHY start GitHub first: its six answers arrive while the git work below runs, not after it
          const asked = prefetch([...LIVE_GH_CALLS, ...TIDY_GH_CALLS], workspaceOf(root));
          const r = readRoot(root);
          await asked;
          const html = buildPage(r, { pageMode: true, tidy: tidyFacts(root, loadCards(r), { cacheScan: true }) });
          try { fs.writeFileSync(file + '.tmp', html); fs.renameSync(file + '.tmp', file); } catch { /* next open just waits */ }
          return pack(html);
        } finally { fs.rmSync(lockFile(), { force: true }); }
      })();
    }
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
    process.stdout.write(JSON.stringify(await handle(root, raw.trim() ? JSON.parse(raw) : {})));
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String(e?.message || e) }));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
