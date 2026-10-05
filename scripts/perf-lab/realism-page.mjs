// scripts/perf-lab/realism-page.mjs — the in-page recorder for realism.mjs (the "real-use" lab).
//
// `eventRecorder` is injected with `(${eventRecorder})()` and must stay SELF-CONTAINED (it runs in the app's window).
// WHY it is nearly passive: the owner's own recorder is passive too, and a probe that does work on every frame (the older
// switch-page.mjs runs a requestAnimationFrame loop) changes what is being measured. Everything here is a browser observer
// that fires AFTER the fact, plus one attribute read 450 ms after each press to check the right pane arrived.
//
// Recorded (times are the page's performance.now()):
//   ev    Event Timing entries, one per pointerdown/pointerup/click/keydown/keyup/wheel/input the browser measured:
//         [name, startTime, processingStart, processingEnd, duration, pillSessionId, interactionId]
//         (realism-stats.mjs splitEvent turns a row into input delay / handler / presentation delay — the recorder's own split)
//   loaf  long animation frames: [startTime, duration, blockingDuration, renderStart, styleAndLayoutStart, [top scripts]]
//   lt    long tasks: [startTime, duration]
//   pane  the pane that was visible 450 ms after a pill press: [pressTime, pillSessionId, visibleSessionId|'', ariaHiddenCount]
//   cap   the capture-phase presses seen, so a press the browser never measured (under the 16 ms floor) is still counted: [type, timeStamp, pillSessionId]
export function eventRecorder() {
  const S = (window.__rl = window.__rl || { R: null, stop: null });
  S.install = (cfg) => {
    if (S.stop) S.stop();
    const ids = cfg.ids;
    const R = { ev: [], loaf: [], lt: [], pane: [], cap: [], flags: {}, t0: performance.now() };
    S.R = R;
    const cleanups = [];
    const visibleNow = () => {
      // First chat root without aria-hidden (what the owner sees). Attribute reads only: no layout.
      let hidden = 0, vis = '';
      for (const id of ids) {
        const el = document.querySelector('[data-chat-session-id="' + id + '"]');
        if (!el) continue;
        if (el.hasAttribute('aria-hidden')) hidden++; else if (!vis) vis = id;
      }
      return [vis, hidden];
    };
    S.visibleNow = visibleNow;
    const onCap = (e) => {
      const t = e.target;
      const pill = t && t.closest ? t.closest('[data-session-id]') : null;
      const pid = pill ? pill.getAttribute('data-session-id') : '';
      R.cap.push([e.type, e.timeStamp, pid]);
      if (e.type === 'pointerdown' && pid) {
        const when = e.timeStamp;
        setTimeout(() => { const [v, h] = visibleNow(); R.pane.push([when, pid, v, h]); }, 450);
      }
    };
    ['pointerdown', 'pointerup', 'click'].forEach((k) => window.addEventListener(k, onCap, { capture: true, passive: true }));
    cleanups.push(() => ['pointerdown', 'pointerup', 'click'].forEach((k) => window.removeEventListener(k, onCap, true)));

    const observe = (type, opts, onEntries, key) => {
      try {
        if (!(PerformanceObserver.supportedEntryTypes || []).includes(type)) { R.flags[key] = 'unsupported'; return; }
        const o = new PerformanceObserver((l) => onEntries(l.getEntries()));
        o.observe(Object.assign({ type, buffered: false }, opts));
        R.flags[key] = 'on';
        cleanups.push(() => o.disconnect());
      } catch (err) { R.flags[key] = 'error: ' + (err && err.message); }
    };
    // durationThreshold 16 is the smallest the API allows; the recorder's 104 ms floor is applied later, in node.
    observe('event', { durationThreshold: 16 }, (es) => es.forEach((e) => {
      let pid = '';
      try { const t = e.target; const pill = t && t.closest ? t.closest('[data-session-id]') : null; pid = pill ? pill.getAttribute('data-session-id') : ''; } catch (err) { /* node gone */ }
      R.ev.push([e.name, e.startTime, e.processingStart, e.processingEnd, e.duration, pid, e.interactionId || 0]);
    }), 'eventTiming');
    observe('long-animation-frame', {}, (es) => es.forEach((e) => {
      const sc = (e.scripts || []).map((s) => [s.invoker || s.name || '', Math.round(s.duration), Math.round(s.forcedStyleAndLayoutDuration || 0), s.sourceFunctionName || '', (s.sourceURL || '').split('/').pop() + ':' + (s.sourceCharPosition === undefined ? '' : s.sourceCharPosition)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      R.loaf.push([e.startTime, e.duration, e.blockingDuration || 0, e.renderStart || 0, e.styleAndLayoutStart || 0, sc]);
    }), 'longAnimationFrame');
    observe('longtask', {}, (es) => es.forEach((e) => R.lt.push([e.startTime, e.duration])), 'longtask');
    S.stop = () => { cleanups.forEach((c) => { try { c(); } catch (err) { /* already gone */ } }); S.stop = null; };
    return { t0: R.t0, flags: R.flags };
  };
  S.read = () => S.R;
  S.clock = () => ({ pageNow: performance.now(), pageEpoch: performance.timeOrigin + performance.now() });
  // Positive control: a known main-thread block of `ms` (the same idea as switch-pingpong's ctrl).
  S.block = (ms) => { const e = performance.now() + ms; while (performance.now() < e); return true; };
  // The pill's centre right now (one element). Read just before a press; a person aims at where the pill IS.
  S.aim = (id) => {
    const s = document.querySelector('[data-session-strip]') || document.querySelector('.session-strip');
    const el = s && s.querySelector('[data-session-id="' + id + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.right < 0 || r.left > innerWidth) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) };
  };
  // The visible chat pane's middle (where a wheel tick goes) and composer (where typing goes). One layout read each, outside any press.
  S.paneMid = () => {
    const el = document.querySelector('[data-chat-session-id]:not([aria-hidden])');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  S.composer = () => {
    const el = [...document.querySelectorAll('.input-bar-container textarea')].find((e) => !e.closest('[aria-hidden="true"]'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  // What is drawn in each chat pane — COUNTS ONLY, never text. Called for the pane that is visible.
  S.census = (id) => {
    const root = document.querySelector('[data-chat-session-id="' + id + '"]');
    if (!root) return null;
    const entries = root.querySelectorAll('.timeline-entry');
    const kinds = {};
    let folded = 0;
    entries.forEach((e) => {
      const key = e.getAttribute('data-entry-key') || '';
      const k = key.split(/[:_\-#]/)[0].replace(/[0-9a-f]{8,}/g, '').slice(0, 24) || 'other';
      kinds[k] = (kinds[k] || 0) + 1;
      if (e.childElementCount === 0) folded++;
    });
    const c = (sel) => root.querySelectorAll(sel).length;
    return { entries: entries.length, folded, kinds, toolCards: c('[data-tool-use-id]'), codeBlocks: c('pre'), tables: c('table'), images: c('img'), details: c('details'), domElements: root.getElementsByTagName('*').length,
      scrollHeight: (root.querySelector('[data-chat-scroll], .overflow-y-auto') || root).scrollHeight };
  };
  return true;
}
