// PROTOTYPE (experiment only, not tooling): same plans, same verification as shot.mjs,
// but ONE Chrome, a pool of isolated tabs, and "wait until the page is actually still"
// instead of fixed sleeps. Writes shot.mjs-shaped manifests so coverage.mjs can read them.
// usage: node fastshot.mjs <outDir> <themes,csv> <poolSize> <wbPort> <plan.json>...
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { CHROME_FLAGS, waitForCdp, selExpr, textExpr, rectOfExpr } from '/home/destin/youcoded-dev/worktrees/sessions/ui-review-infra/scripts/ui-review/cdp-helpers.mjs';

const [outDir, themeArg, poolArg, wbPort, ...planPaths] = process.argv.slice(2);
const THEMES = themeArg.split(','); const POOL = +poolArg; const CDP = 31000 + Math.floor(Math.random() * 900);
const SAME = 0.006; const T0 = Date.now();
const CHROMES = +(process.env.CHROMES ?? 1);
async function browser(k) {
  const port = CDP + k; const prof = mkdtempSync(join(tmpdir(), 'fs-'));
  const chrome = spawn('google-chrome-stable', CHROME_FLAGS(1440, 900, port, prof), { stdio: 'ignore' });
  process.on('exit', () => { chrome.kill(); try { rmSync(prof, { recursive: true, force: true }); } catch {} });
  await waitForCdp(port);
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => bws.onopen = r);
  let bid = 0; const bp = new Map(); const sessions = new Map();
  bws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && bp.has(m.id)) { const p = bp.get(m.id); bp.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.sessionId && sessions.has(m.sessionId)) sessions.get(m.sessionId)(m); };
  const bsend = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++bid; bp.set(i, { res, rej }); bws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { bsend, sessions };
}
const browsers = await Promise.all(Array.from({ length: CHROMES }, (_, k) => browser(k)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Shift: 16, Control: 17, Alt: 18, ' ': 32 };
const keyP = (k, modifiers = 0) => ({ key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : (k === 'Shift' ? 'ShiftLeft' : k), windowsVirtualKeyCode: KEY[k] ?? (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0), modifiers });
const PROBE = readFileSync('/home/destin/youcoded-dev/worktrees/sessions/ui-review-infra/scripts/ui-review/shot.mjs', 'utf8').match(/const PROBE = `([\s\S]*?)`;\n/)[1].replace(/\\\\/g, '\\');

// "Still" = no network request in flight, no finite animation running, two frames painted.
const STILL = `new Promise(res => { const t0 = performance.now(); const tick = () => {
  const busy = document.getAnimations().some(a => a.playState === 'running' && isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity));
  if ((!busy && (window.__inflight|0) === 0) || performance.now() - t0 > CAP) requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0))));
  else setTimeout(tick, 16); }; tick(); })`;
const INFLIGHT = `(() => { if (window.__inflightHooked) return; window.__inflightHooked = 1; window.__inflight = 0;
  const f = window.fetch; window.fetch = function(...a) { window.__inflight++; return f.apply(this, a).finally(() => window.__inflight--); }; })();`;

async function makeTab(i) {
  const { bsend, sessions } = browsers[i % CHROMES];
  const { browserContextId } = await bsend('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await bsend('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await bsend('Target.attachToTarget', { targetId, flatten: true });
  let errors = [];
  sessions.set(sessionId, m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? '?'); });
  const send = (m, p) => bsend(m, p, sessionId);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INFLIGHT });
  const evaluate = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value; };
  const still = async (cap) => { const r = await evaluate(STILL.replace("CAP", String(cap))).catch(() => -1); if (process.env.DBG) console.log("  still", r, "cap", cap, await evaluate(`JSON.stringify({inflight: window.__inflight, anims: document.getAnimations().filter(a => a.playState === "running").map(a => (a.animationName ?? a.transitionProperty ?? "?") + ":" + a.effect?.getComputedTiming?.().endTime).slice(0,4)})`).catch(() => "")); return r; };
  let themeScript = null;
  return {
    send, evaluate, still, resetErrors: () => { const e = errors; errors = []; return e; },
    async setViewport(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); },
    async setTheme(t) { if (themeScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeScript }); themeScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.clear();localStorage.setItem('youcoded-theme',${JSON.stringify(t)});}catch{}` })).identifier; },
    async png() { return Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'); },
  };
}
const rmse = (a, b) => new Promise(res => { const p = spawn('compare', ['-metric', 'RMSE', a, b, 'null:']); let s = ''; p.stderr.on('data', d => s += d); p.on('close', () => { const m = /\(([\d.]+)\)/.exec(s); res(m ? +m[1] : null); }); });

// Job list: every (plan, shot, theme).
const jobs = [];
for (const pp of planPaths) { const plan = JSON.parse(readFileSync(pp, 'utf8')); const name = basename(pp, '.json');
  if (process.env.CYCLE) { for (const s of plan.shots) jobs.push({ plan, name, theme: THEMES[0], s, rest: THEMES.slice(1) }); } else for (const theme of THEMES) for (const s of plan.shots) jobs.push({ plan, name, theme, s }); }
// Slow-to-paint themes first, so they don't all end up at the tail.
const W8 = { 'meadow-mist': 3, 'halftone-dimension': 2 }; jobs.sort((a, b) => (W8[b.theme] ?? 1) - (W8[a.theme] ?? 1));
const manifests = new Map(); const timings = [];
async function runActions(tab, actions) {
  const fails = [];
  for (const a of actions ?? []) {
    try {
      if (a.wait) { await sleep(a.wait); continue; }
      if (a.eval) await tab.evaluate(a.eval);
      else if (a.dispatch) await tab.evaluate(`window.dispatchEvent(new CustomEvent(${JSON.stringify(a.dispatch.name)}, { detail: ${JSON.stringify(a.dispatch.detail ?? null)} }))`);
      else if (a.scrollDialog !== undefined) { const ok = await tab.evaluate(`(() => { const root = document.querySelector('[role=dialog]') || document.body; const s = [...root.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a,b) => b.scrollHeight - a.scrollHeight)[0]; if (!s) return false; const v = ${JSON.stringify(a.scrollDialog)}; s.scrollTop = v === 'bottom' ? s.scrollHeight : v === 'top' ? 0 : Number(v); return true; })()`); if (!ok) fails.push('scrollDialog: no scrollable region'); }
      else if (a.click || a.clickText || a.hover || a.rightClick) {
        const expr = a.click ? selExpr(a.click) : a.hover ? selExpr(a.hover) : a.rightClick ? selExpr(a.rightClick) : textExpr(a.clickText, a.tag);
        // WAIT for the target (up to 3 s) instead of assuming a fixed settle made it appear.
        let r = null; for (const t = Date.now(); Date.now() - t < 3000;) { r = await tab.evaluate(rectOfExpr(expr)).catch(() => null); if (r) break; await sleep(50); }
        if (!r) { fails.push(`MISSING ${JSON.stringify(a.click ?? a.hover ?? a.rightClick ?? a.clickText)}`); continue; }
        const button = a.hover ? null : a.rightClick ? 'right' : 'left';
        await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
        if (button) { await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button, clickCount: 1 }); await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button, clickCount: 1 }); }
      }
      else if (a.keyDown || a.keyUp) { const k = a.keyDown ?? a.keyUp; await tab.send('Input.dispatchKeyEvent', { type: a.keyDown ? 'keyDown' : 'keyUp', ...keyP(k, a.modifiers ?? (k === 'Shift' ? 8 : 0)) }); }
      else if (a.key) { const p = keyP(a.key, a.modifiers ?? 0); await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); }
      else if (a.type) await tab.send('Input.insertText', { text: a.type });
      await sleep(60); await tab.still(a.settle ?? 400);
    } catch (e) { fails.push(`ERR ${JSON.stringify(a).slice(0, 80)}: ${e.message}`); }
  }
  return fails;
}
async function worker(tab) {
  let viewport = '1440x900';
  while (jobs.length) {
    const { plan, name, theme, s, rest = [] } = jobs.shift(); const t0 = Date.now();
    const tdir = join(outDir, `shots-${name}`, theme); mkdirSync(join(tdir, '_unverified'), { recursive: true });
    const entry = { theme, name: s.name, run: 'fast', verified: false, reasons: [], errors: [], contrastFails: [] };
    try {
      const vp = `${plan.width ?? 1440}x${plan.height ?? 900}`; if (vp !== viewport) { await tab.setViewport(plan.width ?? 1440, plan.height ?? 900); viewport = vp; }
      await tab.setTheme(theme); tab.resetErrors();
      const url = (s.url ?? plan.base).replace(/127\.0\.0\.1:\d+|localhost:\d+/, `127.0.0.1:${wbPort}`);
      await tab.send('Page.navigate', { url }); if (process.env.DBG) console.log('  t nav', Date.now() - t0);
      const READY = plan.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
      for (const t = Date.now(); Date.now() - t < 30000;) { if (await tab.evaluate(`!!(${READY})`).catch(() => false)) break; await sleep(25); }
      // Slow-IPC plans are ABOUT the wait (loading states): keep their fixed boot. Everyone else: wait for stillness.
      const slow = /latency=(\d+)/.exec(url); if (slow && +slow[1] >= 150) await sleep(s.boot ?? plan.boot ?? 3500); else await tab.still(s.boot ?? plan.boot ?? 3500);
      const preFails = await runActions(tab, plan.pre); if (process.env.DBG) console.log('  t boot', Date.now() - t0);
      const base = await tab.png(); if (process.env.DBG) console.log('  t pre', Date.now() - t0);
      const fails = [...preFails, ...(await runActions(tab, s.actions))]; if (process.env.DBG) console.log('  t basepng', Date.now() - t0);
      await tab.still(s.settle ?? 500); if (process.env.DBG) console.log('  t actions', Date.now() - t0);
      const png = await tab.png(); if (process.env.DBG) console.log('  t settle', Date.now() - t0);
      entry.reasons.push(...fails.filter(f => !f.startsWith('DUMP')));
      if (s.expect) { const ok = await tab.evaluate(`!!(${selExpr(s.expect)})`).catch(() => false); if (!ok) entry.reasons.push(`expect failed: ${s.expect}`); }
      const file = join(tdir, `${s.name}.png`); writeFileSync(file, png);
      if ((s.actions?.length ?? 0) > 0 && !s.sameAsBaseline) {
        let diff = base.equals(png) ? 0 : null;
        if (diff === null) { const bf = join(tdir, `_baseline-${s.name}.png`); writeFileSync(bf, base); diff = await rmse(bf, file); rmSync(bf); }
        entry.rmseVsBaseline = diff; if (diff !== null && diff < SAME) entry.reasons.push(`identical to baseline (rmse ${diff})`);
      }
      entry.verified = entry.reasons.length === 0; if (process.env.DBG) console.log('  t png+expect+rmse', Date.now() - t0);
      if (s.probe !== false && entry.verified) entry.contrastFails = JSON.parse(await tab.evaluate(PROBE));
      entry.errors = [...new Set(tab.resetErrors())].slice(0, 5); if (process.env.DBG) console.log('  t probe', Date.now() - t0);
      if (!entry.verified) { const d = join(tdir, '_unverified', `${s.name}.png`); renameSync(file, d); entry.file = d; } else entry.file = file;
    } catch (e) { entry.reasons.push('FAILED ' + e.message); }
    const key = `${name}|${theme}`; if (!manifests.has(key)) manifests.set(key, []); manifests.get(key).push(entry);
    // Live theme swap: the surface is already open and proven; repaint it in each other theme.
    for (const t2 of (entry.verified ? rest : [])) {
      const e2 = { ...entry, theme: t2, contrastFails: [], reasons: [] };
      try {
        const n = await tab.evaluate(`window.__workbenchAppearanceSync?.({ theme: ${JSON.stringify(t2)} }) ?? 0`);
        if (!n) e2.reasons.push('theme swap unavailable');
        await sleep(60); await tab.still(1500);
        if (s.expect && !(await tab.evaluate(`!!(${selExpr(s.expect)})`).catch(() => false))) e2.reasons.push(`expect failed after swap: ${s.expect}`);
        const d2 = join(outDir, `shots-${name}`, t2); mkdirSync(join(d2, '_unverified'), { recursive: true });
        const f2 = join(d2, e2.reasons.length ? '_unverified' : '', `${s.name}.png`); writeFileSync(f2, await tab.png()); e2.file = f2;
        e2.verified = !e2.reasons.length; if (e2.verified && s.probe !== false) e2.contrastFails = JSON.parse(await tab.evaluate(PROBE));
      } catch (e) { e2.reasons.push('FAILED ' + e.message); e2.verified = false; }
      const k2 = `${name}|${t2}`; if (!manifests.has(k2)) manifests.set(k2, []); manifests.get(k2).push(e2);
    }
    timings.push(Date.now() - t0);
    console.log(`${entry.verified ? 'ok  ' : 'MISS'} ${name}/${theme}/${s.name} ${Date.now() - t0}ms${entry.verified ? '' : ' — ' + entry.reasons.join('; ').slice(0, 140)}`);
  }
}
const tabs = await Promise.all(Array.from({ length: POOL }, (_, i) => makeTab(i)));
await Promise.all(tabs.map(worker));
for (const [k, list] of manifests) { const [name, theme] = k.split('|'); writeFileSync(join(outDir, `shots-${name}`, `manifest-${name}-${theme}-fast-${Date.now()}.json`), JSON.stringify(list, null, 2)); }
const all = [...manifests.values()].flat(); timings.sort((a, b) => a - b);
console.log(`\nFAST: ${all.filter(e => e.verified).length}/${all.length} verified in ${((Date.now() - T0) / 1000).toFixed(1)}s, pool ${POOL}, median shot ${timings[timings.length >> 1]}ms, p95 ${timings[Math.floor(timings.length * 0.95)]}ms`);
process.exit(0);
