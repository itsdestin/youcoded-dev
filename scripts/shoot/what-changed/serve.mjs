#!/usr/bin/env node
// Local server for the "What changed" viewer: node scripts/shoot/what-changed/serve.mjs <run folder>
//
// WHY a server at all: a page opened from disk cannot read changes.json or save answers. This is the
// smallest thing that can — it serves the viewer's four files, serves ONLY the run folder under /run/,
// and writes the owner's Keep / Not this answers to <run>/decisions.json. It binds 127.0.0.1 only.
import http from 'node:http';
import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDecisions } from './viewer/helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIEWER = path.join(HERE, 'viewer');
// An allowlist, not a directory listing: viewer/ also holds the sample run and its generator.
const VIEWER_FILES = { '/': 'index.html', '/index.html': 'index.html', '/viewer.css': 'viewer.css',
  '/viewer.js': 'viewer.js', '/helpers.js': 'helpers.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const MAX_BODY = 1024 * 1024;

// Map a /run/... URL path to a file inside `root`, or null if it would leave it. Exported for tests.
export function resolveInRun(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes('\0') || rel.includes('\\')) return null;
  const full = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export async function startServer({ run, port = 0, host = '127.0.0.1' }) {
  const root = realpathSync(path.resolve(run));
  const runName = path.basename(root);
  let boundPort = 0;
  const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };

  const server = http.createServer(async (req, res) => {
    try {
      // Refuse requests whose Host/Origin is not us: stops other web pages (or DNS tricks) from
      // writing the owner's answers.
      const own = `127.0.0.1:${boundPort}`;
      const hostOk = [own, `localhost:${boundPort}`].includes(req.headers.host || '');
      const origin = req.headers.origin;
      if (!hostOk || (origin && origin !== `http://${req.headers.host}`)) return send(res, 403, 'forbidden');

      const url = new URL(req.url, 'http://x');
      const p = url.pathname;

      if (req.method === 'PUT' && p === '/api/decisions') {
        const chunks = []; let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > MAX_BODY) return send(res, 413, 'too large');
          chunks.push(c);
        }
        let doc;
        try { doc = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, 'not json'); }
        const bad = validateDecisions(doc);
        if (bad) return send(res, 400, bad);
        // The server decides the run name and the time, so the file always matches its folder.
        const out = { run: runName, decidedAt: new Date().toISOString(), screens: doc.screens };
        const target = path.join(root, 'decisions.json');
        const tmp = target + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(out, null, 2) + '\n');
        await fs.rename(tmp, target); // atomic: a crash never leaves half a file
        return send(res, 200, JSON.stringify({ ok: true, decidedAt: out.decidedAt }), TYPES['.json']);
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
      if (p === '/api/info') return send(res, 200, JSON.stringify({ run: runName }), TYPES['.json']);

      let file = null;
      if (VIEWER_FILES[p]) file = path.join(VIEWER, VIEWER_FILES[p]);
      else if (p.startsWith('/run/')) file = resolveInRun(root, p.slice(5));
      if (!file) return send(res, 404, 'not found');

      // realpath again so a symlink inside the run folder cannot point outside it.
      let real;
      try { real = await fs.realpath(file); } catch { return send(res, 404, 'not found'); }
      const inViewer = file.startsWith(VIEWER + path.sep);
      if (!inViewer && real !== root && !real.startsWith(root + path.sep)) return send(res, 404, 'not found');
      const st = await fs.stat(real);
      if (!st.isFile()) return send(res, 404, 'not found');
      const type = TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      res.end(await fs.readFile(real));
    } catch (err) {
      send(res, 500, 'server error');
    }
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  boundPort = server.address().port;
  return { server, port: boundPort, url: `http://127.0.0.1:${boundPort}/`, root };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv[2];
  if (!run) { console.error('usage: node scripts/shoot/what-changed/serve.mjs <run folder>'); process.exit(2); }
  try { await fs.access(path.join(run, 'changes.json')); } catch {
    console.error(`[what-changed] ${run} has no changes.json — run the comparer first.`); process.exit(1);
  }
  const { url } = await startServer({ run });
  console.log(`[what-changed] ${url}`);
}
