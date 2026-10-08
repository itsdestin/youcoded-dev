// scripts/perf-lab/switch-page.mjs — the in-page recorder for switch-pingpong.mjs.
//
// `pageRecorder` is a real function (so it is syntax-checked and lint-able) that the runner injects with
// `(${pageRecorder})()`. It must stay SELF-CONTAINED: it runs inside the app's window, not in Node.
//
// WHY it records raw lists and decides nothing: every verdict (shown, settled, wrong pane) is made later by
// switch-analysis.mjs from these lists, so the verdicts are unit-testable and the page does the least work possible.
// It never reads layout (no getBoundingClientRect / innerText / offsetHeight): a probe that forces layout charges
// the app for its own cost (README, "A probe that reads layout charges the app for its own cost").
//
// Recorded (all times are the page's performance.now()):
//   ft/fv   every animation frame's time, and which pane was visible at that frame (session index, -1 none)
//   ev      input events seen in the capture phase: [type, handlerNow, event.timeStamp, pillSessionId, key, activeTag, clientX]
//   mu      DOM mutation callbacks per pane: [now, paneIdx, recordCount]
//   ls      layout shifts: [startTime, value, paneIdx|-1]
//   loaf    long animation frames: [startTime, duration, blockingDuration, [top scripts]]
//   lt      long tasks: [startTime, duration]
//   tail    terminal view: the visible-end text of a watched terminal changed: [now, sessionIdx]
//   po      terminal view: pty output reached the page for a watched terminal: [now, sessionIdx, chars]
//   ac      terminal view: the shared glyph-atlas clear counter changed: [now, count]
export function pageRecorder() {
  const S = (window.__sw = { R: null, lastVis: -1, echo: null, stop: null });

  // Which pane is visible. chat: the first chat root without aria-hidden. terminal: the first terminal wrapper
  // without the terminal-hidden class, mapped through ptyIdx (the session indices that have a terminal, in DOM order).
  S.vis = (mode, ids, ptyIdx, roots) => {
    if (mode === 'chat') {
      for (let i = 0; i < roots.length; i++) { const r = roots[i]; if (r && !r.hasAttribute('aria-hidden')) return i; }
      return -1;
    }
    const w = document.querySelectorAll('.terminal-overlay-scroll');
    for (let k = 0; k < w.length; k++) if (!w[k].classList.contains('terminal-hidden')) return k < ptyIdx.length ? ptyIdx[k] : -2;
    return -1;
  };
  S.chatRoots = (ids) => ids.map((id) => document.querySelector('[data-chat-session-id="' + id + '"]'));
  S.visNow = (mode, ids, ptyIdx) => S.vis(mode, ids, ptyIdx, mode === 'chat' ? S.chatRoots(ids) : null);
  const lastLine = (id) => {
    const t = (window.__terminalRegistry && window.__terminalRegistry.getScreenText(id, 3)) || '';
    const lines = t.split('\n').filter((l) => l.trim().length);
    return lines.length ? lines[lines.length - 1].replace(/\s+$/, '') : '';
  };
  S.lastLineLen = (id) => lastLine(id).length;
  S.activeTag = () => (document.activeElement ? document.activeElement.tagName : '');

  S.install = (cfg) => {
    if (S.stop) S.stop();
    const ids = cfg.ids, mode = cfg.mode, ptyIdx = cfg.ptyIdx || [], watch = cfg.watch || [];
    const R = { ft: [], fv: [], ev: [], mu: [], ls: [], loaf: [], lt: [], tail: [], po: [], ac: [], flags: {}, t0: performance.now(), lastAc: undefined };
    S.R = R; S.echo = null; S.lastVis = -1;
    const cleanups = [];
    let raf = 0, alive = true;
    const chatRoots = mode === 'chat' ? S.chatRoots(ids) : null;
    const sigs = {};
    const tick = () => {
      if (!alive) return;
      const now = performance.now();
      const v = S.vis(mode, ids, ptyIdx, chatRoots);
      R.ft.push(now); R.fv.push(v); S.lastVis = v;
      if (mode === 'terminal' && window.__terminalRegistry) {
        for (let k = 0; k < watch.length; k++) {
          const i = watch[k];
          const t = window.__terminalRegistry.getScreenText(ids[i], 3) || '';
          const sig = t.length + ':' + t.slice(-48);
          if (sigs[i] !== sig) { if (sigs[i] !== undefined) R.tail.push([now, i]); sigs[i] = sig; }
        }
        const ac = window.__terminalRegistry.atlasClears;
        if (R.lastAc !== ac) { R.ac.push([now, ac]); R.lastAc = ac; }
        const e = S.echo;
        if (e && e.t === null) { const l = lastLine(ids[e.idx]); if (l.length > e.base && l.endsWith(e.ch)) e.t = now; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onEv = (e) => {
      const t = e.target;
      const pill = t && t.closest ? t.closest('[data-session-id]') : null;
      R.ev.push([e.type, performance.now(), e.timeStamp, pill ? pill.getAttribute('data-session-id') : '', e.key || '', document.activeElement ? document.activeElement.tagName : '', e.clientX === undefined ? 0 : e.clientX]);
    };
    const kinds = ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input', 'wheel'];
    kinds.forEach((k) => window.addEventListener(k, onEv, { capture: true, passive: true }));
    cleanups.push(() => kinds.forEach((k) => window.removeEventListener(k, onEv, true)));

    // One observer per pane so the callback knows which pane changed without searching for it.
    const roots = mode === 'chat' ? chatRoots : Array.prototype.slice.call(document.querySelectorAll('.terminal-overlay-scroll')).map((w, k) => ({ w, idx: ptyIdx[k] }));
    roots.forEach((r, k) => {
      const el = mode === 'chat' ? r : r.w, idx = mode === 'chat' ? k : r.idx;
      if (!el) return;
      const o = new MutationObserver((recs) => { R.mu.push([performance.now(), idx, recs.length]); });
      o.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
      cleanups.push(() => o.disconnect());
    });

    const observe = (type, onEntries, key) => {
      try {
        if (!(PerformanceObserver.supportedEntryTypes || []).includes(type)) { R.flags[key] = 'unsupported'; return; }
        const o = new PerformanceObserver((l) => onEntries(l.getEntries()));
        o.observe({ type, buffered: false });
        R.flags[key] = 'on';
        cleanups.push(() => o.disconnect());
      } catch (err) { R.flags[key] = 'error: ' + (err && err.message); }
    };
    observe('layout-shift', (es) => es.forEach((e) => {
      let paneIdx = -1;
      try { const n = e.sources && e.sources[0] && e.sources[0].node; const root = n && n.closest ? n.closest('[data-chat-session-id]') : null; if (root) paneIdx = ids.indexOf(root.getAttribute('data-chat-session-id')); } catch (err) { /* node gone */ }
      R.ls.push([e.startTime, e.value, paneIdx]);
    }), 'layoutShift');
    observe('long-animation-frame', (es) => es.forEach((e) => {
      const sc = (e.scripts || []).map((s) => [s.invoker || s.name || '', Math.round(s.duration), s.sourceFunctionName || '', (s.sourceURL || '').split('/').pop() + ':' + (s.sourceCharPosition === undefined ? '' : s.sourceCharPosition)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      R.loaf.push([e.startTime, e.duration, e.blockingDuration || 0, sc]);
    }), 'longAnimationFrame');
    observe('longtask', (es) => es.forEach((e) => R.lt.push([e.startTime, e.duration])), 'longtask');

    if (mode === 'terminal') {
      for (let k = 0; k < watch.length; k++) {
        const i = watch[k];
        try { const off = window.claude.on.ptyOutputForSession(ids[i], (d) => { R.po.push([performance.now(), i, d.length]); }); cleanups.push(() => { try { off && off(); } catch (err) { /* gone */ } }); } catch (err) { R.flags.pty = 'error: ' + (err && err.message); }
      }
    }
    S.stop = () => { alive = false; if (raf) cancelAnimationFrame(raf); raf = 0; cleanups.forEach((c) => { try { c(); } catch (err) { /* already gone */ } }); S.stop = null; };
    return { t0: R.t0, flags: R.flags, panes: roots.filter(Boolean).length };
  };
  S.read = () => S.R;
  S.setEcho = (idx, id, ch) => { S.echo = { idx, ch, base: S.lastLineLen(id), t: null }; return S.echo.base; };
  S.readEcho = () => S.echo;
  S.waitShown = (target, timeoutMs) => new Promise((resolve) => {
    const t0 = performance.now();
    const chk = () => { if (S.lastVis === target) resolve(performance.now()); else if (performance.now() - t0 > timeoutMs) resolve(null); else requestAnimationFrame(chk); };
    chk();
  });
  S.clock = () => ({ pageNow: performance.now(), pageEpoch: performance.timeOrigin + performance.now() });
  return true;
}
