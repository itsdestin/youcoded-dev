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
export const selExpr = (s) => s.startsWith('js:') ? `(${s.slice(3)})` : `document.querySelector(${JSON.stringify(s)})`;

// Finds the smallest element whose own text exactly matches `t` (optionally
// scoped to a tag/selector list) — used for {"clickText": "Label"} actions
// where there's no stable CSS hook.
export const textExpr = (t, tag) => `[...document.querySelectorAll(${JSON.stringify(tag ?? 'button,a,[role=button],[role=tab],[role=menuitem],[role=option],label,span,div,h1,h2,h3,p,li')})].filter(e => e.offsetParent !== null && e.textContent.trim() === ${JSON.stringify(t)}).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0]`;

// Wraps a selector expression (from selExpr/textExpr) into JS that resolves
// the element's centre point + size in window pixels, or null if missing.
export const rectOfExpr = (expr) => `(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}; })()`;
