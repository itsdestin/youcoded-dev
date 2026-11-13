#!/usr/bin/env node
// Dev only: frames page.html the way the app does, without the app, so it can be opened in a
// browser, clicked through and photographed (scripts/ui-probe.mjs). It adds a built-in theme's
// colours, the app's real style kit (read from an app checkout — never a copy kept here) and a
// stand-in for window.youcoded that keeps saved data in the tab.
//
//   node pages/tasks/dev/preview.mjs --app <youcoded checkout> [--theme youcoded|dark|…] [--seed sample|empty] [--out file.html]
//
// WHY --app is required: the kit changes with the app; this must show the page against the
// kit of the branch being targeted (today: the pages-finish worktree's youcoded checkout).
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const app = arg('app');
if (!app) { console.error('--app <path to a youcoded checkout> is required'); process.exit(2); }
const desktop = resolve(app, 'desktop');
// WHY the copy: the app's package is not an ES-module package, so Node refuses to import the
// file where it sits; the same file named .mts in a temp folder loads as-is.
const kitCopy = join(mkdtempSync(join(tmpdir(), 'tasks-kit-')), 'page-kit.mts');
copyFileSync(join(desktop, 'src/renderer/components/pages/page-kit.ts'), kitCopy);
const { PAGE_KIT_CSS, PAGE_KIT_JS } = await import(pathToFileURL(kitCopy).href);
const theme = JSON.parse(readFileSync(join(desktop, 'src/renderer/themes/builtin', arg('theme', 'youcoded') + '.json'), 'utf8'));
const tokens = {
  destructive: '#DD4444', 'destructive-fg': theme.dark ? '#FF8A8A' : '#B3261E', 'on-destructive': '#FFFFFF', 'warning-fg': theme.dark ? '#F5C16C' : '#8A5A00',
  radius: '8px', 'radius-sm': '4px', 'radius-md': '8px', 'radius-lg': '12px', 'radius-xl': '16px', 'radius-full': '9999px',
  'font-sans': 'system-ui, sans-serif', 'font-mono': 'ui-monospace, monospace', ...theme.tokens,
};
const themeCss = `:root { ${Object.entries(tokens).map(([k, v]) => `--${k}: ${v};`).join(' ')} color-scheme: ${theme.dark ? 'dark' : 'light'}; }`;

// Sample data, dated relative to today so Today / Overdue / Upcoming always have something.
function sample() {
  const C = createRequire(import.meta.url)('../src/core.js');
  const today = C.ymd(new Date()), d = (n) => C.addDays(today, n);
  const iso = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString(); };
  const t = (id, title, o = {}) => ({ id, title, createdAt: iso(-3), ...o });
  return {
    projects: [
      { id: 'home', name: 'Home', color: 'green', favorite: true, sections: [{ id: 'chores', name: 'Chores' }, { id: 'fix', name: 'Repairs' }] },
      { id: 'work', name: 'Work', color: 'blue', layout: 'board', sections: [{ id: 'todo', name: 'To do' }, { id: 'doing', name: 'Doing' }, { id: 'wait', name: 'Waiting' }] },
      { id: 'trip', name: 'Lisbon trip', color: 'orange' },
    ],
    labels: [{ name: 'errands', color: 'teal' }, { name: 'calls', color: 'purple' }, { name: '5-minutes', color: 'yellow' }],
    filters: [{ id: 'f1', name: 'Quick wins', query: { labels: ['5-minutes'], due: 'any' } }],
    tasks: [
      t('a', 'Reply to the landlord about the lease', { priority: 1, due: { date: d(-2) }, labels: ['calls'] }),
      t('b', 'Renew car registration', { priority: 2, due: { date: d(-1) }, notes: 'Needs the insurance card and last year’s form.' }),
      t('c', 'Pick up prescription', { due: { date: d(0), time: '17:30' }, labels: ['errands'], remind: 30 }),
      t('d', 'Water the plants', { due: { date: d(0) }, repeat: { every: 3, unit: 'day' }, projectId: 'home', sectionId: 'chores' }),
      t('e', 'Plan the week', { priority: 3, due: { date: d(0), time: '09:00' }, repeat: { every: 1, unit: 'week', days: [1] } }),
      t('f', 'Book flights', { priority: 1, due: { date: d(1) }, projectId: 'trip', comments: [{ text: 'TAP has a direct flight on the 3rd.', at: iso(-1) }] }),
      t('f1', 'Compare prices', { parentId: 'f', done: true, doneAt: iso(-1) }),
      t('f2', 'Check passport expiry', { parentId: 'f' }),
      t('f3', 'Choose seats', { parentId: 'f', due: { date: d(2) } }),
      t('g', 'Reserve a table for Saturday', { due: { date: d(2), time: '19:00' }, labels: ['calls', '5-minutes'] }),
      t('h', 'Fix the squeaky door', { projectId: 'home', sectionId: 'fix', labels: ['5-minutes'] }),
      t('i', 'Take out recycling', { projectId: 'home', sectionId: 'chores', due: { date: d(3) }, repeat: { every: 1, unit: 'week' } }),
      t('j', 'Clean the gutters', { projectId: 'home', sectionId: 'fix', priority: 3, due: { date: d(9) } }),
      t('k', 'Quarterly report draft', { projectId: 'work', sectionId: 'doing', priority: 1, due: { date: d(4) } }),
      t('l', 'Review Sam’s proposal', { projectId: 'work', sectionId: 'todo', priority: 2, due: { date: d(1) } }),
      t('m', 'Expense report', { projectId: 'work', sectionId: 'todo', due: { date: d(6) } }),
      t('n', 'Answer from legal on the contract', { projectId: 'work', sectionId: 'wait' }),
      t('o', 'Find a travel adapter', { projectId: 'trip', labels: ['errands'] }),
      t('p', 'Call the dentist', { labels: ['calls'] }),
      t('q', 'Read chapter 4', {}),
      t('r', 'Pay electricity bill', { due: { date: d(20) }, repeat: { every: 1, unit: 'month', anchor: 3 } }),
      t('s', 'Send birthday card', { done: true, doneAt: iso(0) }),
      t('u', 'Buy milk', { done: true, doneAt: iso(-1), labels: ['errands'] }),
    ],
    stats: { days: { [d(0)]: 3, [d(-1)]: 6, [d(-2)]: 5, [d(-3)]: 2, [d(-4)]: 7, [d(-6)]: 4 } },
  };
}
const data = arg('seed', 'sample') === 'empty' ? null : sample();
const json = (v) => JSON.stringify(v).replace(/<\//g, '<\\/');
const fake = `window.__saved = ${json(data)}; window.__saves = 0; window.__subs = [];
window.youcoded = { data: window.__saved, save: function (v) { window.__saved = JSON.parse(JSON.stringify(v)); window.__saves++; },
  onData: function (cb) { window.__subs.push(cb); }, onRefresh: function () {} };
window.__push = function (v) { window.__saved = v; window.__subs.forEach(function (cb) { cb(v); }); };`;
const ours = `<style id="youcoded-theme">${themeCss}</style><style id="youcoded-kit">${PAGE_KIT_CSS}</style><script>${fake}</script><script id="youcoded-kit-js">${PAGE_KIT_JS}</script>`;
const page = readFileSync(join(here, '..', 'page.html'), 'utf8').replace('<head>', () => '<head>' + ours);
const out = resolve(arg('out', join(here, 'preview.html')));
writeFileSync(out, page);
console.log(out);
