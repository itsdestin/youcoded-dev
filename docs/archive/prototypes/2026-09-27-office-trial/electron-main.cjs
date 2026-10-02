// Electron check: serve the editor from a private app-only scheme (office://app),
// frame it from a different origin exactly as YouCoded would, open a real file,
// save it back, and screenshot — in a hidden window with a throwaway profile.
const { app, BrowserWindow, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const S = '/tmp/claude-1000/-home-destin-youcoded-dev/c25d3b88-5ae3-48b8-9f2e-1e15f2993963/scratchpad';
const DIST = path.join(S, 'document/dist');
app.setPath('userData', path.join(S, 'rig/electron-profile'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'office', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, allowServiceWorkers: true } },
]);

const log = (...a) => console.log('[check]', ...a);

app.whenReady().then(async () => {
  protocol.handle('office', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/editor' || p === '/editor/') p = '/editor.html';
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
    // Brotli-packed assets: a web server would send these with Content-Encoding: br;
    // a custom scheme has no such step, so unpack here (a real add-on would store them unpacked).
    if (file.endsWith('.br')) {
      const body = require('node:zlib').brotliDecompressSync(fs.readFileSync(file));
      const type = file.endsWith('.wasm.br') ? 'application/wasm' : file.endsWith('.js.br') ? 'text/javascript' : 'application/octet-stream';
      return new Response(body, { headers: { 'content-type': type } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const errs = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(String(e.message).slice(0, 160)); });
  await win.loadURL('http://127.0.0.1:4718/host.html?editor=' + encodeURIComponent('office://app'));
  const js = (s) => win.webContents.executeJavaScript(s);
  const wait = async (cond, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(cond)) return Date.now() - t; await new Promise((r) => setTimeout(r, 200)); } return -1; };

  log('editor shell ready after ms:', await wait("window.__events.some(e => e.type === 'document:ready')"));
  const name = process.argv.find((a) => a.endsWith('.docx') || a.endsWith('.xlsx') || a.endsWith('.pptx')) || 'budget-compare.docx';
  const b64 = fs.readFileSync(path.join(S, 'samples', name)).toString('base64');
  const opened = await js(`(async () => { const bin = Uint8Array.from(atob(${JSON.stringify(b64)}), c => c.charCodeAt(0)); const d = await window.send('document:open-buffer', { fileName: ${JSON.stringify(name)}, buffer: bin.buffer }); return d.type + ' ' + (d.payload && d.payload.message || ''); })()`);
  log('open reply:', opened);
  await new Promise((r) => setTimeout(r, 9000));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(S, `rig/out/electron-${name}.png`), img.toPNG());
  const saved = await js(`(async () => { const d = await window.send('document:save', {}); if (d.type !== 'document:saved') return d.type + ' ' + (d.payload && d.payload.message); return 'saved ' + d.payload.file.name + ' ' + d.payload.file.size + ' bytes'; })()`);
  log('save reply:', saved);
  log('console errors:', errs.length, errs.slice(0, 5));
  app.quit();
});
