#!/usr/bin/env node
// install-work-board.mjs — put the Work board page into a YouCoded Pages folder.
//
// WHY (Destin, plan deck Q-7, 2026-10-16: "your own page, not built in"): the page lives in his personal Pages
// folder like his Home and Money pages. Its source is kept here (pages/work-board/) so it is versioned and
// tested. The program file is written with this workspace's path, so it runs this workspace's tool.
//
// Usage: node scripts/install-work-board.mjs --pages <a Pages folder> [--workspace <youcoded-dev folder>]
//   --pages is required, never guessed: a dev instance's Pages folder for trying it out, the real one
//   (~/YouCoded/Personal/Pages) only when Destin has said yes — writing there changes his running app.
// Re-installing an edited program makes the page ask for approval again (that is the point of the rule).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, '..', 'pages', 'work-board');

export function installWorkBoard(pagesDir, workspace = path.join(HERE, '..')) {
  if (!pagesDir) throw new Error('install needs --pages <folder> (it never guesses which app to change)');
  const dir = path.join(pagesDir, 'work-board');
  fs.mkdirSync(dir, { recursive: true });
  const ws = path.resolve(workspace);
  // WHY write the program first and the page files after: a page that appears before its program would ask
  // for approval of a file that is not there yet.
  const program = fs.readFileSync(path.join(SOURCE, 'work-items.mjs.template'), 'utf8').replaceAll('__WORKSPACE__', ws);
  fs.writeFileSync(path.join(dir, 'work-items.mjs'), program);
  for (const f of ['page.json', 'page.html']) fs.copyFileSync(path.join(SOURCE, f), path.join(dir, f));
  return dir;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  try { console.log(`installed: ${installWorkBoard(opt('--pages'), opt('--workspace'))}`); }
  catch (e) { console.error(`install-work-board: ${e.message}`); process.exit(1); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
