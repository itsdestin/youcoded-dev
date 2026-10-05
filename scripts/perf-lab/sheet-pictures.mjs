// scripts/perf-lab/sheet-pictures.mjs — pictures of the spreadsheet viewers for the owner's before/after review deck.
// One boot = one app build + one theme. Opens each fixture in the session drawer like a person would and
// photographs the drawer pane (a fixed rectangle, so before and after pictures are the same size).
//   node scripts/perf-lab/sheet-pictures.mjs --checkout <app repo> --theme midnight|light --out <dir> [--which a,b]
// The same script runs against the old and the new viewer; where an action differs (the old viewer has no
// selection of its own) it does the nearest thing a person would see, and says so in the file name.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsReady, buildFixture } from './fixture.mjs';
import { startXvfb, launchApp } from './launch.mjs';
import { startFakeProvider } from './fake-provider.mjs';
import { installPageHelpers, installProbe, waitForSessionReady } from './scenario-workload.mjs';
import { refusePackageProcesses } from './gpu-theme.mjs';
import { installArtifactHelpers, registerArtifacts } from './scenario-artifacts.mjs';
import { bounded, buildBounded } from './suspects.mjs';
import { waitFor } from './cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CLIP = { x: 710, y: 40, width: 480, height: 624, scale: 1 }; // the session drawer pane on the rig's 1200 x 800 window

const o = { checkout: join(ROOT, 'youcoded'), theme: 'midnight', out: join(ROOT, 'scratch/pics/out'), which: '', port: 9581 };
for (let i = 2; i < process.argv.length; i += 2) o[process.argv[i].slice(2)] = process.argv[i + 1];
if (!isAbsolute(o.checkout) || !isAbsolute(o.out)) throw Error('--checkout and --out must be absolute');
const want = k => !o.which || o.which.split(',').includes(k);

const NAMES = ['Harbor Foods', 'Blue Ridge Co', 'Northwind', 'Summit Labs', 'Alder & Finch', 'Kestrel Group', 'Lumen Retail', 'Oakline'];
const csvSmall = () => ['Account,Region,Owner,Orders,Revenue,Status', ...Array.from({ length: 28 }, (_, i) =>
  `${NAMES[i % 8]},${['North', 'South', 'East', 'West'][i % 4]},${['Ana', 'Ben', 'Cho', 'Dee'][i % 4]},${12 + i * 3},${(1250.5 + i * 187.25).toFixed(2)},${i % 5 === 0 ? 'At risk' : 'Active'}`)].join('\n') + '\n';
const csvBig = (rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ((r * 31 + c * 17) % 5 === 0 ? `item-${r}-${c}` : String((r * 7919 + c * 104729) % 100000 / 100))).join(',')).join('\n') + '\n';

async function writeReport(abs) {
  const ExcelJS = createRequire(join(o.checkout, 'desktop', 'package.json'))('exceljs');
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Q3');
  ws.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 28 }, { width: 16 }];
  ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'Q3 account review'; ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.addRow(['Account', 'Region', 'Revenue', 'Growth', 'Notes', 'Closed']);
  ws.getRow(2).eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }; });
  const notes = ['Renewal signed early; asked for a second site.', 'Waiting on legal review of the data terms before they can sign anything further this quarter.', 'Happy.', 'Champion left; new contact is the head of operations who has not seen a demo yet.'];
  for (let i = 0; i < 8; i++) {
    const r = ws.addRow([NAMES[i], ['West', 'West', 'North', 'North', 'East', 'East', 'South', 'South'][i], 18250.4 + i * 3321.77, 0.04 + i * 0.013, notes[i % 4], new Date(2026, 8, 3 + i)]);
    r.getCell(3).numFmt = '#,##0.00'; r.getCell(4).numFmt = '0.0%'; r.getCell(6).numFmt = 'yyyy-mm-dd';
    r.getCell(5).alignment = { wrapText: true, vertical: 'top' };
  }
  ws.mergeCells('B4:B5'); ws.getCell('B4').value = 'West (merged)'; ws.getCell('B4').alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getCell('E12').value = 'Everything the customer told us in the last call, in the order they said it, with no line breaks and no summary so far';
  await wb.xlsx.writeFile(abs);
}

(async () => {
  mkdirSync(o.out, { recursive: true });
  const bound = bounded(14);
  let x, app, fake;
  try {
    if (!assetsReady()) throw Error('perf-lab assets not cached');
    const build = await buildBounded(o.checkout, bound);
    refusePackageProcesses(build.appDir);
    const fixture = buildFixture(mkdtempSync(join(ROOT, 'scratch/perf-lab/suspects-fixture-')), { fakeProvider: true, nativeSessions: false, log: () => {} });
    // the app reads its theme from here at start
    mkdirSync(join(fixture.home, '.claude'), { recursive: true });
    writeFileSync(join(fixture.home, '.claude', 'youcoded-appearance.json'), JSON.stringify({ theme: o.theme }));
    fake = await bound(startFakeProvider({ port: fixture.fakeProvider.port }), 'fake provider');
    x = await bound(startXvfb(':99'), 'Xvfb');
    app = await bound(launchApp({ binary: build.binary, appDir: build.appDir, fixture, display: x.display, cdpPort: Number(o.port), refuseExisting: true }), 'launch', 90000);
    const cdp = app.cdp;
    await bound(installProbe(cdp), 'probe'); await bound(installPageHelpers(cdp), 'page helpers'); await bound(installArtifactHelpers(cdp), 'artifact helpers');
    const dir = join(fixture.projects.alpha, 'pics'); mkdirSync(dir, { recursive: true });
    const files = {};
    const put = (key, name, text) => { const abs = join(dir, name); if (text != null) writeFileSync(abs, text); files[key] = { key, name, rel: `pics/${name}`, abs }; };
    put('small', 'accounts.csv', csvSmall());
    put('wide', 'wide.csv', csvBig(2000, 100));
    await writeReport(join(dir, 'report.xlsx')); put('report', 'report.xlsx', null);
    put('bigx', 'bigsheet.xlsx', null);
    if (want('loading')) { const ExcelJS = createRequire(join(o.checkout, 'desktop', 'package.json'))('exceljs'); const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Data'); for (let r = 0; r < 2000; r++) ws.addRow(Array.from({ length: 100 }, (_, c) => (r * 7919 + c * 104729) % 100000 / 100)); await wb.xlsx.writeFile(join(dir, 'bigsheet.xlsx')); }
    const s = await bound(cdp.evaluate(`window.claude.session.create(${JSON.stringify({ name: 'sheet', cwd: fixture.projects.alpha, skipPermissions: true })}).then(s => ({ id: s.id })).catch(e => ({ error: String(e && e.message || e) }))`), 'create session', 60000);
    if (!s?.id) throw Error(`session.create failed: ${s?.error}`);
    await bound(waitForSessionReady(cdp), 'ready', 45000);
    await bound(registerArtifacts(cdp, fixture.projects.alpha, s.id, files), 'register', 60000);
    const opened = await cdp.evaluate(`(async () => { const b = document.querySelector('button[aria-label="Session Files"]'); if (!b) return { ok: false }; b.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return { ok: true }; })()`);
    if (!opened.ok) throw Error('no Session Files button');
    await waitFor(cdp, `window.__perfArt.drawerOpen()`, { timeoutMs: 15000, everyMs: 25 });
    await waitFor(cdp, `(() => { const n = window.__perfArt.rowNames(); return !!(n && n.indexOf('accounts.csv') >= 0 && n.indexOf('report.xlsx') >= 0); })()`, { timeoutMs: 20000, everyMs: 50 });
    // the page asks "is the pointer over the drawer" before taking Ctrl+F; the rig has no pointer there
    await cdp.evaluate(`(() => { if (!Element.prototype.__m) { Element.prototype.__m = Element.prototype.matches; Element.prototype.matches = function (s) { return s === ':hover' ? true : this.__m(s); }; } })()`);
    const shot = async name => {
      const r = await bound(cdp.send('Page.captureScreenshot', { format: 'png', clip: CLIP }), 'shot');
      writeFileSync(join(o.out, `${name}.png`), Buffer.from(r.data, 'base64'));
    };
    const ready = `(() => { const t = document.querySelector('.drawer-pane table'); return !!t && [...t.querySelectorAll('td')].some(td => td.textContent.trim() !== ''); })()`;
    const openFile = async (key, extra = ready, timeout = 120000) => {
      await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`).catch(() => {});
      await sleep(400);
      await bound(cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(files[key].name)})`), 'click row');
      await waitFor(cdp, extra, { timeoutMs: timeout, everyMs: 50 });
      await cdp.evaluate(`window.__perfArt.clickTitle('Hide list')`).catch(() => {}); // give the sheet the whole pane
      await sleep(900);
    };
    const scroller = `(() => { const t = document.querySelector('.drawer-pane table'); let e = t && t.parentElement; while (e && !(e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement; return e; })()`;
    const findFor = async q => {
      await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }))`);
      await waitFor(cdp, `!!document.querySelector('input[aria-label="Find in document"]')`, { timeoutMs: 8000, everyMs: 25 });
      await cdp.evaluate(`(() => { const i = document.querySelector('input[aria-label="Find in document"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await waitFor(cdp, `(() => { const i = document.querySelector('input[aria-label="Find in document"]'); return !!i && /\\d+\\/\\d+/.test(i.parentElement.textContent); })()`, { timeoutMs: 30000, everyMs: 50 });
      await sleep(700);
    };
    const closeFind = () => cdp.evaluate(`document.querySelector('input[aria-label="Find in document"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);

    if (want('small')) { await openFile('small'); await shot('1-small-sheet'); }
    if (want('find')) { await openFile('small'); await findFor('north'); await shot('4-find'); await closeFind(); }
    if (want('selection')) {
      // After: the viewer's own drag (mouse events). Before: the viewer has no selection of its own, so the nearest
      // thing a person sees: the browser's text selection across the same cells.
      await cdp.evaluate(`(() => {
        const td = (r, c) => document.querySelector('.drawer-pane td[data-r="' + r + '"][data-c="' + c + '"]') || [...document.querySelectorAll('.drawer-pane tbody tr')][r + 1]?.querySelectorAll('td')[c];
        const a = td(3, 1), b = td(9, 3);
        const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
        a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: A.left + 5, clientY: A.top + 5 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: B.left + 5, clientY: B.top + 5 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        if (!a.hasAttribute('data-r')) { const rg = document.createRange(); rg.setStart(a.firstChild, 0); rg.setEnd(b.firstChild, b.firstChild.length); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); }
      })()`);
      await sleep(500); await shot('3-selection');
      await cdp.evaluate(`getSelection().removeAllRanges()`);
    }
    if (want('report')) {
      await openFile('report'); await shot('5-merged-wrapped');
      // click the long text cell (A12): the formula bar shows all of it
      await cdp.evaluate(`(() => { const t = [...document.querySelectorAll('.drawer-pane td')].find(td => td.textContent.startsWith('Everything the customer')); if (t) { t.scrollIntoView({ block: 'nearest', inline: 'center' }); t.click(); } })()`);
      await sleep(500); await shot('6-long-text');
    }
    if (want('wide')) {
      await openFile('wide', `(() => { const t = document.querySelector('.drawer-pane table'); return !!t && t.querySelectorAll('colgroup col').length === 101 && [...t.querySelectorAll('td')].some(td => td.textContent.trim() !== ''); })()`);
      await cdp.evaluate(`(() => { const e = ${scroller}; e.scrollTop = 30000; e.scrollLeft = 2400; })()`);
      await sleep(1500); await shot('2-wide-mid-scroll');
    }
    if (want('loading')) {
      await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`).catch(() => {}); await sleep(400);
      await cdp.evaluate(`window.__perfArt.clickListRow('bigsheet.xlsx')`);
      await sleep(250); await shot('7-loading'); // taken while the sheet is being prepared
    }
  } finally {
    if (app) await Promise.race([app.kill(), sleep(8000)]).catch(() => {});
    if (x?.proc) x.proc.kill('SIGTERM');
    if (fake) await Promise.race([fake.close(), sleep(3000)]).catch(() => {});
  }
  console.log('done', o.out);
})().catch(e => { console.error(e); process.exitCode = 2; });
