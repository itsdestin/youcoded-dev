// scripts/perf-lab/scenario-bigfence-stream.mjs — an ASSISTANT reply that is ONE VERY LARGE fenced code block, streaming in and then sitting on screen.
//
// WHY THIS SCENARIO EXISTS
// Freeze hunt item 2: one huge code fence used to be syntax-coloured in full (highlight.js walks every line, then React builds a node per colour
// span), which froze the page for seconds. The candidate stops colouring a fence over 1,500 lines / 100 KB (markdown-blocks.ts
// HIGHLIGHT_MAX_LINES / _CHARS). The path-list scenario only ever drew short lines. This one measures the three shapes that matter:
//   code-2000    2,000 lines of TypeScript    — just over the limit, the case most people will meet
//   code-20000   20,000 lines of TypeScript   — a pasted log / generated file
//   json-700kb   ~700 KB of JSON in a few very long lines — few lines, huge size: trips the SIZE limit, not the line limit
//   jsonone-700kb (opt-in) the same JSON as ONE line — the worst case for line-wrapping / measuring
// and for each it records, in two phases: WHILE IT STREAMS IN (every chunk re-renders the growing fence) and ON THE FINISHED PAGE (a scroll
// through the block with the typing probe still running). Candidate A (no limit) is expected to be slower; candidate B (limit) is expected to
// draw the block with no colour — the row records `coloured` so the report says which one actually happened instead of assuming it.
//
// Pure orchestration + report shaping, like scenario-pathlist-stream.mjs, whose windows / typing / clock helpers it re-uses unchanged. The
// real wiring (boot, fake model server, CDP) is bigfence-stream-run.mjs. A reading that was not taken is null with a reason, never 0.
import {
  PATHLIST_THRESHOLDS, SETTLE_TIMEOUT_MS, RUNG_GRACE_MS, BASE_PER_SEC, MAX_STREAM_MS, median,
  naturalDeltaCount, ratePerSec,
} from './scenario-pathlist-stream.mjs';

export const BIGFENCE_SCENARIO = Object.freeze({ revision: 1, lane: 'bigfence-stream', exploratory: true });
export { PATHLIST_THRESHOLDS as BIGFENCE_THRESHOLDS, SETTLE_TIMEOUT_MS, RUNG_GRACE_MS };

/** Default ladder: [variant, size]. size = lines for code, KB for json. */
export const DEFAULT_RUNGS = Object.freeze([['code', 2000], ['code', 20000], ['json', 700]]);
export const ALL_VARIANTS = Object.freeze(['code', 'json', 'jsonone']);
/** The candidate's own limits (markdown-blocks.ts); only used to LABEL a rung as over/under — never to decide pass/fail. */
export const APP_HIGHLIGHT_LIMITS = Object.freeze({ lines: 1500, chars: 100 * 1024 });
/** A JSON "line" is this many characters: long enough to be a minified blob, short enough to be many lines. */
export const JSON_LINE_CHARS = 24_000;
/** Scroll pass after the page is painted: a brisk human pace, bottom -> top through the block. */
export const SCROLL_PASS = Object.freeze({ durationMs: 4000, pxPerSecond: 3000 });
export const PSS_CAP_MB = 3072;
export const BIGFENCE_MAX_STREAM_MS = 60_000;

const INTRO = 'Here is the full file you asked for:';
const OUTRO = 'That is the whole file.';

/** The i-th line of code: realistic TypeScript, unique, ~45 chars, several colourable tokens per line. */
export const codeLineAt = (i) => `export const value${i}: number = compute(${i}, "key${i % 97}"); // line ${i}`;

/** One JSON record. Deterministic; ~70 chars. */
export const jsonRecordAt = (i) => `{"id":${i},"name":"item-${i}","active":${i % 2 === 0},"score":${(i % 1000) / 10},"tags":["a${i % 7}","b${i % 5}"]}`;

/** `kb` kilobytes of minified JSON records, wrapped into lines of about JSON_LINE_CHARS (or one line when oneLine). */
export function jsonBody(kb, { oneLine = false } = {}) {
  if (!Number.isInteger(kb) || kb < 1) throw new Error('kb must be a whole number >= 1');
  const target = kb * 1000;
  const lines = [];
  let cur = [], curLen = 0, total = 0;
  for (let i = 0; total < target; i++) {
    const rec = jsonRecordAt(i);
    cur.push(rec); curLen += rec.length + 1; total += rec.length + 1;
    if (!oneLine && curLen >= JSON_LINE_CHARS) { lines.push(`${cur.join(',')},`); cur = []; curLen = 0; }
  }
  if (cur.length) lines.push(cur.join(','));
  return oneLine ? [`[${lines.join('')}]`] : ['[', ...lines, ']'];
}

/** The fence's content lines for a rung. */
export function fenceLines(variant, n) {
  if (!ALL_VARIANTS.includes(variant)) throw new Error(`unknown variant ${variant}`);
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a whole number >= 1');
  if (variant === 'code') return Array.from({ length: n }, (_, i) => codeLineAt(i));
  return jsonBody(n, { oneLine: variant === 'jsonone' });
}

/** Markdown for one rung: intro, one labelled fence, outro. The language label is what makes candidate A colour it. */
export function replyText(variant, n) {
  const lang = variant === 'code' ? 'ts' : 'json';
  return `${INTRO}\n\n\`\`\`${lang}\n${fenceLines(variant, n).join('\n')}\n\`\`\`\n\n${OUTRO}`;
}

export function planRung(variant, n) {
  const lines = fenceLines(variant, n);
  const text = `${INTRO}\n\n\`\`\`${variant === 'code' ? 'ts' : 'json'}\n${lines.join('\n')}\n\`\`\`\n\n${OUTRO}`;
  const deltas = naturalDeltaCount(text);
  // WHY 60 s not the path-list's 45 s: a 20,000-line block is ~380,000 deltas; at 45 s that is >8,000 per second, which tests the lab's own pipe more than the app.
  const perSec = ratePerSec(deltas, { maxMs: BIGFENCE_MAX_STREAM_MS });
  const fenceChars = lines.join('\n').length;
  const lastLine = lines[lines.length - 1];
  return {
    id: `bigfence-${variant}-${n}`, variant, n, text, deltas, perSec,
    streamMs: Math.round(deltas / perSec * 1000),
    atCloudSpeed: perSec === BASE_PER_SEC,
    lineCount: lines.length, fenceChars,
    overLimit: lines.length > APP_HIGHLIGHT_LIMITS.lines || fenceChars > APP_HIGHLIGHT_LIMITS.chars,
    // What the page must show for the rung to count: the fence ends with this tail, holds (nearly) all the characters, and the outro follows.
    lastTail: lastLine.slice(-60), outro: OUTRO,
  };
}

export function planRungs({ rungs = DEFAULT_RUNGS } = {}) { return rungs.map(([v, n]) => planRung(v, n)); }
export const publicPlan = ({ text, ...rest }) => ({ ...rest, chars: text.length });

// ── page sources ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The visible pane's fence state. Cheap on purpose (it runs every 50 ms while a 700 KB block is on screen): looks only at the LAST <pre> and
 * only at its last text node, and never reads the whole pane's text. `coloured` = the first colour span, found by a querySelector that stops
 * at the first hit. The expensive text check for the outro runs only after the fence's tail matched.
 */
export function paneStateSource(plan) {
  return `(() => {
    const panes = [...document.querySelectorAll('.chat-scroll')].filter((e) => !e.closest('[aria-hidden="true"]'));
    if (panes.length !== 1) return { panes: panes.length };
    const p = panes[0];
    const pres = p.querySelectorAll('pre.yc-code');
    const n = pres.length;
    let tail = null;
    if (n) {
      // WHY a reverse walk: a coloured block ends in a run of tiny <span>s and a bare newline, so the last text node alone is not the
      // tail; gathering ~200 characters from the end avoids reading the whole 700 KB block's text on every poll.
      let acc = '';
      const walk = (node) => { if (acc.length >= 200) return; if (node.nodeType === 3) { acc = node.data + acc; return; } for (let c = node.lastChild; c && acc.length < 200; c = c.previousSibling) walk(c); };
      walk(pres[n - 1]); tail = acc.trimEnd();
    }
    const tailOk = tail !== null && tail.endsWith(${JSON.stringify(plan.lastTail)});
    return { panes: 1, blocks: n, tailOk,
      coloured: n ? !!pres[n - 1].querySelector('.hljs-keyword,.hljs-string,.hljs-attr,.hljs-number,.hljs-title') : null,
      hasOutro: tailOk ? (p.textContent || '').includes(${JSON.stringify(plan.outro)}) : false };
  })()`;
}

/** Does a pane reading show the finished reply? Pure so tests can feed it readings. */
export const paneComplete = (s) => !!s && s.panes === 1 && s.tailOk === true && s.hasOutro === true;

/** Page-side wait for the finished reply, then two animation frames (the paint). Renderer-clock times, same shape as the path-list one. */
export function awaitFinalPaintSource(plan, timeoutMs = SETTLE_TIMEOUT_MS) {
  return `(async () => {
    const state = () => ${paneStateSource(plan).trim()};
    const complete = (s) => !!s && s.panes === 1 && s.tailOk === true && s.hasOutro === true;
    const t0 = performance.now();
    let s = state();
    while (!complete(s) && performance.now() - t0 < ${timeoutMs}) { await new Promise((r) => setTimeout(r, 50)); s = state(); }
    const readyAtMs = performance.now();
    const ok = complete(s);
    if (ok) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ok, readyAtMs, paintedAtMs: performance.now(), state: s, timeOrigin: performance.timeOrigin };
  })()`;
}

/**
 * One-off reading of the FINISHED page (outside every timed window): how many characters the fence blocks hold in total, and the JS heap.
 * Chromium-only `performance.memory`; null elsewhere, never 0.
 */
export const finishedReadingSource = `(() => {
  const panes = [...document.querySelectorAll('.chat-scroll')].filter((e) => !e.closest('[aria-hidden="true"]'));
  const p = panes.length === 1 ? panes[0] : null;
  const pres = p ? [...p.querySelectorAll('pre.yc-code')] : [];
  const mem = performance.memory;
  return { blocks: pres.length, fenceChars: pres.reduce((a, x) => a + (x.textContent || '').length, 0),
    coloured: pres.some((x) => !!x.querySelector('.hljs-keyword,.hljs-string,.hljs-attr,.hljs-number,.hljs-title')),
    domNodes: document.getElementsByTagName('*').length,
    heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576 * 10) / 10 : null };
})()`;

/**
 * A scroll pass through the finished block, bottom -> top, at a fixed pixel rate (a hand on a wheel). Records its own per-frame gaps (so a
 * frozen page shows as a long gap) and renderer-clock start/end. The scroll position is set from the clock, so a slow page covers fewer
 * pixels rather than slowing the test down.
 */
export function scrollPassSource({ durationMs, pxPerSecond }) {
  return `(async () => {
    const pane = [...document.querySelectorAll('.chat-scroll')].find((e) => !e.closest('[aria-hidden="true"]'));
    if (!pane) return { ok: false, reason: 'no visible .chat-scroll' };
    const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
    pane.scrollTop = max;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const startMs = performance.now();
    let last = startMs, maxGap = 0, over50 = 0, frames = 0;
    while (true) {
      const el = performance.now() - startMs;
      pane.scrollTop = Math.max(0, max - ${pxPerSecond} * el / 1000);
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now(); const gap = now - last; last = now; frames++;
      if (gap > maxGap) maxGap = gap; if (gap > 50) over50++;
      if (el >= ${durationMs} || pane.scrollTop <= 0) break;
    }
    return { ok: true, startMs, endMs: performance.now(), maxFrameGapMs: Math.round(maxGap * 10) / 10, framesOver50ms: over50, frames,
      scrolledPx: Math.round(max - pane.scrollTop), scrollableAtStartPx: Math.round(max) };
  })()`;
}

// ── rung classification ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (n) => (num(n) === null ? null : Math.round(n * 10) / 10);

/** Every way the evidence for a rung can be unfit, in plain words. Empty = the rung measured what it claims. */
export function proofProblems(plan, raw) {
  const p = [];
  const rec = raw?.fakeRecord;
  if (!rec) p.push('the fake model server never recorded the request');
  else {
    if (rec.aborted) p.push('the stream was aborted mid-reply');
    if (rec.deltasSent !== plan.deltas) p.push(`sent ${rec.deltasSent} of ${plan.deltas} deltas`);
  }
  const f = raw?.final;
  if (!f) p.push('final paint was never read');
  else if (!f.ok) p.push(`the finished reply never appeared within the settle limit (blocks ${f.state?.blocks ?? '?'}, tail ${f.state?.tailOk ?? '?'}, outro ${f.state?.hasOutro ?? '?'})`);
  if (raw?.sessionVisible === false) p.push('the streaming session was not the one on screen');
  const fin = raw?.finished;
  // WHY a 2 % floor: markdown rendering may trim a trailing newline or the copy-button label; a missing chunk is far bigger than that.
  if (f?.ok && fin && fin.fenceChars < plan.fenceChars * 0.98) p.push(`the page holds ${fin.fenceChars} fence characters of ${plan.fenceChars} expected`);
  if (f?.ok && !raw?.scroll?.ok) p.push(`the scroll pass did not run (${raw?.scroll?.reason ?? 'no reading'})`);
  return p;
}

/**
 * raw = { failure?, fakeRecord, final, finished, scroll, sessionVisible, windows, longtasks, scrollTasks, loop, typing, main, memory, interference }.
 * Status: failed:<reason> | slow (valid, a named threshold breached) | measured. Same vocabulary as lane F and the path-list scenario.
 */
export function classifyRung(plan, raw, thresholds = PATHLIST_THRESHOLDS) {
  const row = { id: plan.id, variant: plan.variant, n: plan.n, lineCount: plan.lineCount, fenceChars: plan.fenceChars, overLimit: plan.overLimit,
    deltas: plan.deltas, perSec: plan.perSec, atCloudSpeed: plan.atCloudSpeed };
  const lt = raw?.longtasks ?? {}, lp = raw?.loop ?? {}, ty = raw?.typing, sc = raw?.scrollTasks;
  const end = raw?.final?.ok && num(raw?.windows?.settle?.[1]) !== null ? raw.windows.settle[1] - raw.windows.settle[0] : null;
  Object.assign(row, {
    streamLongtaskMaxMs: round1(lt.stream?.maxMs), streamLongtaskTotalMs: round1(lt.stream?.totalMs), streamLongtaskCount: num(lt.stream?.count),
    settleLongtaskMaxMs: round1(lt.settle?.maxMs), settleLongtaskTotalMs: round1(lt.settle?.totalMs),
    scrollLongtaskMaxMs: round1(sc?.maxMs), scrollFrameGapMaxMs: round1(raw?.scroll?.maxFrameGapMs), scrollFramesOver50: num(raw?.scroll?.framesOver50ms),
    streamTimerStallMaxMs: round1(lp.stream?.maxDelayMs), settleTimerStallMaxMs: round1(lp.settle?.maxDelayMs),
    mainMaxDelayMs: round1(raw?.main?.maxDelayMs), mainTotalStallMs: round1(raw?.main?.totalStallMs),
    typingIdleMaxMs: ty?.complete ? ty.idleMaxMs : null, typingStreamMaxMs: ty?.complete ? ty.streamMaxMs : null,
    typingSettleMaxMs: ty?.complete ? ty.settleMaxMs : null, typingScrollMaxMs: ty?.complete ? ty.afterMaxMs : null,
    typingSaturated: ty?.complete ? ty.saturated : null, typingKeysStream: ty?.complete ? ty.keysStream : null, typingKeysSettle: ty?.complete ? ty.keysSettle : null,
    typingKeysScroll: ty?.complete ? ty.keysAfter : null, typingExhausted: ty?.complete ? ty.exhausted : null,
    endToPaintMs: round1(end),
    peakPssMb: round1(raw?.memory?.peakPssMb), heapMb: round1(raw?.finished?.heapMb), domNodes: num(raw?.finished?.domNodes),
    // WHAT THE APP DID with the block: 1 = drawn with syntax colour, 0 = drawn plain. Numeric so it aggregates; null when unread.
    coloured: raw?.finished ? (raw.finished.coloured ? 1 : 0) : null,
    interference: raw?.interference ?? null,
  });
  const maxOf = (...v) => { const x = v.filter((y) => y !== null); return x.length ? Math.max(...x) : null; };
  row.worstLongtaskMs = maxOf(row.streamLongtaskMaxMs, row.settleLongtaskMaxMs, row.scrollLongtaskMaxMs);
  row.worstTypingMs = maxOf(row.typingStreamMaxMs, row.typingSettleMaxMs, row.typingScrollMaxMs);

  if (raw?.failure) { row.status = `failed:${raw.failure.status || 'failed'}`; row.reason = String(raw.failure.error ?? '').split('\n')[0].slice(0, 300); return row; }
  const problems = proofProblems(plan, raw);
  if (problems.length) {
    row.status = raw?.final && raw.final.ok === false ? 'failed:settle-timeout' : 'failed:evidence-incomplete';
    row.reason = problems.join('; '); return row;
  }
  if (!ty) { row.status = 'failed:evidence-incomplete'; row.reason = 'typing: no reading'; return row; }
  if (!ty.complete) { row.status = 'failed:evidence-incomplete'; row.reason = `typing: ${ty.reasons.join('; ')}`; return row; }
  if (row.worstLongtaskMs === null) { row.status = 'failed:evidence-incomplete'; row.reason = 'renderer long tasks were not observed'; return row; }
  const breaches = [];
  if (row.worstLongtaskMs > thresholds.rendererMaxDelayMs) breaches.push({ metric: 'worstLongtaskMs', value: row.worstLongtaskMs, limit: thresholds.rendererMaxDelayMs });
  if (row.worstTypingMs !== null && row.worstTypingMs > thresholds.inputLatencyMs) breaches.push({ metric: 'worstTypingMs', value: row.worstTypingMs, limit: thresholds.inputLatencyMs });
  if (row.endToPaintMs !== null && row.endToPaintMs > thresholds.endToPaintMs) breaches.push({ metric: 'endToPaintMs', value: row.endToPaintMs, limit: thresholds.endToPaintMs });
  row.breaches = breaches;
  row.status = breaches.length ? 'slow' : 'measured';
  return row;
}

// ── across rounds (shared with the long-conversation scenario) ──────────────────────────────────────────────────────────────

export const TABLE_METRICS = Object.freeze(['streamLongtaskMaxMs', 'streamLongtaskTotalMs', 'settleLongtaskMaxMs', 'scrollLongtaskMaxMs', 'scrollFrameGapMaxMs',
  'typingStreamMaxMs', 'typingSettleMaxMs', 'typingScrollMaxMs', 'endToPaintMs', 'peakPssMb', 'heapMb', 'domNodes', 'coloured']);

/** rows = [{ side, round, row }] -> { rungId: { side: { statuses, metrics: { m: {median,min,max,n,of} } } } }. Missing values are not counted; n says how many were. */
export function aggregateRounds(rows, metrics = TABLE_METRICS) {
  const out = {};
  for (const { side, row } of rows) {
    const cell = ((out[row.id] ??= {})[side] ??= { statuses: [], values: {} });
    cell.statuses.push(row.status);
    for (const m of metrics) (cell.values[m] ??= []).push(row[m]);
  }
  for (const sides of Object.values(out)) for (const cell of Object.values(sides)) {
    cell.metrics = Object.fromEntries(Object.entries(cell.values).map(([m, vs]) => {
      const v = vs.filter((x) => num(x) !== null);
      return [m, { median: median(v), min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, n: v.length, of: vs.length }];
    }));
    delete cell.values;
  }
  return out;
}
export { renderComparison } from './scenario-pathlist-stream.mjs';
export { MAX_STREAM_MS };
