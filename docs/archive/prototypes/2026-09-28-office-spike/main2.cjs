// Spike, part 2 (design §2 e/f): the editor FRAMED from a second origin, one origin per
// document (office://<token>/), every bridge.js call relayed host → main, two documents at
// once, and a per-document media folder. Also applies the YouCoded theme bridge.
//
// Run: electron main2.cjs <fileA> <fileB> [--shot out.png] [--save] [--theme midnight|meadow]
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');

const SPIKE = path.resolve(__dirname, '..');
const DIST = path.join(SPIKE, 'eol', 'src-dist');
const BIN = path.join(SPIKE, 'x', 'usr', 'lib', 'Euro-Office-Lite', 'binaries');
const BRIDGE = path.resolve(SPIKE, '..', '..', 'docs', 'active', 'prototypes', '2026-09-27-office-trial', 'yc-bridge.js');
const flag = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const FILES = process.argv.slice(2).filter((a) => fs.existsSync(a) && /\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(a));
app.setPath('userData', path.join(SPIKE, 'electron-profile2'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'office', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'ychost', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const log = (...a) => console.log('[spike2]', ...a);

/** token → { path, temp, sender } — one session per open document (§3a). */
const sessions = new Map();
const CMD_ALLOW = new Set(['js_log', 'get_current_path', 'set_window_title', 'set_document_modified', 'recent_files_state',
  'set_recent_files_enabled', 'clear_recent_files', 'get_system_fonts', 'list_user_dictionaries', 'recovery_begin', 'recovery_end',
  'recovery_mark_saved', 'recovery_candidates', 'recovery_load', 'recovery_discard', 'open_file', 'write_editor_bin', 'save_file',
  'save_changes', 'convert_for_insert', 'force_close']);

function formatOf(p) {
  return { docx: 65, doc: 66, odt: 67, rtf: 68, xlsx: 257, xls: 258, ods: 259, csv: 260, pptx: 129, ppt: 130, odp: 131 }[path.extname(p).slice(1).toLowerCase()] ?? 0;
}
function x2t(from, to, formatTo, outDir) {
  const job = fs.mkdtempSync(path.join(outDir, 'job-'));
  const params = path.join(job, 'params.xml');
  fs.writeFileSync(params, `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>${from}</m_sFileFrom><m_sFileTo>${to}</m_sFileTo><m_nFormatTo>${formatTo}</m_nFormatTo><m_sTempDir>${job}</m_sTempDir><m_sFontDir>${path.join(BIN, 'fonts')}</m_sFontDir><m_sAllFontsPath>${path.join(BIN, 'AllFonts.js')}</m_sAllFontsPath></TaskQueueDataConvert>`);
  return new Promise((res, rej) => execFile(path.join(BIN, 'x2t'), [params], { cwd: BIN, env: { ...process.env, LD_LIBRARY_PATH: BIN }, timeout: 60_000 }, (err, _o, se) => {
    fs.rmSync(job, { recursive: true, force: true });
    if (err) rej(new Error(`x2t failed ${err.code ?? ''} ${se}`)); else res();
  }));
}

function commands(s) {
  return {
    js_log: ({ msg }) => { if (/error|fail/i.test(msg)) log(s.token.slice(0, 6), 'editor:', String(msg).slice(0, 160)); return null; },
    get_current_path: () => s.path, set_window_title: () => null, set_document_modified: () => null,
    recent_files_state: () => ({ enabled: false, files: [] }), set_recent_files_enabled: () => null, clear_recent_files: () => null,
    get_system_fonts: () => '', list_user_dictionaries: () => ({ folders: [], refused: [] }),
    recovery_begin: () => null, recovery_end: () => null, recovery_mark_saved: () => null, recovery_candidates: () => [], recovery_load: () => null, recovery_discard: () => null,
    convert_for_insert: () => null, force_close: () => null,
    async open_file({ path: p }) {
      if (p !== s.path) throw new Error('not this document');         // a frame opens only its own file
      const out = path.join(s.temp, 'Editor.bin');
      await fsp.rm(path.join(s.temp, 'media'), { recursive: true, force: true });
      const t0 = Date.now(); await x2t(p, out, 8192, s.temp);
      const b64 = (await fsp.readFile(out)).toString('base64');
      log(s.token.slice(0, 6), `open ${path.basename(p)} ${Date.now() - t0} ms`);
      return b64;
    },
    async write_editor_bin({ data }) { await fsp.writeFile(path.join(s.temp, 'Editor.bin'), Buffer.from(data, 'base64')); return 'ok'; },
    async save_file() { const t0 = Date.now(); await x2t(path.join(s.temp, 'Editor.bin'), s.path, formatOf(s.path), s.temp); log(s.token.slice(0, 6), `save ${path.basename(s.path)} ${Date.now() - t0} ms`); return 'ok'; },
    save_changes(a) { return this.save_file(a); },
  };
}

ipcMain.handle('office-invoke', async (e, token, cmd, args) => {
  const s = sessions.get(token);
  // Main re-checks everything (review 2, R2-7): known command, and the document was opened by THIS window.
  if (!s || s.sender !== e.sender.id || !CMD_ALLOW.has(cmd)) { log('REFUSED', cmd, token?.slice?.(0, 6)); throw new Error('refused'); }
  return commands(s)[cmd](args ?? {});
});
ipcMain.on('host-log', (_e, m) => log(m));

function serveFile(root, rel) {
  const file = path.resolve(root, '.' + path.sep + rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}
const CSP = "default-src office: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src office: data: blob:; img-src office: data: blob:; font-src office: data:";

app.whenReady().then(async () => {
  protocol.handle('office', async (req) => {
    const u = new URL(req.url);
    const s = sessions.get(u.hostname);
    if (!s) return new Response('no such document', { status: 404 });
    let rel = decodeURIComponent(u.pathname).replace(/^\//, '') || 'index.html';
    let res;
    if (rel.startsWith('asc/docmedia/')) res = serveFile(s.temp, rel.slice('asc/docmedia/'.length));
    else if (rel.startsWith('asc/dictionaries/')) res = serveFile(DIST, rel.slice('asc/'.length));
    else if (rel === 'tauri-relay.js') res = serveFile(__dirname, 'tauri-relay.js');
    else if (rel === 'yc-bridge.js') res = new Response(fs.readFileSync(BRIDGE), { headers: { 'content-type': 'text/javascript' } });
    else if (rel === 'index.html') {
      // The add-on's index: relay first, then bridge.js as before (+ the theme bridge).
      const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').replace('<head>', '<head><script src="tauri-relay.js"></script><script src="yc-bridge.js"></script>');
      res = new Response(html, { headers: { 'content-type': 'text/html' } });
    } else if (rel === 'bridge.js') {
      // The one-line patch (§3a): media and dictionaries under this document's own origin.
      const js = fs.readFileSync(path.join(DIST, 'bridge.js'), 'utf8').replace("var ASC_PROTO_BASE = _isWindows ? 'http://ascdesktop.localhost/' : 'ascdesktop://';", "var ASC_PROTO_BASE = location.origin + '/asc/';");
      res = new Response(js, { headers: { 'content-type': 'text/javascript' } });
    } else res = serveFile(DIST, rel);
    const r = await res;
    const h = new Headers(r.headers); h.set('Content-Security-Policy', CSP);
    return new Response(r.body, { status: r.status, headers: h });
  });
  protocol.handle('ychost', () => new Response(fs.readFileSync(path.join(__dirname, 'host.html')), { headers: { 'content-type': 'text/html' } }));

  const win = new BrowserWindow({ show: false, width: 1600, height: 900, webPreferences: { preload: path.join(__dirname, 'host-preload.cjs'), contextIsolation: true } });
  win.webContents.on('console-message', (e) => { if (e.level === 'error' && !/ServiceWorker/.test(e.message)) log('console error:', String(e.message).slice(0, 160)); });
  win.webContents.on('will-frame-navigate', (e) => { if (!/^office:|^ychost:/.test(e.url)) { log('BLOCKED navigation', e.url); e.preventDefault(); } });
  await win.loadURL('ychost://app/host.html');
  const tokens = [];
  for (const f of FILES) {
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, { token, path: f, temp: fs.mkdtempSync(path.join(os.tmpdir(), 'yc-office-doc-')), sender: win.webContents.id });
    tokens.push(token);
    await win.webContents.executeJavaScript(`openDoc(${JSON.stringify(token)}, ${JSON.stringify(f)})`);
  }
  // Wait until every frame's editor has drawn.
  const t0 = Date.now();
  const drawn = (token) => win.webContents.mainFrame.framesInSubtree.some((fr) => fr.origin === `office://${token}` && /web-apps\/apps/.test(fr.url));
  for (;;) {
    let ready = 0;
    for (const tk of tokens) {
      const fr = win.webContents.mainFrame.framesInSubtree.find((f) => f.origin === `office://${tk}` && /web-apps\/apps/.test(f.url));
      if (fr && await fr.executeJavaScript(`!![...document.querySelectorAll('#editor_sdk,#ws-canvas-outer,#id_main_view')].length && ![...document.querySelectorAll('.asc-loadmask')].some(m=>m.offsetParent!==null)`).catch(() => false)) ready++;
    }
    if (ready === tokens.length) break;
    if (Date.now() - t0 > 60000) { log('TIMEOUT', ready, 'of', tokens.length); break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  log(`both drawn after ${Date.now() - t0} ms`);
  const theme = flag('--theme');
  if (theme) {
    const THEMES = {
      midnight: { tokens: { panel: '#161B22', canvas: '#0D1117', inset: '#21262D', well: '#0D1117', fg: '#C9D1D9', 'fg-2': '#A0AAB4', 'fg-dim': '#919AA4', 'fg-muted': '#858D97', 'fg-faint': '#4E555E', edge: '#343A41', accent: '#B1BAC4', 'on-accent': '#0D1117', link: '#58A6FF', 'radius-sm': '4px', 'radius-md': '8px', 'radius-lg': '12px', 'font-sans': "'Cascadia Mono', monospace" }, dark: true, wallpaper: false, panelsOpacity: 1, panelsBlur: 0, fontLinks: [] },
      // WHY: a light theme is the real test. Euro-Office defaults to dark on a dark
      // desktop, so a dark theme can "pass" without the bridge doing anything.
      meadow: { tokens: { panel: '#DDE9DA', canvas: '#F6FAF5', inset: '#BAD0B6', well: '#C4DCBF', fg: '#041008', 'fg-2': '#1E3426', 'fg-dim': '#33493A', 'fg-muted': '#465B4E', 'fg-faint': '#637668', edge: '#8FB191', accent: '#2F7D55', 'on-accent': '#FFFFFF', link: '#2F7D55', 'radius-sm': '6px', 'radius-md': '10px', 'radius-lg': '14px', 'font-sans': "'Nunito', 'Cascadia Mono', monospace" }, dark: false, wallpaper: false, panelsOpacity: 1, panelsBlur: 0, fontLinks: [] },
    };
    for (const tk of tokens) await win.webContents.executeJavaScript(`__frames[${JSON.stringify(tk)}].win.postMessage({type:'yc:office-theme', theme:${JSON.stringify(THEMES[theme])}}, 'office://${tk}')`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  // Isolation checks: localStorage is per document, and one document cannot fetch the other's media.
  const [a, b] = tokens;
  if (a && b) {
    const fa = win.webContents.mainFrame.framesInSubtree.find((f) => f.origin === `office://${a}` && f.parent === win.webContents.mainFrame);
    const iso = await fa.executeJavaScript(`(async () => { localStorage.setItem('yc-probe', 'A'); let cross; try { const r = await fetch('office://${b}/asc/docmedia/media/image1.png'); cross = 'status ' + r.status; } catch (e) { cross = 'blocked: ' + e.message.slice(0, 60); } return { cross }; })()`);
    const fb = win.webContents.mainFrame.framesInSubtree.find((f) => f.origin === `office://${b}` && f.parent === win.webContents.mainFrame);
    const seen = await fb.executeJavaScript(`localStorage.getItem('yc-probe')`);
    const net = await fa.executeJavaScript(`fetch('https://example.com/').then(r => 'reached ' + r.status, e => 'blocked')`);
    log(`isolation: B sees A's localStorage? ${seen === 'A' ? 'YES (bad)' : 'no (good)'}; A fetching B's media: ${iso.cross}; A reaching the internet: ${net}`);
  }
  const shot = flag('--shot');
  if (shot) { fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG()); log('shot', shot); }
  if (process.argv.includes('--save')) {
    for (const tk of tokens) {
      const fr = win.webContents.mainFrame.framesInSubtree.find((f) => f.origin === `office://${tk}` && f.parent === win.webContents.mainFrame);
      await fr.executeJavaScript(`window.AscDesktopEditor.LocalFileSave('', '', null, 0, null)`).catch((e) => log('save failed', e.message));
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
  app.quit();
});
