// release-view.mjs — "Since the last release" on the Work board, worked out fresh every time the page is drawn.
//
// WHY (Destin, 2026-11-11: the board "is pointing to 1.3.0, which is janky… I just want to be able to quickly
// see what we'd be releasing if we launched a release today, and how it would change things for users"): the
// section used to be a hand-typed v1.3.0 list. Nothing here is typed in: the last official release is the highest
// `vX.Y.Z` tag of the app repo that master contains, and the list is every change merged to master after it.
//
// Where each fact comes from:
//   last release + date   the app repo's git tags (betas such as 1.4.0-beta.30 and tags without a `v` are ignored)
//   changes since         `git log --first-parent <tag>..master`: one entry per merged pull request (or direct commit)
//   wording               the pull request's title (git keeps it as the merge commit's second line); when exactly one
//                         finished work item is linked, its own plain-language summary rides underneath as `detail`.
//                         The changelog's "Unreleased" bullets, when someone has written them, are listed too.
//   links                 a change links to a work item when the item lists the change's branch under `work`, or
//                         its branch name, or the title says "card #N"
//   freshness             GitHub is asked first (a tiny, safe fetch into a cache folder; the shared checkout is never
//                         touched). If GitHub cannot be reached the page says it is using the last copy and when that was.
//
// Tests: node --test scripts/release-view.test.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim();

/** `v1.3.3` → [1,3,3]; anything else (betas, no `v`) → null. */
export function parseOfficialTag(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const newerFirst = (a, b) => { const x = parseOfficialTag(a), y = parseOfficialTag(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; };

/** The newest official tag that `ref` contains, or null. */
export function lastRelease(dir, ref) {
  const tags = git(dir, ['tag', '--list', 'v*']).split('\n').filter((t) => parseOfficialTag(t)).sort(newerFirst);
  for (const t of tags) {
    try { git(dir, ['merge-base', '--is-ancestor', t, ref]); return t; } catch { /* not in master: skip it */ }
  }
  return null;
}

// ---- sorting a change into a group, from its words ----
const BEHIND = /^(chore|docs?|tests?|build|ci|refactor)(\(.*?\))?[:!]|\bdeps?\b|dependabot|readme|\bdocs?\b|^tests?\b|\btests?\b.*\b(failed|failures?)\b|\bfailures?\b.*\btests?\b|privacy policy|site footer|\bsite\b|announcement|musl|tidy-ups|\blicen[sc]e\b|screenshots/i;
const FIXES = /^fix(es)?\b|\bfix(es|ed)?\b|no longer|stuck|never fail|repairs?\b|freeze|hang|reliabl|instead of refusing|lost\b/i;
export const GROUPS = [
  ['new', 'New and improved', 'Things people will see or feel when they use the app.'],
  ['fixes', 'Fixes', 'Problems that no longer happen.'],
  ['behind', 'Behind the scenes', 'Tests, docs, website and safety checks. Nothing to see in the app.'],
];
export function groupOf(text, branch = '') {
  if (/^dependabot\//.test(branch) || BEHIND.test(text)) return 'behind';
  if (FIXES.test(text)) return 'fixes';
  return 'new';
}

/** "fix(background): commands no longer stay Running (card #40)" → "Commands no longer stay Running". */
export function cleanTitle(t) {
  let s = String(t).replace(/^\w+(\([^)]*\))?!?:\s*/, '').replace(/\s*\((card |item )?#\d+\)\s*$/i, '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : String(t);
}
function shorten(s, n = 150) {
  s = String(s).replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > n * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…');
}

/** The bullets under "## [Unreleased]" in a CHANGELOG, flattened. Empty when nobody wrote any. */
export function unreleasedBullets(text) {
  const t = String(text || '');
  const at = t.search(/^## \[Unreleased\]/m);
  if (at < 0) return [];
  const rest = t.slice(at).split('\n').slice(1).join('\n');
  const next = rest.search(/^## \[/m);
  return (next < 0 ? rest : rest.slice(0, next)).split('\n').filter((l) => /^\s*[-*] \S/.test(l)).map((l) => l.replace(/^\s*[-*] /, '').trim());
}

/** Cards a change belongs to: by branch, by the card's own branch name, or "card #N" in the title. */
function linkedCards(cards, branch, title) {
  const named = new Set([...String(title).matchAll(/(?:card|item) #(\d+)/gi)].map((m) => Number(m[1])));
  return cards.filter((c) => (branch && ((c.work || []).includes(branch) || (c.branch && branch === `session/${c.branch}`))) || named.has(Number(c.id)));
}

/** A change's entry: words, group, and the work items it links to. */
export function describeChange({ subject, body = '', date = '', sha = '' }, cards) {
  const pr = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(subject);
  const branch = pr ? pr[2] : '';
  // WHY the body's first line: GitHub writes the pull request's title there
  const raw = pr ? (body.split('\n').find((l) => l.trim()) || branch) : subject;
  const links = linkedCards(cards, branch, raw);
  const done = links.filter((c) => c.stage === 'merged' && c.summary);
  // WHY the title leads and the summary only follows (checked against the 30 real changes on 2026-11-11): item summaries
  // are written as the problem ("Some spots still read whole files…, needed before 1.3.1"), which read as stale or as
  // the wrong thing when shown as "what changed". WHY only one item: a batch pull request that touched five items
  // would otherwise be described as just one of them.
  const text = cleanTitle(raw);
  const detail = links.length === 1 && done.length === 1 ? shorten(done[0].summary) : '';
  return { sha: sha.slice(0, 9), date, pr: pr ? Number(pr[1]) : null, branch, text, detail, group: groupOf(raw, branch),
    items: links.map((c) => ({ id: Number(c.id), title: c.title })) };
}

/**
 * The whole section, as plain data. `dir` is the app repo's folder. Never throws: when the answer cannot be read it
 * returns { ok: false, reason } and the page says so instead of showing old numbers.
 * { fetch:false } skips asking GitHub (tests). { cache } is the folder for the small fresh copy.
 */
export function releaseFacts(dir, cards = [], { fetch = true, cache = path.join(os.homedir(), '.cache', 'youcoded-work-board'), now = Date.now() } = {}) {
  if (!dir || !fs.existsSync(path.join(dir, '.git'))) {
    return { ok: false, reason: "The app's folder (youcoded/) is not on this computer, so the changes since the last release cannot be read." };
  }
  let repo = dir, ref = 'origin/master', fresh = false, asOf = 0;
  try {
    git(dir, ['rev-parse', '--verify', '-q', 'origin/master']);
    const fh = path.join(git(dir, ['rev-parse', '--absolute-git-dir']), 'FETCH_HEAD');
    try { asOf = fs.statSync(fh).mtimeMs; } catch { asOf = 0; }
  } catch { return { ok: false, reason: "The app's folder has no copy of master (origin/master), so the changes since the last release cannot be read." }; }
  if (fetch) {
    // WHY a bare cache that borrows the shared checkout's objects: GitHub's newest master and tags land here, tiny and
    // fast, and the shared checkout (never to be fetched into by this page) is only read.
    try {
      const url = git(dir, ['remote', 'get-url', 'origin']);
      const bare = path.join(cache, 'app-refs.git');
      if (!fs.existsSync(path.join(bare, 'HEAD'))) { fs.mkdirSync(bare, { recursive: true }); git(bare, ['init', '-q', '--bare']); }
      const objects = path.join(git(dir, ['rev-parse', '--absolute-git-dir']), 'objects');
      fs.writeFileSync(path.join(bare, 'objects', 'info', 'alternates'), objects + '\n');
      git(bare, ['fetch', '-q', '--no-tags', '--filter=blob:none', url, '+refs/heads/master:refs/heads/master', '+refs/tags/v*:refs/tags/v*']);
      repo = bare; ref = 'master'; fresh = true; asOf = now;
    } catch { /* offline or no remote: fall back to the shared checkout's last copy, and say so */ }
  }
  const tag = lastRelease(repo, ref);
  if (!tag) return { ok: false, reason: 'No official release (a tag like v1.3.3) is on master in the app folder, so there is nothing to compare against.' };
  const date = git(repo, ['log', '-1', '--format=%cs', tag]);
  const SEP = '\u001f', END = '\u001e';
  const raw = git(repo, ['log', '--first-parent', `--format=%H${SEP}%cs${SEP}%s${SEP}%b${END}`, `${tag}..${ref}`]);
  const changes = raw.split(END).map((r) => r.replace(/^\n/, '')).filter(Boolean).map((r) => {
    const [sha, d, subject, body] = r.split(SEP);
    return describeChange({ sha, date: d, subject, body: body || '' }, cards);
  });
  let files = 0;
  try { files = git(repo, ['diff', '--name-only', `${tag}..${ref}`]).split('\n').filter(Boolean).length; } catch { /* count is optional */ }
  let written = [];
  try { written = unreleasedBullets(git(repo, ['show', `${ref}:CHANGELOG.md`])); } catch { /* no changelog */ }
  const groups = GROUPS.map(([key, title, hint]) => ({ key, title, hint, changes: changes.filter((c) => c.group === key) })).filter((g) => g.changes.length);
  return { ok: true, version: tag, date, count: changes.length, files, written, groups, fresh, asOf: asOf ? new Date(asOf).toISOString() : '' };
}
