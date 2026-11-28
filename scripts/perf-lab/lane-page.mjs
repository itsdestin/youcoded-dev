// scripts/perf-lab/lane-page.mjs — the in-page helper for lane-run.mjs (menus and chat switching).
//
// `lanePage` is injected with `(${lanePage})()` and must stay SELF-CONTAINED (it runs inside the app's window).
// It is deliberately thin and passive, like realism-page.mjs: it finds the thing to press, remembers when the press
// happened (the browser's own event timestamp) and, after the press, watches for the result with requestAnimationFrame.
// The press itself is a real mouse press sent over the debugging protocol by lane-run.mjs, never el.click(), so the page's
// Event Timing recorder sees it as a person's press.
//
// Every finder returns null when it cannot find its target. lane-run reports that as "could not open", never as a fast result:
// the app's markup changes between builds and a missing menu must read as missing, not as zero milliseconds.
export function lanePage() {
  const L = (window.__lane = window.__lane || {});
  // The browser timestamp of the most recent pointer press: the start of every "press to result" measure.
  L.t0 = 0;
  if (!L.listening) {
    window.addEventListener('pointerdown', (e) => { L.t0 = e.timeStamp; }, { capture: true, passive: true });
    L.listening = true;
  }
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  const firstVisible = (list) => [...list].find(visible) || null;

  // What each menu is, how to find the thing to press and how to tell it is open. The strip's "All sessions" arrow has no label,
  // so it is recognised by its chevron drawing; the model chip carries data-model-chip; the ||| button has aria-label "Open menu".
  const MENUS = {
    session: {
      // Document-wide, but only buttons in the header band (the folder list uses the same chevron further down the page).
      trigger: () => firstVisible([...document.querySelectorAll('button')].filter((b) => b.querySelector('svg path[d="M19 9l-7 7-7-7"]') && b.getBoundingClientRect().top < 90)),
      open: () => !!document.querySelector('.session-menu'),
    },
    model: {
      trigger: () => firstVisible(document.querySelectorAll('[data-model-chip]')),
      open: () => !!document.querySelector('[aria-label="Model"], [aria-label="Model and effort"]'),
    },
    main: {
      trigger: () => firstVisible(document.querySelectorAll('button[aria-label="Open menu"]')),
      open: () => !!document.querySelector('[role="menu"]'),
    },
    // The folder picker lives inside the session menu's new-session form: its trigger is a button in the open menu that,
    // when pressed, shows the folder list (data-folder-switcher-portal). Found by trying each button once (probe).
    folder: {
      trigger: () => { const menu = document.querySelector('.session-menu'); if (!menu) return null; return L.folderTrigger && visible(L.folderTrigger) ? L.folderTrigger : null; },
      open: () => !!document.querySelector('[data-folder-switcher-portal]'),
    },
  };
  L.menuNames = Object.keys(MENUS);
  L.box = (name) => { const m = MENUS[name]; const el = m && m.trigger(); return el ? centre(el) : null; };
  L.isOpen = (name) => !!MENUS[name] && MENUS[name].open();
  // Find the folder-picker trigger: press each button in the open session menu in turn until the folder list appears.
  L.probeFolder = async () => {
    const menu = document.querySelector('.session-menu');
    if (!menu) return false;
    const buttons = [...menu.querySelectorAll('button, [role="button"]')].filter(visible);
    for (const b of buttons) {
      b.click();
      await new Promise((r) => setTimeout(r, 250));
      if (document.querySelector('[data-folder-switcher-portal]')) { L.folderTrigger = b; b.click(); await new Promise((r) => setTimeout(r, 250)); return true; }
    }
    return false;
  };
  // After a press: ms from the press to "open AND painted" (two animation frames after it first reads open). null = never opened.
  const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  L.opened = (name, timeoutMs = 4000) => new Promise((resolve) => {
    const start = performance.now();
    const tick = async () => {
      if (L.isOpen(name)) { await twoFrames(); return resolve(Math.round((performance.now() - L.t0) * 10) / 10); }
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
  L.closed = (name, timeoutMs = 3000) => new Promise((resolve) => {
    const start = performance.now();
    const tick = () => { if (!L.isOpen(name)) return resolve(true); if (performance.now() - start > timeoutMs) return resolve(false); setTimeout(tick, 50); };
    tick();
  });
  // Switching chats: ms from the press to the target chat being the visible one for two frames in a row. null = never.
  L.visibleAfter = (id, timeoutMs = 4000) => new Promise((resolve) => {
    const start = performance.now();
    const shown = () => { const el = document.querySelector('[data-chat-session-id="' + id + '"]'); return !!el && !el.hasAttribute('aria-hidden'); };
    const tick = async () => {
      if (shown()) { await twoFrames(); if (shown()) return resolve(Math.round((performance.now() - L.t0) * 10) / 10); }
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
  L.now = () => performance.now();
  L.epochNow = () => performance.timeOrigin + performance.now();
  return true;
}
