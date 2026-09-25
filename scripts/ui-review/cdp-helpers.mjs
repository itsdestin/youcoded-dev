// Shared CDP plumbing for the UI review tools.
//
// WHY THIS FILE EXISTS: shot.mjs (screenshots) and record.mjs (scripted-scene
// video) both drive headless Chrome over raw DevTools Protocol and need the
// exact same browser flags, boot-wait, and selector-to-JS translation — if
// they drifted (e.g. one forgot the primaryHoverType flags below), a shot
// and a recording of the "same" surface could disagree about what's visible.
// Keeping these in one file means a fix here fixes both call sites at once.

// Argv for spawning throw-away headless Chrome, pointed at its own CDP port
// and scratch profile directory so multiple instances never collide.
export function CHROME_FLAGS(W, H, cdpPort, profileDir) {
  return [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    // Headless Chrome has NO input device, so it answers `(hover: none)` and
    // `(pointer: coarse)` — it looks like a phone to CSS. Anything gated on a real
    // cursor then never renders, and the shot lands in _unverified with a
    // misleading "MISSING" instead of a wrong picture (found 2026-08-27: the
    // artifact viewer's magnifier button was invisible to the rig for this reason).
    // These are Blink's own enums: hover=2 (HoverTypeHover), pointer=4
    // (PointerTypeFine). CDP's Emulation.setEmulatedMedia does NOT cover these two
    // features — it only knows the prefers-* family — so the flags are the only way.
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    `--window-size=${W},${H}`, '--force-device-scale-factor=1',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
  ];
}

// Polls the CDP HTTP endpoint until Chrome answers or gives up.
export async function waitForCdp(port) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`CDP endpoint on ${port} never came up`);
}

// Selector -> JS expression the page can Runtime.evaluate. `js:...` passes an
// arbitrary expression through (wrapped so it can be a bare object literal);
// anything else becomes a querySelector call.
// A `[title…]` selector that finds nothing retries as `[data-hint…]`. WHY (2026-09-10): the app's
// hover hints (ui/Tooltip.tsx) moved every hinted control's words from title= to data-hint=, and
// 8 of 15 promo scenes plus most landing loops died on MISSING at once — a README lesson ("scenes
// rot against the app") had not prevented it, so the recorder now tolerates that rename itself.
export const selExpr = (s) => {
  if (s.startsWith('js:')) return `(${s.slice(3)})`;
  const hinted = s.replaceAll('[title', '[data-hint');
  return hinted === s
    ? `document.querySelector(${JSON.stringify(s)})`
    : `(document.querySelector(${JSON.stringify(s)}) ?? document.querySelector(${JSON.stringify(hinted)}))`;
};

// Finds the smallest element whose own text exactly matches `t` (optionally
// scoped to a tag/selector list) — used for {"clickText": "Label"} actions
// where there's no stable CSS hook.
export const textExpr = (t, tag) => `[...document.querySelectorAll(${JSON.stringify(tag ?? 'button,a,[role=button],[role=tab],[role=menuitem],[role=option],label,span,div,h1,h2,h3,p,li')})].filter(e => e.offsetParent !== null && e.textContent.trim() === ${JSON.stringify(t)}).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0]`;

// Wraps a selector expression (from selExpr/textExpr) into JS that resolves
// the element's centre point + size in window pixels, or null if missing.
export const rectOfExpr = (expr) => `(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}; })()`;

// Painted-pixel contrast probe: for each visible element with its own text,
// measure the computed colour against the first opaque ancestor background.
// Returns a JSON string of the failures. Used by shot.mjs and scripts/shoot/.
export const CONTRAST_PROBE = `(() => {
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
