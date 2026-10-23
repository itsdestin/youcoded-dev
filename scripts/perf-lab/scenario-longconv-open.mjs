// scripts/perf-lab/scenario-longconv-open.mjs — opening a LONG saved conversation, with no model.
//
// WHAT THIS IS, HONESTLY. The lab can open a long conversation without any model because native sessions are plain files: the fixture writes a
// native session transcript (the app's own saved format, ~/.youcoded/sessions/<project>/<id>.jsonl) and the scenario resumes it through the
// app's own `youcoded:resume-session` event - the same door the Resume list uses. The reply text on disk is generated (mixed prose, code
// fences, diffs, long output and TOOL CARDS - a tool call plus its result - in a fixed cycle), but opening it exercises the app's real
// history load, timeline build and first draw. What it is NOT: a Claude Code (`.claude/projects`) conversation - that route is the history
// scenario and needs the local model; and the conversation is replayed from disk, not streamed.
//
// WHAT IT MEASURES, per rung (40 / 200 / 1,000 turns):
//   openToNewestPaintMs   resume event -> the NEWEST message is on screen, inside the visible area, and two frames have painted
//   openToSettledMs       resume event -> the entry count has held still for 3 frames plus 300 ms
//   open*Long*            worst renderer freeze (browser long task / timer delay) between the event and the newest paint, and after it
//   typing                inert key every 250 ms from the moment the conversation's pane exists: worst delay while opening, and in the 3 s after
//   scroll-up             a human-pace (1,500 px/s) pass upward: frames where an entry in view was a blank spacer, and frames where the app
//                         moved the viewport by itself (a jump)
// Pure orchestration and report shaping (unit-tested offline); the wiring (boot, fixture, CDP) is longconv-open-run.mjs.
import { assistantContentBlocks } from './content.mjs';
import { stableUuid } from './fixture.mjs';
import { PATHLIST_THRESHOLDS, RUNG_GRACE_MS, median } from './scenario-pathlist-stream.mjs';
import { summariseLateContent } from './late-content.mjs';

export const LONGCONV_SCENARIO = Object.freeze({ revision: 1, lane: 'longconv-open', exploratory: true });
export const TURN_COUNTS = Object.freeze([40, 200, 1000]);
export const LONGCONV_THRESHOLDS = Object.freeze({ ...PATHLIST_THRESHOLDS, openToNewestPaintMs: 3000 });
export { RUNG_GRACE_MS };
/** The newest message carries this text so "the newest message is on screen" is a fact read off the page, not a guess from a count. */
export const NEWEST_MARKER = 'NEWEST-TURN-MARKER-7c1f';
export const OPEN_TIMEOUT_MS = 120_000;
/** How long typing is watched after the newest message has painted. */
export const AFTER_OPEN_MS = 3000;
export const PSS_CAP_MB = 3072;
// WHY 16 s: the app opens only the newest page of history (~30 turns, ~18,000 px), so at a human 1,500 px/s the pass needs ~12 s just to reach
// the top of that page - the point where the next older page loads and the viewport is most likely to jump. A 6 s pass (the first exploratory
// run) never got there, so it could not tell a 40-turn from a 1,000-turn conversation.
export const SCROLL_UP = Object.freeze({ durationMs: 16_000, direction: 'up', pxPerSecond: 1500, settleMs: 3000 });

// ── the conversation on disk ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The fixed cycle of turn shapes. `tool` turns are the tool-card ones: assistant text, then two tool calls with results, then an answer. */
export const TURN_CYCLE = Object.freeze(['prose', 'code', 'tool', 'diff', 'long_output', 'prose', 'tool']);

const textOf = (kind, seed) => assistantContentBlocks(kind, seed).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n\n');

/**
 * The saved native transcript, one JSON string per line, in the exact event shapes fixture.nativeSessionLines writes (user-message /
 * assistant-text / turn-complete), plus tool-use / tool-result events for `tool` turns (shapes: shared/transcript-event-types.ts). Every uuid is
 * distinct (the store dedupes by uuid). The LAST turn is a short prose turn that carries NEWEST_MARKER.
 */
export function longConversationLines({ sessionId, cwd, turns, startedAt, binding, seed = 'longconv' }) {
  if (!Number.isInteger(turns) || turns < 2) throw new Error(`longConversationLines: turns must be a whole number >= 2, got ${JSON.stringify(turns)}`);
  const lines = [JSON.stringify({ v: 1, sessionId, harnessId: 'coder', binding, cwd, createdAt: startedAt })];
  const ev = (type, key, timestamp, data) => lines.push(JSON.stringify({ type, sessionId, uuid: stableUuid(`${sessionId}:${key}`), timestamp, data }));
  for (let i = 0; i < turns; i++) {
    const base = startedAt + i * 60_000;
    const last = i === turns - 1;
    const kind = last ? 'prose' : TURN_CYCLE[i % TURN_CYCLE.length];
    ev('user-message', `u:${i}`, base, { text: `Question ${i + 1} about ${cwd.split('/').pop()}: what should change next?` });
    if (kind === 'tool') {
      const id1 = `toolu_${i}_a`, id2 = `toolu_${i}_b`;
      ev('assistant-text', `a0:${i}`, base + 1000, { text: 'Let me look at the code first.', partId: `text-${i}-0` });
      ev('tool-use', `tu1:${i}`, base + 1500, { toolUseId: id1, toolName: 'Bash', toolInput: { command: `rg -n "needle${i}" src | head -20`, description: `Search for needle${i}` } });
      ev('tool-result', `tr1:${i}`, base + 2000, { toolUseId: id1, toolName: 'Bash', isError: false, toolResult: Array.from({ length: 12 }, (_, k) => `src/module${k}.ts:${10 + k}: const needle${i} = ${k};`).join('\n') });
      ev('tool-use', `tu2:${i}`, base + 2200, { toolUseId: id2, toolName: 'Read', toolInput: { file_path: `${cwd}/src/module${i % 12}.ts` } });
      ev('tool-result', `tr2:${i}`, base + 2600, { toolUseId: id2, toolName: 'Read', isError: false, toolResult: Array.from({ length: 40 }, (_, k) => `${k + 1}\texport function step${k}(input: number) { return input + ${k}; }`).join('\n') });
      ev('assistant-text', `a1:${i}`, base + 3000, { text: textOf('prose', `${seed}:${sessionId}:${i}`), partId: `text-${i}-1` });
    } else {
      const text = last ? `That covers it. ${NEWEST_MARKER}` : (textOf(kind, `${seed}:${sessionId}:${i}`) || `Turn ${i + 1}.`);
      ev('assistant-text', `a:${i}`, base + 2000, { text, partId: `text-${i}` });
    }
    ev('turn-complete', `t:${i}`, base + 4000, { stopReason: 'end_turn', model: binding.modelId });
  }
  return lines;
}

export function planRung(turns) {
  return { id: `longconv-${turns}`, turns, marker: NEWEST_MARKER, toolTurns: Array.from({ length: turns - 1 }, (_, i) => TURN_CYCLE[i % TURN_CYCLE.length]).filter((k) => k === 'tool').length };
}
export const planRungs = (counts = TURN_COUNTS) => counts.map(planRung);

// ── page sources ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ids of the chat panes on screen right now (the only ones without an aria-hidden ancestor). */
export const visiblePaneIdsSource = `[...document.querySelectorAll('[data-chat-session-id]')].filter((x) => !x.closest('[aria-hidden="true"]')).map((x) => x.dataset.chatSessionId)`;

/**
 * Dispatch the resume event and watch the page open. Progress is published on window.__lc as it happens (so the controller can start its
 * typing train the moment the pane exists) and the whole thing resolves with renderer-clock times:
 *   dispatchMs, paneMs (the new pane exists), firstEntryMs, newestVisibleMs, newestPaintedMs (+2 frames), settledMs, entries counts.
 * "Newest visible" = the last entries hold the marker, are not blank spacers, and intersect the pane's visible area.
 */
export function openSource({ detail, marker, priorIds, timeoutMs = OPEN_TIMEOUT_MS }) {
  return `(async () => {
    const lc = window.__lc = { sessionId: null };
    const prior = new Set(${JSON.stringify(priorIds)});
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const pane = () => { const ids = ${visiblePaneIdsSource}; const id = ids.find((x) => !prior.has(x)); return id ? document.querySelector('[data-chat-session-id="' + id + '"]') : null; };
    const scroller = (root) => (root && root.querySelector('.chat-scroll')) || (root && root.matches && root.matches('.chat-scroll') ? root : null);
    const t0 = performance.now();
    lc.dispatchMs = t0;
    window.dispatchEvent(new CustomEvent('youcoded:resume-session', { detail: ${JSON.stringify(detail)} }));
    const out = { dispatchMs: t0, paneMs: null, firstEntryMs: null, newestVisibleMs: null, newestPaintedMs: null, settledMs: null, ok: false, reason: null };
    let last = -1, stable = 0, stableSince = 0;
    while (performance.now() - t0 < ${timeoutMs}) {
      await raf();
      const root = pane();
      if (root && out.paneMs === null) { out.paneMs = performance.now(); lc.sessionId = root.dataset.chatSessionId; lc.paneMs = out.paneMs; }
      const sc = scroller(root) || [...document.querySelectorAll('.chat-scroll')].find((e) => !e.closest('[aria-hidden="true"]'));
      if (!root || !sc) continue;
      const entries = sc.querySelectorAll('.timeline-entry');
      if (entries.length && out.firstEntryMs === null) out.firstEntryMs = performance.now();
      if (out.newestVisibleMs === null && entries.length) {
        const view = sc.getBoundingClientRect();
        const tail = [...entries].slice(-3);
        const hit = tail.find((e) => (e.textContent || '').includes(${JSON.stringify(marker)}));
        if (hit) { const r = hit.getBoundingClientRect(); if (r.height > 0 && r.bottom > view.top && r.top < view.bottom) out.newestVisibleMs = performance.now(); }
        if (out.newestVisibleMs !== null) { await raf(); await raf(); out.newestPaintedMs = performance.now(); out.entriesAtPaint = entries.length; out.domNodesAtPaint = document.getElementsByTagName('*').length; }
      }
      if (out.newestPaintedMs !== null) {
        const n = sc.querySelectorAll('.timeline-entry').length;
        if (n === last) { if (++stable >= 3 && performance.now() - stableSince >= 300) { out.settledMs = performance.now(); out.entriesAtSettle = n; out.ok = true; break; } }
        else { last = n; stable = 0; stableSince = performance.now(); }
      }
    }
    if (!out.ok) out.reason = out.paneMs === null ? 'no new chat pane appeared' : out.newestPaintedMs === null ? 'the newest message never reached the visible area' : 'the entry count never held still';
    lc.done = true;
    return out;
  })()`;
}

/** Page census once the open is done and before the scroll pass: what the conversation actually drew. Cheap; one-off. */
export const censusSource = `(() => {
  const sc = [...document.querySelectorAll('.chat-scroll')].find((e) => !e.closest('[aria-hidden="true"]'));
  if (!sc) return null;
  const entries = sc.querySelectorAll('.timeline-entry');
  const mem = performance.memory;
  return { entries: entries.length, scrollHeightPx: sc.scrollHeight, clientHeightPx: sc.clientHeight, scrollTopPx: Math.round(sc.scrollTop),
    spacers: [...entries].filter((e) => e.childElementCount === 0 && !e.textContent.trim()).length,
    codeBlocks: sc.querySelectorAll('pre.yc-code').length,
    // WHY text, not a class: the tool-card markup has no stable selector, but a collapsed tool turn always reads "Ran a command and read a file" (checked in the app 2026-10-23). Entries far off screen are folded to blank spacers, so this counts only the drawn ones.
    toolCardTextHits: (sc.textContent || '').split('Ran a command and read a file').length - 1,

    // What kinds of entry the timeline drew (data-entry-key with id runs collapsed), so the report can say what the conversation was made of.
    entryKinds: [...entries].reduce((a, e) => { const k = (e.getAttribute('data-entry-key') || '?').replace(/[0-9a-f-]{8,}|\\d+/g, '#').slice(0, 40); a[k] = (a[k] || 0) + 1; return a; }, {}),
    domNodes: document.getElementsByTagName('*').length, heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576 * 10) / 10 : null };
})()`;

// ── rung classification ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (n) => (num(n) === null ? null : Math.round(n * 10) / 10);

/** Every way the evidence for a rung can be unfit, in plain words. */
export function proofProblems(plan, raw) {
  const p = [];
  const o = raw?.open;
  if (!o) p.push('the open was never read');
  else if (!o.ok) p.push(`the conversation did not finish opening: ${o.reason}`);
  if (o?.ok && !raw?.census) p.push('the page census was not read');
  const sl = raw?.scrollUp;
  if (o?.ok && !sl?.ok) p.push(`the scroll-up pass did not run (${sl?.reason ?? 'no reading'})`);
  return p;
}

/**
 * raw = { failure?, open, census, scrollUp, late (summariseLateContent), windows, longtasks, loop, typing, main, memory, interference }.
 * Same vocabulary as the other lanes: failed:<reason> | slow | measured.
 */
export function classifyRung(plan, raw, thresholds = LONGCONV_THRESHOLDS) {
  const row = { id: plan.id, turns: plan.turns, toolTurns: plan.toolTurns };
  const o = raw?.open, lt = raw?.longtasks ?? {}, lp = raw?.loop ?? {}, ty = raw?.typing, late = raw?.late;
  const since = (t) => (o?.ok && num(t) !== null ? t - o.dispatchMs : null);
  Object.assign(row, {
    openToPaneMs: round1(since(o?.paneMs)), openToFirstEntryMs: round1(since(o?.firstEntryMs)),
    openToNewestPaintMs: round1(since(o?.newestPaintedMs)), openToSettledMs: round1(since(o?.settledMs)),
    entriesAtPaint: num(o?.entriesAtPaint), entriesAtSettle: num(o?.entriesAtSettle),
    openLongtaskMaxMs: round1(lt.stream?.maxMs), openLongtaskTotalMs: round1(lt.stream?.totalMs), openLongtaskCount: num(lt.stream?.count),
    afterLongtaskMaxMs: round1(lt.settle?.maxMs), afterLongtaskTotalMs: round1(lt.settle?.totalMs),
    openTimerStallMaxMs: round1(lp.stream?.maxDelayMs), afterTimerStallMaxMs: round1(lp.settle?.maxDelayMs),
    openFrameGapMaxMs: round1(lt.stream?.frameGapMaxMs),
    mainMaxDelayMs: round1(raw?.main?.maxDelayMs), mainTotalStallMs: round1(raw?.main?.totalStallMs),
    // 'stream' in the shared typing summary = the open window, 'settle' = the AFTER_OPEN_MS window after the newest paint, 'after' = the scroll pass.
    typingOpenMaxMs: ty?.complete ? ty.streamMaxMs : null, typingAfterOpenMaxMs: ty?.complete ? ty.settleMaxMs : null, typingScrollMaxMs: ty?.complete ? ty.afterMaxMs : null,
    typingSaturated: ty?.complete ? ty.saturated : null, typingKeysOpen: ty?.complete ? ty.keysStream : null,
    typingKeysAfterOpen: ty?.complete ? ty.keysSettle : null, typingKeysScroll: ty?.complete ? ty.keysAfter : null,
    scrollVerdict: late?.verdict ?? null, scrollBlankFrames: num(late?.framesWithLate), scrollMaxBlankInView: num(late?.maxLateInViewport),
    scrollJumpedFrames: num(late?.jumpedFrames), scrollFrames: num(late?.frames), scrollPx: num(late?.scrolledPx), scrollBlankAtRest: late ? (late.settledAtRest === false ? 1 : 0) : null,
    peakPssMb: round1(raw?.memory?.peakPssMb), heapMb: round1(raw?.census?.heapMb), domNodes: num(raw?.census?.domNodes),
    toolCardTextHits: num(raw?.census?.toolCardTextHits), scrollHeightPx: num(raw?.census?.scrollHeightPx), entryKinds: raw?.census?.entryKinds ?? null,
    interference: raw?.interference ?? null,
  });
  const maxOf = (...v) => { const x = v.filter((y) => y !== null); return x.length ? Math.max(...x) : null; };
  row.worstLongtaskMs = maxOf(row.openLongtaskMaxMs, row.afterLongtaskMaxMs);
  row.worstTypingMs = maxOf(row.typingOpenMaxMs, row.typingAfterOpenMaxMs, row.typingScrollMaxMs);

  if (raw?.failure) { row.status = `failed:${raw.failure.status || 'failed'}`; row.reason = String(raw.failure.error ?? '').split('\n')[0].slice(0, 300); return row; }
  const problems = proofProblems(plan, raw);
  if (problems.length) { row.status = o && o.ok === false ? 'failed:open-timeout' : 'failed:evidence-incomplete'; row.reason = problems.join('; '); return row; }
  if (!ty) { row.status = 'failed:evidence-incomplete'; row.reason = 'typing: no reading'; return row; }
  if (!ty.complete) { row.status = 'failed:evidence-incomplete'; row.reason = `typing: ${ty.reasons.join('; ')}`; return row; }
  if (row.worstLongtaskMs === null) { row.status = 'failed:evidence-incomplete'; row.reason = 'renderer long tasks were not observed'; return row; }
  const breaches = [];
  if (row.worstLongtaskMs > thresholds.rendererMaxDelayMs) breaches.push({ metric: 'worstLongtaskMs', value: row.worstLongtaskMs, limit: thresholds.rendererMaxDelayMs });
  if (row.worstTypingMs !== null && row.worstTypingMs > thresholds.inputLatencyMs) breaches.push({ metric: 'worstTypingMs', value: row.worstTypingMs, limit: thresholds.inputLatencyMs });
  if (row.openToNewestPaintMs !== null && row.openToNewestPaintMs > thresholds.openToNewestPaintMs) breaches.push({ metric: 'openToNewestPaintMs', value: row.openToNewestPaintMs, limit: thresholds.openToNewestPaintMs });
  // The scroll invariant is absolute: a single blank frame in view, or a viewport jump, is a defect (late-content.mjs).
  if (row.scrollBlankFrames > 0) breaches.push({ metric: 'scrollBlankFrames', value: row.scrollBlankFrames, limit: 0 });
  if (row.scrollJumpedFrames > 0) breaches.push({ metric: 'scrollJumpedFrames', value: row.scrollJumpedFrames, limit: 0 });
  row.breaches = breaches;
  row.status = breaches.length ? 'slow' : 'measured';
  return row;
}

export { summariseLateContent, median };

export const TABLE_METRICS = Object.freeze(['openToNewestPaintMs', 'openToSettledMs', 'openLongtaskMaxMs', 'openLongtaskTotalMs', 'afterLongtaskMaxMs',
  'typingOpenMaxMs', 'typingAfterOpenMaxMs', 'typingScrollMaxMs', 'scrollBlankFrames', 'scrollJumpedFrames', 'entriesAtPaint', 'peakPssMb', 'heapMb', 'domNodes']);
