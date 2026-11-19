#!/usr/bin/env node
// A stand-in for the app around ONE YouCoded Page, so a page can be opened and tested in a plain
// browser: serves <pageFolder>/page.html with a stub `window.youcoded` backed by the folder's own
// data.json. Local data only.
//
// Usage: node scripts/page-standin.mjs <pageFolder> [--port N]      (prints the address; Ctrl-C stops it)
//
// WHAT THE STUB DOES (the surface is page-theme.ts `bootstrap`, the code the real app injects):
//   data          the contents of <folder>/data.json (null when there is none) — what the app
//                 bakes in as the page's saved data
//   save(d)       keeps d in memory and fires onData; it never writes data.json back
//   onData/onRefresh   register callbacks; window.__standin.refresh() fires onRefresh (the band's button)
//   fetch(url)    answered from <folder>/fetch.json, a map of exact URL -> {status?, body} (a body that
//                 is not a string is sent as JSON); a URL not in the map answers {ok:false, reason:
//                 'standin-no-data'}. NOTHING is ever forwarded to a network, an API or a token.
//   startSession  only when page.json declares a "session" connection: logs the prompt, answers {ok:true}
//   chats         only with a "chats" connection: list -> {ok:true, chats:[]}, resume / setTag … -> {ok:true}
//   program.run   only with a "program" connection: {ok:false, reason:'standin-no-programs'} (a program is
//                 code the app runs for the page; the stand-in does not run it)
//   devices {}, plaid/socket absent
// Colours: a plain dark set of the app's variables plus the app's own page kit styles when the kit
// can be read from this workspace's youcoded/ checkout; neither is the user's real theme.
//
// WHAT IT IS NOT: the app's sandbox. The real page frame carries a Content-Security-Policy and
// reaches the outside only through youcoded.fetch; this server adds neither, so a page that works
// here can still be refused in the app. Binds 127.0.0.1 only and refuses requests whose Host is
// anything else (a web page on the internet cannot reach it through a rebinding name).
//
// Forwarding to a live API / using a token is deliberately NOT here (owner's decision, card #239).
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (file, fallback) => {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON: ${e.message}`); }
};
// `</script>` in data must not end the script early (the app escapes the same sequence).
const lit = (v) => JSON.stringify(v ?? null).replace(/<\//g, '<\\/');

// A dark default set of the app's colour variables, enough for kit-styled pages to read.
const THEME = ':root{--canvas:#141414;--panel:#1e1e1e;--inset:#2a2a2a;--well:#181818;--fg:#ececec;--fg-2:#b5b5b5;--fg-muted:#8a8a8a;--fg-dim:#9a9a9a;--fg-faint:#666;--accent:#d97757;--on-accent:#fff;--edge:#333;--edge-dim:#2a2a2a;--radius-md:8px;--radius-lg:12px;font-family:system-ui,sans-serif;color:var(--fg);background:var(--canvas)}body{margin:0;background:var(--canvas)}';

function kitCss() {
  const f = join(WORKSPACE, 'youcoded', 'desktop', 'src', 'renderer', 'components', 'pages', 'page-kit.ts');
  try { return readFileSync(f, 'utf8').match(/PAGE_KIT_CSS = `([\s\S]*?)`;/)?.[1] ?? ''; } catch { return ''; }
}

/** The script injected as the first thing in <head>. */
export function stubScript({ data, connections, fetchMap }) {
  const has = (kind) => connections.some((c) => c && c.kind === kind);
  const chats = has('chats');
  return `(function(){
  var subs = [], refreshSubs = [];
  var fetchMap = ${lit(fetchMap)};
  var log = function (what, detail) { try { console.info('[standin] ' + what, detail === undefined ? '' : detail); } catch (e) {} };
  var call = function (list, arg) { for (var i = 0; i < list.length; i++) { try { list[i](arg); } catch (e) {} } };
  window.youcoded = {
    data: ${lit(data)},
    devices: {},
    save: function (d) { window.youcoded.data = d; log('save', d); call(subs, d); },
    onData: function (cb) { if (typeof cb === 'function') subs.push(cb); },
    onRefresh: function (cb) { if (typeof cb === 'function') refreshSubs.push(cb); },
    fetch: function (url) {
      var hit = Object.prototype.hasOwnProperty.call(fetchMap, String(url)) ? fetchMap[String(url)] : undefined;
      if (hit === undefined) { log('fetch with no local answer', String(url)); return Promise.resolve({ ok: false, reason: 'standin-no-data', message: 'The stand-in has no local answer for ' + url + ' (add it to fetch.json).' }); }
      var body = hit && typeof hit === 'object' && 'body' in hit ? hit.body : hit;
      var status = hit && typeof hit === 'object' && typeof hit.status === 'number' ? hit.status : 200;
      return Promise.resolve({ ok: true, status: status, headers: {}, body: typeof body === 'string' ? body : JSON.stringify(body) });
    }
  };
  ${has('session') ? `window.youcoded.startSession = function (o) { log('startSession', o); return Promise.resolve({ ok: true }); };` : ''}
  ${chats ? `window.youcoded.chats = { list: function () { return Promise.resolve({ ok: true, chats: [] }); }, resume: function (c) { log('chats.resume', c); return Promise.resolve({ ok: true }); }, setTag: function () { return Promise.resolve({ ok: true }); }, setNote: function () { return Promise.resolve({ ok: true }); }, setMark: function () { return Promise.resolve({ ok: true }); } };` : ''}
  ${has('program') ? `window.youcoded.program = { run: function (f) { log('program.run', f); return Promise.resolve({ ok: false, reason: 'standin-no-programs' }); } };` : ''}
  window.__standin = { refresh: function () { call(refreshSubs); } };
})();`;
}

/** Starts the stand-in for `folder`. Resolves { server, port, url, close }. */
export async function createStandin(folder, { port = 0 } = {}) {
  const dir = resolve(folder);
  const pagePath = join(dir, 'page.html');
  if (!existsSync(pagePath)) throw new Error(`${dir} has no page.html — is this a Page folder?`);
  const manifest = readJson(join(dir, 'page.json'), {});
  const connections = Array.isArray(manifest.connections) ? manifest.connections : [];
  const kit = kitCss();
  let bound = 0;

  const server = http.createServer((req, res) => {
    // Only the two names this server is reached by; anything else (a rebinding hostname) is refused.
    const host = String(req.headers.host ?? '');
    if (host !== `127.0.0.1:${bound}` && host !== `localhost:${bound}`) { res.writeHead(403).end('forbidden host'); return; }
    const path = new URL(req.url, 'http://x').pathname;
    if (path !== '/' && path !== '/page.html') { res.writeHead(404).end('not found'); return; }
    try {
      // Re-read on every load, so an edit to the page or its data shows on refresh.
      const html = readFileSync(pagePath, 'utf8');
      const data = readJson(join(dir, 'data.json'), null);
      const fetchMap = readJson(join(dir, 'fetch.json'), {});
      const inject = `<style>${THEME}${kit}</style><script>${stubScript({ data, connections, fetchMap })}</script>`;
      const out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(out);
    } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }).end(String(e.message)); }
  });
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(port, '127.0.0.1', ok); });
  bound = server.address().port;
  return { server, port: bound, url: `http://127.0.0.1:${bound}/`, close: () => new Promise((r) => server.close(r)) };
}

// ─── command line ────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let port = 0; const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') { port = Number(args[++i]); if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error('--port needs a number from 0 to 65535'); process.exit(2); } }
    else rest.push(args[i]);
  }
  if (rest.length !== 1) { console.error('usage: node scripts/page-standin.mjs <pageFolder> [--port N]'); process.exit(2); }
  try {
    const s = await createStandin(rest[0], { port });
    console.log(`page stand-in for ${resolve(rest[0])}\n  ${s.url}\n(local data only; Ctrl-C to stop)`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
