// scripts/perf-lab/phone/probe.mjs — the page side of the phone speed lab, injected into the dev copy's page.
// Records, between start() and stop():
//   - every frame's gap (requestAnimationFrame), so dropped and slow frames can be counted against the screen's rate;
//   - long animation frames (the browser's own report of a frame that took >50 ms, with what filled it: script,
//     style and layout);
//   - every tap's response (Event Timing: from the finger to the next painted frame);
//   - when the thing a step waits for first showed (`waitShown`), measured from the step's first touch.
// It reads layout only to find what to tap (find) and what a step waits for — never text or pictures.
export const PROBE = String.raw`(() => {
  if (window.__plab) return 'already';
  const P = window.__plab = { on: false };
  let frames = [], loafs = [], events = [], lastT = 0, firstDown = null, shownAt = null;
  const tick = (t) => { if (!P.on) return; if (lastT) frames.push(t - lastT); lastT = t; requestAnimationFrame(tick); };
  try {
    new PerformanceObserver((l) => { if (P.on) for (const e of l.getEntries()) loafs.push({
      d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0),
      style: Math.round(e.styleAndLayoutStart ? (e.startTime + e.duration - e.styleAndLayoutStart) : 0),
      script: Math.round((e.scripts || []).reduce((a, s) => a + s.duration, 0)),
      top: (e.scripts || []).sort((a, b) => b.duration - a.duration).slice(0, 2).map((s) => (s.invoker || '') + ' ' + Math.round(s.duration) + 'ms'),
    }); }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) { P.noLoaf = true; }
  try {
    new PerformanceObserver((l) => { if (P.on) for (const e of l.getEntries()) events.push({
      name: e.name, d: Math.round(e.duration), delay: Math.round(e.processingStart - e.startTime),
      handlers: Math.round(e.processingEnd - e.processingStart),
    }); }).observe({ type: 'event', durationThreshold: 16, buffered: false });
  } catch (e) { P.noEvents = true; }
  addEventListener('pointerdown', () => { if (P.on && firstDown == null) firstDown = performance.now(); }, true);
  P.start = () => { frames = []; loafs = []; events = []; lastT = 0; firstDown = null; shownAt = null; P.on = true; requestAnimationFrame(tick); return true; };
  P.stop = () => { P.on = false; return { frames: frames.map((x) => Math.round(x * 10) / 10), loafs, events,
    shownMs: firstDown != null && shownAt != null ? Math.round(shownAt - firstDown) : null }; };
  // The smallest visible element matching a CSS selector and/or whose own label or text matches 'text' (a regex).
  P.find = (sel, text) => {
    const re = text ? new RegExp('^(?:' + text + ')$', 'i') : null;
    const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > innerHeight) return false;
      const h = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
      return h && (e === h || e.contains(h) || h.contains(e)); };
    const all = [...document.querySelectorAll(sel || 'button,[role=button],[role=menuitem],[role=tab],[role=separator],a,label,[aria-label]')]
      .filter((e) => (!re || re.test((e.getAttribute('aria-label') || e.innerText || '').trim())) && vis(e));
    if (!all.length) return null;
    const e = all.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, dpr: devicePixelRatio };
  };
  // Resolves (true) on the first painted frame after 'sel' (and 'text') is visible; false after 'ms'.
  P.waitShown = (sel, text, ms) => new Promise((res) => {
    const t0 = performance.now();
    const poll = () => {
      if (P.find(sel, text)) { requestAnimationFrame(() => { shownAt = performance.now(); res(true); }); return; }
      if (performance.now() - t0 > ms) { res(false); return; }
      requestAnimationFrame(poll);
    };
    poll();
  });
  return 'installed';
})()`;
