// Guards on the drawn Work board page. Run: node --test scripts/work-board-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPage } from './manage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(HERE, '..');
const release = { ok: false, reason: 'test' };

test('inside YouCoded every button that says "Not built yet" in a browser has a real job', () => {
  // WHY (2026-11-11): each chat's "Resume chat" button in an item's chat list had no handler, so inside the app it only showed "Not built yet"
  const page = buildPage(root, { pageMode: true, tidy: { deps: [], idle: [] }, release });
  const labels = new Set();
  for (const m of page.matchAll(/<button[^>]*\bdata-does\b[^>]*>([^<]+)<\/button>/g)) if (!/data-tidy-prompt/.test(m[0])) labels.add(m[1].trim());
  for (const m of page.matchAll(/<button class="mitem"[^>]*role="menuitem"[^>]*data-does[^>]*><span>([^<]+)<\/span>/g)) labels.add(m[1].trim());
  const acts = new Set([...fs.readFileSync(path.join(HERE, '..', 'pages', 'work-board', 'renderer', 'page_mode.py'), 'utf8').matchAll(/^\s*'([^']+)':\s*(?:async\s*)?(?:\(|id=>)/gm)].map((m) => m[1]));
  assert.ok(labels.size > 3, 'found the buttons');
  // The buttons below are placeholders on purpose until Destin decides what they do (proposals in the 2026-11-11 cleanup deck); any NEW dead button fails.
  const PLACEHOLDERS = new Set(['What changed last time', 'Leave a note', "That's wrong"]);
  const free = new Set([...fs.readFileSync(path.join(HERE, '..', 'pages', 'work-board', 'renderer', 'page_mode.py'), 'utf8').matchAll(/^\s*'([^']+)':\(\)=>/gm)].map((m) => m[1]));
  const dead = [...labels].filter((l) => !acts.has(l) && !free.has(l) && !PLACEHOLDERS.has(l) && !l.includes('${'));
  assert.deepEqual(dead, [], `no handler inside YouCoded for: ${dead.join(', ')}`);
});

test('no stale typed-in dates remain in the board', () => {
  const dir = path.join(root, 'pages', 'work-board', 'renderer');
  const vision = fs.readFileSync(path.join(dir, 'vision_tab.py'), 'utf8');
  assert.ok(!/>=\s*'2026-\d\d-\d\d'/.test(vision), 'a typed cutoff date is back in Big picture');
  assert.ok(!/'Facts as of Oct 12'|>Facts as of Oct 12</.test(fs.readFileSync(path.join(dir, 'build.py'), 'utf8')));
  assert.ok(!/BUGS\s*=/.test(fs.readFileSync(path.join(dir, 'build.py'), 'utf8')));
});

test('the board starts itself up when put into an already-loaded page, as YouCoded does', () => {
  // WHY (Destin, 2026-11-11: "still visual issues on the board, like this spacing"): the app's shell (pages/work-board/page.html)
  // announces DOMContentLoaded on `document`, which never reaches a listener on `window`. The board listened on `window`, so inside
  // the app its setup never ran: the search row stayed in the scrolling body, flush against the first card. Measured in a copy of
  // the shell: gap 0px before, 28px after.
  const page = buildPage(root, { pageMode: true, tidy: { deps: [], idle: [] }, release });
  const bare = [...page.matchAll(/(^|[^.\w])addEventListener\('DOMContentLoaded'/gm)];
  assert.equal(bare.length, 0, 'a window-level DOMContentLoaded listener is back: it never fires inside YouCoded');
  assert.ok(page.includes("document.addEventListener('DOMContentLoaded',boot)"), 'setup listens on document');
  assert.ok(page.includes("if(document.readyState!=='loading')setTimeout(boot,0)"), 'setup also runs when the page had already loaded');
});
