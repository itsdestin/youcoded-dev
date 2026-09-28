// Office spike (task 0): Euro-Office editors in DESKTOP mode, served from office://,
// with euro-office-lite's AGPL bridge.js unmodified and its Tauri calls answered by an
// Electron stand-in (preload.cjs → ipc → these handlers), converting with the native x2t.
// Go/no-go: open, edit, save the samples; fidelity via compare.py.
//
// Run: electron main.cjs <file-to-open> [--save-after-ms N] [--shot out.png]
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');

const SPIKE = path.resolve(__dirname, '..');
const DIST = path.join(SPIKE, 'eol', 'src-dist');
const BIN = path.join(SPIKE, 'x', 'usr', 'lib', 'Euro-Office-Lite', 'binaries');
const TEMPLATES = path.join(SPIKE, 'x', 'usr', 'lib', 'Euro-Office-Lite', 'templates');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-office-spike-'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a) && !a.endsWith('.png'));
const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const FILE = args.find((a) => fs.existsSync(a));
app.setPath('userData', path.join(SPIKE, 'electron-profile'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'office', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'ascdesktop', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const log = (...a) => console.log('[spike]', ...a);
const state = { current: null, modified: false };

function serveFrom(root, rel) {
  const file = path.resolve(root, '.' + path.sep + rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function formatOf(p) {
  // x2t format codes (OnlyOffice AVS_OFFICESTUDIO_FILE_*), the ones the samples need.
  const ext = path.extname(p).slice(1).toLowerCase();
  return { docx: 65, doc: 66, odt: 67, rtf: 68, xlsx: 257, xls: 258, ods: 259, csv: 260, pptx: 129, ppt: 130, odp: 131 }[ext] ?? 0;
}

// Every x2t job gets a FRESH temp dir. Measured 2026-09-28: saving with the temp dir the open
// step had used (it leaves xlsx_unpacked/ behind) made x2t merge the old drawing parts in, and
// a workbook's 5 charts came back on two sheets. A clean dir gives the right file.
function x2t(from, to, formatTo) {
  const jobTemp = fs.mkdtempSync(path.join(TEMP, 'job-'));
  const xml = `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>${from}</m_sFileFrom><m_sFileTo>${to}</m_sFileTo><m_nFormatTo>${formatTo}</m_nFormatTo><m_sTempDir>${jobTemp}</m_sTempDir><m_sFontDir>${path.join(BIN, 'fonts')}</m_sFontDir><m_sAllFontsPath>${path.join(BIN, 'AllFonts.js')}</m_sAllFontsPath></TaskQueueDataConvert>`;
  const params = path.join(TEMP, `params-${Date.now()}.xml`);
  fs.writeFileSync(params, xml);
  return new Promise((res, rej) => execFile(path.join(BIN, 'x2t'), [params], { cwd: BIN, env: { ...process.env, LD_LIBRARY_PATH: BIN }, timeout: 60_000 }, (err, _o, stderr) => {
    fs.rmSync(params, { force: true });
    fs.rmSync(jobTemp, { recursive: true, force: true });
    if (err) rej(new Error(`x2t failed: ${err.code ?? err.message} ${stderr}`)); else res();
  }));
}

const COMMANDS = {
  js_log: ({ msg }) => { if (/error|fail|warn/i.test(msg)) log('editor:', String(msg).slice(0, 200)); return null; },
  get_current_path: () => state.current,
  set_window_title: () => null,
  set_document_modified: ({ modified }) => { state.modified = !!modified; return null; },
  recent_files_state: () => ({ enabled: false, files: [] }),
  set_recent_files_enabled: () => null,
  clear_recent_files: () => null,
  // A JS string (an AllFonts.js overlay of the machine's fonts) or '' for none — an array breaks the font list.
  get_system_fonts: () => '',
  list_user_dictionaries: () => ({ folders: [], refused: [] }),
  recovery_begin: () => null, recovery_end: () => null, recovery_mark_saved: () => null,
  recovery_candidates: () => [], recovery_load: () => null, recovery_discard: () => null,
  async open_file({ path: p }) {
    const t0 = Date.now();
    const out = path.join(TEMP, 'Editor.bin');
    await fsp.rm(path.join(TEMP, 'media'), { recursive: true, force: true });
    await fsp.rm(out, { force: true });
    await x2t(p, out, 8192);
    state.current = p;
    const b64 = (await fsp.readFile(out)).toString('base64');
    log(`open ${path.basename(p)}: translated in ${Date.now() - t0} ms, ${b64.length} b64 chars`);
    return b64;
  },
  async write_editor_bin({ data }) { await fsp.writeFile(path.join(TEMP, 'Editor.bin'), Buffer.from(data, 'base64')); return 'ok'; },
  async save_file() {
    const t0 = Date.now();
    await x2t(path.join(TEMP, 'Editor.bin'), state.current, formatOf(state.current));
    state.modified = false;
    log(`save ${path.basename(state.current)}: ${Date.now() - t0} ms, ${fs.statSync(state.current).size} bytes`);
    return 'ok';
  },
  async save_changes(a) { return COMMANDS.save_file(a); },
  force_close: () => { app.quit(); return null; },
};

ipcMain.handle('tauri-invoke', async (_e, cmd, a) => {
  const f = COMMANDS[cmd];
  if (!f) { log('UNHANDLED command', cmd, JSON.stringify(a ?? {}).slice(0, 120)); return null; }
  return f(a ?? {});
});

app.whenReady().then(async () => {
  protocol.handle('office', (req) => serveFrom(DIST, decodeURIComponent(new URL(req.url).pathname).replace(/^\//, '') || 'index.html'));
  protocol.handle('ascdesktop', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent((u.host + u.pathname)).replace(/^\/+/, '');
    if (rel.startsWith('docmedia/')) return serveFrom(TEMP, rel.slice('docmedia/'.length));
    if (rel.startsWith('dictionaries/')) return serveFrom(DIST, rel);
    return new Response('not found', { status: 404 });
  });
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false } });
  win.webContents.on('console-message', (e) => { if (e.level === 'error') log('console error:', String(e.message).slice(0, 160)); });
  await win.loadURL('office://app/index.html');
  await new Promise((r) => setTimeout(r, 1500));
  if (FILE) {
    const t0 = Date.now();
    win.webContents.send('tauri-event', 'open-file', FILE);
    // Wait until the editor has drawn: the web-apps frame exists and its load mask is gone.
    for (;;) {
      const ok = await win.webContents.executeJavaScript(`(() => { const f=[...document.querySelectorAll('iframe')].find(i => /web-apps\\/apps/.test(i.src)); if(!f) return false; const d=f.contentDocument; return !!d && !![...d.querySelectorAll('#editor_sdk,#ws-canvas-outer,#id_main_view')].length && ![...d.querySelectorAll('.asc-loadmask')].some(m=>m.offsetParent!==null); })()`).catch(() => false);
      if (ok) break;
      if (Date.now() - t0 > 60000) { log('TIMEOUT waiting for the editor'); break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    log(`visible after ${Date.now() - t0} ms`);
    await new Promise((r) => setTimeout(r, 1500));
    const shot = flag('--shot');
    if (shot) { fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG()); log('shot', shot); }
    if (process.argv.includes('--save')) {
      // Save through the editor's own path: Ctrl+S in the editor frame → LocalFileSave → our commands.
      await win.webContents.executeJavaScript(`window.AscDesktopEditor.LocalFileSave('', '', null, 0, null)`).catch((e) => log('save call failed', e.message));
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
  app.quit();
});
