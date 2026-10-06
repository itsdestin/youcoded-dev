// scripts/perf-lab/realism-stats.mjs — the pure parts of the "real-use" lab (realism.mjs): no browser, no files, unit-tested.
//
// WHY this file exists: the question is "does the lab feel what Destin feels?", and the answer is only worth anything if the
// lab's number and his number are the SAME KIND of number. His hitch recorder (youcoded/docs/hitch-recorder.md) logs a click
// (pointerdown / pointerup / click) when the browser's Event Timing says it took >= 104 ms from the input arriving to the next
// painted frame, and splits that time into three parts:
//     input delay    (delay) = processingStart - startTime   the page was busy with something else and could not even start
//     processing     (proc)  = processingEnd - processingStart  our click handler ran
//     presentation   (pres)  = duration - (processingEnd - startTime)  after the handler: style, layout, paint, compositor, display
// These helpers compute exactly those three from raw Event Timing entries so lab and recorder agree by construction.

/** Nearest-rank percentile (the same rule as hitch-report.mjs `pct` and switch-analysis.mjs `percentile`). null for an empty list. */
export function pctl(values, p) {
  const a = values.filter(n => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * a.length));
  return a[Math.min(a.length, rank) - 1];
}

const r1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);

/** p50 / p95 / max / n of a list (rounded to 0.1). */
export function dist(values) {
  const a = values.filter(n => typeof n === 'number' && Number.isFinite(n));
  if (!a.length) return { n: 0, p50: null, p95: null, max: null };
  return { n: a.length, p50: r1(pctl(a, 50)), p95: r1(pctl(a, 95)), max: r1(Math.max(...a)) };
}

/** The recorder's threshold: an input counts as "slow" at or above this many ms (Event Timing rounds to 8 ms, so this is the 104 the recorder uses). */
export const SLOW_MS = 104;

/**
 * One raw Event Timing row from the page recorder -> the three-way split.
 * Row layout (realism-page.mjs): [name, startTime, processingStart, processingEnd, duration, pillId, interactionId].
 */
export function splitEvent(row) {
  const [name, startTime, processingStart, processingEnd, duration, pill, interactionId] = row;
  const delay = Math.max(0, processingStart - startTime);
  const proc = Math.max(0, processingEnd - processingStart);
  const pres = Math.max(0, duration - (processingEnd - startTime));
  return { name, startTime, delay: r1(delay), proc: r1(proc), pres: r1(pres), dur: duration, pill: pill || '', interactionId };
}

/**
 * Summarise a list of split events the way the owner's recorded data can be summarised.
 * His file only holds events >= SLOW_MS, so the comparable numbers are: how many per minute of flipping, and the distribution
 * of the slow ones (dur, delay, proc, pres). We also report the whole distribution (all clicks), which his file cannot give.
 */
export function summariseEvents(events, { minutes = null, types = ['pointerdown', 'pointerup', 'click'] } = {}) {
  const out = { minutes: minutes === null ? null : r1(minutes), byType: {}, all: null };
  const forType = list => {
    const slow = list.filter(e => e.dur >= SLOW_MS);
    return {
      n: list.length, slowN: slow.length, slowShare: list.length ? r1((slow.length / list.length) * 100) : null,
      slowPerMin: minutes ? r1(slow.length / minutes) : null,
      dur: dist(list.map(e => e.dur)), delay: dist(list.map(e => e.delay)), proc: dist(list.map(e => e.proc)), pres: dist(list.map(e => e.pres)),
      slowDur: dist(slow.map(e => e.dur)), slowDelay: dist(slow.map(e => e.delay)), slowProc: dist(slow.map(e => e.proc)), slowPres: dist(slow.map(e => e.pres)),
    };
  };
  for (const t of types) out.byType[t] = forType(events.filter(e => e.name === t));
  out.all = forType(events.filter(e => types.includes(e.name)));
  return out;
}

/**
 * The owner's recorded distribution from hitches.jsonl rows (kind:'event' rows are the slow inputs).
 * `rows` are parsed JSON lines. Only events with sessions >= minSessions count (his recorded sequence had 4 sessions open).
 * Returns the same shape as summariseEvents' per-type entries, built from his d/delay/proc/pres fields.
 */
export function targetFromHitches(rows, { minSessions = 2 } = {}) {
  const ev = rows.filter(r => r.kind === 'event' && (r.sessions ?? 0) >= minSessions);
  const toSplit = r => ({ name: r.type, dur: r.d, delay: r.delay, proc: r.proc, pres: r.pres });
  const by = {};
  for (const t of ['pointerdown', 'pointerup', 'click']) {
    const l = ev.filter(r => r.type === t).map(toSplit);
    by[t] = { n: l.length, dur: dist(l.map(e => e.dur)), delay: dist(l.map(e => e.delay)), proc: dist(l.map(e => e.proc)), pres: dist(l.map(e => e.pres)) };
  }
  const all = ev.map(toSplit);
  // "minutes of flipping": the minutes in which at least one slow input was logged (his file has no click counter).
  const activeMinutes = new Set(ev.map(r => String(r.ts).slice(0, 16))).size;
  return {
    events: ev.length, activeMinutes, perActiveMinute: activeMinutes ? r1(ev.length / activeMinutes) : null,
    byType: by, all: { dur: dist(all.map(e => e.dur)), delay: dist(all.map(e => e.delay)), proc: dist(all.map(e => e.proc)), pres: dist(all.map(e => e.pres)) },
  };
}

/**
 * Is the lab "calibrated" against the target? Judged on the SLOW tail, because that is what his file can show:
 * lab worst (max) and p95 of slow clicks within `factor` of his, and the slow rate per active minute within `factor`.
 * ratio = lab / his; within = 1/factor <= ratio <= factor. A lab that is far LOWER fails exactly like one that is far HIGHER.
 * `lab` is a summariseEvents().all block with slowPerActiveMin added by the caller.
 */
export function calibrate(lab, target, { factor = 2 } = {}) {
  const pairs = {
    'worst click->paint (ms)': [lab.dur?.max, target.all.dur.max],
    'p95 click->paint of slow clicks (ms)': [lab.slowDur?.p95, target.all.dur.p95],
    'slow clicks per minute': [lab.slowPerMin, target.perActiveMinute],
    'worst presentation delay (ms)': [lab.pres?.max, target.all.pres.max],
    'worst handler time (ms)': [lab.proc?.max, target.all.proc.max],
  };
  const rows = {};
  let ok = 0, judged = 0;
  for (const [k, [a, b]] of Object.entries(pairs)) {
    judged++;
    if (typeof a !== 'number' || typeof b !== 'number' || b === 0) { rows[k] = { lab: a ?? null, his: b ?? null, ratio: null, within: false }; continue; }
    const ratio = r1(a / b), within = ratio >= 1 / factor && ratio <= factor;
    rows[k] = { lab: a, his: b, ratio, within };
    if (within) ok++;
  }
  return { factor, rows, within: ok, of: judged, calibrated: ok === judged };
}

// ── human-like input timing ───────────────────────────────────────────────────

/** Small seeded PRNG (mulberry32): the same seed gives the same flip sequence, so every cell flips the same way. */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Gaussian from two uniforms (Box-Muller). */
const gauss = r => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

/**
 * The gap between two flips of a person quickly looking through sessions: log-normal around ~290 ms, clipped to 150..600 ms,
 * with an 8% chance of a longer "reading" pause of 0.9..2.4 s.
 */
export function humanGapMs(r) {
  if (r() < 0.08) return Math.round(900 + r() * 1500);
  const g = Math.exp(Math.log(290) + 0.33 * gauss(r));
  return Math.round(Math.min(600, Math.max(150, g)));
}

/** How long a person holds the button down: 60..140 ms. And the pause between the pointer arriving over the pill and pressing: 25..90 ms. */
export const humanHoldMs = r => Math.round(60 + r() * 80);
export const humanAimMs = r => Math.round(25 + r() * 65);

/**
 * A flipping plan: an ordered list of actions with their own start offsets (ms from the start).
 *   { at, kind:'click', idx }                a real press/release on that session's pill (idx = session index)
 *   { at, kind:'wheel', dy }                 one scroll tick in the visible chat
 *   { at, kind:'type', text }                click the composer, type, erase
 *   { at, kind:'kbd' }                       the app's own switcher: Shift + ArrowDown + release (switches to the next session)
 * Switch targets: 35% "back to where I just was" (the ping-pong people do), otherwise a random other session.
 * `count` = how many sessions are open; `start` = the session showing now. No target repeats the session already showing.
 * NOTE: a 'kbd' action moves the active session by one in the app's own order; the runner reads the real active pane afterwards,
 * so the plan's notion of "current" is only used to avoid clicking the session already showing.
 */
export function humanPlan({ seed = 'real-use', seconds = 75, count, start = 0, wheelShare = 0.12, typeShare = 0.05, kbdShare = 0.06 }) {
  if (count < 2) throw new Error('humanPlan needs at least 2 sessions');
  const r = rng(seed);
  const plan = [];
  let at = 600, cur = start, prev = -1, clicks = 0;
  while (at < seconds * 1000) {
    const roll = r();
    if (roll < kbdShare) { plan.push({ at, kind: 'kbd' }); cur = (cur + 1) % count; at += humanGapMs(r) + 500; continue; }
    let idx;
    if (prev >= 0 && prev !== cur && r() < 0.35) idx = prev;
    else { do { idx = Math.floor(r() * count); } while (idx === cur); }
    plan.push({ at, kind: 'click', idx });
    prev = cur; cur = idx; clicks++;
    at += humanGapMs(r);
    const extra = r();
    if (extra < wheelShare) plan.push({ at: at - Math.round(humanGapMs(r) / 2), kind: 'wheel', dy: r() < 0.5 ? -120 : 120 });
    else if (extra < wheelShare + typeShare) { plan.push({ at, kind: 'type', text: 'ab' }); at += 900; }
  }
  plan.sort((a, b) => a.at - b.at);
  return { plan, clicks, seconds };
}

// ── factors ───────────────────────────────────────────────────────────────────

export const FACTORS = Object.freeze({
  build: ['packaged', 'dev'],
  history: ['fixture', 'real'],
  theme: ['stock', 'heavy'],
  display: ['xvfb', 'gpu'],
  busy: ['off', 'on', 'heavy'],   // on = 4 hogs at 35% + a browser-like page; heavy = every core saturated (a build/VM storm, load ~40)
});

export const SESSION_COUNTS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

/** The "real-use" preset: what ships (packaged), his real conversations, his glass+particle theme, the real GPU at 2560x1600 / 1.5, 4 sessions (his recorded sequence), a busy desktop. */
export const PRESETS = Object.freeze({
  'real-use': { build: 'packaged', history: 'real', theme: 'heavy', display: 'gpu', sessions: 4, busy: 'on' },
  'real-use-storm': { build: 'packaged', history: 'real', theme: 'heavy', display: 'gpu', sessions: 4, busy: 'heavy' },
  'cheap': { build: 'packaged', history: 'fixture', theme: 'stock', display: 'xvfb', sessions: 6, busy: 'off' },
});

/** Merge a preset with overrides; validates every value. */
export function resolveFactors(preset, overrides = {}) {
  const base = PRESETS[preset];
  if (!base) throw new Error(`unknown preset ${preset} (known: ${Object.keys(PRESETS).join(', ')})`);
  const f = { ...base, ...overrides };
  for (const [k, allowed] of Object.entries(FACTORS)) {
    if (!allowed.includes(f[k])) throw new Error(`--${k} takes ${allowed.join(' | ')} (got ${f[k]})`);
  }
  f.sessions = Number(f.sessions);
  if (!SESSION_COUNTS.includes(f.sessions)) throw new Error(`--sessions takes ${SESSION_COUNTS.join(', ')}`);
  return f;
}

/**
 * Pick real transcripts by size so a world of `count` sessions covers small -> huge.
 * `files` = [{ size, mtimeMs }] (NO names/paths: this function never sees conversation identity, only sizes).
 * Returns indices into `files`, one per session slot, from a quantile ladder (12th..90th percentile of size) over the files
 * modified in the last `recentDays` days (what he actually flips between), else over all. Files above maxBytes are never picked.
 */
export function pickBySize(files, count, { maxBytes = 120e6, minBytes = 20e3, recentDays = 3, now = Date.now(), mode = 'ladder' } = {}) {
  const cand = files.map((f, i) => ({ ...f, i })).filter(f => f.size >= minBytes && f.size <= maxBytes);
  const recent = cand.filter(f => now - f.mtimeMs <= recentDays * 86400e3);
  const pool = (recent.length >= count ? recent : cand).sort((a, b) => a.size - b.size);
  if (pool.length < count) throw new Error(`only ${pool.length} real transcripts fit ${minBytes}..${maxBytes} bytes; need ${count}`);
  // newest = the conversations touched most recently (what he was actually flipping between); biggest = the largest recent ones.
  if (mode === 'newest') return [...pool].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, count).map(f => f.i);
  if (mode === 'biggest') return pool.slice(-count).map(f => f.i);
  const taken = new Set(), out = [];
  for (let k = 0; k < count; k++) {
    const q = count === 1 ? 0.5 : 0.12 + (0.9 - 0.12) * (k / (count - 1));
    let j = Math.min(pool.length - 1, Math.round(q * (pool.length - 1)));
    while (taken.has(j) && j < pool.length - 1) j++;
    while (taken.has(j) && j > 0) j--;
    taken.add(j); out.push(pool[j].i);
  }
  return out;
}

/** Deterministic shuffle, so which size lands in which strip position does not correlate with size. */
export function shuffled(list, seed = 'shuffle') {
  const r = rng(seed), a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Real-history sizes in MB for a size ladder (report-friendly, no names). */
export const mb = bytes => Math.round((bytes / 1048576) * 10) / 10;
