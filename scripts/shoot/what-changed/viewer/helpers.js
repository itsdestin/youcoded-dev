// Pure helpers for the "What changed" viewer. Plain ES module with no DOM access so the browser
// page (viewer.js) and node:test (scripts/shoot/tests/what-changed-viewer.test.mjs) share one copy.

// Colour-coded kinds, in legend order. `label` is the plain word the owner sees.
export const KINDS = [
  { kind: 'added', label: 'Added' },
  { kind: 'removed', label: 'Removed' },
  { kind: 'text', label: 'Wording' },
  { kind: 'moved', label: 'Moved' },
  { kind: 'restyled', label: 'Restyled' },
  { kind: 'pixels', label: 'Other pixels' },
];
export const kindLabel = (k) => (KINDS.find((x) => x.kind === k) || { label: k }).label;

// Roles a person would call "a button or control".
const CONTROL_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'combobox', 'slider', 'textbox', 'searchbox', 'option', 'spinbutton']);

// A change can sit in several filters at once (a reworded button is both wording and controls).
export function categories(change) {
  const out = [];
  if (change.kind === 'text') out.push('wording');
  if (CONTROL_ROLES.has(change.role)) out.push('controls');
  if (!out.length) out.push('other');
  return out;
}

// Boxes are CSS px; pictures are `scale` times bigger. Returns percentages of the picture so the
// overlay stays correct whatever size the picture is shown at.
export function boxToPercent(box, scale, natW, natH) {
  if (!box || !natW || !natH) return null;
  const s = scale || 1;
  return {
    left: (box.x * s / natW) * 100, top: (box.y * s / natH) * 100,
    width: (box.w * s / natW) * 100, height: (box.h * s / natH) * 100,
  };
}

// Which picture a change's `box` belongs on. Removed things only exist in the before picture.
export const boxSide = (change) => (change.kind === 'removed' ? 'before' : (change.side || 'after'));

export const areaOf = (name) => (name.includes('/') ? name.slice(0, name.indexOf('/')) : name);

// One screen name can have several theme rows; the owner decides per name (FORMAT.md), so fold
// the rows into one entry with an overall status.
export function aggregateScreens(screens) {
  const byName = new Map();
  for (const s of screens || []) {
    if (!byName.has(s.name)) byName.set(s.name, { name: s.name, area: areaOf(s.name), rows: [] });
    byName.get(s.name).rows.push(s);
  }
  const rank = ['changed', 'new', 'removed', 'failed', 'unchanged'];
  const entries = [...byName.values()];
  for (const e of entries) {
    const has = (st) => e.rows.some((r) => r.status === st);
    e.status = rank.find(has) || 'unchanged';
    // A screen with one failed theme but a changed other theme is still reviewable; the failure
    // is noted on that theme's tab.
    e.reason = (e.rows.find((r) => r.reason) || {}).reason || '';
    e.changeCount = Math.max(0, ...e.rows.map((r) => (r.changes ? r.changes.length : 0))); // per theme, not summed
  }
  return entries;
}

export function countStatuses(entries) {
  const c = { changed: 0, new: 0, unchanged: 0, failed: 0, removed: 0 };
  for (const e of entries) c[e.status] = (c[e.status] || 0) + 1;
  return c;
}

export const isReviewable = (e) => e.status === 'changed' || e.status === 'new' || e.status === 'removed';

export function matchesFilter(entry, filter) {
  if (!filter || filter === 'all') return true;
  const want = { controls: 'controls', wording: 'wording', other: 'other' }[filter];
  return entry.rows.some((r) => (r.changes || []).some((c) => categories(c).includes(want)));
}

export function matchesQuery(entry, q) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [entry.name];
  for (const r of entry.rows) for (const c of r.changes || []) hay.push(c.name, c.oldText, c.newText, c.role);
  return hay.some((t) => t && String(t).toLowerCase().includes(needle));
}

// Area groups in first-seen order, each with its visible entries.
export function groupByArea(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.area)) groups.set(e.area, []);
    groups.get(e.area).push(e);
  }
  return [...groups].map(([area, items]) => ({ area, items }));
}

// `words` -> what to print in the Old and New columns, with the changed words flagged.
export function wordParts(words) {
  const oldParts = []; const newParts = [];
  for (const w of words || []) {
    if ('same' in w) { oldParts.push({ text: w.same }); newParts.push({ text: w.same }); continue; }
    if (w.old) oldParts.push({ text: w.old, mark: true });
    if (w.new) newParts.push({ text: w.new, mark: true });
  }
  return { oldParts, newParts };
}

export function progress(entries, decisions) {
  const list = entries.filter(isReviewable);
  const decided = list.filter((e) => decisions[e.name] && decisions[e.name].verdict).length;
  return { decided, total: list.length };
}

// Verdict map -> the decisions.json document (FORMAT.md). Entries with no verdict and no note are dropped.
export function buildDecisions(run, screens, now = new Date()) {
  const out = {};
  for (const [name, d] of Object.entries(screens || {})) {
    if (d && (d.verdict || d.note)) out[name] = { verdict: d.verdict || '', note: d.note || '' };
  }
  return { run, decidedAt: now.toISOString(), screens: out };
}

// Accepts only what the viewer writes; used by serve.mjs so a stray request cannot write junk.
export function validateDecisions(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'not an object';
  if (!doc.screens || typeof doc.screens !== 'object' || Array.isArray(doc.screens)) return 'screens missing';
  for (const [name, d] of Object.entries(doc.screens)) {
    if (!d || typeof d !== 'object') return `bad entry ${name}`;
    if (d.verdict !== '' && d.verdict !== 'keep' && d.verdict !== 'not-this') return `bad verdict for ${name}`;
    if (typeof d.note !== 'string' || d.note.length > 5000) return `bad note for ${name}`;
  }
  return null;
}
