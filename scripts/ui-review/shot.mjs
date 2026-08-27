#!/usr/bin/env node
// Self-verifying screenshot driver for autonomous UI reviews.
//
// Drives the REAL renderer over raw Chrome DevTools Protocol — either the UI
// Workbench in a throw-away headless Chrome (default) or an already-running
// Electron dev instance (ATTACH_PORT=<port> after launching electron with
// --remote-debugging-port=<port>). No puppeteer/playwright dependency.
//
// WHY IT VERIFIES ITSELF: on 2026-08-25 the first version of this rig filed
// 40 screenshots of the plain chat window under labels like "context menu"
// because a click missed and nothing noticed. A screenshot is only evidence if
// the surface actually opened, so every shot now has to prove it did:
//   1. every action's target must exist (a MISSING selector fails the shot);
//   2. an optional `expect` selector/JS must be truthy after the actions;
//   3. the result must differ from the post-boot baseline (ImageMagick RMSE),
//      unless the shot says `sameAsBaseline: true` on purpose.
// Failed shots are written to <outDir>/<theme>/_unverified/ so the montage and
// gallery steps never see them, and the run ends with a coverage summary.
//
// Usage:
//   node shot.mjs <plan.json> <outDir> [themes,comma,list]
//   CDP_PORT=9981    port for the throw-away Chrome (default 9978)
//   ATTACH_PORT=9299 attach to an Electron instance instead of spawning Chrome
//
// plan.json:
//   { "base": "<url>", "boot": 3500, "width": 1440, "height": 900,
//     "pre": [ ...actions run after every boot... ],
//     "shots": [ { "name": "x", "url": "<override>", "boot": 5000,
//                  "actions": [ ... ], "expect": "<selector or js:expr>",
//                  "sameAsBaseline": false, "probe": true } ] }
// actions:
//   {"click": "<css or js:expr returning an element>"}   real mouse click at its centre
//   {"clickText": "Exact label", "tag": "button"}         click the smallest element with that text
//   {"rightClick": "<css or js:>"}                        real right-button click
//   {"hover": "<css or js:>"}                             move the mouse there
//   {"keyDown": "Shift"} / {"keyUp": "Shift"} / {"key": "Escape", "modifiers": 2}
//   {"type": "text"}                                      insert text at the focus
//   {"eval": "js"}                                        run JS in the page
//   {"dispatch": {"name": "buddy:attach-file", "detail": {...}}}  window CustomEvent
//   {"scrollDialog": "bottom"|"top"|<px>}                 scroll the open dialog's body
//   {"wait": 500}                                         pause (ms); every action accepts "settle"
//   shot-level: "measure": ["<css or js:>", {"text": "Label", "tag": "button"}]
//     → entry.measures[key] = {x,y,w,h} in window pixels (key = the css string or "text:<Label>");
//       a missing element is recorded as null AND fails the shot, because a review deck asked for it.
//   UI_REVIEW_RUN=<id>  stamped on every entry as `run` (coverage.mjs merges by it — hand-off gap 6)
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [planPath, outDir, themeArg] = process.argv.slice(2);
if (!planPath || !outDir) { console.error('usage: node shot.mjs <plan.json> <outDir> [themes]'); process.exit(2); }
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
// SHARD=k/n runs every n-th shot starting at k, so run-review.sh can spread one plan
// over many Chrome processes: the sweep is wall-clock bound (each shot pays a fixed
// page-boot wait), not CPU bound — 18 processes left a 32-core box 85% idle.
const [SHARD_K, SHARD_N] = (process.env.SHARD ?? '0/1').split('/').map(Number);
plan.shots = plan.shots.filter((_, i) => i % SHARD_N === SHARD_K);
const THEMES = (themeArg ?? 'midnight').split(',');
const CDP_PORT = Number(process.env.CDP_PORT ?? 9978);
// Plans hardcode the workbench default (127.0.0.1:5233); WB_PORT points them at the
// server run-review.sh actually started for this worktree.
const WB_PORT = process.env.WB_PORT;
const wb = (u) => (WB_PORT && u ? u.replace('127.0.0.1:5233', `127.0.0.1:${WB_PORT}`) : u);
const ATTACH = process.env.ATTACH_PORT ? Number(process.env.ATTACH_PORT) : 0;
const PORT = ATTACH || CDP_PORT;
const W = plan.width ?? 1440, H = plan.height ?? 900;
const SAME_THRESHOLD = plan.sameThreshold ?? 0.006; // RMSE (0..1) below which two shots count as identical
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'ui-review-'));
const proc = ATTACH ? null : spawn('google-chrome-stable', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--window-size=${W},${H}`, '--force-device-scale-factor=1',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const cleanup = () => { if (proc) proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanup);

async function waitForCdp() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`CDP endpoint on ${PORT} never came up`);
}

// RMSE between two PNGs via ImageMagick; null if compare is unavailable.
function rmse(a, b) {
  const r = spawnSync('compare', ['-metric', 'RMSE', a, b, 'null:'], { encoding: 'utf8' });
  const m = /\(([\d.]+)\)/.exec(r.stderr ?? '');
  return m ? Number(m[1]) : null;
}

// Painted-pixel contrast probe: for each visible element with its own text,
// measure the computed colour against the first opaque ancestor background.
const PROBE = `(() => {
  const lum = (r,g,b) => { const f = c => { c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const parse = s => { const m = s && s.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const p = m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const blend = (top, under) => ({ r: top.r*top.a+under.r*(1-top.a), g: top.g*top.a+under.g*(1-top.a), b: top.b*top.a+under.b*(1-top.a), a: 1 });
  const bgOf = el => { let cur = el; let acc = null; while (cur && cur !== document) { const cs = getComputedStyle(cur); const c = parse(cs.backgroundColor); if (c && c.a > 0) { acc = acc ? blend(acc, c) : c; if (acc.a >= 0.999 || c.a >= 0.999) return acc; } if (cs.backgroundImage && cs.backgroundImage !== 'none' && !acc) return null; cur = cur.parentElement; } return acc ? blend(acc, {r:255,g:255,b:255,a:1}) : null; };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT','STYLE','SVG','PATH','CANVAS','IFRAME','TEXTAREA','INPUT'].includes(el.tagName)) continue;
    let txt = ''; for (const n of el.childNodes) if (n.nodeType===3) txt += n.textContent;
    txt = txt.trim(); if (!txt) continue;
    const rect = el.getBoundingClientRect(); if (rect.width < 2 || rect.height < 2) continue;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) continue;
    const cs = getComputedStyle(el); if (cs.visibility==='hidden' || cs.display==='none' || Number(cs.opacity)===0) continue;
    let anc = el, hidden=false; while (anc && anc !== document.body) { const a = getComputedStyle(anc); if (Number(a.opacity)===0 || a.visibility==='hidden') { hidden=true; break; } anc = anc.parentElement; } if (hidden) continue;
    const fgRaw = parse(cs.color); if (!fgRaw) continue;
    const bg = bgOf(el); if (!bg) continue;
    const fg = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;
    const L1 = lum(fg.r,fg.g,fg.b), L2 = lum(bg.r,bg.g,bg.b);
    const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight,10) >= 700;
    const need = (size >= 18.66 || (bold && size >= 14)) ? 3 : 4.5;
    if (ratio < need) {
      const path = []; let p = el; for (let i=0;i<4 && p && p!==document.body;i++){ path.unshift(p.tagName.toLowerCase() + (typeof p.className==='string' && p.className ? '.'+p.className.trim().split(/\\s+/).slice(0,3).join('.') : '')); p = p.parentElement; }
      out.push({ text: txt.slice(0,60), ratio: Math.round(ratio*100)/100, need, size, fg: cs.color, bg: 'rgb('+Math.round(bg.r)+','+Math.round(bg.g)+','+Math.round(bg.b)+')', path: path.join(' > '), x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) });
    }
  }
  return JSON.stringify(out);
})()`;

const KEYCODES = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Shift: 16, Control: 17, Alt: 18, ' ': 32 };
const keyParams = (k, modifiers = 0) => ({ key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : (k === 'Shift' ? 'ShiftLeft' : k), windowsVirtualKeyCode: KEYCODES[k] ?? (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0), modifiers });

async function session(theme) {
  let target;
  if (ATTACH) {
    const list = await (await fetch(`http://127.0.0.1:${ATTACH}/json/list`)).json();
    target = list.find(t => t.type === 'page' && !/devtools|buddy/.test(t.url)) ?? list[0];
    if (!target) throw new Error('no page target on ' + ATTACH);
  } else {
    target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '?');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (!ATTACH) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(theme)});}catch{}` });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value; };
  const selExpr = (s) => s.startsWith('js:') ? `(${s.slice(3)})` : `document.querySelector(${JSON.stringify(s)})`;
  const textExpr = (t, tag) => `[...document.querySelectorAll(${JSON.stringify(tag ?? 'button,a,[role=button],[role=tab],[role=menuitem],[role=option],label,span,div,h1,h2,h3,p,li')})].filter(e => e.offsetParent !== null && e.textContent.trim() === ${JSON.stringify(t)}).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0]`;
  const rectOf = async (expr) => evaluate(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}; })()`);
  const mouse = async (x, y, button) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    if (!button) return;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // Runs actions; returns the list of failures (a non-empty list = unverified).
  const run = async (actions) => {
    const fails = [];
    for (const a of actions ?? []) {
      try {
        if (a.wait) { await sleep(a.wait); continue; }
        if (a.eval) { await evaluate(a.eval); }
        else if (a.dispatch) { await evaluate(`window.dispatchEvent(new CustomEvent(${JSON.stringify(a.dispatch.name)}, { detail: ${JSON.stringify(a.dispatch.detail ?? null)} }))`); }
        else if (a.scrollDialog !== undefined) {
          const ok = await evaluate(`(() => { const root = document.querySelector('[role=dialog]') || document.body; const s = [...root.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a,b) => b.scrollHeight - a.scrollHeight)[0]; if (!s) return false; const v = ${JSON.stringify(a.scrollDialog)}; s.scrollTop = v === 'bottom' ? s.scrollHeight : v === 'top' ? 0 : Number(v); return true; })()`);
          if (!ok) fails.push(`scrollDialog: no scrollable region`);
        }
        else if (a.click || a.clickText || a.hover || a.rightClick) {
          const expr = a.click ? selExpr(a.click) : a.hover ? selExpr(a.hover) : a.rightClick ? selExpr(a.rightClick) : textExpr(a.clickText, a.tag);
          const r = await rectOf(expr);
          if (!r) { fails.push(`MISSING ${JSON.stringify(a.click ?? a.hover ?? a.rightClick ?? a.clickText)}`); continue; }
          await mouse(r.x, r.y, a.hover ? null : a.rightClick ? 'right' : 'left');
        }
        else if (a.keyDown || a.keyUp) { const k = a.keyDown ?? a.keyUp; await send('Input.dispatchKeyEvent', { type: a.keyDown ? 'keyDown' : 'keyUp', ...keyParams(k, a.modifiers ?? (k === 'Shift' ? 8 : 0)) }); }
        else if (a.key) { const p = keyParams(a.key, a.modifiers ?? 0); await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); }
        else if (a.type) { await send('Input.insertText', { text: a.type }); }
        else if (a.dump) { const d = await evaluate(`[...document.querySelectorAll('button,[role=button],[role=tab],[role=menuitem],a,select,input,textarea')].filter(e=>e.offsetParent!==null).map(e=>{const r=e.getBoundingClientRect();return [e.tagName.toLowerCase(), e.getAttribute('aria-label')||'', e.getAttribute('title')||'', e.textContent.trim().slice(0,40), Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)].join(' | ')}).join('\\n')`); fails.push('DUMP\n' + d); }
        await sleep(a.settle ?? 400);
      } catch (e) { fails.push(`ERR ${JSON.stringify(a).slice(0, 80)}: ${e.message}`); }
    }
    return fails;
  };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); };
  const probe = async () => JSON.parse(await evaluate(PROBE));
  const close = async () => { try { ws.close(); if (!ATTACH) await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${target.id}`); } catch { /* gone */ } };
  return { send, evaluate, run, shot, probe, errors, close, selExpr, textExpr };
}

await waitForCdp();
const manifest = [];
const summary = { verified: 0, unverified: [] };
for (const theme of THEMES) {
  const tdir = join(outDir, theme); mkdirSync(join(tdir, '_unverified'), { recursive: true });
  for (const s of plan.shots) {
    const sess = await session(theme);
    // run stamps UI_REVIEW_RUN on every entry so coverage.mjs can merge manifests from one sweep (hand-off gap 6).
    const entry = { theme, name: s.name, run: process.env.UI_REVIEW_RUN ?? null, verified: false, reasons: [], errors: [], contrastFails: [] };
    try {
      if (ATTACH) { await sess.evaluate(`localStorage.setItem('youcoded-theme', ${JSON.stringify(theme)})`); await sess.send('Page.reload'); }
      else await sess.send('Page.navigate', { url: wb(s.url ?? plan.base) });
      // Readiness poll BEFORE the fixed boot wait: with 24 Chromes loading at once the
      // renderer can take longer than the boot wait just to paint its first frame, and a
      // fixed wait then produces honest-but-useless misses ("MISSING [title=Settings]" in
      // 7 surfaces × 6 themes on the first full sharded sweep, 2026-08-25). The poll
      // waits for the app to have painted real text, then the plan's boot wait still
      // applies on top for data fetches and animations.
      const READY = plan.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
      for (const t0 = Date.now(); Date.now() - t0 < (plan.readyMax ?? 30000);) {
        if (await sess.evaluate(`!!(${READY})`).catch(() => false)) break;
        await new Promise(r => setTimeout(r, 250));
      }
      await new Promise(r => setTimeout(r, s.boot ?? plan.boot ?? 3500));
      const preFails = await sess.run(plan.pre);
      const baseline = join(tdir, `_baseline-${s.name}.png`);
      await sess.shot(baseline);
      const fails = [...preFails.filter(f => !f.startsWith('DUMP')), ...(await sess.run(s.actions))];
      const dumps = fails.filter(f => f.startsWith('DUMP')); const realFails = fails.filter(f => !f.startsWith('DUMP'));
      await new Promise(r => setTimeout(r, s.settle ?? 500));
      const file = join(tdir, `${s.name}.png`);
      await sess.shot(file);
      // Measure named elements for the review deck (spec §4.2): same DOM the screenshot shows.
      if (Array.isArray(s.measure)) {
        entry.measures = {};
        for (const m of s.measure) {
          const key = typeof m === 'string' ? m : `text:${m.text}`;
          const expr = typeof m === 'string' ? sess.selExpr(m) : sess.textExpr(m.text, m.tag);
          entry.measures[key] = await sess.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`).catch(() => null);
          if (!entry.measures[key]) entry.reasons.push(`measure missing: ${key}`);
        }
      }
      // --- verification ---
      entry.reasons.push(...realFails);
      if (s.expect) {
        const ok = await sess.evaluate(`!!(${sess.selExpr(s.expect)})`).catch(() => false);
        if (!ok) entry.reasons.push(`expect failed: ${s.expect}`);
      }
      const diff = rmse(baseline, file);
      entry.rmseVsBaseline = diff;
      if ((s.actions?.length ?? 0) > 0 && !s.sameAsBaseline && diff !== null && diff < SAME_THRESHOLD) entry.reasons.push(`identical to baseline (rmse ${diff})`);
      entry.verified = entry.reasons.length === 0;
      entry.dump = dumps.map(d => d.slice(5));
      if (s.probe !== false && entry.verified) { try { entry.contrastFails = await sess.probe(); } catch (e) { entry.reasons.push('probe failed: ' + e.message); } }
      entry.errors = [...new Set(sess.errors)].slice(0, 5);
      if (!entry.verified) { const dest = join(tdir, '_unverified', `${s.name}.png`); renameSync(file, dest); entry.file = dest; summary.unverified.push(`${theme}/${s.name}: ${entry.reasons.join('; ')}`); }
      else { entry.file = file; summary.verified += 1; }
      try { rmSync(baseline); } catch { /* keep going */ }
      console.log(`${entry.verified ? 'ok  ' : 'MISS'} ${theme}/${s.name}${entry.verified ? ` (${entry.contrastFails.length} contrast fails)` : ' — ' + entry.reasons.join('; ').slice(0, 160)}${entry.errors.length ? ` | ${entry.errors.length} js errors` : ''}`);
    } catch (e) {
      entry.reasons.push('FAILED ' + e.message); summary.unverified.push(`${theme}/${s.name}: ${e.message}`);
      console.log(`FAIL ${theme}/${s.name}: ${e.message}`);
    } finally { await sess.close(); manifest.push(entry); }
  }
}
// Unique per run (plan + themes + time) so a targeted re-run never clobbers an
// earlier manifest — coverage.mjs merges them oldest-first.
const mf = join(outDir, `manifest-${planPath.split('/').pop().replace(/\.json$/, '')}-${THEMES.join('-')}-s${SHARD_K}of${SHARD_N}-${Date.now()}.json`);
writeFileSync(mf, JSON.stringify(manifest, null, 2));
console.log(`\n${summary.verified}/${manifest.length} shots verified. Manifest: ${mf}`);
if (summary.unverified.length) { console.log('Unverified (moved to _unverified/):'); for (const u of summary.unverified) console.log('  ' + u); }
process.exit(0);
